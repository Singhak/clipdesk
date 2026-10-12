/**
 * Caption & Subtitle Engine
 * Dynamic animated captions generator for viral 9:16 vertical reels (Shorts, Reels, TikTok).
 * Supports browser speech-to-text recognition and real-time canvas burning.
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
   * Renders high-quality animated captions directly onto a 9:16 Canvas frame
   */
  public static renderCaptions(
    ctx: CanvasRenderingContext2D,
    currentTimeSec: number,
    segments: CaptionSegment[],
    style: CaptionStyleConfig,
    canvasW: number,
    canvasH: number
  ): void {
    if (segments.length === 0) return;

    // Find active segment for this timestamp
    const active = segments.find(
      (s) => currentTimeSec >= s.startSec && currentTimeSec <= s.endSec
    );

    if (!active) return;

    ctx.save();

    const scale = canvasW / 1080; // Relative to 1080p target
    const fontSize = style.fontSize * scale;
    ctx.font = `800 ${fontSize}px Inter, system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const rawText = style.allCaps ? active.text.toUpperCase() : active.text;
    const posY = canvasH * style.positionYRatio;

    // Measure text width for dark pill capsule backing
    const metrics = ctx.measureText(rawText);
    const pillPaddingX = 24 * scale;
    const pillPaddingY = 14 * scale;
    const pillW = metrics.width + pillPaddingX * 2;
    const pillH = fontSize + pillPaddingY * 2;
    const pillX = (canvasW - pillW) / 2;
    const pillY = posY - pillH / 2;
    const pillRadius = 14 * scale;

    // Draw backdrop capsule
    ctx.fillStyle = style.bgColor;
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillW, pillH, pillRadius);
    ctx.fill();

    // Subtle capsule border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.5 * scale;
    ctx.stroke();

    // If karaoke style, highlight current active word
    if (style.id === 'viral_karaoke' && active.words.length > 0) {
      let currentWordX = (canvasW - metrics.width) / 2;
      ctx.textAlign = 'left';

      active.words.forEach((w) => {
        const wordText = (style.allCaps ? w.word.toUpperCase() : w.word) + ' ';
        const isWordActive = currentTimeSec >= w.startSec && currentTimeSec <= w.endSec;

        if (style.outlineWidth > 0) {
          ctx.strokeStyle = style.outlineColor;
          ctx.lineWidth = style.outlineWidth * scale;
          ctx.strokeText(wordText, currentWordX, posY);
        }

        ctx.fillStyle = isWordActive ? style.highlightColor : style.textColor;
        ctx.fillText(wordText, currentWordX, posY);

        currentWordX += ctx.measureText(wordText).width;
      });
    } else {
      // Standard styled text with outline
      if (style.outlineWidth > 0) {
        ctx.strokeStyle = style.outlineColor;
        ctx.lineWidth = style.outlineWidth * scale;
        ctx.strokeText(rawText, canvasW / 2, posY);
      }

      ctx.fillStyle = style.textColor;
      ctx.fillText(rawText, canvasW / 2, posY);
    }

    ctx.restore();
  }
}
