import type {
  NuclearPlugin,
  NuclearPluginAPI,
} from '@nuclearplayer/plugin-sdk';

const CATEGORY = 'Subsonic';

const plugin: NuclearPlugin = {
  async onLoad(api: NuclearPluginAPI) {
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
  },

  // ponytail: providers (metadata + streaming) to come
  onEnable() {},
  onDisable() {},
};

export default plugin;
