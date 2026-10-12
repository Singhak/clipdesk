/**
 * Caption & Subtitle Engine
 * Dynamic animated captions generator for viral 9:16 vertical reels (Shorts, Reels, TikTok)
 * and 16:9 widescreen presentations.
 * Supports manual typing, browser Web Speech API speech-to-text recognition,
 * and customizable location, size, and background.
 */

export type CaptionStyleId = 'viral_karaoke' | 'neon_cyber' | 'minimal_clean' | 'tiktok_punch';

export interface CaptionWord {
  word: string;
  startSec: number;
  endSec: number;
}

export interface CaptionSegment {
  id: string;
  text: string;
  startSec: number;
  endSec: number;
  words: CaptionWord[];
}

export interface CaptionStyleConfig {
  id: CaptionStyleId;
  name: string;
  description: string;
  fontSize: number; // in px for 1080x1920 canvas
  textColor: string;
  highlightColor: string;
  bgColor: string;
  outlineColor: string;
  outlineWidth: number;
  allCaps: boolean;
  positionYRatio: number; // e.g. 0.72 (lower third, safe above mobile UI)
}

export type CaptionPositionPreset = 'top' | 'upper' | 'center' | 'lower_third' | 'bottom' | 'custom';
export type CaptionSizePreset = 'small' | 'medium' | 'large' | 'hero' | 'custom';
export type CaptionAlignment = 'left' | 'center' | 'right';
export type CaptionBgPreset =
  | 'charcoal'
  | 'solid_black'
  | 'cyber_slate'
  | 'vibrant_rose'
  | 'royal_indigo'
  | 'emerald'
  | 'amber'
  | 'transparent'
  | 'custom';

export interface CaptionCustomSettings {
  // Location
  positionYRatio: number; // 0.10 to 0.90 (e.g. 0.72)
  positionPreset: CaptionPositionPreset;
  alignment: CaptionAlignment;

  // Size
  fontSize: number; // in px for 1080x1920 canvas (default 50)
  sizePreset: CaptionSizePreset;

  // Background
  bgColor: string; // hex or rgba or transparent
  bgOpacity: number; // 0.0 to 1.0
  bgPreset: CaptionBgPreset;
  borderRadius: number; // in px for canvas, default 14
  hasBorder: boolean;
}

export const DEFAULT_CAPTION_SETTINGS: CaptionCustomSettings = {
  positionYRatio: 0.72,
  positionPreset: 'lower_third',
  alignment: 'center',
  fontSize: 50,
  sizePreset: 'medium',
  bgColor: '#18181b',
  bgOpacity: 0.85,
  bgPreset: 'charcoal',
  borderRadius: 14,
  hasBorder: true
};

export const CAPTION_BG_PRESETS: Record<CaptionBgPreset, { name: string; color: string; defaultOpacity: number }> = {
  charcoal: { name: 'Smoked Charcoal', color: '#18181b', defaultOpacity: 0.85 },
  solid_black: { name: 'Jet Black', color: '#000000', defaultOpacity: 0.95 },
  cyber_slate: { name: 'Cyber Slate', color: '#0f172a', defaultOpacity: 0.90 },
  vibrant_rose: { name: 'Rose Velvet', color: '#881337', defaultOpacity: 0.88 },
  royal_indigo: { name: 'Royal Indigo', color: '#312e81', defaultOpacity: 0.88 },
  emerald: { name: 'Emerald Forest', color: '#064e3b', defaultOpacity: 0.88 },
  amber: { name: 'Amber Glow', color: '#78350f', defaultOpacity: 0.88 },
  transparent: { name: 'Transparent (No Box)', color: 'transparent', defaultOpacity: 0 },
  custom: { name: 'Custom Color', color: '#18181b', defaultOpacity: 0.85 }
};

export const CAPTION_POSITION_PRESETS: Record<
  Exclude<CaptionPositionPreset, 'custom'>,
  { name: string; ratio: number; description: string }
> = {
  top: { name: 'Top', ratio: 0.15, description: 'Upper header banner' },
  upper: { name: 'Upper Third', ratio: 0.32, description: 'Upper area above center' },
  center: { name: 'Center', ratio: 0.50, description: 'Direct middle of screen' },
  lower_third: { name: 'Lower Third', ratio: 0.72, description: 'Safe zone above Reels & TikTok UI' },
  bottom: { name: 'Bottom', ratio: 0.86, description: 'Lower border position' }
};

