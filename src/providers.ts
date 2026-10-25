import type {
  Album,
  AlbumRef,
  ArtistBio,
  ArtistRef,
  DashboardProvider,
  DiscoveryProvider,
  LyricsProvider,
  MetadataProvider,
  NuclearPluginAPI,
  PlaylistProvider,
  SearchParams,
  Stream,
  StreamingProvider,
  Track,
  TrackRef,
} from '@nuclearplayer/plugin-sdk';

import {
  ARTIST_TOP_TRACKS,
  DASHBOARD_ARTISTS,
  DASHBOARD_PROVIDER_ID,
  DASHBOARD_SIZE,
  DEFAULT_SEARCH_LIMIT,
  DISCOVERY_LIMIT,
  DISCOVERY_PROVIDER_ID,
  LYRICS_PROVIDER_ID,
  METADATA_PROVIDER_ID,
  ORIGINAL,
  PLAYLIST_PROVIDER_ID,
  PLAYLIST_URL_PREFIX,
  SETTINGS,
  STREAMING_PROVIDER_ID,
  STREAMING_SEARCH_LIMIT,
} from './config';
import { fromStructured, fromText } from './lyrics';
import {
  albumRef,
  artistRef,
  artwork,
  candidate,
  creditOf,
  isFromServer,
  playlist,
  playlistRef,
  source,
  track,
  trackRef,
} from './mappers';
import type { createClient, SubsonicArtist, SubsonicClient } from './subsonic';

export type Connect = ReturnType<typeof createClient>;

const searchOnly = (
  kind: 'artistCount' | 'albumCount' | 'songCount',
  limit: number,
) => ({ artistCount: 0, albumCount: 0, songCount: 0, [kind]: limit });

const findSongs = async (
  client: SubsonicClient,
  artist: string,
  title: string,
  limit: number,
) =>
  (await client.search(`${artist} ${title}`, searchOnly('songCount', limit)))
    .song ?? [];

export const createMetadataProvider = (connect: Connect): MetadataProvider => ({
  id: METADATA_PROVIDER_ID,
  kind: 'metadata',
  name: 'Subsonic',
  streamingProviderId: STREAMING_PROVIDER_ID,
  searchCapabilities: ['artists', 'albums', 'tracks'],
  artistMetadataCapabilities: [
    'artistBio',
    'artistAlbums',
    'artistTopTracks',
    'artistRelatedArtists',
  ],
  albumMetadataCapabilities: ['albumDetails'],

  searchArtists: async ({ query, limit }: Omit<SearchParams, 'types'>) => {
    const client = await connect();
    const result = await client.search(
      query,
      searchOnly('artistCount', limit ?? DEFAULT_SEARCH_LIMIT),
    );
    return (result.artist ?? []).map((a) => artistRef(client.url, a));
  },

  searchAlbums: async ({ query, limit }: Omit<SearchParams, 'types'>) => {
    const client = await connect();
    const result = await client.search(
      query,
      searchOnly('albumCount', limit ?? DEFAULT_SEARCH_LIMIT),
    );
    return (result.album ?? []).map((a) => albumRef(client.url, a));
  },

  searchTracks: async ({ query, limit }: Omit<SearchParams, 'types'>) => {
    const client = await connect();
    const result = await client.search(
      query,
      searchOnly('songCount', limit ?? DEFAULT_SEARCH_LIMIT),
    );
    return (result.song ?? []).map((s) => track(client.url, s));
  },

  fetchArtistBio: async (artistId: string): Promise<ArtistBio> => {
    const client = await connect();
    const artist = await client.getArtist(artistId);
    if (!artist) {
      throw new Error(`Subsonic: artist ${artistId} not found`);
    }
    // The biography depends on the server's own external agents: optional.
    const info = await client.getArtistInfo(artistId).catch(() => undefined);
    // No cover art on the server: fall back on the external agent's image.
    const image = info?.largeImageUrl;
    return {
      name: artist.name,
      bio: info?.biography || undefined,
      artwork:
        artwork(client.url, artist.coverArt) ??
        (image ? { items: [{ url: image, purpose: 'avatar' }] } : undefined),
      source: source(METADATA_PROVIDER_ID, artist.id),
    };
  },

  fetchArtistAlbums: async (artistId: string): Promise<AlbumRef[]> => {
    const client = await connect();
    const artist = await client.getArtist(artistId);
    return (artist?.album ?? []).map((a) => albumRef(client.url, a));
  },

  // Top songs and similar artists rely on the server's external agents
  // (Last.fm, etc.): empty when it has none.
  fetchArtistTopTracks: async (artistId: string): Promise<TrackRef[]> => {
    const client = await connect();
    const artist = await client.getArtist(artistId);
    if (!artist) {
      return [];
    }
    const songs = await client.getTopSongs(artist, ARTIST_TOP_TRACKS);
    return songs.map((s) => trackRef(client.url, s));
  },

  fetchArtistRelatedArtists: async (artistId: string): Promise<ArtistRef[]> => {
    const client = await connect();
    const info = await client.getArtistInfo(artistId);
    // Only artists present in the library have an id to open.
    return (info?.similarArtist ?? [])
      .filter((a) => a.id)
      .map((a) => artistRef(client.url, a));
  },

  fetchAlbumDetails: async (albumId: string): Promise<Album> => {
    const client = await connect();
    const album = await client.getAlbum(albumId);
    if (!album) {
      throw new Error(`Subsonic: album ${albumId} not found`);
    }
    return {
      title: album.name,
      artists: album.artist
        ? [{ ...creditOf(album.artist, album.artistId), roles: [] }]
        : [],
      tracks: (album.song ?? []).map((s) => trackRef(client.url, s)),
      releaseDate: album.year
        ? { precision: 'year', dateIso: String(album.year) }
        : undefined,
      genres: album.genre ? [album.genre] : undefined,
      artwork: artwork(client.url, album.coverArt),
      source: source(METADATA_PROVIDER_ID, album.id),
    };
  },
});

