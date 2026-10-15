import type { Lyrics } from '@nuclearplayer/plugin-sdk';

import type { StructuredLyrics } from './subsonic';

// Lines without an explicit end last until the next one; the last one
// until the end of the track, or a few seconds when its length is unknown.
const LAST_LINE_MS = 5000;

const plain = (lines: string[]): Lyrics => ({
  type: 'plain',
  metadata: {},
  sections: [{ lines: lines.map((text) => ({ segments: [{ text }] })) }],
});

// Picks the main layer, synced first, and converts it. Translations and
// pronunciations are separate layers without line alignment: left out.
export const fromStructured = (
  entries: StructuredLyrics[],
  durationMs?: number,
): Lyrics | undefined => {
  const main = entries.filter((e) => !e.kind || e.kind === 'main');
  const chosen = main.find((e) => e.synced) ?? main[0];
  if (!chosen || chosen.line.length === 0) {
    return undefined;
  }
  if (!chosen.synced) {
    return plain(chosen.line.map((l) => l.value));
  }

  // A positive offset shows the lyrics sooner.
  const shift = (ms: number) => Math.max(0, ms - (chosen.offset ?? 0));
  const starts = chosen.line.map((l) => shift(l.start ?? 0));
  const endOf = (i: number) =>
    starts[i + 1] ?? Math.max(durationMs ?? 0, starts[i] + LAST_LINE_MS);

  const cueLines = chosen.cueLine?.filter((c) => c.cue?.length);
  if (cueLines?.length) {
    return {
      type: 'wordSynced',
      metadata: {},
      sections: [
        {
          lines: cueLines.map((c) => ({
            startMs: shift(c.start ?? c.cue![0].start),
            endMs: shift(c.end ?? c.cue!.at(-1)!.end),
            segments: c.cue!.map((cue) => ({
              text: cue.value,
              startMs: shift(cue.start),
              endMs: shift(cue.end),
            })),
          })),
        },
      ],
    };
  }

  return {
    type: 'lineSynced',
    metadata: {},
    sections: [
      {
        lines: chosen.line.map((l, i) => ({
          startMs: starts[i],
          endMs: endOf(i),
          segments: [{ text: l.value }],
        })),
      },
    ],
  };
};

// The legacy getLyrics answer: one plain text block.
export const fromText = (text?: string): Lyrics | undefined => {
  const lines = text?.replace(/\r\n?/g, '\n').trim().split('\n');
  return lines?.some((l) => l.trim()) ? plain(lines) : undefined;
};
