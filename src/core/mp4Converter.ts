import type { FFmpeg, FFFSType } from '@ffmpeg/ffmpeg';
import { cutFilterGraph, type TimeRange } from './cutList';

let ffmpegPromise: Promise<FFmpeg> | null = null;

/** Lazily loads the single-thread ffmpeg.wasm core (no COOP/COEP headers needed). */
async function loadFFmpeg(): Promise<FFmpeg> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const [{ FFmpeg }, { toBlobURL }, coreJs, coreWasm] = await Promise.all([
        import('@ffmpeg/ffmpeg'),
        import('@ffmpeg/util'),
        import('@ffmpeg/core?url'),
        import('@ffmpeg/core/wasm?url')
      ]);
      const ff = new FFmpeg();
      // Extension pages only allow scripts from the extension itself, so the bundled core is loaded
      // from its own URL there; on the web it's wrapped in blob URLs as ffmpeg.wasm recommends
      const inExtension = location.protocol === 'chrome-extension:';
      const own = (u: string) => new URL(u, location.href).href;
      await ff.load({
        coreURL: inExtension ? own(coreJs.default) : await toBlobURL(coreJs.default, 'text/javascript'),
        wasmURL: inExtension ? own(coreWasm.default) : await toBlobURL(coreWasm.default, 'application/wasm')
      });
      return ff;
    })().catch((e) => {
      ffmpegPromise = null;
      throw e;
    });
  }
  return ffmpegPromise;
}

/** The parts of a recording to keep, and the recording's length */
export interface KeepPlan {
  ranges: TimeRange[];
  duration: number;
}

/** Whether ffmpeg sees an audio stream; the cut filter graph has to know */
async function probeHasAudio(ff: FFmpeg, path: string): Promise<boolean> {
  let found = false;
  const onLog = ({ message }: { message: string }) => {
    if (/Stream #.*Audio:/.test(message)) found = true;
  };
  ff.on('log', onLog);
  try {
    // Exits non-zero because no output is given; the stream list is printed anyway
    await ff.exec(['-hide_banner', '-i', path]);
  } catch {
    // probing only
  } finally {
    ff.off('log', onLog);
  }
  return found;
}

/**
 * Converts a recorded video to H.264/AAC MP4 entirely in the browser, keeping only `keep` when
 * given (cuts anywhere in the video, not just the ends). An MP4 input with no cuts is returned as-is.
 */
export async function convertToMp4(
  input: Blob,
  onProgress?: (ratio: number) => void,
  keep?: KeepPlan | null
): Promise<Blob> {
  if (!input || input.size === 0) {
    throw new Error('Input video file is empty or missing.');
  }

  const isMp4 = input.type.toLowerCase().includes('mp4');
  if (isMp4 && !keep) {
    onProgress?.(1);
    return input;
  }

  const ff = await loadFFmpeg();
  // The recording is mounted read-only (WORKERFS) rather than copied into the wasm heap, so ffmpeg
  // reads it from the Blob as it goes and a long take doesn't need its full size in memory twice over
  const inDir = '/input';
  const inName = isMp4 ? 'in.mp4' : 'in.webm';
  const inPath = `${inDir}/${inName}`;
  const handler = ({ progress }: { progress: number }) =>
    onProgress?.(Math.min(1, Math.max(0, progress)));
  ff.on('progress', handler);

  try {
    await ff.createDir(inDir).catch(() => {});
    await ff.mount('WORKERFS' as FFFSType, { blobs: [{ name: inName, data: input }] }, inDir);

    // Frame-accurate cuts: each kept piece is trimmed from the decoded stream and the pieces joined
    let cutArgs: string[] = [];
    if (keep) {
      const audio = await probeHasAudio(ff, inPath);
      cutArgs = ['-filter_complex', cutFilterGraph(keep.ranges, keep.duration, audio), '-map', '[vout]'];
      if (audio) cutArgs.push('-map', '[aout]');
    }

    // Run ultrafast x264 transcode with yuv420p for 100% compatibility with Reels, Shorts, and TikTok
    const code = await ff.exec([
      '-i', inPath,
      ...cutArgs,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-r', '30',
      '-c:a', 'aac', '-b:a', '160k',
      '-movflags', '+faststart',
      'out.mp4'
    ]);

    if (code !== 0) {
      throw new Error(`FFmpeg transcode returned non-zero code ${code}`);
    }

    const data = (await ff.readFile('out.mp4')) as Uint8Array;
    return new Blob([data as Uint8Array<ArrayBuffer>], { type: 'video/mp4' });
  } catch (err: any) {
    console.error('In-browser MP4 transcode failed:', err);
    throw new Error(
      err?.message || 'In-browser MP4 conversion encountered a memory or codec error. You can download the raw WebM recording directly.'
    );
  } finally {
    ff.off('progress', handler);
    await ff.unmount(inDir).catch(() => {});
    await ff.deleteFile('out.mp4').catch(() => {});
  }
}