export const createStreamingProvider = (
  api: NuclearPluginAPI,
  connect: Connect,
): StreamingProvider => {
  const searchForTrack = async (artist: string, title: string) => {
    const client = await connect();
    const songs = await findSongs(
      client,
      artist,
      title,
      STREAMING_SEARCH_LIMIT,
    );
    return songs.map((s) => candidate(client.url, s));
  };

  return {
    id: STREAMING_PROVIDER_ID,
    kind: 'streaming',
    name: 'Subsonic',

    searchForTrack,

    // A track that comes from this server already carries its id.
    searchForTrackV2: async (t: Track) =>
      isFromServer(t)
        ? [
            {
              id: t.source.id,
              title: t.title,
              durationMs: t.durationMs,
              failed: false,
              source: source(STREAMING_PROVIDER_ID, t.source.id),
            },
          ]
        : searchForTrack(t.artists[0]?.name ?? '', t.title),

    getStreamUrl: async (candidateId: string): Promise<Stream> => {
      const client = await connect();
      const [maxBitRate, format] = await Promise.all([
        api.Settings.get<string>(SETTINGS.MAX_BIT_RATE),
        api.Settings.get<string>(SETTINGS.FORMAT),
      ]);
      const url = client.url('stream', {
        id: candidateId,
        maxBitRate:
          maxBitRate && maxBitRate !== ORIGINAL ? maxBitRate : undefined,
        format: format && format !== ORIGINAL ? format : undefined,
      });
      return {
        url,
        protocol: url.startsWith('https:') ? 'https' : 'http',
        source: source(STREAMING_PROVIDER_ID, candidateId),
      };
    },
  };
};

