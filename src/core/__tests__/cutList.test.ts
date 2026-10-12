import { describe, expect, it } from 'vitest';
import type { CaptionSegment } from '../captionEngine';
import {
  EditHistory,
  addCut,
  cutFilterGraph,
  keptLength,
  keptRanges,
  normalizeCuts,
  parseRanges,
  playableTime,
  remapCaptions,
  restoreCut,
  toEditedTime
} from '../cutList';

const r = (startSec: number, endSec: number) => ({ startSec, endSec });

describe('normalizeCuts', () => {
  it('sorts, clamps and merges overlapping cuts', () => {
    expect(normalizeCuts([r(8, 12), r(-1, 2), r(1, 3), r(5, 6)], 10)).toEqual([r(0, 3), r(5, 6), r(8, 10)]);
  });

  it('snaps cuts to the ends and folds in slivers', () => {
    expect(normalizeCuts([r(0.05, 2), r(2.05, 4), r(9.95, 9.97)], 10)).toEqual([r(0, 4)]);
    expect(normalizeCuts([r(5, 9.95)], 10)).toEqual([r(5, 10)]);
  });
});

describe('addCut', () => {
  it('removes a middle section', () => {
    const res = addCut([], r(3, 5), 10);
    expect(res).toEqual({ ok: true, cuts: [r(3, 5)] });
    expect(keptRanges([r(3, 5)], 10)).toEqual([r(0, 3), r(5, 10)]);
    expect(keptLength([r(3, 5)], 10)).toBeCloseTo(8);
  });

  it('refuses a cut that changes nothing or removes everything', () => {
    expect(addCut([r(2, 6)], r(3, 4), 10)).toEqual({ ok: false, reason: 'unchanged' });
    expect(addCut([r(0, 5)], r(4.8, 10), 10)).toEqual({ ok: false, reason: 'too-much' });
  });
});

describe('restoreCut', () => {
  it('puts back only the cut under the time', () => {
    expect(restoreCut([r(1, 2), r(4, 6)], 5)).toEqual([r(1, 2)]);
    expect(restoreCut([r(1, 2)], 3)).toEqual([r(1, 2)]);
  });
});

describe('time mapping', () => {
  const kept = keptRanges([r(2, 4), r(6, 7)], 10);

  it('skips cuts during playback and stops at the end', () => {
    expect(playableTime(kept, 1)).toBe(1);
    expect(playableTime(kept, 3)).toBe(4);
    expect(playableTime(kept, 6.5)).toBe(7);
    expect(playableTime(kept, 10)).toBeNull();
  });

  it('maps source time onto the edited timeline', () => {
    expect(toEditedTime(kept, 1)).toBeCloseTo(1);
    expect(toEditedTime(kept, 3)).toBeCloseTo(2);
    expect(toEditedTime(kept, 5)).toBeCloseTo(3);
    expect(toEditedTime(kept, 8)).toBeCloseTo(5);
  });
});

describe('remapCaptions', () => {
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

  it('drops lines inside a cut, shifts later ones and shortens lines a cut runs through', () => {
    const kept = keptRanges([r(2, 4)], 10);
    const out = remapCaptions([seg('gone', 2.5, 3.5), seg('one two three four', 1, 5), seg('later', 6, 7)], kept);
    expect(out.map((s) => s.text)).toEqual(['one four', 'later']);
    expect(out[0].startSec).toBeCloseTo(1);
    expect(out[0].endSec).toBeCloseTo(3);
    expect(out[1].startSec).toBeCloseTo(4);
    expect(out[1].endSec).toBeCloseTo(5);
  });
});

describe('cutFilterGraph', () => {
  it('trims each kept piece and joins them, leaving the last piece open-ended', () => {
    const graph = cutFilterGraph([r(0, 3), r(5, 10)], 10, true);
    expect(graph).toBe(
      '[0:v]trim=start=0.000:end=3.000,setpts=PTS-STARTPTS[v0];[0:a]atrim=start=0.000:end=3.000,asetpts=PTS-STARTPTS[a0];' +
        '[0:v]trim=start=5.000,setpts=PTS-STARTPTS[v1];[0:a]atrim=start=5.000,asetpts=PTS-STARTPTS[a1];' +
        '[v0][a0][v1][a1]concat=n=2:v=1:a=1[vout][aout]'
    );
  });

  it('leaves audio out for silent recordings', () => {
    expect(cutFilterGraph([r(1, 2)], 10, false)).toBe('[0:v]trim=start=1.000:end=2.000,setpts=PTS-STARTPTS[v0];[v0]concat=n=1:v=1:a=0[vout]');
  });
});

describe('parseRanges', () => {
  it('accepts ordered ranges and rejects anything else', () => {
    expect(parseRanges([r(0, 1), r(2, 3)])).toEqual([r(0, 1), r(2, 3)]);
    expect(parseRanges([r(2, 3), r(0, 1)])).toBeNull();
    expect(parseRanges([{ startSec: 'x', endSec: 1 }])).toBeNull();
    expect(parseRanges([r(0, Infinity)])).toBeNull();
    expect(parseRanges([])).toBeNull();
    expect(parseRanges('nope')).toBeNull();
  });
});

describe('EditHistory', () => {
  it('undoes and redoes, and a new edit clears redo', () => {
    const h = new EditHistory<number>(0);
    h.push(1);
    h.push(2);
    expect(h.undo()).toBe(1);
    expect(h.undo()).toBe(0);
    expect(h.canUndo).toBe(false);
    expect(h.redo()).toBe(1);
    h.push(5);
    expect(h.canRedo).toBe(false);
    expect(h.current).toBe(5);
  });
});
