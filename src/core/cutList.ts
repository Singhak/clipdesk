import type { CaptionSegment } from './captionEngine';

// Non-destructive cut editing. An edit is a list of removed ranges in the source recording's
// timeline; the source file is never changed, so every edit can be undone until export.

export interface TimeRange {
  startSec: number;
  endSec: number;
}

/** Pieces shorter than this, kept or removed, are slivers from an imprecise drag and get absorbed */
export const MIN_PIECE_SEC = 0.1;
/** An edit must leave at least this much video */
export const MIN_KEEP_SEC = 0.5;

const sumLength = (ranges: readonly TimeRange[]) => ranges.reduce((n, r) => n + (r.endSec - r.startSec), 0);

/** Clamps, sorts and merges cuts, snapping them to the ends of the video when they nearly touch */
export function normalizeCuts(cuts: readonly TimeRange[], duration: number): TimeRange[] {
  const clamped = cuts
    .map((c) => {
      let startSec = Math.max(0, Math.min(duration, Math.min(c.startSec, c.endSec)));
      let endSec = Math.max(0, Math.min(duration, Math.max(c.startSec, c.endSec)));
      if (startSec < MIN_PIECE_SEC) startSec = 0;
      if (duration - endSec < MIN_PIECE_SEC) endSec = duration;
      return { startSec, endSec };
    })
    .filter((c) => c.endSec - c.startSec >= MIN_PIECE_SEC)
    .sort((a, b) => a.startSec - b.startSec);

  const merged: TimeRange[] = [];
  for (const c of clamped) {
    const last = merged[merged.length - 1];
    // A kept gap too short to matter is folded into the cuts around it
    if (last && c.startSec - last.endSec < MIN_PIECE_SEC) last.endSec = Math.max(last.endSec, c.endSec);
    else merged.push({ ...c });
  }
  return merged;
}

/** The parts of the video that survive the cuts, in order */
export function keptRanges(cuts: readonly TimeRange[], duration: number): TimeRange[] {
  const kept: TimeRange[] = [];
  let at = 0;
  for (const c of normalizeCuts(cuts, duration)) {
    if (c.startSec > at) kept.push({ startSec: at, endSec: c.startSec });
    at = c.endSec;
  }
  if (duration > at) kept.push({ startSec: at, endSec: duration });
  return kept;
}

/** The cuts that leave exactly `kept`, e.g. to reopen a saved edit */
export function cutsFromKept(kept: readonly TimeRange[], duration: number): TimeRange[] {
  const cuts: TimeRange[] = [];
  let at = 0;
  for (const r of kept) {
    if (r.startSec > at) cuts.push({ startSec: at, endSec: r.startSec });
    at = Math.max(at, r.endSec);
  }
  if (duration > at) cuts.push({ startSec: at, endSec: duration });
  return normalizeCuts(cuts, duration);
}

export const keptLength = (cuts: readonly TimeRange[], duration: number): number => sumLength(keptRanges(cuts, duration));

export type AddCutResult = { ok: true; cuts: TimeRange[] } | { ok: false; reason: 'unchanged' | 'too-much' };

/** Adds a cut, refusing one that changes nothing or leaves less than MIN_KEEP_SEC of video */
export function addCut(cuts: readonly TimeRange[], range: TimeRange, duration: number): AddCutResult {
  const next = normalizeCuts([...cuts, range], duration);
  if (Math.abs(sumLength(next) - sumLength(normalizeCuts(cuts, duration))) < 1e-6) return { ok: false, reason: 'unchanged' };
  if (keptLength(next, duration) < MIN_KEEP_SEC) return { ok: false, reason: 'too-much' };
  return { ok: true, cuts: next };
}

export const cutContaining = (cuts: readonly TimeRange[], t: number): TimeRange | undefined =>
  cuts.find((c) => t >= c.startSec && t < c.endSec);

/** Puts back the cut that covers `t` */
export const restoreCut = (cuts: readonly TimeRange[], t: number): TimeRange[] => {
  const hit = cutContaining(cuts, t);
  return hit ? cuts.filter((c) => c !== hit) : [...cuts];
};

/**
 * Where playback should be for source time `t`: `t` itself inside a kept range, the start of the
 * next kept range inside a cut, or null once nothing is left to play.
 */
export function playableTime(kept: readonly TimeRange[], t: number): number | null {
  for (const r of kept) {
    if (t < r.startSec) return r.startSec;
    if (t < r.endSec - 0.02) return t;
  }
  return null;
}

/** Source time to the matching time in the edited video; times inside a cut map to the cut point */
export function toEditedTime(kept: readonly TimeRange[], t: number): number {
  let offset = 0;
  for (const r of kept) {
    if (t <= r.startSec) return offset;
    if (t < r.endSec) return offset + (t - r.startSec);
    offset += r.endSec - r.startSec;
  }
  return offset;
}

