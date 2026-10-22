import type { NuclearPluginAPI } from '@nuclearplayer/plugin-sdk';

import { md5 } from './md5';

const API_VERSION = '1.16.1';
const CLIENT_NAME = 'nuclear';
// Without the formPost extension every parameter travels in the URL.
const MAX_GET_QUEUE = 200;

export type SubsonicArtist = {
  id: string;
  name: string;
  coverArt?: string;
  albumCount?: number;
  album?: SubsonicAlbum[];
};

export type SubsonicAlbum = {
  id: string;
  name: string;
  artist?: string;
  artistId?: string;
  coverArt?: string;
  year?: number;
  genre?: string;
  song?: SubsonicSong[];
};

export type SubsonicSong = {
  id: string;
  title: string;
  album?: string;
  albumId?: string;
  artist?: string;
  artistId?: string;
  track?: number;
  discNumber?: number;
  duration?: number;
  coverArt?: string;
  genre?: string;
  bitRate?: number;
  contentType?: string;
  suffix?: string;
  size?: number;
};

export type SubsonicPlaylist = {
  id: string;
  name: string;
  comment?: string;
  coverArt?: string;
  created?: string;
  changed?: string;
  owner?: string;
  entry?: SubsonicSong[];
};

export type LyricsCue = { start: number; end: number; value: string };

export type StructuredLyrics = {
  lang?: string;
  synced: boolean;
  offset?: number;
  kind?: 'main' | 'translation' | 'pronunciation';
  line: { start?: number; value: string }[];
  cueLine?: {
    index: number;
    start?: number;
    end?: number;
    value: string;
    cue?: LyricsCue[];
  }[];
};

export type SubsonicResponse = {
  status: 'ok' | 'failed';
  version?: string;
  // OpenSubsonic servers name themselves.
  type?: string;
  serverVersion?: string;
  error?: { code: number; message: string };
  openSubsonicExtensions?: { name: string; versions: number[] }[];
  searchResult3?: {
    artist?: SubsonicArtist[];
    album?: SubsonicAlbum[];
    song?: SubsonicSong[];
  };
  artist?: SubsonicArtist;
  album?: SubsonicAlbum;
  artistInfo2?: {
    biography?: string;
    largeImageUrl?: string;
    similarArtist?: SubsonicArtist[];
  };
  albumList2?: { album?: SubsonicAlbum[] };
  randomSongs?: { song?: SubsonicSong[] };
  similarSongs?: { song?: SubsonicSong[] };
  similarSongs2?: { song?: SubsonicSong[] };
  topSongs?: { song?: SubsonicSong[] };
  starred2?: {
    artist?: SubsonicArtist[];
    album?: SubsonicAlbum[];
    song?: SubsonicSong[];
  };
  playlists?: { playlist?: SubsonicPlaylist[] };
  playlist?: SubsonicPlaylist;
  lyrics?: { artist?: string; title?: string; value?: string };
  lyricsList?: { structuredLyrics?: StructuredLyrics[] };
  playQueue?: { current?: string; position?: number; entry?: SubsonicSong[] };
};

export type AlbumListType = 'newest' | 'frequent' | 'recent' | 'random';
export type StarTarget = 'id' | 'albumId' | 'artistId';

// An answer from the server, as opposed to a network failure.
class SubsonicError extends Error {}

type Params = Record<string, string | number | string[] | undefined>;

export type UrlBuilder = (endpoint: string, params?: Params) => string;

const authParams = (username: string, password: string) => {
  // A fresh salt per request, so the token is never reused.
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
  return {
    u: username,
    t: md5(password + salt),
    s: salt,
    v: API_VERSION,
    c: CLIENT_NAME,
    f: 'json',
  };
};

const toSearchParams = (params: Params) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      value.forEach((v) => search.append(key, v));
    } else if (value !== undefined) {
      search.set(key, String(value));
    }
  }
  return search;
};

