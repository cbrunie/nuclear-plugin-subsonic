import type {
  Album,
  AlbumRef,
  ArtistBio,
  ArtistRef,
  ArtworkSet,
  DashboardProvider,
  DiscoveryProvider,
  MetadataProvider,
  NuclearPlugin,
  NuclearPluginAPI,
  Playlist,
  PlaylistProvider,
  PlaylistRef,
  SearchParams,
  Stream,
  StreamCandidate,
  StreamingProvider,
  Track,
  TrackRef,
} from '@nuclearplayer/plugin-sdk';

import {
  createClient,
  type SubsonicAlbum,
  type SubsonicArtist,
  type SubsonicPlaylist,
  type SubsonicSong,
  type UrlBuilder,
} from './subsonic';

const CATEGORY = 'Subsonic';
const METADATA_PROVIDER_ID = 'subsonic';
const STREAMING_PROVIDER_ID = 'subsonic-stream';
const DASHBOARD_PROVIDER_ID = 'subsonic-dashboard';
const PLAYLIST_PROVIDER_ID = 'subsonic-playlists';
const DISCOVERY_PROVIDER_ID = 'subsonic-discovery';
const DEFAULT_SEARCH_LIMIT = 20;
const STREAMING_SEARCH_LIMIT = 5;
const DASHBOARD_SIZE = 20;
const DASHBOARD_ARTISTS = 12;
const ARTIST_TOP_TRACKS = 10;
const DISCOVERY_LIMIT = 20;

// Nuclear opens a dashboard playlist through the playlist provider that
// matches its URL: server playlists get a URL of their own.
const PLAYLIST_URL_PREFIX = 'subsonic://playlist/';

type Connect = ReturnType<typeof createClient>;

const source = (provider: string, id: string) => ({ provider, id });

const artwork = (url: UrlBuilder, coverArt?: string): ArtworkSet | undefined =>
  coverArt
    ? {
        items: [
          {
            url: url('getCoverArt', { id: coverArt, size: 600 }),
            width: 600,
            height: 600,
            purpose: 'cover',
          },
          {
            url: url('getCoverArt', { id: coverArt, size: 200 }),
            width: 200,
            height: 200,
            purpose: 'thumbnail',
          },
        ],
      }
    : undefined;

const durationMs = (song: SubsonicSong) =>
  song.duration ? song.duration * 1000 : undefined;

const artistRef = (url: UrlBuilder, artist: SubsonicArtist): ArtistRef => ({
  name: artist.name,
  artwork: artwork(url, artist.coverArt),
  source: source(METADATA_PROVIDER_ID, artist.id),
});

const creditOf = (name?: string, id?: string) => ({
  name: name ?? 'Unknown artist',
  source: source(METADATA_PROVIDER_ID, id ?? ''),
});

const albumRef = (url: UrlBuilder, album: SubsonicAlbum): AlbumRef => ({
  title: album.name,
  artists: album.artist ? [creditOf(album.artist, album.artistId)] : undefined,
  artwork: artwork(url, album.coverArt),
  source: source(METADATA_PROVIDER_ID, album.id),
});

const track = (url: UrlBuilder, song: SubsonicSong): Track => ({
  title: song.title,
  artists: [{ ...creditOf(song.artist, song.artistId), roles: [] }],
  album: song.albumId
    ? {
        title: song.album ?? '',
        source: source(METADATA_PROVIDER_ID, song.albumId),
      }
    : undefined,
  durationMs: durationMs(song),
  trackNumber: song.track,
  disc: song.discNumber ? String(song.discNumber) : undefined,
  artwork: artwork(url, song.coverArt),
  tags: song.genre ? [song.genre] : undefined,
  source: source(METADATA_PROVIDER_ID, song.id),
});

const trackRef = (url: UrlBuilder, song: SubsonicSong): TrackRef => ({
  title: song.title,
  artists: [creditOf(song.artist, song.artistId)],
  durationMs: durationMs(song),
  artwork: artwork(url, song.coverArt),
  source: source(METADATA_PROVIDER_ID, song.id),
});

const candidate = (url: UrlBuilder, song: SubsonicSong): StreamCandidate => ({
  id: song.id,
  title: song.artist ? `${song.artist} - ${song.title}` : song.title,
  durationMs: durationMs(song),
  thumbnail: song.coverArt
    ? url('getCoverArt', { id: song.coverArt, size: 200 })
    : undefined,
  failed: false,
  source: source(STREAMING_PROVIDER_ID, song.id),
});

const playlistRef = (
  url: UrlBuilder,
  playlist: SubsonicPlaylist,
): PlaylistRef => ({
  id: playlist.id,
  name: playlist.name,
  artwork: artwork(url, playlist.coverArt),
  source: {
    ...source(PLAYLIST_PROVIDER_ID, playlist.id),
    url: PLAYLIST_URL_PREFIX + playlist.id,
  },
});

