import assert from 'node:assert/strict';
import { test } from 'node:test';

import { accountKey, normalizeServerUrl, sameUser } from './account.ts';

test('one account whatever the spelling of the URL and username', () => {
  const key = accountKey({ url: 'https://music.example.com', username: 'Bob' });
  for (const url of [
    'http://music.example.com',
    'https://Music.Example.com/',
    'https://music.example.com:443//',
  ]) {
    assert.equal(accountKey({ url, username: 'bob' }), key);
  }
  assert.notEqual(
    accountKey({ url: 'https://music.example.com/navidrome', username: 'bob' }),
    key,
  );
  assert.notEqual(
    accountKey({ url: 'https://music.example.com:4533', username: 'bob' }),
    key,
  );
});

test('server URL: http(s) root, trailing slashes dropped', () => {
  assert.equal(
    normalizeServerUrl('  https://music.example.com/navidrome// '),
    'https://music.example.com/navidrome',
  );
  assert.equal(normalizeServerUrl('http://host:4533/'), 'http://host:4533');
  assert.throws(() => normalizeServerUrl('music.example.com'));
  assert.throws(() => normalizeServerUrl('ftp://music.example.com'));
  assert.throws(() => normalizeServerUrl('https://music.example.com/?u=x'));
});

test('usernames compare without case', () => {
  assert.equal(sameUser('CBrunie', 'cbrunie'), true);
  assert.equal(sameUser('cbrunie', 'other'), false);
  assert.equal(sameUser(undefined, 'cbrunie'), false);
});
