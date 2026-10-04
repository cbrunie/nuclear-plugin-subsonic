import type { NuclearPluginAPI } from '@nuclearplayer/plugin-sdk';

import { md5 } from './md5';

const API_VERSION = '1.16.1';
const CLIENT_NAME = 'nuclear';

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

export type SubsonicResponse = {
  status: 'ok' | 'failed';
  error?: { code: number; message: string };
  searchResult3?: {
    artist?: SubsonicArtist[];
    album?: SubsonicAlbum[];
    song?: SubsonicSong[];
  };
  artist?: SubsonicArtist;
  album?: SubsonicAlbum;
  artistInfo2?: { biography?: string; largeImageUrl?: string };
};

type Params = Record<string, string | number>;

export type UrlBuilder = (endpoint: string, params?: Params) => string;

export const makeUrlBuilder =
  (server: string, username: string, password: string): UrlBuilder =>
  (endpoint, params = {}) => {
    // A fresh salt per URL, so the token is never reused.
    const salt = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
    const url = new URL(`rest/${endpoint}`, server.replace(/\/*$/, '/'));
    const query = {
      u: username,
      t: md5(password + salt),
      s: salt,
      v: API_VERSION,
      c: CLIENT_NAME,
      f: 'json',
      ...params,
    };
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  };

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

  const call = async (
    endpoint: string,
    params?: Params,
  ): Promise<SubsonicResponse> => {
    const response = await api.Http.fetch(url(endpoint, params));
    if (!response.ok) {
      throw new Error(`Subsonic ${endpoint}: HTTP ${response.status}`);
    }
    const body = (await response.json())['subsonic-response'] as
      | SubsonicResponse
      | undefined;
    if (!body) {
      throw new Error(`Subsonic ${endpoint}: not a Subsonic server`);
    }
    if (body.status !== 'ok') {
      throw new Error(
        `Subsonic ${endpoint}: ${body.error?.message ?? 'request failed'}`,
      );
    }
    return body;
  };

  return {
    url,
    search: async (
      query: string,
      counts: { artistCount?: number; albumCount?: number; songCount?: number },
    ) => (await call('search3', { query, ...counts })).searchResult3 ?? {},
    getArtist: async (id: string) => (await call('getArtist', { id })).artist,
    getArtistInfo: async (id: string) =>
      (await call('getArtistInfo2', { id })).artistInfo2,
    getAlbum: async (id: string) => (await call('getAlbum', { id })).album,
  };
};
