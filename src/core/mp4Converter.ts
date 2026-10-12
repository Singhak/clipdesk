import type { FFmpeg } from '@ffmpeg/ffmpeg';

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
      await ff.load({
        coreURL: await toBlobURL(coreJs.default, 'text/javascript'),
        wasmURL: await toBlobURL(coreWasm.default, 'application/wasm')
      });
      return ff;
    })().catch((e) => {
      ffmpegPromise = null;
      throw e;
    });
  }
  return ffmpegPromise;
}

/**
 * Converts a recorded WebM blob to H.264/AAC MP4 entirely in the browser.
 * If the input blob is already MP4 (from Chrome 126+ or Safari), returns it immediately.
 */
export async function convertToMp4(
  input: Blob,
  onProgress?: (ratio: number) => void
): Promise<Blob> {
  if (!input || input.size === 0) {
    throw new Error('Input video file is empty or missing.');
  }

  // Fast path: Already an MP4 video file!
  if (input.type.toLowerCase().includes('mp4')) {
    onProgress?.(1);
    return input;
  }

  const ff = await loadFFmpeg();
  const handler = ({ progress }: { progress: number }) =>
    onProgress?.(Math.min(1, Math.max(0, progress)));
  ff.on('progress', handler);

  try {
    const inputBytes = new Uint8Array(await input.arrayBuffer());
    await ff.writeFile('in.webm', inputBytes);

    // Run ultrafast x264 transcode with yuv420p for 100% compatibility with Reels, Shorts, and TikTok
    const code = await ff.exec([
      '-i', 'in.webm',
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
    await ff.deleteFile('in.webm').catch(() => {});
    await ff.deleteFile('out.mp4').catch(() => {});
  }
}
