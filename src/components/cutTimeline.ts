import {
  EditHistory,
  MIN_PIECE_SEC,
  addCut,
  cutContaining,
  normalizeCuts,
  keptLength,
  keptRanges,
  playableTime,
  restoreCut,
  toEditedTime,
  type TimeRange
} from '../core/cutList';

// Cut editor shared by the web export screen and the desktop result window. It is plain DOM so the
// React page and the framework-free desktop page use the same widget. Drag across the track to
// select, then Delete removes it; removed parts are skipped in the preview and restored with ↺,
// Undo or Reset. The source video is never changed here.

export interface CutTimelineOptions {
  /** Called after every edit with the removed ranges and what is left */
  onChange?: (cuts: TimeRange[], kept: TimeRange[]) => void;
  /** Short user-facing messages, e.g. why a cut was refused */
  notify?: (message: string) => void;
  /** Adds a Play/Pause button for pages that don't have their own */
  playButton?: boolean;
}

export const formatClock = (sec: number): string => {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}.${Math.floor((s % 1) * 10)}`;
};

const BTN =
  'px-2.5 py-1 text-[11px] font-medium rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 cursor-pointer transition disabled:opacity-40 disabled:cursor-not-allowed';

const CUT_BTN =
  'px-2.5 py-1 text-[11px] font-bold rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-200 cursor-pointer transition disabled:opacity-40 disabled:cursor-not-allowed';

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

export class CutTimeline {
  private duration = 0;
  private readonly history = new EditHistory<TimeRange[]>([]);
  private kept: TimeRange[] = [];
  private selection: TimeRange | null = null;
  private dragAnchor: number | null = null;
  private dragMoved = false;
  private raf = 0;

  private readonly root: HTMLDivElement;
  private readonly track: HTMLDivElement;
  private readonly layer: HTMLDivElement;
  private readonly selectionEl: HTMLDivElement;
  private readonly playhead: HTMLDivElement;
  private readonly summary: HTMLSpanElement;
  private readonly clock: HTMLSpanElement;
  private readonly buttons: Record<'play' | 'cut' | 'undo' | 'redo' | 'reset', HTMLButtonElement | null>;
  private readonly cleanup: Array<() => void> = [];

  constructor(
    container: HTMLElement,
    private readonly video: HTMLVideoElement,
    private readonly options: CutTimelineOptions = {}
  ) {
    this.root = document.createElement('div');
    this.root.className = 'flex flex-col gap-2 select-none';
    this.root.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span class="font-mono text-[11px] text-slate-400" data-ref="clock"></span>
        <span class="text-[11px] text-slate-400" data-ref="summary"></span>
      </div>
      <div data-ref="track" class="relative h-11 w-full rounded-xl border border-white/10 bg-indigo-500/15 overflow-hidden cursor-crosshair touch-none"
        title="Drag to select a part, then press Delete to cut it">
        <div data-ref="layer" class="absolute inset-0"></div>
        <div data-ref="selection" hidden class="absolute top-0 bottom-0 bg-amber-400/30 border-x-2 border-amber-400 pointer-events-none"></div>
        <div data-ref="playhead" class="absolute top-0 bottom-0 w-[2px] -ml-px bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)] pointer-events-none"></div>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-1.5">
        <div class="flex flex-wrap items-center gap-1.5">
          ${options.playButton ? `<button type="button" data-ref="play" class="${BTN}">▶ Play</button>` : ''}
          <button type="button" data-ref="in" class="${BTN}" title="Start the selection at the playhead (I)">[ In</button>
          <button type="button" data-ref="out" class="${BTN}" title="End the selection at the playhead (O)">Out ]</button>
          <button type="button" data-ref="cut" class="${CUT_BTN}" title="Remove the selected part (Delete)">✂ Cut selection</button>
          <button type="button" data-ref="first" class="${BTN}" title="Remove the first 2 seconds that are left">Cut first 2s</button>
          <button type="button" data-ref="last" class="${BTN}" title="Remove the last 3 seconds that are left">Cut last 3s</button>
        </div>
        <div class="flex items-center gap-1.5">
          <button type="button" data-ref="undo" class="${BTN}" title="Undo (Ctrl+Z)">↶ Undo</button>
          <button type="button" data-ref="redo" class="${BTN}" title="Redo (Ctrl+Y)">↷ Redo</button>
          <button type="button" data-ref="reset" class="${BTN}" title="Put back everything that was cut">Reset</button>
        </div>
      </div>`;
    container.appendChild(this.root);

    const ref = <T extends HTMLElement>(name: string) => this.root.querySelector<T>(`[data-ref="${name}"]`);
    this.track = ref<HTMLDivElement>('track')!;
    this.layer = ref<HTMLDivElement>('layer')!;
    this.selectionEl = ref<HTMLDivElement>('selection')!;
    this.playhead = ref<HTMLDivElement>('playhead')!;
    this.summary = ref<HTMLSpanElement>('summary')!;
    this.clock = ref<HTMLSpanElement>('clock')!;
    this.buttons = {
      play: ref<HTMLButtonElement>('play'),
      cut: ref<HTMLButtonElement>('cut'),
      undo: ref<HTMLButtonElement>('undo'),
      redo: ref<HTMLButtonElement>('redo'),
      reset: ref<HTMLButtonElement>('reset')
    };

    this.buttons.play?.addEventListener('click', () => this.togglePlay());
    ref('in')!.addEventListener('click', () => this.markIn());
    ref('out')!.addEventListener('click', () => this.markOut());
    this.buttons.cut!.addEventListener('click', () => this.cutSelection());
    ref('first')!.addEventListener('click', () => this.cutFromEdge('start', 2));
    ref('last')!.addEventListener('click', () => this.cutFromEdge('end', 3));
    this.buttons.undo!.addEventListener('click', () => this.undo());
    this.buttons.redo!.addEventListener('click', () => this.redo());
    this.buttons.reset!.addEventListener('click', () => this.commit([]));

    this.track.addEventListener('pointerdown', this.onPointerDown);
    this.track.addEventListener('pointermove', this.onPointerMove);
    this.track.addEventListener('pointerup', this.onPointerUp);
    this.track.addEventListener('pointercancel', this.onPointerUp);
    this.listen(window, 'keydown', this.onKeyDown as EventListener);
    this.listen(video, 'play', this.onPlay);
    this.listen(video, 'pause', this.paintPlayState);
    this.listen(video, 'seeked', this.paintPlayhead);
    this.listen(video, 'timeupdate', this.onTimeUpdate);

    this.render();
  }

  /** The removed ranges, in source time */
  get cuts(): TimeRange[] {
    return this.history.current;
  }

  /** The parts that will be exported, in source time */
  get keptRanges(): TimeRange[] {
    return this.kept;
  }

  /** Length of the source; resets the edit when it changes (a new recording), optionally to `initialCuts` */
  setDuration(duration: number, initialCuts: TimeRange[] = []): void {
    if (Math.abs(duration - this.duration) < 1e-3) return;
    this.duration = Math.max(0, duration);
    this.history.reset(normalizeCuts(initialCuts, this.duration));
    this.selection = null;
    this.render();
  }

  /** Plays from the playhead, or from the first kept part when the playhead is in a cut or at the end */
  togglePlay(): void {
    if (!this.video.paused) {
      this.video.pause();
      return;
    }
    const at = playableTime(this.kept, this.video.currentTime);
    this.video.currentTime = at ?? this.kept[0]?.startSec ?? 0;
    void this.video.play().catch(() => {});
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.cleanup.forEach((off) => off());
    this.root.remove();
  }

  // ---------- editing ----------

  private commit(cuts: TimeRange[]): void {
    const same =
      cuts.length === this.cuts.length && cuts.every((c, i) => c.startSec === this.cuts[i].startSec && c.endSec === this.cuts[i].endSec);
    if (same) return;
    this.history.push(cuts);
    this.selection = null;
    this.render();
  }

  private cut(range: TimeRange): void {
    const result = addCut(this.cuts, range, this.duration);
    if (result.ok) this.commit(result.cuts);
    else if (result.reason === 'too-much') this.options.notify?.('That would cut the whole video; at least half a second has to stay.');
  }

  private cutSelection(): void {
    if (this.selection) this.cut(this.selection);
    else this.options.notify?.('Drag across the timeline to select the part to cut first.');
  }

  /** Cuts `seconds` off the start or end of what is left */
  private cutFromEdge(edge: 'start' | 'end', seconds: number): void {
    const piece = edge === 'start' ? this.kept[0] : this.kept[this.kept.length - 1];
    if (!piece) return;
    this.cut(
      edge === 'start'
        ? { startSec: 0, endSec: Math.min(piece.endSec, piece.startSec + seconds) }
        : { startSec: Math.max(piece.startSec, piece.endSec - seconds), endSec: this.duration }
    );
  }

  private undo(): void {
    this.history.undo();
    this.selection = null;
    this.render();
  }

  private redo(): void {
    this.history.redo();
    this.selection = null;
    this.render();
  }

  private markIn(): void {
    const t = this.video.currentTime;
    const end = this.selection && this.selection.endSec > t + MIN_PIECE_SEC ? this.selection.endSec : this.duration;
    this.select({ startSec: t, endSec: end });
  }

  private markOut(): void {
    const t = this.video.currentTime;
    const start = this.selection && this.selection.startSec < t - MIN_PIECE_SEC ? this.selection.startSec : 0;
    this.select({ startSec: start, endSec: t });
  }

  private select(range: TimeRange | null): void {
    this.selection = range && range.endSec - range.startSec >= MIN_PIECE_SEC ? range : null;
    this.paintSelection();
  }

  // ---------- input ----------

  private timeAt(clientX: number): number {
    const rect = this.track.getBoundingClientRect();
    return (Math.max(0, Math.min(rect.width, clientX - rect.left)) / Math.max(1, rect.width)) * this.duration;
  }

  private seek(t: number): void {
    this.video.currentTime = Math.max(0, Math.min(this.duration, t));
    this.paintPlayhead();
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('[data-restore]')) return;
    this.track.setPointerCapture(e.pointerId);
    this.dragAnchor = this.timeAt(e.clientX);
    this.dragMoved = false;
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.dragAnchor === null) return;
    const t = this.timeAt(e.clientX);
    const px = (Math.abs(t - this.dragAnchor) / Math.max(0.001, this.duration)) * this.track.clientWidth;
    if (!this.dragMoved && px < 4) return;
    this.dragMoved = true;
    this.select({ startSec: Math.min(this.dragAnchor, t), endSec: Math.max(this.dragAnchor, t) });
    this.seek(t);
  };

  private onPointerUp = (e: PointerEvent) => {
    if (this.dragAnchor === null) return;
    if (!this.dragMoved) {
      // A plain click moves the playhead and drops the selection
      this.select(null);
      this.seek(this.timeAt(e.clientX));
    }
    this.dragAnchor = null;
    try {
      this.track.releasePointerCapture(e.pointerId);
    } catch {
      // already released
    }
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (isTyping(e.target) || !this.root.isConnected) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && key === 'z' && !e.shiftKey) this.undo();
    else if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) this.redo();
    else if (!mod && (e.key === 'Delete' || e.key === 'Backspace') && this.selection) this.cutSelection();
    else if (!mod && key === 'i') this.markIn();
    else if (!mod && key === 'o') this.markOut();
    else if (e.key === 'Escape' && this.selection) this.select(null);
    else return;
    e.preventDefault();
  };

  private listen(target: EventTarget, type: string, handler: EventListener): void {
    target.addEventListener(type, handler);
    this.cleanup.push(() => target.removeEventListener(type, handler));
  }

  // ---------- playback ----------

  /** Jumps over a cut, or stops at the end of what is kept */
  private skipCuts(): void {
    if (this.video.paused || this.video.ended) return;
    const t = this.video.currentTime;
    const next = playableTime(this.kept, t);
    if (next === null) {
      this.video.pause();
      this.video.currentTime = this.kept[0]?.startSec ?? 0;
    } else if (next - t > 0.01) {
      this.video.currentTime = next;
    }
  }

  // Backstop for when animation frames don't run (a hidden tab or window)
  private onTimeUpdate = () => {
    this.skipCuts();
    this.paintPlayhead();
  };

  private onPlay = () => {
    this.paintPlayState();
    cancelAnimationFrame(this.raf);
    // Jump over cuts every frame while playing; timeupdate alone is too coarse and a cut part would flash
    const tick = () => {
      if (this.video.paused || this.video.ended) return;
      this.skipCuts();
      this.paintPlayhead();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  };

  // ---------- painting ----------

  private pct = (t: number) => `${(Math.max(0, Math.min(this.duration, t)) / Math.max(0.001, this.duration)) * 100}%`;

  private render(): void {
    this.kept = keptRanges(this.cuts, this.duration);

    this.layer.replaceChildren(
      ...this.cuts.map((c) => {
        const block = document.createElement('div');
        block.className =
          'absolute top-0 bottom-0 flex items-center justify-center bg-rose-950/80 border-x border-rose-500/60 ' +
          'bg-[repeating-linear-gradient(135deg,rgba(244,63,94,0.25)_0_6px,transparent_6px_12px)]';
        block.style.left = this.pct(c.startSec);
        block.style.width = `calc(${this.pct(c.endSec)} - ${this.pct(c.startSec)})`;
        block.title = `Cut ${formatClock(c.startSec)} – ${formatClock(c.endSec)}`;
        const restore = document.createElement('button');
        restore.type = 'button';
        restore.dataset.restore = '';
        restore.className =
          'w-5 h-5 shrink-0 rounded-full bg-black/70 text-rose-200 hover:text-white hover:bg-rose-600 text-[11px] leading-none cursor-pointer';
        restore.textContent = '↺';
        restore.title = 'Put this part back';
        restore.addEventListener('click', (e) => {
          e.stopPropagation();
          this.commit(restoreCut(this.cuts, (c.startSec + c.endSec) / 2));
        });
        block.appendChild(restore);
        return block;
      })
    );

    const left = this.kept.reduce((n, r) => n + r.endSec - r.startSec, 0);
    const n = this.cuts.length;
    this.summary.innerHTML =
      n === 0
        ? `Length <b class="text-emerald-400 font-mono">${formatClock(this.duration)}</b> · nothing cut`
        : `Final <b class="text-emerald-400 font-mono">${formatClock(left)}</b> of ${formatClock(this.duration)} · ${n} cut${n === 1 ? '' : 's'}`;

    this.buttons.undo!.disabled = !this.history.canUndo;
    this.buttons.redo!.disabled = !this.history.canRedo;
    this.buttons.reset!.disabled = n === 0;
    this.paintSelection();
    this.paintPlayhead();
    this.options.onChange?.(this.cuts, this.kept);
  }

  private paintSelection(): void {
    const s = this.selection;
    this.selectionEl.hidden = !s;
    this.buttons.cut!.disabled = !s;
    if (!s) return;
    this.selectionEl.style.left = this.pct(s.startSec);
    this.selectionEl.style.width = `calc(${this.pct(s.endSec)} - ${this.pct(s.startSec)})`;
  }

  private paintPlayhead = () => {
    const t = this.video.currentTime;
    this.playhead.style.left = this.pct(t);
    const inCut = cutContaining(this.cuts, t);
    this.clock.textContent = `${formatClock(toEditedTime(this.kept, t))} / ${formatClock(keptLength(this.cuts, this.duration))}${inCut ? ' · in a cut' : ''}`;
  };

  private paintPlayState = () => {
    if (this.buttons.play) this.buttons.play.textContent = this.video.paused ? '▶ Play' : '❚❚ Pause';
  };
}
