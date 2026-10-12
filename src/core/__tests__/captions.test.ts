import { describe, expect, it } from 'vitest';
import {
  CAPTION_STYLES,
  CaptionEngine,
  CaptionSegment,
  DEFAULT_CAPTION_SETTINGS,
  generateSegmentsFromText
} from '../captionEngine';

const seg = (text: string, startSec: number, endSec: number): CaptionSegment => {
  const words = text.split(' ');
  const step = (endSec - startSec) / words.length;
  return {
    id: text,
    text,
    startSec,
    endSec,
    words: words.map((word, i) => ({ word, startSec: startSec + i * step, endSec: startSec + (i + 1) * step }))
  };
};

describe('SRT round trip', () => {
  it('parses what exportToSrt writes', () => {
    const input = [seg('Hello there', 0.5, 2), seg('General Kenobi', 2.5, 4.25)];
    const parsed = CaptionEngine.parseSrtOrVtt(CaptionEngine.exportToSrt(input));
    expect(parsed.map((s) => s.text)).toEqual(['Hello there', 'General Kenobi']);
    expect(parsed[1].startSec).toBeCloseTo(2.5);
    expect(parsed[1].endSec).toBeCloseTo(4.25);
  });
});

describe('generateSegmentsFromText', () => {
  it('splits a paragraph into sentences that fit the video', () => {
    const out = generateSegmentsFromText('First line. Second line! Third?', 12);
    expect(out.map((s) => s.text)).toEqual(['First line.', 'Second line!', 'Third?']);
    for (const s of out) expect(s.endSec).toBeLessThanOrEqual(12);
  });

  it('returns nothing for blank input', () => {
    expect(generateSegmentsFromText('   ', 10)).toEqual([]);
  });
});

describe('shiftForTrim', () => {
  it('drops lines outside the cut and moves the rest onto the new timeline', () => {
    const out = CaptionEngine.shiftForTrim([seg('gone', 0, 1.5), seg('kept', 3, 4), seg('edge', 9, 12)], 2, 10);
    expect(out.map((s) => s.text)).toEqual(['kept', 'edge']);
    expect(out[0].startSec).toBeCloseTo(1);
    expect(out[0].endSec).toBeCloseTo(2);
    // Clamped to the trimmed length
    expect(out[1].endSec).toBeCloseTo(8);
    expect(out[1].words.every((w) => w.endSec <= 8)).toBe(true);
  });
});

describe('toASS', () => {
  const style = CAPTION_STYLES.viral_karaoke;

  it('writes a script sized to the video with one event per word slice', () => {
    const ass = CaptionEngine.toASS([seg('one two', 1, 2)], style, DEFAULT_CAPTION_SETTINGS, 1080, 1920);
    expect(ass).toContain('PlayResX: 1080');
    expect(ass).toContain('PlayResY: 1920');
    const events = ass.split('\n').filter((l) => l.startsWith('Dialogue:'));
    expect(events).toHaveLength(2);
    expect(events[0]).toContain('0:00:01.00,0:00:01.50');
    // Only the spoken word carries the highlight colour override
    expect(events[0]).toMatch(/\{\\c&H[0-9A-F]{8}&\}ONE\{\\c&H[0-9A-F]{8}&\} TWO/);
  });

  it('strips override braces and escapes newlines from user text', () => {
    const plain = CAPTION_STYLES.minimal_clean;
    const ass = CaptionEngine.toASS([seg('a{\\b1}b', 0, 1)], plain, DEFAULT_CAPTION_SETTINGS, 1080, 1920);
    const event = ass.split('\n').find((l) => l.startsWith('Dialogue:'))!;
    const text = event.slice(event.indexOf('}') + 1);
    expect(text).not.toMatch(/[{}]/);
  });

  it('uses a single background box for opaque backgrounds and an outline for transparent ones', () => {
    const boxed = CaptionEngine.toASS([], style, DEFAULT_CAPTION_SETTINGS, 1080, 1920);
    const bare = CaptionEngine.toASS([], style, { ...DEFAULT_CAPTION_SETTINGS, bgPreset: 'transparent', bgOpacity: 0 }, 1080, 1920);
    const borderStyle = (ass: string) => ass.split('\n').find((l) => l.startsWith('Style:'))!.split(',')[15];
    expect(borderStyle(boxed)).toBe('4');
    expect(borderStyle(bare)).toBe('1');
  });
});