export const CAPTION_SIZE_PRESETS: Record<
  Exclude<CaptionSizePreset, 'custom'>,
  { name: string; fontSize: number; label: string }
> = {
  small: { name: 'Small', fontSize: 36, label: '36px' },
  medium: { name: 'Medium', fontSize: 50, label: '50px' },
  large: { name: 'Large', fontSize: 64, label: '64px' },
  hero: { name: 'Hero', fontSize: 78, label: '78px' }
};

/**
 * Converts a hex, rgb, or rgba string into an rgba string with custom alpha
 */
export function colorWithAlpha(color: string, alpha: number): string {
  if (!color || color === 'transparent') return 'transparent';
  const clampedAlpha = Math.max(0, Math.min(1, alpha));
  if (color.startsWith('#')) {
    let hex = color.slice(1);
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    const r = parseInt(hex.substring(0, 2), 16) || 0;
    const g = parseInt(hex.substring(2, 4), 16) || 0;
    const b = parseInt(hex.substring(4, 6), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`;
  }
  if (color.startsWith('rgb(')) {
    return color.replace('rgb(', 'rgba(').replace(')', `, ${clampedAlpha})`);
  }
  if (color.startsWith('rgba(')) {
    return color.replace(/,(\s*[\d\.]+)\)$/, `, ${clampedAlpha})`);
  }
  return color;
}

/**
 * Converts manually typed script or multi-line text into timed caption segments
 */
export function generateSegmentsFromText(rawText: string, durationSec: number): CaptionSegment[] {
  const trimmed = rawText.trim();
  if (!trimmed) return [];

  // Split by newlines first
  const rawLines = trimmed
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  let phrases: string[] = [];
  if (rawLines.length > 1) {
    phrases = rawLines;
  } else {
    // If user provided a single paragraph, split by punctuation
    const sentences = trimmed
      .split(/(?<=[.?!])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    phrases = sentences.length > 0 ? sentences : [trimmed];
  }

  if (phrases.length === 0) return [];

  const duration = Math.max(1, durationSec);
  const step = Math.min(4.5, Math.max(1.5, duration / phrases.length));
  const segments: CaptionSegment[] = [];

  for (let i = 0; i < phrases.length; i++) {
    const start = Math.min(duration - 0.5, i * step + 0.2);
    const end = Math.min(duration, start + step - 0.2);
    if (start >= duration) break;

    const wordsRaw = phrases[i].split(/\s+/).filter(Boolean);
    const wordStep = (end - start) / Math.max(1, wordsRaw.length);

    const words = wordsRaw.map((w, wIdx) => ({
      word: w,
      startSec: start + wIdx * wordStep,
      endSec: start + (wIdx + 1) * wordStep
    }));

    segments.push({
      id: `typed_${Date.now()}_${i}`,
      text: phrases[i],
      startSec: start,
      endSec: Math.max(start + 0.5, end),
      words
    });
  }

  return segments;
}

export const CAPTION_STYLES: Record<CaptionStyleId, CaptionStyleConfig> = {
  viral_karaoke: {
    id: 'viral_karaoke',
    name: 'Viral Karaoke',
    description: 'Punchy words with animated neon highlight (MrBeast / Alex Hormozi style)',
    fontSize: 54,
    textColor: '#FFFFFF',
    highlightColor: '#FDE047', // bright yellow
    bgColor: 'rgba(0, 0, 0, 0.82)',
    outlineColor: '#000000',
    outlineWidth: 4,
    allCaps: true,
    positionYRatio: 0.72
  },
  neon_cyber: {
    id: 'neon_cyber',
    name: 'Cyber Neon',
    description: 'Electric cyan glow with high-contrast tech typography',
    fontSize: 50,
    textColor: '#67E8F9', // cyan-300
    highlightColor: '#38BDF8', // sky-400
    bgColor: 'rgba(15, 23, 42, 0.85)',
    outlineColor: '#0369A1',
    outlineWidth: 3,
    allCaps: false,
    positionYRatio: 0.70
  },
  minimal_clean: {
    id: 'minimal_clean',
    name: 'Minimal Clean',
    description: 'Refined modern white text with soft dark backing for readability',
    fontSize: 46,
    textColor: '#F8FAFC',
    highlightColor: '#818CF8', // indigo-400
    bgColor: 'rgba(0, 0, 0, 0.65)',
    outlineColor: 'rgba(0,0,0,0.5)',
    outlineWidth: 2,
    allCaps: false,
    positionYRatio: 0.74
  },
  tiktok_punch: {
    id: 'tiktok_punch',
    name: 'TikTok Punch',
    description: 'Extra-bold uppercase text with vibrant magenta accents',
    fontSize: 56,
    textColor: '#FFFFFF',
    highlightColor: '#F43F5E', // rose-500
    bgColor: 'rgba(0, 0, 0, 0.88)',
    outlineColor: '#000000',
    outlineWidth: 5,
    allCaps: true,
    positionYRatio: 0.68
  }
};

export class CaptionEngine {
  private recognition: any = null;
  private isListening = false;
  private recordedSegments: CaptionSegment[] = [];
  private currentSegment: CaptionSegment | null = null;
  private startTime = 0;

  /**
   * Checks if browser speech recognition Web API is supported in the current environment
   */
  public static isSpeechRecognitionSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  }

  /**
   * Initializes browser speech recognition during live recording take
   */
  public startLiveTranscription(onUpdate?: (segments: CaptionSegment[]) => void): boolean {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      console.warn('SpeechRecognition API not available in this browser');
      return false;
    }

    try {
      this.recognition = new SpeechRec();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      this.startTime = Date.now();
      this.recordedSegments = [];

      this.recognition.onresult = (event: any) => {
        const nowSec = (Date.now() - this.startTime) / 1000;
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          const transcript = res[0].transcript.trim();
          if (!transcript) continue;

          const words = transcript.split(/\s+/).map((w: string, idx: number, arr: string[]) => {
            const span = 0.35;
            const wStart = Math.max(0, nowSec - (arr.length - idx) * span);
            return {
              word: w,
              startSec: wStart,
              endSec: wStart + span
            };
          });

          const segment: CaptionSegment = {
            id: `seg_${i}_${Date.now()}`,
            text: transcript,
            startSec: words[0]?.startSec ?? Math.max(0, nowSec - 2),
            endSec: nowSec + 0.5,
            words
          };

          if (res.isFinal) {
            this.recordedSegments.push(segment);
          } else {
            this.currentSegment = segment;
          }
        }

        const all = [...this.recordedSegments];
        if (this.currentSegment) all.push(this.currentSegment);
        onUpdate?.(all);
      };

      this.recognition.onerror = (e: any) => {
        console.warn('Speech recognition notice:', e.error);
      };

      this.recognition.start();
      this.isListening = true;
      return true;
    } catch (e) {
      console.warn('Failed to start speech recognition:', e);
      return false;
    }
  }

  public stopLiveTranscription(): CaptionSegment[] {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch {}
      this.isListening = false;
    }
    const final = [...this.recordedSegments];
    if (this.currentSegment) final.push(this.currentSegment);
    return final;
  }

  /**
   * Generates initial demo / smart speech segments if microphone speech recognition was not active
   */
  public static generateSmartCaptions(durationSec: number): CaptionSegment[] {
    const phrases = [
      'Welcome to ClipDesk',
      'The vertical content workspace',
      'Turn your desktop code into viral reels',
      'Zero manual editing required',
      'Publish straight to Shorts and TikTok'
    ];

    const segments: CaptionSegment[] = [];
    const step = Math.min(3.5, Math.max(1.8, durationSec / (phrases.length + 1)));

    for (let i = 0; i < phrases.length; i++) {
      const start = i * step + 0.4;
      const end = Math.min(durationSec, start + step - 0.2);
      if (start >= durationSec) break;

      const words = phrases[i].split(' ').map((w, idx, arr) => {
        const wStart = start + (idx * (end - start)) / arr.length;
        const wEnd = wStart + (end - start) / arr.length;
        return { word: w, startSec: wStart, endSec: wEnd };
      });

      segments.push({
        id: `gen_${i}`,
        text: phrases[i],
        startSec: start,
        endSec: end,
        words
      });
    }

    return segments;
  }

  /**
   * Renders high-quality animated captions directly onto a Canvas frame
   * with custom position, size, and background support.
   */
  public static renderCaptions(
    ctx: CanvasRenderingContext2D,
    currentTimeSec: number,
    segments: CaptionSegment[],
    style: CaptionStyleConfig,
    canvasW: number,
    canvasH: number,
    customSettings?: Partial<CaptionCustomSettings>
  ): void {
    if (segments.length === 0) return;

    // Find active segment for this timestamp
    const active = segments.find(
      (s) => currentTimeSec >= s.startSec && currentTimeSec <= s.endSec
    );

    if (!active) return;

    ctx.save();

    const scale = canvasW / 1080; // Relative to 1080p target
    const effectiveFontSize = (customSettings?.fontSize ?? style.fontSize) * scale;
    ctx.font = `800 ${effectiveFontSize}px Inter, system-ui, -apple-system, sans-serif`;
    ctx.textBaseline = 'middle';

    const rawText = style.allCaps ? active.text.toUpperCase() : active.text;

    // Location calculation (Y-position ratio: 0.1 to 0.9)
    const posYRatio = customSettings?.positionYRatio ?? style.positionYRatio;
    const posY = canvasH * posYRatio;

    // Measure text width for backdrop capsule
    const metrics = ctx.measureText(rawText);
    const pillPaddingX = 24 * scale;
    const pillPaddingY = 14 * scale;
    const pillW = metrics.width + pillPaddingX * 2;
    const pillH = effectiveFontSize + pillPaddingY * 2;
    const pillY = posY - pillH / 2;
    const pillRadius = (customSettings?.borderRadius ?? 14) * scale;

    // Alignment calculation (X-position)
    const alignment = customSettings?.alignment ?? 'center';
    let pillX = (canvasW - pillW) / 2;
    if (alignment === 'left') {
      pillX = 40 * scale;
    } else if (alignment === 'right') {
      pillX = canvasW - pillW - 40 * scale;
    }

    // Background determination
    const isTransparentBg =
      customSettings?.bgPreset === 'transparent' ||
      (customSettings?.bgOpacity !== undefined && customSettings.bgOpacity === 0);

    if (!isTransparentBg) {
      const customBgColor = customSettings?.bgColor;
      const opacity = customSettings?.bgOpacity ?? 0.85;
      const effectiveBg = customBgColor
        ? colorWithAlpha(customBgColor, opacity)
        : style.bgColor;

      // Draw backdrop capsule
      ctx.fillStyle = effectiveBg;
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, pillH, pillRadius);
      ctx.fill();

      // Capsule border
      if (customSettings?.hasBorder !== false) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.lineWidth = 1.5 * scale;
        ctx.stroke();
      }
    } else {
      // For transparent background, add a drop shadow for high contrast readability
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 10 * scale;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2 * scale;
    }

    // Text rendering: karaoke animated words vs single line
    if (style.id === 'viral_karaoke' && active.words.length > 0) {
      let currentWordX = pillX + pillPaddingX;
      ctx.textAlign = 'left';

      active.words.forEach((w) => {
        const wordText = (style.allCaps ? w.word.toUpperCase() : w.word) + ' ';
        const isWordActive = currentTimeSec >= w.startSec && currentTimeSec <= w.endSec;

        const effectiveOutlineWidth = isTransparentBg
          ? Math.max(5, style.outlineWidth + 2)
          : style.outlineWidth;

        if (effectiveOutlineWidth > 0) {
          ctx.strokeStyle = style.outlineColor;
          ctx.lineWidth = effectiveOutlineWidth * scale;
          ctx.strokeText(wordText, currentWordX, posY);
        }

        ctx.fillStyle = isWordActive ? style.highlightColor : style.textColor;
        ctx.fillText(wordText, currentWordX, posY);

        currentWordX += ctx.measureText(wordText).width;
      });
    } else {
      // Standard styled text with outline
      const textCenterX = pillX + pillW / 2;
      ctx.textAlign = 'center';

      const effectiveOutlineWidth = isTransparentBg
        ? Math.max(5, style.outlineWidth + 2)
        : style.outlineWidth;

      if (effectiveOutlineWidth > 0) {
        ctx.strokeStyle = style.outlineColor;
        ctx.lineWidth = effectiveOutlineWidth * scale;
        ctx.strokeText(rawText, textCenterX, posY);
      }

      ctx.fillStyle = style.textColor;
      ctx.fillText(rawText, textCenterX, posY);
    }

    ctx.restore();
  }
}
