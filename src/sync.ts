import type {
  FavoritesData,
  NuclearPluginAPI,
  Playlist,
  PlaylistIndexEntry,
  Queue,
  Track,
} from '@nuclearplayer/plugin-sdk';

import {
  PLAY_QUEUE_SAVE_DELAY_MS,
  PLAYLIST_SYNC_DELAY_MS,
  PLAYLIST_SYNC_INTERVAL_MS,
  PLAYLIST_URL_PREFIX,
  SETTINGS,
} from './config';
import { albumRef, artistRef, isFromServer, playlist, track } from './mappers';
import { planPlaylistSync, type PlaylistLink } from './playlistSync';
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

const originServerId = (playlist: Playlist) =>
  playlist.origin?.url?.startsWith(PLAYLIST_URL_PREFIX)
    ? playlist.origin.url.slice(PLAYLIST_URL_PREFIX.length)
    : undefined;

const serverSongIds = (playlist: Playlist) =>
  playlist.items
    .filter((item) => isFromServer(item.track))
    .map((item) => item.track.source.id);

// Server playlists appear in Nuclear; Nuclear playlists holding songs from
// this server are kept on it. The rules are in playlistSync.ts.
export const startPlaylistSync = async (
  api: NuclearPluginAPI,
  connect: Connect,
): Promise<Unsubscribe> => {
  const enabled = async () =>
    (await api.Settings.get<boolean>(SETTINGS.SYNC_PLAYLISTS)) !== false;
  const loadLinks = async (): Promise<PlaylistLink[]> =>
    JSON.parse(
      (await api.Settings.get<string>(SETTINGS.PLAYLIST_LINKS)) || '[]',
    );
  const modifiedOf = async (nuclearId: string) =>
    (await api.Playlists.getIndex()).find((e) => e.id === nuclearId)
      ?.lastModifiedIso ?? '';

  let vanished = new Set<string>();
  let previousIds = new Set(
    (await api.Playlists.getIndex()).map((entry) => entry.id),
  );

  const sync = async () => {
    if (!(await enabled())) {
      return;
    }
    const client = await connect();
    const serverLists = (await client.getPlaylists()).filter(
      // Other users' public playlists cannot be edited.
      (p) => !p.owner || p.owner === client.username,
    );
    const index = await api.Playlists.getIndex();
    const nuclearLists = (
      await Promise.all(index.map((e) => api.Playlists.getPlaylist(e.id)))
    ).filter((p): p is Playlist => Boolean(p));
    const nuclearById = new Map(nuclearLists.map((p) => [p.id, p]));

    const toDelete = vanished;
    vanished = new Set();
    const actions = planPlaylistSync({
      links: await loadLinks(),
      nuclear: nuclearLists.map((p) => ({
        id: p.id,
        modified: p.lastModifiedIso,
        originServerId: originServerId(p),
        hasServerTracks: serverSongIds(p).length > 0,
      })),
      server: serverLists.map((p) => ({ id: p.id, changed: p.changed })),
      vanished: toDelete,
    });
    if (!actions.length) {
      return;
    }

    let links = await loadLinks();
    const drop = (l: PlaylistLink) => {
      links = links.filter((x) => x.nuclearId !== l.nuclearId);
    };
    const keep = async (nuclearId: string, serverId: string) => {
      drop({ nuclearId, serverId } as PlaylistLink);
      links.push({
        nuclearId,
        serverId,
        nuclearModified: await modifiedOf(nuclearId),
        serverChanged: (await client.getPlaylist(serverId))?.changed,
      });
    };

    for (const action of actions) {
      try {
        switch (action.type) {
          case 'unlink':
            drop(action.link);
            break;
          case 'deleteOnServer':
            await client.deletePlaylist(action.link.serverId);
            drop(action.link);
            break;
          case 'deleteInNuclear':
            await api.Playlists.deletePlaylist(action.link.nuclearId);
            drop(action.link);
            break;
          case 'push': {
            const local = nuclearById.get(action.link.nuclearId)!;
            const remote = serverLists.find(
              (p) => p.id === action.link.serverId,
            );
            await client.replacePlaylistSongs(
              action.link.serverId,
              serverSongIds(local),
            );
            if (remote && remote.name !== local.name) {
              await client.renamePlaylist(action.link.serverId, local.name);
            }
            await keep(action.link.nuclearId, action.link.serverId);
            break;
          }
          case 'pull': {
            // Songs from other sources stay, after the server's.
            const local = nuclearById.get(action.link.nuclearId)!;
            const remote = await client.getPlaylist(action.link.serverId);
            const others = local.items.filter((i) => !isFromServer(i.track));
            await api.Playlists.removeTracks(
              local.id,
              local.items.map((i) => i.id),
            );
            await api.Playlists.addTracks(local.id, [
              ...(remote?.entry ?? []).map((s) => track(client.url, s)),
              ...others.map((i) => i.track),
            ]);
            await keep(local.id, action.link.serverId);
            break;
          }
          case 'link':
            await keep(action.nuclearId, action.serverId);
            break;
          case 'createOnServer': {
            const local = nuclearById.get(action.nuclearId)!;
            const created = await client.createPlaylist(
              local.name,
              serverSongIds(local),
            );
            // Servers older than API 1.14 do not return the playlist.
            const serverId =
              created?.id ??
              (await client.getPlaylists())
                .filter((p) => p.name === local.name)
                .sort((a, b) =>
                  (b.created ?? '').localeCompare(a.created ?? ''),
                )[0]?.id;
            if (serverId) {
              await keep(local.id, serverId);
            }
            break;
          }
          case 'importFromServer': {
            const remote = await client.getPlaylist(action.serverId);
            if (remote) {
              const nuclearId = await api.Playlists.importPlaylist({
                ...playlist(client.url, remote),
                isReadOnly: false,
              });
              await keep(nuclearId, action.serverId);
            }
            break;
          }
        }
      } catch (error) {
        api.Logger.warn(
          `Subsonic: playlist sync, ${action.type} failed: ${String(error)}`,
        );
      }
    }
    await api.Settings.set(SETTINGS.PLAYLIST_LINKS, JSON.stringify(links));
    previousIds = new Set(
      (await api.Playlists.getIndex()).map((entry) => entry.id),
    );
  };

  // One sync at a time; a request during a sync runs once it ends.
  let running: Promise<void> = Promise.resolve();
  const run = () => {
    running = running
      .then(sync)
      .catch((error) =>
        api.Logger.warn(`Subsonic: playlist sync failed: ${String(error)}`),
      );
  };

  // Loading a playlist notifies too: only a changed index triggers a sync,
  // or syncing would trigger itself forever.
  const signature = (index: PlaylistIndexEntry[]) =>
    JSON.stringify(index.map((e) => [e.id, e.name, e.lastModifiedIso]));
  let lastSignature = signature(await api.Playlists.getIndex());

  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsubscribe = api.Playlists.subscribe((index) => {
    const current = signature(index);
    if (current === lastSignature) {
      return;
    }
    lastSignature = current;
    const ids = new Set(index.map((entry) => entry.id));
    for (const id of previousIds) {
      if (!ids.has(id)) {
        vanished.add(id);
      }
    }
    previousIds = ids;
    clearTimeout(timer);
    timer = setTimeout(run, PLAYLIST_SYNC_DELAY_MS);
  });
  const interval = setInterval(run, PLAYLIST_SYNC_INTERVAL_MS);
  run();

  return () => {
    clearTimeout(timer);
    clearInterval(interval);
    unsubscribe();
  };
};
