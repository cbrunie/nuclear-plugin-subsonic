import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import { md5 } from './md5.ts';

test('md5 matches node:crypto', () => {
  const inputs = [
    '',
    'a',
    'sesame',
    'mot de passe à accents ✓',
    'x'.repeat(55),
    'x'.repeat(56),
    'x'.repeat(1000),
  ];
  for (const input of inputs) {
    assert.equal(md5(input), createHash('md5').update(input).digest('hex'));
  }
});

test('Subsonic API docs example', () => {
  assert.equal(md5('sesamec19b2d'), '26719a1196d2a940705a59634eb18eab');
});
