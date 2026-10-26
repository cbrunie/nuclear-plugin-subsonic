import type {
  CustomWidgetComponent,
  NuclearPlugin,
  NuclearPluginAPI,
} from '@nuclearplayer/plugin-sdk';

import { ConnectionTest } from './ConnectionTest';
import {
  CONNECTION_TEST_WIDGET,
  DASHBOARD_PROVIDER_ID,
  DISCOVERY_PROVIDER_ID,
  LYRICS_PROVIDER_ID,
  METADATA_PROVIDER_ID,
  PLAYLIST_PROVIDER_ID,
  SETTING_DEFINITIONS,
  SETTINGS,
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
  startPlaylistSync,
  startPlayQueueSync,
  startScrobbling,
} from './sync';

const SYNCS = [
  startFavoritesSync,
  startPlayQueueSync,
  startScrobbling,
  startPlaylistSync,
];

let cleanups: (() => void)[] = [];
let stopSyncs = () => {};

const plugin: NuclearPlugin = {
  // Nuclear only calls onEnable: settings registered in onLoad never show up.
  async onEnable(api: NuclearPluginAPI) {
    await api.Settings.register(SETTING_DEFINITIONS);
    // Nuclear passes the plugin's own API to its widgets (CustomWidgetField).
    api.Settings.registerWidget(
      CONNECTION_TEST_WIDGET,
      ConnectionTest as CustomWidgetComponent,
    );

    const connect = createClient(api);
    api.Providers.register(createMetadataProvider(connect));
    api.Providers.register(createStreamingProvider(api, connect));
    api.Providers.register(createDashboardProvider(connect));
    api.Providers.register(createPlaylistProvider(connect));
    api.Providers.register(createDiscoveryProvider(connect));
    api.Providers.register(createLyricsProvider(connect));

    // In the background: an unreachable or unconfigured server must not
    // keep the plugin from enabling. Connecting an account restarts them;
    // typing in the fields does not, nothing is sent before Connect.
    let generation = 0;
    const startSyncs = () => {
      stopSyncs();
      const current = ++generation;
      const running: (() => void)[] = [];
      stopSyncs = () => {
        generation++;
        running.splice(0).forEach((stop) => stop());
      };
      for (const start of SYNCS) {
        start(api, connect)
          .then((stop) =>
            // Stopped or restarted while starting: stop right away.
            current === generation ? running.push(stop) : stop(),
          )
          .catch((error) =>
            api.Logger.warn(`Subsonic: sync not started: ${String(error)}`),
          );
      }
    };
    startSyncs();

    cleanups = [
      api.Settings.subscribe(SETTINGS.ACCOUNT, startSyncs),
      () => stopSyncs(),
    ];
  },

  onDisable(api: NuclearPluginAPI) {
    cleanups.forEach((cleanup) => cleanup());
    cleanups = [];
    api.Settings.unregisterWidget(CONNECTION_TEST_WIDGET);
    api.Providers.unregister(METADATA_PROVIDER_ID);
    api.Providers.unregister(STREAMING_PROVIDER_ID);
    api.Providers.unregister(DASHBOARD_PROVIDER_ID);
    api.Providers.unregister(PLAYLIST_PROVIDER_ID);
    api.Providers.unregister(DISCOVERY_PROVIDER_ID);
    api.Providers.unregister(LYRICS_PROVIDER_ID);
  },
};

export default plugin;
