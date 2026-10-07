import type {
  Album,
  AlbumRef,
  ArtistBio,
  ArtistRef,
  ArtworkSet,
  MetadataProvider,
  NuclearPlugin,
  NuclearPluginAPI,
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
  type SubsonicSong,
  type UrlBuilder,
} from './subsonic';

const CATEGORY = 'Subsonic';
const METADATA_PROVIDER_ID = 'subsonic';
const STREAMING_PROVIDER_ID = 'subsonic-stream';
const DEFAULT_SEARCH_LIMIT = 20;
const STREAMING_SEARCH_LIMIT = 5;

type Connect = ReturnType<typeof createClient>;

const source = (provider: string, id: string) => ({ provider, id });

const artwork = (
  url: UrlBuilder,
  coverArt?: string,
): ArtworkSet | undefined =>
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
  artistMetadataCapabilities: ['artistBio', 'artistAlbums'],
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
  },

  onDisable(api: NuclearPluginAPI) {
    api.Providers.unregister(METADATA_PROVIDER_ID);
    api.Providers.unregister(STREAMING_PROVIDER_ID);
  },
};

export default plugin;