const playlist = (url: UrlBuilder, list: SubsonicPlaylist): Playlist => {
  const created = list.created ?? new Date().toISOString();
  return {
    id: list.id,
    name: list.name,
    description: list.comment,
    artwork: artwork(url, list.coverArt),
    createdAtIso: created,
    lastModifiedIso: list.changed ?? created,
    isReadOnly: true,
    origin: source(PLAYLIST_PROVIDER_ID, list.id),
    items: (list.entry ?? []).map((song, index) => ({
      id: `${list.id}-${index}`,
      track: track(url, song),
      addedAtIso: created,
    })),
  };
};

const searchOnly = (
  kind: 'artistCount' | 'albumCount' | 'songCount',
  limit: number,
) => ({ artistCount: 0, albumCount: 0, songCount: 0, [kind]: limit });

const createMetadataProvider = (connect: Connect): MetadataProvider => ({
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
    return {
      name: artist.name,
      bio: info?.biography || undefined,
      artwork: artwork(client.url, artist.coverArt),
      source: source(METADATA_PROVIDER_ID, artist.id),
    };
  },

  fetchArtistAlbums: async (artistId: string): Promise<AlbumRef[]> => {
    const client = await connect();
    const artist = await client.getArtist(artistId);
    return (artist?.album ?? []).map((a) => albumRef(client.url, a));
  },

  // Top songs and similar artists rely on the server's external agents
  // (Last.fm…): empty when it has none.
  fetchArtistTopTracks: async (artistId: string): Promise<TrackRef[]> => {
    const client = await connect();
    const artist = await client.getArtist(artistId);
    if (!artist) {
      return [];
    }
    const songs = await client.getTopSongs(artist.name, ARTIST_TOP_TRACKS);
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

const createStreamingProvider = (connect: Connect): StreamingProvider => {
  const searchForTrack = async (artist: string, title: string) => {
    const client = await connect();
    const result = await client.search(
      `${artist} ${title}`,
      searchOnly('songCount', STREAMING_SEARCH_LIMIT),
    );
    return (result.song ?? []).map((s) => candidate(client.url, s));
  };

  return {
    id: STREAMING_PROVIDER_ID,
    kind: 'streaming',
    name: 'Subsonic',

    searchForTrack,

    // A track that comes from this server already carries its id.
    searchForTrackV2: async (t: Track) =>
      t.source.provider === METADATA_PROVIDER_ID
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
      const url = client.url('stream', { id: candidateId });
      return {
        url,
        protocol: url.startsWith('https:') ? 'https' : 'http',
        source: source(STREAMING_PROVIDER_ID, candidateId),
      };
    },
  };
};

const createDashboardProvider = (connect: Connect): DashboardProvider => ({
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

const createPlaylistProvider = (connect: Connect): PlaylistProvider => ({
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

const createDiscoveryProvider = (connect: Connect): DiscoveryProvider => ({
  id: DISCOVERY_PROVIDER_ID,
  kind: 'discovery',
  name: 'Subsonic',
  // Songs similar to the last one from this server, random ones otherwise.
  getRecommendations: async (context: Track[], { limit }) => {
    const client = await connect();
    const count = limit ?? DISCOVERY_LIMIT;
    const seed = context
      .filter((t) => t.source.provider === METADATA_PROVIDER_ID)
      .at(-1);
    const similar = seed
      ? await client.getSimilarSongs(seed.source.id, count).catch(() => [])
      : [];
    const played = new Set(context.map((t) => t.source.id));
    const fresh = similar.filter((s) => !played.has(s.id));
    const songs = fresh.length ? fresh : await client.getRandomSongs(count);
    return songs.map((s) => track(client.url, s));
  },
});

const plugin: NuclearPlugin = {
  // Nuclear only calls onEnable: settings registered in onLoad never show up.
  async onEnable(api: NuclearPluginAPI) {
    await api.Settings.register([
      {
        id: 'url',
        title: 'Server URL',
        description: 'e.g. https://music.example.com',
        category: CATEGORY,
        kind: 'string',
        format: 'url',
        widget: { type: 'text', placeholder: 'https://' },
      },
      {
        id: 'username',
        title: 'Username',
        category: CATEGORY,
        kind: 'string',
        widget: { type: 'text' },
      },
      {
        id: 'password',
        title: 'Password',
        category: CATEGORY,
        kind: 'string',
        widget: { type: 'password' },
      },
    ]);

    const connect = createClient(api);
    api.Providers.register(createMetadataProvider(connect));
    api.Providers.register(createStreamingProvider(connect));
    api.Providers.register(createDashboardProvider(connect));
    api.Providers.register(createPlaylistProvider(connect));
    api.Providers.register(createDiscoveryProvider(connect));
  },

  onDisable(api: NuclearPluginAPI) {
    api.Providers.unregister(METADATA_PROVIDER_ID);
    api.Providers.unregister(STREAMING_PROVIDER_ID);
    api.Providers.unregister(DASHBOARD_PROVIDER_ID);
    api.Providers.unregister(PLAYLIST_PROVIDER_ID);
    api.Providers.unregister(DISCOVERY_PROVIDER_ID);
  },
};

export default plugin;
