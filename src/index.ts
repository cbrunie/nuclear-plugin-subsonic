import type {
  NuclearPlugin,
  NuclearPluginAPI,
} from '@nuclearplayer/plugin-sdk';

import {
  DASHBOARD_PROVIDER_ID,
  DISCOVERY_PROVIDER_ID,
  LYRICS_PROVIDER_ID,
  METADATA_PROVIDER_ID,
  PLAYLIST_PROVIDER_ID,
  SETTING_DEFINITIONS,
  STREAMING_PROVIDER_ID,
} from './config';
import {
  createDashboardProvider,
  createDiscoveryProvider,
  createLyricsProvider,
  createMetadataProvider,
  createPlaylistProvider,
  createStreamingProvider,
} from './providers';
import { createClient } from './subsonic';
import {
  startFavoritesSync,
  startPlayQueueSync,
  startScrobbling,
} from './sync';

let cleanups: (() => void)[] = [];

const plugin: NuclearPlugin = {
  // Nuclear only calls onEnable: settings registered in onLoad never show up.
  async onEnable(api: NuclearPluginAPI) {
    await api.Settings.register(SETTING_DEFINITIONS);

    const connect = createClient(api);
    api.Providers.register(createMetadataProvider(connect));
    api.Providers.register(createStreamingProvider(api, connect));
    api.Providers.register(createDashboardProvider(connect));
    api.Providers.register(createPlaylistProvider(connect));
    api.Providers.register(createDiscoveryProvider(connect));
    api.Providers.register(createLyricsProvider(connect));

    // In the background: an unreachable or unconfigured server must not
    // keep the plugin from enabling.
    for (const start of [
      startFavoritesSync,
      startPlayQueueSync,
      startScrobbling,
    ]) {
      start(api, connect)
        .then((cleanup) => cleanups.push(cleanup))
        .catch((error) =>
          api.Logger.warn(`Subsonic: sync not started: ${String(error)}`),
        );
    }
  },

  onDisable(api: NuclearPluginAPI) {
    cleanups.forEach((cleanup) => cleanup());
    cleanups = [];
    api.Providers.unregister(METADATA_PROVIDER_ID);
    api.Providers.unregister(STREAMING_PROVIDER_ID);
    api.Providers.unregister(DASHBOARD_PROVIDER_ID);
    api.Providers.unregister(PLAYLIST_PROVIDER_ID);
    api.Providers.unregister(DISCOVERY_PROVIDER_ID);
    api.Providers.unregister(LYRICS_PROVIDER_ID);
  },
};

export default plugin;
