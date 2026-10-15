import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fromStructured, fromText } from './lyrics.ts';

test('synced lines: offset applied, ends chained, last line to track end', () => {
  const lyrics = fromStructured(
    [
      { kind: 'translation', synced: true, line: [{ start: 0, value: 'x' }] },
      {
        synced: true,
        offset: 100,
        line: [
          { start: 1000, value: 'one' },
          { start: 3000, value: 'two' },
        ],
      },
    ],
    10_000,
  );
  assert.equal(lyrics?.type, 'lineSynced');
  assert.deepEqual(
    lyrics?.type === 'lineSynced' &&
      lyrics.sections[0].lines.map((l) => [
        l.startMs,
        l.endMs,
        l.segments[0].text,
      ]),
    [
      [900, 2900, 'one'],
      [2900, 10_000, 'two'],
    ],
  );
});

test('synced preferred over unsynced, unsynced gives plain', () => {
  const unsynced = { synced: false, line: [{ value: 'a' }] };
  const synced = { synced: true, line: [{ start: 0, value: 'b' }] };
  assert.equal(fromStructured([unsynced, synced])?.type, 'lineSynced');
  assert.equal(fromStructured([unsynced])?.type, 'plain');
  assert.equal(fromStructured([]), undefined);
});

test('word-level cues give wordSynced', () => {
  const lyrics = fromStructured([
    {
      kind: 'main',
      synced: true,
      line: [{ start: 0, value: 'hi you' }],
      cueLine: [
        {
          index: 0,
          start: 0,
          end: 900,
          value: 'hi you',
          cue: [
            { start: 0, end: 400, value: 'hi ' },
            { start: 400, end: 900, value: 'you' },
          ],
        },
      ],
    },
  ]);
  assert.equal(lyrics?.type, 'wordSynced');
  assert.equal(
    lyrics?.type === 'wordSynced' &&
      lyrics.sections[0].lines[0].segments[1].startMs,
    400,
  );
});

test('legacy text', () => {
  assert.equal(fromText(''), undefined);
  assert.equal(fromText(undefined), undefined);
  const lyrics = fromText('a\r\nb\n');
  assert.equal(lyrics?.type === 'plain' && lyrics.sections[0].lines.length, 2);
});
