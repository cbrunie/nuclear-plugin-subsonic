import type {
  AlbumRef,
  ArtistRef,
  ArtworkSet,
  Playlist,
  PlaylistRef,
  StreamCandidate,
  Track,
  TrackRef,
} from '@nuclearplayer/plugin-sdk';

import {
  METADATA_PROVIDER_ID,
  PLAYLIST_PROVIDER_ID,
  PLAYLIST_URL_PREFIX,
  STREAMING_PROVIDER_ID,
} from './config';
import type {
  SubsonicAlbum,
  SubsonicArtist,
  SubsonicPlaylist,
  SubsonicSong,
  UrlBuilder,
} from './subsonic';

export const source = (provider: string, id: string) => ({ provider, id });

export const isFromServer = (ref: { source: { provider: string } }) =>
  ref.source.provider === METADATA_PROVIDER_ID;

export const artwork = (
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

export const artistRef = (
  url: UrlBuilder,
  artist: SubsonicArtist,
): ArtistRef => ({
  name: artist.name,
  artwork: artwork(url, artist.coverArt),
  source: source(METADATA_PROVIDER_ID, artist.id),
});

export const creditOf = (name?: string, id?: string) => ({
  name: name ?? 'Unknown artist',
  source: source(METADATA_PROVIDER_ID, id ?? ''),
});

export const albumRef = (url: UrlBuilder, album: SubsonicAlbum): AlbumRef => ({
  title: album.name,
  artists: album.artist ? [creditOf(album.artist, album.artistId)] : undefined,
  artwork: artwork(url, album.coverArt),
  source: source(METADATA_PROVIDER_ID, album.id),
});

export const track = (url: UrlBuilder, song: SubsonicSong): Track => ({
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

export const trackRef = (url: UrlBuilder, song: SubsonicSong): TrackRef => ({
  title: song.title,
  artists: [creditOf(song.artist, song.artistId)],
  durationMs: durationMs(song),
  artwork: artwork(url, song.coverArt),
  source: source(METADATA_PROVIDER_ID, song.id),
});

export const candidate = (
  url: UrlBuilder,
  song: SubsonicSong,
): StreamCandidate => ({
  id: song.id,
  title: song.artist ? `${song.artist} - ${song.title}` : song.title,
  durationMs: durationMs(song),
  thumbnail: song.coverArt
    ? url('getCoverArt', { id: song.coverArt, size: 200 })
    : undefined,
  failed: false,
  source: source(STREAMING_PROVIDER_ID, song.id),
});

export const playlistRef = (
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

export const playlist = (url: UrlBuilder, list: SubsonicPlaylist): Playlist => {
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
