import { ExportSettings, LayoutMode } from './types';
import { recoveryService } from './recordingRecoveryService';
import { CaptionSegment, CaptionStyleConfig, CaptionCustomSettings, CaptionEngine } from './captionEngine';
import { getExportBitrate } from '../licensing/tierFeatures';

export class ExportEngine {
  /** Escapes a file path or command argument for safe execution in shell command strings */
  private static escapeShellArg(arg: string): string {
    return `"${arg.replace(/[\\"]/g, '\\$&')}"`;
  }

  /** Escapes special characters for FFmpeg drawtext filter string literal */
  private static escapeDrawtext(text: string): string {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/:/g, '\\:');
  }

  /** Sanitizes bitrate parameter, enforcing alphanumeric video bitrate syntax (e.g., 14M, 6000k) */
  private static sanitizeBitrate(bitrate?: string): string {
    if (bitrate && /^[0-9]+[kKmMgG]?$/.test(bitrate)) {
      return bitrate;
    }
    return '14M';
  }

  /**
   * Builds the optimized FFmpeg filtergraph command for the desktop pipeline
   */
  public static buildFFmpegCommand(options: {
    inputFile: string;
    outputFile: string;
    audioFile?: string;
    layout: string;
    watermark: boolean;
    watermarkText?: string;
    bitrate?: string;
  }): string {
    const { inputFile, outputFile, audioFile, layout, watermark, bitrate } = options;
    const safeInput = ExportEngine.escapeShellArg(inputFile);
    const safeOutput = ExportEngine.escapeShellArg(outputFile);
    const safeBitrate = ExportEngine.sanitizeBitrate(bitrate);
    const rawWmText = options.watermarkText || 'Made with ClipDesk';
    const safeWmText = ExportEngine.escapeDrawtext(rawWmText);

    // The recorded file is already the composed 1080x1920 canvas (layout, camera and zoom
    // baked in), so re-cropping would damage it. Only re-encode, plus the optional watermark.
    if (layout === 'recorded_canvas') {
      const wm = watermark
        ? ` -vf "drawtext=text='${safeWmText}':x=w-tw-30:y=h-th-40:fontsize=24:fontcolor=white@0.8:box=1:boxcolor=black@0.5:boxborderw=10"`
        : '';
      return `ffmpeg -y -i ${safeInput}${wm} -c:v libx264 -preset fast -b:v ${safeBitrate} -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart ${safeOutput}`;
    }

    let filter = '';
    if (layout === 'blur_backdrop') {
      filter = `"[0:v]split=2[fg][bg]; [bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=25:5[bgblur]; [fg]scale=1040:-1[fgscaled]; [bgblur][fgscaled]overlay=(W-w)/2:(H-h)/2[v]"`;
    } else if (layout === 'dynamic_crop') {
      filter = `"[0:v]crop=608:1080,scale=1080:1920[v]"`;
    } else {
      filter = `"[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black[v]"`;
    }

    if (watermark) {
      filter = filter.replace(
        '[v]"',
        `[v0]; [v0]drawtext=text='${safeWmText}':x=w-tw-30:y=h-th-40:fontsize=24:fontcolor=white@0.8:box=1:boxcolor=black@0.5:boxborderw=10[v]"`
      );
    }

    const audioParam = audioFile ? `-i ${ExportEngine.escapeShellArg(audioFile)} -map 1:a -c:a aac -b:a 192k` : '-c:a copy';

    return `ffmpeg -y -i ${safeInput} ${audioFile ? audioParam : ''} -filter_complex ${filter} -map "[v]" -c:v libx264 -preset fast -b:v ${safeBitrate} -pix_fmt yuv420p ${safeOutput}`;
  }

  /**
   * Starts capturing the real-time 9:16 Canvas feed into a downloadable video
   */
  public static startRecordingCanvas(
    canvas: HTMLCanvasElement,
    audioStream: MediaStream | null,
    settings: ExportSettings,
    sink?: {
      /** Receives every encoded chunk in order, e.g. to append it to a file on disk */
      onChunk: (chunk: Blob) => void;
      /** Keep chunks in memory for the blob returned by stop(). False: stop() returns an empty blob. */
      keepInMemory: boolean;
    }
  ): {
    mimeType: string;
    stop: () => Promise<Blob>;
    pause: () => void;
    resume: () => void;
  } {
    const fps = settings.fps || 60;
    const { stream: canvasStream, stopFrames, setPaused } = ExportEngine.createCanvasVideoStream(canvas, fps);

    // Attach audio track if available
    if (audioStream && audioStream.getAudioTracks().length > 0) {
      audioStream.getAudioTracks().forEach((track) => canvasStream.addTrack(track));
    }

    // Determine best supported mime type
    // Prefer native MP4 (Chrome 126+, Safari) so files upload to Reels/TikTok directly
    const candidates = [
      'video/mp4;codecs=avc1,mp4a.40.2',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ];
    const mimeType = candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? 'video/webm';

    const recorder = new MediaRecorder(canvasStream, {
      mimeType,
      // The watermark flag is set exactly for the Free tier
      videoBitsPerSecond: getExportBitrate(!settings.includeWatermark).bitsPerSecond
    });

    // A caller that streams chunks to disk has its own recovery; IndexedDB would be a second copy
    const keepInMemory = sink?.keepInMemory ?? true;
    const useRecovery = !sink;
    if (useRecovery) {
      const sessionId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      void recoveryService.startSession(sessionId, {
        mimeType,
        layoutMode: settings.layout,
        templateId: settings.templateId
      });
    }

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        if (keepInMemory) chunks.push(e.data);
        sink?.onChunk(e.data);
        if (useRecovery) void recoveryService.saveChunk(e.data);
      }
    };

    recorder.start(250); // collect chunks every 250ms

    const makeBlob = () => new Blob(chunks, { type: mimeType.split(';')[0] });
    let stopPromise: Promise<Blob> | null = null;
    const finalizeRecovery = () => {
      if (useRecovery) void recoveryService.finalizeSession(0);
    };

    return {
      mimeType: mimeType.split(';')[0],
      pause: () => {
        setPaused(true);
        if (recorder.state === 'recording') recorder.pause();
      },
      resume: () => {
        setPaused(false);
        if (recorder.state === 'paused') recorder.resume();
      },
      // Idempotent: repeated calls (double click) return the same result
      stop: () => {
        stopFrames();
        if (!stopPromise) {
          stopPromise = new Promise<Blob>((resolve) => {
            const handleStop = () => {
              const finalBlob = makeBlob();
              finalizeRecovery();
              resolve(finalBlob);
            };

            if (recorder.state === 'inactive') {
              const finalBlob = makeBlob();
              finalizeRecovery();
              resolve(finalBlob);
              return;
            }

            recorder.onstop = handleStop;

            // Flush in-flight data so stops <250ms don't produce corrupt 0-byte blobs
            try {
              if (recorder.state === 'recording' || recorder.state === 'paused') {
                recorder.requestData();
              }
            } catch {
              // Ignore if already transitioning
            }

            try {
              recorder.stop();
            } catch {
              const finalBlob = makeBlob();
              finalizeRecovery();
              resolve(finalBlob);
            }
          });
        }
        return stopPromise;
      }
    };
  }

  /**
   * A worker timer: unlike setInterval or requestAnimationFrame it keeps firing in a hidden tab.
   * The worker waits for each tick to be handled before sending the next, so a slow tick drops
   * frames instead of queueing a backlog that would starve the page's other work.
   */
  public static startTicker(intervalMs: number, onTick: () => void): () => void {
    try {
      const url = URL.createObjectURL(
        new Blob(
          [`var ready=true;onmessage=function(){ready=true};setInterval(function(){if(ready){ready=false;postMessage(0)}},${Math.round(intervalMs)})`],
          { type: 'text/javascript' }
        )
      );
      const worker = new Worker(url);
      worker.onmessage = () => {
        try {
          onTick();
        } finally {
          worker.postMessage(0);
        }
      };
      return () => {
        worker.terminate();
        URL.revokeObjectURL(url);
      };
    } catch {
      const id = window.setInterval(onTick, intervalMs);
      return () => window.clearInterval(id);
    }
  }

  /**
   * A video track fed from the canvas at a steady frame rate, also while the tab is hidden.
   *
   * Chrome: each tick copies the canvas into a VideoFrame and writes it to a track generator,
   * which keeps the full frame rate in a background tab. Elsewhere: captureStream, pushed by
   * requestFrame where available (canvas capture drops to a few FPS in a hidden tab).
   */
  public static createCanvasVideoStream(
    canvas: HTMLCanvasElement,
    fps: number
  ): { stream: MediaStream; stopFrames: () => void; setPaused: (paused: boolean) => void } {
    let paused = false;
    const setPaused = (p: boolean) => {
      paused = p;
    };

    if (typeof (globalThis as { MediaStreamTrackGenerator?: unknown }).MediaStreamTrackGenerator === 'function') {
      const generator = new MediaStreamTrackGenerator({ kind: 'video' });
      const writer = generator.writable.getWriter();
      let writing = false;
      const stopTicker = ExportEngine.startTicker(1000 / fps, () => {
        // Skip a tick rather than queue frames if the encoder falls behind
        if (paused || writing) return;
        writing = true;
        const frame = new VideoFrame(canvas, { timestamp: Math.round(performance.now() * 1000) });
        writer
          .write(frame)
          .catch(() => {})
          .finally(() => {
            frame.close();
            writing = false;
          });
      });
      return {
        stream: new MediaStream([generator]),
        setPaused,
        stopFrames: () => {
          stopTicker();
          void writer.close().catch(() => {});
        }
      };
    }

    const probe = canvas.captureStream(0);
    const track = probe.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
    if (track && typeof track.requestFrame === 'function') {
      const stopTicker = ExportEngine.startTicker(1000 / fps, () => {
        if (!paused) track.requestFrame();
      });
      return { stream: probe, setPaused, stopFrames: stopTicker };
    }
    return { stream: canvas.captureStream(fps), setPaused, stopFrames: () => {} };
  }

  /** The real length of a recorded file in seconds, or null if the browser can't tell (e.g. WebM). */
  public static probeDuration(blob: Blob, timeoutMs = 5000): Promise<number | null> {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      const url = URL.createObjectURL(blob);
      let settled = false;
      let timerId: number | null = null;

      const finish = (value: number | null) => {
        if (settled) return;
        settled = true;
        if (timerId !== null) {
          clearTimeout(timerId);
          timerId = null;
        }
        video.onloadedmetadata = null;
        video.onerror = null;
        URL.revokeObjectURL(url);
        video.removeAttribute('src');
        video.load();
        resolve(value);
      };

      video.muted = true;
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        if (Number.isFinite(video.duration)) {
          finish(video.duration);
          return;
        }
        // MediaRecorder WebM has no length in its header: seeking far past the end makes the browser find it
        video.ontimeupdate = () => finish(Number.isFinite(video.duration) ? video.duration : null);
        video.currentTime = 1e101;
      };
      video.onerror = () => finish(null);
      timerId = window.setTimeout(() => finish(null), timeoutMs);
      video.src = url;
    });
  }

  /**
   * Makes a just-recorded file seekable. MediaRecorder WebM reports an infinite length, and then
   * jumping to another time (skipping a cut part, dragging the playhead) snaps back to the start.
   * Seeking far past the end once makes the browser work out the real length; playback then returns to 0.
   */
  public static ensureSeekable(video: HTMLVideoElement): void {
    if (Number.isFinite(video.duration)) return;
    const wasPlaying = !video.paused;
    const onFixed = () => {
      video.removeEventListener('timeupdate', onFixed);
      video.currentTime = 0;
      if (wasPlaying) void video.play().catch(() => {});
    };
    video.addEventListener('timeupdate', onFixed);
    video.currentTime = 1e101;
  }

  /**
   * Triggers a browser download of the exported video file
   */
  public static extensionFor(blob: Blob): 'mp4' | 'webm' {
    return blob.type.includes('mp4') ? 'mp4' : 'webm';
  }

  /**
   * Re-renders video with animated subtitles burned directly onto each canvas frame.
   */
  public static async burnCaptionsToVideo(
    sourceBlob: Blob,
    segments: CaptionSegment[],
    style: CaptionStyleConfig,
    customSettings: CaptionCustomSettings,
    layoutMode: LayoutMode,
    onProgress?: (ratio: number) => void,
    range?: { startSec: number; endSec: number }
  ): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const isWide = layoutMode === 'widescreen';
      const canvasW = isWide ? 1920 : 1080;
      const canvasH = isWide ? 1080 : 1920;

      const video = document.createElement('video');
      // Keep muted=false internally so audio samples are emitted to Web Audio,
      // but do NOT connect to audioCtx.destination so speakers remain completely silent
      video.muted = false;
      video.playsInline = true;
      video.preload = 'auto';

      const blobUrl = URL.createObjectURL(sourceBlob);
      video.src = blobUrl;

      const canvas = document.createElement('canvas');
      canvas.width = canvasW;
      canvas.height = canvasH;
      const ctx = canvas.getContext('2d', { alpha: false });

      if (!ctx) {
        URL.revokeObjectURL(blobUrl);
        reject(new Error('Canvas 2D context unavailable'));
        return;
      }

      video.onloadedmetadata = () => {
        // WebM from MediaRecorder often reports Infinity; fall back to the requested range
        const fileDuration = Number.isFinite(video.duration) ? video.duration : range?.endSec ?? 0;
        const startSec = Math.max(0, range?.startSec ?? 0);
        const endSec = range && range.endSec > startSec ? Math.min(range.endSec, fileDuration || range.endSec) : fileDuration;
        const span = Math.max(0.1, (endSec || 1) - startSec);
        const fps = 30;
        const stream = canvas.captureStream(fps);
        let audioCtx: AudioContext | null = null;

        try {
          audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const sourceNode = audioCtx.createMediaElementSource(video);
          const destNode = audioCtx.createMediaStreamDestination();
          // Connect solely to destination stream for video track, NEVER to speaker output
          sourceNode.connect(destNode);
          destNode.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
        } catch {
          // Continue if audio graph fails
        }

        const candidates = [
          'video/mp4;codecs=avc1,mp4a.40.2',
          'video/mp4',
          'video/webm;codecs=vp9,opus',
          'video/webm'
        ];
        const mimeType = candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? 'video/webm';
        const recorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: 16000000
        });

        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };

        let stopTicker: (() => void) | null = null;
        let stopping = false;
        const stopRecording = () => {
          if (stopping) return;
          stopping = true;
          video.pause();
          setTimeout(() => {
            if (recorder.state === 'recording') recorder.stop();
          }, 300);
        };
        const renderTick = () => {
          if (stopping || video.paused || video.ended) return;
          if (endSec > 0 && video.currentTime >= endSec) {
            stopRecording();
            return;
          }
          // Fit the source inside the frame instead of stretching it
          const vw = video.videoWidth || canvasW;
          const vh = video.videoHeight || canvasH;
          const scale = Math.min(canvasW / vw, canvasH / vh);
          const dw = vw * scale;
          const dh = vh * scale;
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, canvasW, canvasH);
          ctx.drawImage(video, (canvasW - dw) / 2, (canvasH - dh) / 2, dw, dh);
          CaptionEngine.renderCaptions(ctx, video.currentTime, segments, style, canvasW, canvasH, customSettings);
          onProgress?.(Math.min(0.99, Math.max(0, (video.currentTime - startSec) / span)));
        };

        recorder.onstop = () => {
          if (stopTicker) stopTicker();
          if (audioCtx && audioCtx.state !== 'closed') {
            void audioCtx.close();
          }
          URL.revokeObjectURL(blobUrl);
          video.removeAttribute('src');
          video.load();
          onProgress?.(1);
          resolve(new Blob(chunks, { type: mimeType.split(';')[0] }));
        };

        const begin = () => {
          recorder.start(250);
          video.play().then(() => {
            // Worker ticker keeps rendering at 30 FPS even if the tab is hidden or minimized
            stopTicker = ExportEngine.startTicker(1000 / fps, renderTick);
          }).catch((err) => {
            recorder.stop();
            reject(err);
          });
        };

        video.onended = stopRecording;

        if (startSec > 0) {
          video.addEventListener('seeked', begin, { once: true });
          video.currentTime = startSec;
        } else {
          begin();
        }
      };

      video.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        reject(new Error('Video loading error during caption burning'));
      };
    });
  }

  public static downloadBlob(blob: Blob, filename = `clipdesk_reel.${ExportEngine.extensionFor(blob)}`): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}
