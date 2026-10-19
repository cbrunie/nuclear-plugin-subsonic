import assert from 'node:assert/strict';
import { test } from 'node:test';

import { planPlaylistSync, type PlaylistLink } from './playlistSync.ts';

const link: PlaylistLink = {
  nuclearId: 'n1',
  serverId: 's1',
  nuclearModified: 't1',
  serverChanged: 'c1',
};
const n1 = { id: 'n1', modified: 't1', hasServerTracks: true };
const s1 = { id: 's1', changed: 'c1' };
const types = (actions: { type: string }[]) => actions.map((a) => a.type);
const none = new Set<string>();

test('nothing changed: nothing to do', () => {
  assert.deepEqual(
    planPlaylistSync({
      links: [link],
      nuclear: [n1],
      server: [s1],
      vanished: none,
    }),
    [],
  );
});

test('changed on one side goes to the other, Nuclear wins a conflict', () => {
  const edited = { ...n1, modified: 't2' };
  const moved = { ...s1, changed: 'c2' };
  const plan = (n: typeof n1, s: typeof s1) =>
    types(
      planPlaylistSync({
        links: [link],
        nuclear: [n],
        server: [s],
        vanished: none,
      }),
    );
  assert.deepEqual(plan(edited, s1), ['push']);
  assert.deepEqual(plan(n1, moved), ['pull']);
  assert.deepEqual(plan(edited, moved), ['push']);
});

test('a playlist missing from Nuclear is deleted on the server only if seen vanishing', () => {
  const plan = (vanished: Set<string>) =>
    types(
      planPlaylistSync({ links: [link], nuclear: [], server: [s1], vanished }),
    );
  assert.deepEqual(plan(none), ['unlink', 'importFromServer']);
  assert.deepEqual(plan(new Set(['n1'])), ['deleteOnServer']);
});

test('deleted on the server: follow, unless edited in Nuclear', () => {
  const plan = (n: typeof n1) =>
    types(
      planPlaylistSync({
        links: [link],
        nuclear: [n],
        server: [],
        vanished: none,
      }),
    );
  assert.deepEqual(plan(n1), ['deleteInNuclear']);
  assert.deepEqual(plan({ ...n1, modified: 't2' }), [
    'unlink',
    'createOnServer',
  ]);
});

test('unlinked: hand-made copies relinked, others created or imported', () => {
  const actions = planPlaylistSync({
    links: [],
    nuclear: [
      {
        id: 'copy',
        modified: 't',
        originServerId: 's1',
        hasServerTracks: true,
      },
      { id: 'mixed', modified: 't', hasServerTracks: true },
      { id: 'youtube', modified: 't', hasServerTracks: false },
    ],
    server: [s1, { id: 's2' }],
    vanished: none,
  });
  assert.deepEqual(actions, [
    { type: 'link', nuclearId: 'copy', serverId: 's1' },
    { type: 'createOnServer', nuclearId: 'mixed' },
    { type: 'importFromServer', serverId: 's2' },
  ]);
});
