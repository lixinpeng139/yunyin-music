import type { LyricLine, ParsedLyric } from "../types/ncm";

const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

/**
 * Parses an LRC payload into timed lines.
 *
 * Handles the messy realities of NetEase lyric data: multiple time tags on one
 * line (`[00:12.00][01:20.00]副歌`), `[mm:ss:cc]` variant separators, metadata
 * tags, and unsynced payloads that carry no timestamps at all.
 */
export function parseLyric(raw: string | undefined | null): LyricLine[] {
  if (!raw) return [];
  const lines: LyricLine[] = [];
  for (const rawLine of raw.split("\n")) {
    const line = rawLine.replace(/\r/g, "").trim();
    if (!line) continue;
    TIME_TAG.lastIndex = 0;
    const stamps: number[] = [];
    let match: RegExpExecArray | null;
    let lastIndex = 0;
    while ((match = TIME_TAG.exec(line)) !== null) {
      // Any bracketed metadata must come before the first timestamp to count.
      if (match.index !== lastIndex) break;
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fractionRaw = match[3] ?? "0";
      const fraction = Number(fractionRaw.padEnd(3, "0").slice(0, 3));
      stamps.push(minutes * 60_000 + seconds * 1000 + fraction);
      lastIndex = TIME_TAG.lastIndex;
    }
    if (!stamps.length) continue;
    const text = line.slice(lastIndex).trim();
    for (const time of stamps) lines.push({ time, text });
  }
  return lines.sort((a, b) => a.time - b.time);
}

/** Plain-text fallback: one line per row, evenly spaced, no timings. */
function plainLines(raw: string | undefined | null): LyricLine[] {
  if (!raw) return [];
  return raw
    .split("\n")
    .map((line) => line.replace(/\r/g, "").trim())
    .filter(Boolean)
    .map((text, index) => ({ time: index * 4000, text }));
}

/**
 * Merges the main lyric with its translation (and romanisation), matching on
 * timestamp. NetEase frequently returns the same line count but with timings
 * that drift by a few milliseconds, so a small tolerance window is used.
 */
export function mergeLyrics(
  main: string | undefined | null,
  translation?: string | undefined | null,
  roman?: string | undefined | null,
): ParsedLyric {
  const primary = parseLyric(main);
  if (!primary.length) {
    const fallback = plainLines(main);
    return { lines: fallback, plainOnly: fallback.length > 0 };
  }

  const secondary = [...parseLyric(translation), ...parseLyric(roman)].sort(
    (a, b) => a.time - b.time,
  );

  if (secondary.length) {
    const TOLERANCE = 120;
    let cursor = 0;
    for (const line of primary) {
      while (
        cursor < secondary.length &&
        secondary[cursor]!.time < line.time - TOLERANCE
      ) {
        cursor += 1;
      }
      const candidate = secondary[cursor];
      if (candidate && Math.abs(candidate.time - line.time) <= TOLERANCE) {
        if (candidate.text && candidate.text !== line.text)
          line.sub = candidate.text;
      }
    }
  }

  return { lines: primary, plainOnly: false };
}

/** Index of the line that should be highlighted at `position` ms. */
export function activeLineIndex(lines: LyricLine[], position: number): number {
  if (!lines.length) return -1;
  let low = 0;
  let high = lines.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lines[mid]!.time <= position) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}