/**
 * Moves captions onto the edited timeline. Lines and words that fall entirely inside cuts are
 * dropped; a line that loses some of its words is shortened to the words that remain.
 */
export function remapCaptions(segments: readonly CaptionSegment[], kept: readonly TimeRange[]): CaptionSegment[] {
  const overlap = (a: number, b: number, r: TimeRange) => Math.min(b, r.endSec) - Math.max(a, r.startSec);
  // Maps a span into the kept range it overlaps most, clamped to that range
  const mapSpan = (a: number, b: number) => {
    let best: TimeRange | null = null;
    for (const r of kept) if (overlap(a, b, r) > 0 && (!best || overlap(a, b, r) > overlap(a, b, best))) best = r;
    if (!best) return null;
    const clamp = (t: number) => Math.max(best!.startSec, Math.min(best!.endSec, t));
    return { startSec: toEditedTime(kept, clamp(a)), endSec: toEditedTime(kept, clamp(b)) };
  };

  const out: CaptionSegment[] = [];
  for (const seg of segments) {
    const touching = kept.filter((r) => overlap(seg.startSec, seg.endSec, r) > 0);
    if (touching.length === 0) continue;

    const words = seg.words.flatMap((w) => {
      const span = mapSpan(w.startSec, w.endSec);
      return span ? [{ ...w, ...span }] : [];
    });
    if (seg.words.length > 0 && words.length === 0) continue;

    const first = touching[0];
    const last = touching[touching.length - 1];
    out.push({
      ...seg,
      text: words.length < seg.words.length ? words.map((w) => w.word).join(' ') : seg.text,
      startSec: toEditedTime(kept, Math.max(seg.startSec, first.startSec)),
      endSec: toEditedTime(kept, Math.min(seg.endSec, last.endSec)),
      words
    });
  }
  return out;
}

/**
 * An ffmpeg filter graph that keeps `kept` from input 0 and joins the pieces. Its outputs are
 * [vout] and, with audio, [aout]. The last piece has no end time when it runs to the end of the
 * video, so a duration the browser under-reports can't clip the tail.
 */
export function cutFilterGraph(kept: readonly TimeRange[], duration: number, hasAudio: boolean): string {
  const window = (r: TimeRange) =>
    `start=${r.startSec.toFixed(3)}` + (r.endSec >= duration - 0.01 ? '' : `:end=${r.endSec.toFixed(3)}`);
  const chains: string[] = [];
  let joined = '';
  kept.forEach((r, i) => {
    chains.push(`[0:v]trim=${window(r)},setpts=PTS-STARTPTS[v${i}]`);
    joined += `[v${i}]`;
    if (hasAudio) {
      chains.push(`[0:a]atrim=${window(r)},asetpts=PTS-STARTPTS[a${i}]`);
      joined += `[a${i}]`;
    }
  });
  chains.push(`${joined}concat=n=${kept.length}:v=1:a=${hasAudio ? 1 : 0}[vout]${hasAudio ? '[aout]' : ''}`);
  return chains.join(';');
}

/** Validates ranges received over IPC: finite, ordered, non-overlapping and not too many */
export function parseRanges(value: unknown, max = 1000): TimeRange[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) return null;
  const out: TimeRange[] = [];
  let prevEnd = 0;
  for (const v of value) {
    const { startSec, endSec } = (v ?? {}) as Partial<TimeRange>;
    if (typeof startSec !== 'number' || typeof endSec !== 'number') return null;
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) return null;
    if (startSec < prevEnd || endSec - startSec < 0.05) return null;
    out.push({ startSec, endSec });
    prevEnd = endSec;
  }
  return out;
}

/** Undo/redo over immutable snapshots */
export class EditHistory<T> {
  private past: T[] = [];
  private future: T[] = [];

  constructor(
    private present: T,
    private readonly limit = 200
  ) {}

  get current(): T {
    return this.present;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  push(next: T): void {
    this.past.push(this.present);
    if (this.past.length > this.limit) this.past.shift();
    this.present = next;
    this.future = [];
  }

  undo(): T {
    const prev = this.past.pop();
    if (prev !== undefined) {
      this.future.push(this.present);
      this.present = prev;
    }
    return this.present;
  }

  redo(): T {
    const next = this.future.pop();
    if (next !== undefined) {
      this.past.push(this.present);
      this.present = next;
    }
    return this.present;
  }

  /** Starts over from `value` with no history, e.g. for a new recording */
  reset(value: T): void {
    this.past = [];
    this.future = [];
    this.present = value;
  }
}
