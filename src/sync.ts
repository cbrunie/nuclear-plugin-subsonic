import type {
  FavoritesData,
  NuclearPluginAPI,
  Queue,
  Track,
} from '@nuclearplayer/plugin-sdk';

import { PLAY_QUEUE_SAVE_DELAY_MS, SETTINGS } from './config';
import { albumRef, artistRef, isFromServer, track } from './mappers';
import type { Connect } from './providers';
import type { StarTarget } from './subsonic';

type Unsubscribe = () => void;

// Favorites are keyed "<star target>:<id>", for this server's items only.
const favoriteKeys = (data: FavoritesData) =>
  new Set([
    ...data.tracks
      .filter((e) => isFromServer(e.ref))
      .map((e) => `id:${e.ref.source.id}`),
    ...data.albums
      .filter((e) => isFromServer(e.ref))
      .map((e) => `albumId:${e.ref.source.id}`),
    ...data.artists
      .filter((e) => isFromServer(e.ref))
      .map((e) => `artistId:${e.ref.source.id}`),
  ]);

const readFavorites = async (api: NuclearPluginAPI): Promise<FavoritesData> => {
  const [tracks, albums, artists] = await Promise.all([
    api.Favorites.getTracks(),
    api.Favorites.getAlbums(),
    api.Favorites.getArtists(),
  ]);
  return { tracks, albums, artists };
};

const splitKey = (key: string) => {
  const at = key.indexOf(':');
  return [key.slice(0, at) as StarTarget, key.slice(at + 1)] as const;
};

// At startup the server's starred items join Nuclear's favorites; then every
// change on this server's items is starred or unstarred on it.
export const startFavoritesSync = async (
  api: NuclearPluginAPI,
  connect: Connect,
): Promise<Unsubscribe> => {
  const enabled = () => api.Settings.get<boolean>(SETTINGS.SYNC_FAVORITES);

  if ((await enabled()) !== false) {
    const client = await connect();
    const starred = await client.getStarred();
    const known = favoriteKeys(await readFavorites(api));
    for (const song of starred.song ?? []) {
      if (!known.has(`id:${song.id}`)) {
        await api.Favorites.addTrack(track(client.url, song));
      }
    }
    for (const album of starred.album ?? []) {
      if (!known.has(`albumId:${album.id}`)) {
        await api.Favorites.addAlbum(albumRef(client.url, album));
      }
    }
    for (const artist of starred.artist ?? []) {
      if (!known.has(`artistId:${artist.id}`)) {
        await api.Favorites.addArtist(artistRef(client.url, artist));
      }
    }
  }

  let known = favoriteKeys(await readFavorites(api));
  return api.Favorites.subscribe(async (data) => {
    const current = favoriteKeys(data);
    const added = [...current].filter((k) => !known.has(k));
    const removed = [...known].filter((k) => !current.has(k));
    known = current;
    if ((!added.length && !removed.length) || (await enabled()) === false) {
      return;
    }
    try {
      const client = await connect();
      await Promise.all([
        ...added.map((k) => client.star(...splitKey(k))),
        ...removed.map((k) => client.unstar(...splitKey(k))),
      ]);
    } catch (error) {
      api.Logger.warn(`Subsonic: favorites not synced: ${String(error)}`);
    }
  });
};

// Saves the queue (this server's songs only) a few seconds after it settles,
// and restores the server's queue when Nuclear starts with an empty one.
export const startPlayQueueSync = async (
  api: NuclearPluginAPI,
  connect: Connect,
): Promise<Unsubscribe> => {
  const enabled = () => api.Settings.get<boolean>(SETTINGS.SYNC_PLAY_QUEUE);

  if ((await enabled()) !== false) {
    const queue = await api.Queue.getQueue();
    if (queue.items.length === 0) {
      const client = await connect();
      const saved = await client.getPlayQueue();
      const songs = saved?.entry ?? [];
      if (songs.length) {
        await api.Queue.addToQueue(songs.map((s) => track(client.url, s)));
        const index = songs.findIndex((s) => s.id === saved?.current);
        if (index > 0) {
          await api.Queue.goToIndex(index);
        }
      }
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined;

  const save = async (queue: Queue) => {
    if ((await enabled()) === false) {
      return;
    }
    const items = queue.items.filter((item) => isFromServer(item.track));
    const current = queue.items[queue.currentIndex];
    if (!items.length || !current || !isFromServer(current.track)) {
      return;
    }
    try {
      const { seek } = await api.Playback.getState();
      const client = await connect();
      await client.savePlayQueue(
        items.map((item) => item.track.source.id),
        current.track.source.id,
        Math.floor(seek * 1000),
      );
    } catch (error) {
      api.Logger.warn(`Subsonic: play queue not saved: ${String(error)}`);
    }
  };

  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      await save(await api.Queue.getQueue());
    }, PLAY_QUEUE_SAVE_DELAY_MS);
  };

  const unsubscribers = [
    api.Queue.subscribe(schedule),
    // The position matters too: save it when playback pauses or stops.
    api.Events.on('playbackPaused', async () => schedule()),
    api.Events.on('playbackStopped', async () => schedule()),
  ];
  return () => {
    clearTimeout(timer);
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  };
};

// Now playing when a song from this server starts, a listen when it plays
// to the end. Skipped songs are not counted.
export const startScrobbling = async (
  api: NuclearPluginAPI,
  connect: Connect,
): Promise<Unsubscribe> => {
  const startedAt = new Map<string, number>();

  const report = async (t: Track, submission: boolean) => {
    if (
      !isFromServer(t) ||
      (await api.Settings.get<boolean>(SETTINGS.SCROBBLE)) === false
    ) {
      return;
    }
    try {
      const client = await connect();
      await client.scrobble(
        t.source.id,
        submission,
        submission ? startedAt.get(t.source.id) : undefined,
      );
    } catch (error) {
      api.Logger.warn(`Subsonic: scrobble failed: ${String(error)}`);
    }
  };

  const unsubscribers = [
    api.Events.on('trackStarted', async (t) => {
      // Nuclear also emits trackStarted when resuming: keep the first start.
      if (!startedAt.has(t.source.id)) {
        startedAt.clear();
        startedAt.set(t.source.id, Date.now());
      }
      await report(t, false);
    }),
    api.Events.on('trackFinished', async (t) => {
      await report(t, true);
      startedAt.delete(t.source.id);
    }),
  ];
  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
};
