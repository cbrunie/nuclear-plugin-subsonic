import type { SettingDefinition } from '@nuclearplayer/plugin-sdk';

export const CONNECTION_TEST_WIDGET = 'connection-test';

export const METADATA_PROVIDER_ID = 'subsonic';
export const STREAMING_PROVIDER_ID = 'subsonic-stream';
export const DASHBOARD_PROVIDER_ID = 'subsonic-dashboard';
export const PLAYLIST_PROVIDER_ID = 'subsonic-playlists';
export const DISCOVERY_PROVIDER_ID = 'subsonic-discovery';
export const LYRICS_PROVIDER_ID = 'subsonic-lyrics';

export const DEFAULT_SEARCH_LIMIT = 20;
export const STREAMING_SEARCH_LIMIT = 5;
export const DASHBOARD_SIZE = 20;
export const DASHBOARD_ARTISTS = 12;
export const ARTIST_TOP_TRACKS = 10;
export const DISCOVERY_LIMIT = 20;
export const PLAY_QUEUE_SAVE_DELAY_MS = 3000;
export const PLAYLIST_SYNC_DELAY_MS = 2000;
// Changes made on the server by other clients are picked up this often.
export const PLAYLIST_SYNC_INTERVAL_MS = 5 * 60 * 1000;

// Nuclear opens a dashboard playlist through the playlist provider that
// matches its URL: server playlists get a URL of their own.
export const PLAYLIST_URL_PREFIX = 'subsonic://playlist/';

export const SETTINGS = {
  URL: 'url',
  USERNAME: 'username',
  PASSWORD: 'password',
  MAX_BIT_RATE: 'maxBitRate',
  FORMAT: 'format',
  SYNC_FAVORITES: 'syncFavorites',
  SYNC_PLAY_QUEUE: 'syncPlayQueue',
  SCROBBLE: 'scrobble',
  SYNC_PLAYLISTS: 'syncPlaylists',
  PLAYLIST_LINKS: 'playlistLinks',
  CONNECTION_TEST: 'connectionTest',
  ACCOUNT: 'account',
} as const;

const CATEGORY = 'Subsonic';
export const ORIGINAL = 'original';

export const SETTING_DEFINITIONS: SettingDefinition[] = [
  {
    id: SETTINGS.URL,
    title: 'Server URL',
    description: 'e.g. https://music.example.com',
    category: CATEGORY,
    kind: 'string',
    format: 'url',
    widget: { type: 'text', placeholder: 'https://' },
  },
  {
    id: SETTINGS.USERNAME,
    title: 'Username',
    category: CATEGORY,
    kind: 'string',
    widget: { type: 'text' },
  },
  {
    id: SETTINGS.PASSWORD,
    title: 'Password',
    category: CATEGORY,
    kind: 'string',
    widget: { type: 'password' },
  },
  {
    id: SETTINGS.CONNECTION_TEST,
    title: 'Connection',
    description:
      'Checks the URL and credentials above, then uses them. Nothing is sent to the server before.',
    category: CATEGORY,
    kind: 'custom',
    widgetId: CONNECTION_TEST_WIDGET,
    default: null,
  },
  {
    id: SETTINGS.MAX_BIT_RATE,
    title: 'Maximum bitrate',
    description: 'Above it, the server transcodes. Useful on mobile data.',
    category: CATEGORY,
    kind: 'enum',
    default: ORIGINAL,
    options: [
      { value: ORIGINAL, label: 'Original' },
      ...['320', '256', '192', '128', '96', '64'].map((kbps) => ({
        value: kbps,
        label: `${kbps} kbps`,
      })),
    ],
    widget: { type: 'select' },
  },
  {
    id: SETTINGS.FORMAT,
    title: 'Format',
    description: 'Formats other than the original depend on the server.',
    category: CATEGORY,
    kind: 'enum',
    default: ORIGINAL,
    options: [
      { value: ORIGINAL, label: 'Original' },
      { value: 'mp3', label: 'MP3' },
      { value: 'opus', label: 'Opus' },
      { value: 'aac', label: 'AAC' },
    ],
    widget: { type: 'select' },
  },
  {
    id: SETTINGS.SYNC_FAVORITES,
    title: 'Sync favorites',
    description:
      'Favorites from this server are starred on it, and its starred items appear in your favorites.',
    category: CATEGORY,
    kind: 'boolean',
    default: true,
    widget: { type: 'toggle' },
  },
  {
    id: SETTINGS.SYNC_PLAY_QUEUE,
    title: 'Sync play queue',
    description:
      'Saves the queue on the server, to resume it from another client. An empty queue is restored from it at startup.',
    category: CATEGORY,
    kind: 'boolean',
    default: true,
    widget: { type: 'toggle' },
  },
  {
    id: SETTINGS.SYNC_PLAYLISTS,
    title: 'Sync playlists',
    description:
      'Your server playlists appear in Nuclear, and Nuclear playlists holding songs from this server are kept on it (other songs stay in Nuclear only).',
    category: CATEGORY,
    kind: 'boolean',
    default: true,
    widget: { type: 'toggle' },
  },
  {
    // Which Nuclear playlist is which server playlist: internal state.
    id: SETTINGS.PLAYLIST_LINKS,
    title: 'Playlist links',
    category: CATEGORY,
    kind: 'string',
    default: '{}',
    hidden: true,
  },
  {
    // The account validated by Connect: what every request uses.
    id: SETTINGS.ACCOUNT,
    title: 'Account',
    category: CATEGORY,
    kind: 'string',
    hidden: true,
  },
  {
    id: SETTINGS.SCROBBLE,
    title: 'Scrobble',
    description:
      'Reports now playing and finished songs to the server: play counts, and whatever it forwards them to (Last.fm, ListenBrainz, etc.).',
    category: CATEGORY,
    kind: 'boolean',
    default: true,
    widget: { type: 'toggle' },
  },
];