const endpointUrl = (server: string, endpoint: string) =>
  new URL(`rest/${endpoint}`, server.replace(/\/*$/, '/'));

export const makeUrlBuilder =
  (server: string, username: string, password: string): UrlBuilder =>
  (endpoint, params = {}) => {
    const url = endpointUrl(server, endpoint);
    url.search = toSearchParams({
      ...authParams(username, password),
      ...params,
    }).toString();
    return url.toString();
  };

// OpenSubsonic extensions, by server: name -> supported versions.
// Plain Subsonic servers reject the call and get an empty map; a network
// failure is not cached, the next call asks again.
const extensionsCache = new Map<string, Promise<Map<string, number[]>>>();

export type SubsonicClient = Awaited<
  ReturnType<ReturnType<typeof createClient>>
>;

// Settings are read on every call, so a change applies without reloading.
export const createClient = (api: NuclearPluginAPI) => async () => {
  const [server, username, password] = await Promise.all([
    api.Settings.get<string>('url'),
    api.Settings.get<string>('username'),
    api.Settings.get<string>('password'),
  ]);
  if (!server || !username || !password) {
    throw new Error('Subsonic: set the server URL, username and password');
  }
  const url = makeUrlBuilder(server, username, password);

  const parse = async (endpoint: string, response: Response) => {
    if (!response.ok) {
      throw new SubsonicError(`Subsonic ${endpoint}: HTTP ${response.status}`);
    }
    const body = (await response.json())['subsonic-response'] as
      SubsonicResponse | undefined;
    if (!body) {
      throw new SubsonicError(`Subsonic ${endpoint}: not a Subsonic server`);
    }
    if (body.status !== 'ok') {
      throw new SubsonicError(
        `Subsonic ${endpoint}: ${body.error?.message ?? 'request failed'}`,
      );
    }
    return body;
  };

  const call = async (endpoint: string, params?: Params) =>
    parse(endpoint, await api.Http.fetch(url(endpoint, params)));

  const post = async (endpoint: string, params: Params) =>
    parse(
      endpoint,
      await api.Http.fetch(endpointUrl(server, endpoint).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: toSearchParams({
          ...authParams(username, password),
          ...params,
        }).toString(),
      }),
    );

  const cacheKey = `${server}|${username}`;
  if (!extensionsCache.has(cacheKey)) {
    extensionsCache.set(
      cacheKey,
      call('getOpenSubsonicExtensions')
        .then(
          (r) =>
            new Map(
              (r.openSubsonicExtensions ?? []).map((e) => [e.name, e.versions]),
            ),
        )
        .catch((error) => {
          if (!(error instanceof SubsonicError)) {
            extensionsCache.delete(cacheKey);
          }
          return new Map<string, number[]>();
        }),
    );
  }
  const extensions = await extensionsCache.get(cacheKey)!;
  const supports = (name: string, version = 1) =>
    extensions.get(name)?.includes(version) ?? false;

  // Long lists (playlists, queues) go in a POST body when the server takes
  // one; a URL too long for a plain server fails rather than truncating.
  const send = (endpoint: string, params: Params) =>
    supports('formPost') ? post(endpoint, params) : call(endpoint, params);

  return {
    url,
    username,
    account: cacheKey,
    supports,
    extensionNames: [...extensions.keys()],
    ping: () => call('ping'),
    search: async (
      query: string,
      counts: { artistCount?: number; albumCount?: number; songCount?: number },
    ) => (await call('search3', { query, ...counts })).searchResult3 ?? {},
    getArtist: async (id: string) => (await call('getArtist', { id })).artist,
    getArtistInfo: async (id: string) =>
      (await call('getArtistInfo2', { id })).artistInfo2,
    getAlbum: async (id: string) => (await call('getAlbum', { id })).album,
    getAlbumList: async (type: AlbumListType, size: number) =>
      (await call('getAlbumList2', { type, size })).albumList2?.album ?? [],
    getRandomSongs: async (size: number) =>
      (await call('getRandomSongs', { size })).randomSongs?.song ?? [],
    getSimilarSongs: async (id: string, count: number) =>
      (await call('getSimilarSongs', { id, count })).similarSongs?.song ?? [],
    // By id when the server allows it, by name (ambiguous) otherwise.
    getSimilarSongsByArtist: async (artistId: string, count: number) =>
      (await call('getSimilarSongs2', { id: artistId, count })).similarSongs2
        ?.song ?? [],
    getTopSongs: async (artist: SubsonicArtist, count: number) =>
      (
        await call(
          'getTopSongs',
          supports('topSongsByArtistId')
            ? { id: artist.id, artist: artist.name, count }
            : { artist: artist.name, count },
        )
      ).topSongs?.song ?? [],
    getStarred: async () => (await call('getStarred2')).starred2 ?? {},
    star: async (target: StarTarget, id: string) => {
      await call('star', { [target]: id });
    },
    unstar: async (target: StarTarget, id: string) => {
      await call('unstar', { [target]: id });
    },
    getPlaylists: async () =>
      (await call('getPlaylists')).playlists?.playlist ?? [],
    getPlaylist: async (id: string) =>
      (await call('getPlaylist', { id })).playlist,
    createPlaylist: async (name: string, songIds: string[]) =>
      (await send('createPlaylist', { name, songId: songIds })).playlist,
    // createPlaylist with a playlistId replaces the whole song list.
    replacePlaylistSongs: async (id: string, songIds: string[]) => {
      await send('createPlaylist', { playlistId: id, songId: songIds });
    },
    renamePlaylist: async (id: string, name: string) => {
      await call('updatePlaylist', { playlistId: id, name });
    },
    deletePlaylist: async (id: string) => {
      await call('deletePlaylist', { id });
    },
    // Structured (synced) lyrics need the songLyrics extension; version 2
    // adds word-level timing.
    getStructuredLyrics: async (id: string) =>
      supports('songLyrics')
        ? ((
            await call('getLyricsBySongId', {
              id,
              enhanced: supports('songLyrics', 2) ? 'true' : undefined,
            })
          ).lyricsList?.structuredLyrics ?? [])
        : undefined,
    getLyrics: async (artist: string, title: string) =>
      (await call('getLyrics', { artist, title })).lyrics?.value,
    // submission=false: now playing; true: a listen, with its start time.
    scrobble: async (id: string, submission: boolean, time?: number) => {
      await call('scrobble', { id, submission: String(submission), time });
    },
    getPlayQueue: async () => (await call('getPlayQueue')).playQueue,
    savePlayQueue: async (ids: string[], current: string, position: number) => {
      if (supports('formPost')) {
        await post('savePlayQueue', { id: ids, current, position });
        return;
      }
      // Keep the URL short: a window of the queue around the current song.
      const at = Math.max(0, ids.indexOf(current) - MAX_GET_QUEUE / 2);
      await call('savePlayQueue', {
        id: ids.slice(at, at + MAX_GET_QUEUE),
        current,
        position,
      });
    },
  };
};
