/** The latest frame of a video feed, ready for drawImage. */
export interface FrameSource {
  /** Null until the first frame has arrived */
  readonly image: CanvasImageSource | null;
  readonly width: number;
  readonly height: number;
  stop(): void;
}

export const supportsTrackProcessor = (): boolean =>
  typeof (globalThis as { MediaStreamTrackProcessor?: unknown }).MediaStreamTrackProcessor === 'function';

/**
 * Reads frames straight off the track. Unlike a <video> element this keeps delivering new frames
 * while the page is hidden, which is where the recorder sits while the user works in another app.
 */
export class TrackFrameSource implements FrameSource {
  private frame: VideoFrame | null = null;
  private reader: ReadableStreamDefaultReader<VideoFrame>;
  private track: MediaStreamTrack;
  private stopped = false;

  constructor(track: MediaStreamTrack) {
    // A clone, so stopping this reader never ends the caller's track
    this.track = track.clone();
    this.reader = new MediaStreamTrackProcessor({ track: this.track }).readable.getReader();
    void this.pump();
  }

  private async pump(): Promise<void> {
    while (!this.stopped) {
      let result: ReadableStreamReadResult<VideoFrame>;
      try {
        result = await this.reader.read();
      } catch {
        return;
      }
      if (result.done) return;
      if (this.stopped) {
        result.value.close();
        return;
      }
      // Keep only the newest frame; holding more starves the capturer's buffer pool
      this.frame?.close();
      this.frame = result.value;
    }
  }

  get image(): CanvasImageSource | null {
    return this.frame;
  }

  get width(): number {
    return this.frame?.displayWidth ?? 0;
  }

  get height(): number {
    return this.frame?.displayHeight ?? 0;
  }

  stop(): void {
    this.stopped = true;
    void this.reader.cancel().catch(() => {});
    this.track.stop();
    this.frame?.close();
    this.frame = null;
  }
}

/** Fallback for browsers without MediaStreamTrackProcessor (Safari, Firefox). Freezes in a hidden tab. */
export class VideoElementFrameSource implements FrameSource {
  constructor(private video: HTMLVideoElement) {}

  get image(): CanvasImageSource | null {
    return this.video.readyState >= 2 && this.video.videoWidth > 0 ? this.video : null;
  }

  get width(): number {
    return this.video.videoWidth;
  }

  get height(): number {
    return this.video.videoHeight;
  }

  stop(): void {}
}

/** Prefers reading the stream's track directly, falling back to an already-playing <video>. */
export const createFrameSource = (
  stream: MediaStream | null | undefined,
  fallbackVideo?: HTMLVideoElement | null
): FrameSource | null => {
  const track = stream?.getVideoTracks()[0];
  if (track && track.readyState === 'live' && supportsTrackProcessor()) {
    try {
      return new TrackFrameSource(track);
    } catch (e) {
      console.warn('Track frame reader unavailable, using the video element:', e);
    }
  }
  return fallbackVideo ? new VideoElementFrameSource(fallbackVideo) : null;
};
