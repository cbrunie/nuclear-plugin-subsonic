import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  planPlaylistSync,
  type NuclearSide,
  type PlaylistLink,
  type ServerSide,
} from './playlistSync.ts';

const link: PlaylistLink = {
  nuclearId: 'n1',
  serverId: 's1',
  nuclearModified: 't1',
  serverChanged: 'c1',
};
const n1: NuclearSide = {
  id: 'n1',
  name: 'Road trip',
  modified: 't1',
  hasServerTracks: true,
};
const s1: ServerSide = {
  id: 's1',
  name: 'Road trip',
  changed: 'c1',
  editable: true,
};
const none = new Set<string>();
const plan = ({
  links = [link],
  nuclear = [n1],
  server = [s1],
  vanished = none,
}: {
  links?: PlaylistLink[];
  nuclear?: NuclearSide[];
  server?: ServerSide[];
  vanished?: Set<string>;
}) => planPlaylistSync({ links, nuclear, server, vanished }).map((a) => a.type);

test('nothing changed: nothing to do', () => {
  assert.deepEqual(plan({}), []);
});

test('changed on one side goes to the other, Nuclear wins a conflict', () => {
  const edited = { ...n1, modified: 't2' };
  const moved = { ...s1, changed: 'c2' };
  assert.deepEqual(plan({ nuclear: [edited] }), ['push']);
  assert.deepEqual(plan({ server: [moved] }), ['pull']);
  assert.deepEqual(plan({ nuclear: [edited], server: [moved] }), ['push']);
});

test('missing from Nuclear: deleted on the server only if seen vanishing while on', () => {
  // Missing at startup, or deleted while the sync was off: never deleted,
  // the server copy comes back instead.
  assert.deepEqual(plan({ nuclear: [] }), ['unlink', 'importFromServer']);
  assert.deepEqual(plan({ nuclear: [], vanished: new Set(['n1']) }), [
    'deleteOnServer',
  ]);
});

test('missing from the server: deletion proposed, unless edited in Nuclear', () => {
  assert.deepEqual(plan({ server: [] }), ['deleteInNuclear']);
  assert.deepEqual(plan({ server: [], nuclear: [{ ...n1, modified: 't2' }] }), [
    'unlink',
    'createOnServer',
  ]);
});

test("someone else's playlist is never deleted, synced or imported", () => {
  const theirs = { ...s1, editable: false };
  assert.deepEqual(plan({ server: [theirs] }), ['unlink', 'createOnServer']);
  assert.deepEqual(plan({ links: [], nuclear: [], server: [theirs] }), []);
  assert.deepEqual(
    plan({ nuclear: [], server: [theirs], vanished: new Set(['n1']) }),
    ['unlink'],
  );
});

test('links lost: same playlists paired by name, not duplicated', () => {
  const actions = planPlaylistSync({
    links: [],
    nuclear: [{ ...n1, name: ' road TRIP ' }],
    server: [s1],
    vanished: none,
  });
  assert.deepEqual(actions, [
    { type: 'link', nuclearId: 'n1', serverId: 's1' },
  ]);
});

test('an ambiguous name is not paired', () => {
  const twin = { ...n1, id: 'n2' };
  assert.deepEqual(plan({ links: [], nuclear: [n1, twin] }), [
    'createOnServer',
    'createOnServer',
    'importFromServer',
  ]);
});

test('unlinked: hand-made copies paired by origin, others created or imported', () => {
  const actions = planPlaylistSync({
    links: [],
    nuclear: [
      {
        id: 'copy',
        name: 'Copy',
        modified: 't',
        originServerId: 's1',
        hasServerTracks: true,
      },
      { id: 'mixed', name: 'Mixed', modified: 't', hasServerTracks: true },
      { id: 'youtube', name: 'YouTube', modified: 't', hasServerTracks: false },
    ],
    server: [s1, { id: 's2', name: 'Other', editable: true }],
    vanished: none,
  });
  assert.deepEqual(actions, [
    { type: 'link', nuclearId: 'copy', serverId: 's1' },
    { type: 'createOnServer', nuclearId: 'mixed' },
    { type: 'importFromServer', serverId: 's2' },
  ]);
});