export const createDashboardProvider = (
  connect: Connect,
): DashboardProvider => ({
  id: DASHBOARD_PROVIDER_ID,
  kind: 'dashboard',
  name: 'Subsonic',
  metadataProviderId: METADATA_PROVIDER_ID,
  capabilities: [
    'topTracks',
    'topArtists',
    'topAlbums',
    'editorialPlaylists',
    'newReleases',
  ],

  // Starred songs: the closest thing to "top tracks" a Subsonic server keeps.
  fetchTopTracks: async () => {
    const client = await connect();
    const starred = await client.getStarred();
    return (starred.song ?? []).map((s) => track(client.url, s));
  },

  // Artists of the most played albums, in play order.
  fetchTopArtists: async () => {
    const client = await connect();
    const albums = await client.getAlbumList('frequent', DASHBOARD_SIZE * 2);
    const ids = [
      ...new Set(albums.map((a) => a.artistId).filter(Boolean)),
    ].slice(0, DASHBOARD_ARTISTS) as string[];
    const artists = await Promise.all(ids.map((id) => client.getArtist(id)));
    return artists
      .filter((a): a is SubsonicArtist => Boolean(a))
      .map((a) => artistRef(client.url, a));
  },

  fetchTopAlbums: async () => {
    const client = await connect();
    const albums = await client.getAlbumList('frequent', DASHBOARD_SIZE);
    return albums.map((a) => albumRef(client.url, a));
  },

  fetchEditorialPlaylists: async () => {
    const client = await connect();
    const lists = await client.getPlaylists();
    return lists.map((p) => playlistRef(client.url, p));
  },

  // Recently added to the library.
  fetchNewReleases: async () => {
    const client = await connect();
    const albums = await client.getAlbumList('newest', DASHBOARD_SIZE);
    return albums.map((a) => albumRef(client.url, a));
  },
});

export const createPlaylistProvider = (connect: Connect): PlaylistProvider => ({
  id: PLAYLIST_PROVIDER_ID,
  kind: 'playlists',
  name: 'Subsonic',
  matchesUrl: (url: string) => url.startsWith(PLAYLIST_URL_PREFIX),
  fetchPlaylistByUrl: async (url: string) => {
    const client = await connect();
    const id = url.slice(PLAYLIST_URL_PREFIX.length);
    const list = await client.getPlaylist(id);
    if (!list) {
      throw new Error(`Subsonic: playlist ${id} not found`);
    }
    return playlist(client.url, list);
  },
});

export const createDiscoveryProvider = (
  connect: Connect,
): DiscoveryProvider => ({
  id: DISCOVERY_PROVIDER_ID,
  kind: 'discovery',
  name: 'Subsonic',
  // Songs similar to the last one from this server; else similar to the last
  // artist played, when the library has them; random ones otherwise.
  getRecommendations: async (context: Track[], { limit }) => {
    const client = await connect();
    const count = limit ?? DISCOVERY_LIMIT;
    const similarToContext = async () => {
      const seed = context.filter(isFromServer).at(-1);
      if (seed) {
        return client.getSimilarSongs(seed.source.id, count);
      }
      const name = context.at(-1)?.artists[0]?.name;
      if (!name) {
        return [];
      }
      const found = await client.search(name, searchOnly('artistCount', 5));
      const artist = found.artist?.find((a) => sameText(a.name, name));
      return artist ? client.getSimilarSongsByArtist(artist.id, count) : [];
    };
    const similar = await similarToContext().catch(() => []);
    const played = new Set(context.map((t) => t.source.id));
    const fresh = similar.filter((s) => !played.has(s.id));
    const songs = fresh.length ? fresh : await client.getRandomSongs(count);
    return songs.map((s) => track(client.url, s));
  },
});

const sameText = (a?: string, b?: string) =>
  a?.localeCompare(b ?? '', undefined, { sensitivity: 'base' }) === 0;

export const createLyricsProvider = (connect: Connect): LyricsProvider => ({
  id: LYRICS_PROVIDER_ID,
  kind: 'lyrics',
  name: 'Subsonic',
  getLyrics: async (t: Track) => {
    const client = await connect();
    const artist = t.artists[0]?.name ?? '';

    // A track from elsewhere is looked up in the library, exact title only.
    const songId = isFromServer(t)
      ? t.source.id
      : (await findSongs(client, artist, t.title, STREAMING_SEARCH_LIMIT)).find(
          (s) => sameText(s.title, t.title) && sameText(s.artist, artist),
        )?.id;

    const structured = songId
      ? await client.getStructuredLyrics(songId)
      : undefined;
    const lyrics = structured && fromStructured(structured, t.durationMs);
    if (lyrics) {
      return lyrics;
    }
    // Plain Subsonic: lyrics by artist and title, unsynced.
    return fromText(await client.getLyrics(artist, t.title));
  },
});
