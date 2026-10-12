import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

export class FFmpegManager {
  private static ffmpegBinaryPath: string | null = null;

  public static getBinaryPath(): string {
    if (this.ffmpegBinaryPath && fs.existsSync(this.ffmpegBinaryPath)) {
      return this.ffmpegBinaryPath;
    }

    // 1. Try ffmpeg-static
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ffmpegStatic = require('ffmpeg-static') as string;
      if (typeof ffmpegStatic === 'string') {
        const unpacked = ffmpegStatic.replace('app.asar', 'app.asar.unpacked');
        if (fs.existsSync(unpacked)) {
          this.ffmpegBinaryPath = unpacked;
          return unpacked;
        }
        if (fs.existsSync(ffmpegStatic)) {
          this.ffmpegBinaryPath = ffmpegStatic;
          return ffmpegStatic;
        }
      }
    } catch {
      // ignore
    }

    // 2. Check bundled or local binaries
    const candidatePaths = [
      path.join(process.resourcesPath || '', 'bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'),
      path.join(__dirname, '..', 'bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'),
      path.join(process.cwd(), 'node_modules', 'ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'),
      'ffmpeg' // System PATH fallback
    ];

    for (const p of candidatePaths) {
      if (p === 'ffmpeg' || fs.existsSync(p)) {
        this.ffmpegBinaryPath = p;
        return p;
      }
    }

    return 'ffmpeg';
  }

  public static executePipeline(
    args: string[],
    onProgress?: (data: string) => void
  ): Promise<{ success: boolean; output: string }> {
    return new Promise((resolve, reject) => {
      const binary = FFmpegManager.getBinaryPath();
      const child = spawn(binary, args);

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (d) => {
        const str = d.toString();
        stdout += str;
        if (onProgress) onProgress(str);
      });

      child.stderr.on('data', (d) => {
        const str = d.toString();
        stderr += str;
        if (onProgress) onProgress(str);
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, output: stdout });
        } else {
          reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
        }
      });

      child.on('error', (err) => {
        reject(err);
      });
    });
  }

  public static async hasAudioStream(inputPath: string): Promise<boolean> {
    const ffmpegPath = FFmpegManager.getBinaryPath();
    return new Promise((resolve) => {
      const child = spawn(ffmpegPath, ['-i', inputPath], { windowsHide: true });
      let output = '';
      child.stderr.on('data', (d) => {
        output += d.toString();
      });
      child.on('close', () => {
        resolve(/Audio:\s+/i.test(output));
      });
      child.on('error', () => {
        resolve(false);
      });
    });
  }

  public static async convertToMp4(
    inputPath: string,
    outputPath: string,
    options?: {
      bitrate?: string;
      noiseCancellation?: 'off' | 'studio' | 'fan_killer' | 'mild';
    }
  ): Promise<void> {
    const bitrate = options?.bitrate ?? '12M';
    const noiseMode = options?.noiseCancellation ?? 'studio';
    const hasAudio = await FFmpegManager.hasAudioStream(inputPath);

    // Highly compatible 1080x1920 (or 1920x1080) H.264/AAC MP4 with web-optimized faststart
    const args = [
      '-y',
      '-i', inputPath,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-pix_fmt', 'yuv420p',
      '-b:v', bitrate,
      '-maxrate', '16M',
      '-bufsize', '24M'
    ];

    if (hasAudio) {
      // Audio Filter Chain:
      // - highpass: cuts traffic rumble, desk thumps, AC wind, 50/60Hz hum
      // - afftdn: FFT-based spectral denoiser cutting stationary fan hum, PC fans, and air hiss
      // - agate: dynamic audio gate silencing room noise when speaker is not talking
      // - dynaudnorm: dynamic audio normalizer delivering crisp, punchy voice volume
      let audioFilter: string | null = null;
      if (noiseMode === 'studio') {
        audioFilter = 'highpass=f=85,afftdn=nf=-24:nr=12,agate=range=0.04:threshold=0.03:ratio=2.5:attack=10:release=250,dynaudnorm=p=0.9:m=10';
      } else if (noiseMode === 'fan_killer') {
        audioFilter = 'highpass=f=120,afftdn=nf=-20:nr=18,agate=range=0.02:threshold=0.04:ratio=3:attack=10:release=250,lowpass=f=11000,dynaudnorm=p=0.9:m=10';
      } else if (noiseMode === 'mild') {
        audioFilter = 'highpass=f=70,afftdn=nf=-28:nr=8,dynaudnorm=p=0.9:m=10';
      }

      if (audioFilter) {
        args.push('-af', audioFilter);
      }
      args.push('-c:a', 'aac', '-b:a', '192k');
    } else {
      args.push('-an');
    }

      args.push('-movflags', '+faststart', outputPath);

    await FFmpegManager.executePipeline(args);
  }

  /**
   * Trims a recorded video to a precision [startSec, endSec] window using native FFmpeg.
   */
  public static async trimVideo(
    inputPath: string,
    outputPath: string,
    startSec: number,
    endSec: number
  ): Promise<void> {
    const duration = Math.max(0.1, endSec - startSec);
    const hasAudio = await FFmpegManager.hasAudioStream(inputPath);

    const args = [
      '-y',
      '-ss', startSec.toFixed(3),
      '-i', inputPath,
      '-t', duration.toFixed(3),
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-pix_fmt', 'yuv420p',
      '-b:v', '14M',
      '-maxrate', '18M',
      '-bufsize', '28M'
    ];

    if (hasAudio) {
      args.push('-c:a', 'aac', '-b:a', '192k');
    } else {
      args.push('-an');
    }

    args.push('-movflags', '+faststart', outputPath);

    await FFmpegManager.executePipeline(args);
  }
}

