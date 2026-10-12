import { AudioConfig } from './types';
import { MixedAudio, mixAudioTracks } from './audioMixer';

export class RecordingService {
  private displayStream: MediaStream | null = null;
  private micStream: MediaStream | null = null;
  private mixedAudio: MixedAudio | null = null;
  private isSimulation = false;
  private simulationInterval: number | null = null;

  public async startCapture(
    audioConfig: AudioConfig = { recordMic: true, recordSystemAudio: true },
    allowSimulation = false
  ): Promise<{ stream: MediaStream; isSimulated: boolean; warnings: string[] }> {
    const warnings: string[] = [];
    if (allowSimulation) {
      this.isSimulation = true;
      return { stream: this.createSimulatedScreenStream(), isSimulated: true, warnings };
    }

    try {
      // 1. Request Display Stream
      const displayConstraints: DisplayMediaStreamOptions = {
        video: {
          displaySurface: 'monitor',
          frameRate: { ideal: 60, max: 60 }
        },
        audio: audioConfig.recordSystemAudio
      };

      this.displayStream = await navigator.mediaDevices.getDisplayMedia(displayConstraints);
      this.isSimulation = false;

      // 2. Request Mic if requested
      if (audioConfig.recordMic) {
        try {
          this.micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true
            }
          });
        } catch (err) {
          console.warn('Microphone permission denied or unavailable:', err);
          warnings.push('Microphone is blocked or unavailable, so this recording has no mic audio. Allow microphone access in the browser address bar to fix it.');
        }
      }
      if (audioConfig.recordSystemAudio && this.displayStream.getAudioTracks().length === 0) {
        warnings.push('No system audio was shared. In the browser prompt, choose a tab or screen and tick "Share audio" to capture it.');
      }

      // 3. Audio mixing
      await this.setupAudioMixing(warnings, audioConfig);

      return {
        stream: this.displayStream,
        isSimulated: false,
        warnings
      };
    } catch (err) {
      console.warn('Screen capture cancelled or unavailable:', err);
      throw err;
    }
  }

  /** Camera-only recording: the camera is the video source, with the mic as the only audio. */
  public async startCameraOnlyCapture(
    audioConfig: AudioConfig,
    allowSimulation = false
  ): Promise<{ stream: MediaStream; isSimulated: boolean; warnings: string[] }> {
    const warnings: string[] = [];
    let stream: MediaStream;
    let isSimulated = false;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: 'user' }
      });
      this.displayStream = stream;
    } catch (err) {
      if (!allowSimulation) throw err;
      stream = this.createSimulatedWebcamStream();
      this.webcamStream = stream;
      isSimulated = true;
    }
    this.isSimulation = isSimulated;

    if (audioConfig.recordMic) {
      try {
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }
        });
      } catch (err) {
        console.warn('Microphone permission denied or unavailable:', err);
        warnings.push('Microphone is blocked or unavailable, so this recording has no audio. Allow microphone access in the browser address bar to fix it.');
      }
    }
    await this.setupAudioMixing(warnings, audioConfig);
    return { stream, isSimulated, warnings };
  }

  private async setupAudioMixing(warnings: string[], audioConfig?: AudioConfig): Promise<void> {
    // Mic first: if the two sources can't be mixed, the voice-over is the one to keep
    this.mixedAudio = await mixAudioTracks({
      micTrack: this.micStream?.getAudioTracks()[0] ?? null,
      systemTrack: this.displayStream?.getAudioTracks()[0] ?? null,
      noiseCancellation: audioConfig?.noiseCancellation ?? 'studio'
    });
    if (this.mixedAudio.warning) warnings.push(this.mixedAudio.warning);
  }

  public getMixedAudioStream(): MediaStream | null {
    return this.mixedAudio?.stream ?? null;
  }

  public getDisplayStream(): MediaStream | null {
    return this.displayStream;
  }

  private webcamStream: MediaStream | null = null;
  private isWebcamSimulated = false;
  private webcamSimulationInterval: number | null = null;

  /** Throws if the camera is unavailable, unless `allowSimulation` (demo mode) is set. */
  public async startWebcamCapture(
    deviceId?: string,
    allowSimulation = false
  ): Promise<{ stream: MediaStream; isSimulated: boolean }> {
    try {
      const constraints: MediaStreamConstraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
      };

      this.webcamStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.isWebcamSimulated = false;
      return { stream: this.webcamStream, isSimulated: false };
    } catch (err) {
      console.warn('Webcam hardware unavailable or permission denied:', err);
      if (!allowSimulation) throw err;
      const simStream = this.createSimulatedWebcamStream();
      this.isWebcamSimulated = true;
      return { stream: simStream, isSimulated: true };
    }
  }

  public getWebcamStream(): MediaStream | null {
    return this.webcamStream;
  }

  public stopWebcam(): void {
    if (this.webcamStream) {
      this.webcamStream.getTracks().forEach((t) => t.stop());
      this.webcamStream = null;
    }
    if (this.webcamSimulationInterval) {
      window.clearInterval(this.webcamSimulationInterval);
      this.webcamSimulationInterval = null;
    }
  }

  public stop(): void {
    if (this.displayStream) {
      this.displayStream.getTracks().forEach((t) => t.stop());
      this.displayStream = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    this.stopWebcam();
    this.mixedAudio?.close();
    this.mixedAudio = null;
    if (this.simulationInterval) {
      window.clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
  }

  /**
   * Generates an animated creator webcam feed in 640x640 resolution
   * with studio lighting gradient, creator avatar, and dynamic talking waveforms.
   */
  private createSimulatedWebcamStream(): MediaStream {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 640;
    const ctx = canvas.getContext('2d')!;

    let frame = 0;
    const renderWebcamFrame = () => {
      frame++;
      // Background studio gradient
      const bgGrad = ctx.createRadialGradient(320, 320, 50, 320, 320, 320);
      bgGrad.addColorStop(0, '#1e1b4b');
      bgGrad.addColorStop(0.6, '#0f172a');
      bgGrad.addColorStop(1, '#020617');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 640, 640);

      // Studio rim lighting ring
      const ringPulse = 200 + Math.sin(frame * 0.08) * 6;
      ctx.save();
      ctx.beginPath();
      ctx.arc(320, 300, ringPulse, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.25)';
      ctx.lineWidth = 14;
      ctx.stroke();
      ctx.restore();

      // Creator Avatar Circle Simulation
      // Shoulders / Hoodie
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(320, 520, 190, 130, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#1e293b';
      ctx.fill();
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();

      // Head / Face
      const headBob = Math.sin(frame * 0.05) * 3;
      ctx.save();
      ctx.beginPath();
      ctx.arc(320, 280 + headBob, 110, 0, Math.PI * 2);
      ctx.fillStyle = '#f6d3b3';
      ctx.fill();

      // Hair
      ctx.beginPath();
      ctx.arc(320, 240 + headBob, 115, Math.PI * 0.85, Math.PI * 2.15);
      ctx.fillStyle = '#1e1b2e';
      ctx.fill();

      // Creator Glasses / Eyes
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 6;
      // Left eye / glasses frame
      ctx.strokeRect(260, 260 + headBob, 45, 26);
      // Right eye / glasses frame
      ctx.strokeRect(335, 260 + headBob, 45, 26);
      // Bridge
      ctx.beginPath();
      ctx.moveTo(305, 273 + headBob);
      ctx.lineTo(335, 273 + headBob);
      ctx.stroke();

      // Eyes
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(282, 273 + headBob, 5, 0, Math.PI * 2);
      ctx.arc(358, 273 + headBob, 5, 0, Math.PI * 2);
      ctx.fill();

      // Smile / speech movement
      const mouthOpen = 4 + Math.abs(Math.sin(frame * 0.12)) * 8;
      ctx.beginPath();
      ctx.ellipse(320, 340 + headBob, 18, mouthOpen, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#831843';
      ctx.fill();
      ctx.restore();

      // Audio waves overlay at bottom of webcam circle
      ctx.save();
      for (let i = 0; i < 9; i++) {
        const waveH = 8 + Math.abs(Math.sin((frame + i * 8) * 0.15)) * 22;
        const barX = 264 + i * 14;
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.roundRect(barX, 410 - waveH / 2, 7, waveH, 3);
        ctx.fill();
      }
      ctx.restore();

      // Studio Watermark Tag
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.beginPath();
      ctx.roundRect(240, 560, 160, 32, 16);
      ctx.fill();
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(260, 576, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('CAM FEED', 276, 580);
      ctx.restore();
    };

    this.webcamSimulationInterval = window.setInterval(renderWebcamFrame, 1000 / 30);
    renderWebcamFrame();

    const stream = canvas.captureStream(30);
    this.webcamStream = stream;
    return stream;
  }

  /**
   * Generates a sleek 1920x1080 animated VS Code & SaaS Dashboard stream
   * for zero-friction testing and demoing without requiring desktop screen permissions.
   */
  private createSimulatedScreenStream(): MediaStream {
    const simCanvas = document.createElement('canvas');
    simCanvas.width = 1920;
    simCanvas.height = 1080;
    const ctx = simCanvas.getContext('2d')!;

    let frame = 0;
    const renderSimFrame = () => {
      frame++;
      // Background: Dark VS Code / Studio editor
      ctx.fillStyle = '#0d1117';
      ctx.fillRect(0, 0, 1920, 1080);

      // Title bar
      ctx.fillStyle = '#161b22';
      ctx.fillRect(0, 0, 1920, 48);

      // Window dots
      ctx.fillStyle = '#ff5f56';
      ctx.beginPath();
      ctx.arc(28, 24, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffbd2e';
      ctx.beginPath();
      ctx.arc(52, 24, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#27c93f';
      ctx.beginPath();
      ctx.arc(76, 24, 7, 0, Math.PI * 2);
      ctx.fill();

      // Title
      ctx.fillStyle = '#8b949e';
      ctx.font = '14px JetBrains Mono, monospace';
      ctx.fillText('App.tsx — ReelScreen Studio (1920x1080 Desktop View)', 120, 30);

      // Sidebar
      ctx.fillStyle = '#161b22';
      ctx.fillRect(0, 48, 260, 1032);
      ctx.fillStyle = '#c9d1d9';
      ctx.font = '13px JetBrains Mono, monospace';
      ctx.fillText('EXPLORER', 24, 80);
      ctx.fillStyle = '#8b949e';
      ctx.fillText('▾ src', 24, 110);
      ctx.fillText('  ▸ components', 32, 135);
      ctx.fillText('  ▸ core', 32, 160);
      ctx.fillStyle = '#58a6ff';
      ctx.fillText('  ● cameraAgent.ts', 32, 185);
      ctx.fillStyle = '#8b949e';
      ctx.fillText('  ● exportEngine.ts', 32, 210);

      // Code Editor Area
      ctx.fillStyle = '#0d1117';
      ctx.fillRect(260, 48, 1660, 1032);

      // Line numbers & Code
      const lines = [
        'import { CameraAgent, ZoomEngine } from "./core";',
        '',
        '// Converting 16:9 widescreen to 9:16 vertical reels automatically',
        'export function renderVerticalReel(input: ScreenCapture): ReelOutput {',
        '  const camera = new CameraAgent({ smoothingFactor: 0.12 });',
        '  const zoom = new ZoomEngine(1.0, 1.4);',
        '  ',
        '  // 60 FPS Cursor tracking and click auto-zoom',
        '  const timeline = input.events.map(event => {',
        '    return camera.update(event.cursor.x, event.cursor.y, zoom.update());',
        '  });',
        '',
        '  console.log("Generating 1080x1920 export with zero editing needed!");',
        '  return ExportEngine.render(timeline, { format: "reel_9_16" });',
        '}'
      ];

      lines.forEach((line, i) => {
        const y = 90 + i * 32;
        // Line number
        ctx.fillStyle = '#484f58';
        ctx.font = '14px JetBrains Mono, monospace';
        ctx.fillText(`${i + 1}`, 280, y);

        // Highlight active line
        if (i === 6 + (Math.floor(frame / 60) % 5)) {
          ctx.fillStyle = 'rgba(56, 139, 253, 0.15)';
          ctx.fillRect(260, y - 22, 1660, 30);
        }

        // Code syntax highlighting simulation
        if (line.includes('import') || line.includes('export') || line.includes('function') || line.includes('return')) {
          ctx.fillStyle = '#ff7b72';
        } else if (line.includes('//')) {
          ctx.fillStyle = '#8b949e';
        } else if (line.includes('"')) {
          ctx.fillStyle = '#a5d6ff';
        } else {
          ctx.fillStyle = '#d2a8ff';
        }
        ctx.fillText(line, 320, y);
      });

      // Terminal drawer at bottom
      ctx.fillStyle = '#010409';
      ctx.fillRect(260, 800, 1660, 280);
      ctx.fillStyle = '#3fb950';
      ctx.font = '14px JetBrains Mono, monospace';
      ctx.fillText('➜ reelscreen-cli git:(main) ✔ npm run export:reel', 280, 840);
      ctx.fillStyle = '#8b949e';
      ctx.fillText('[ExportAgent] Rendering 1080x1920 @ 60 FPS... Done in 1.4s', 280, 875);
      ctx.fillText('[Output] reel_20261011_short.mp4 (High Bitrate 12Mbps)', 280, 905);

      // Animated simulated cursor
      const simCursorX = 500 + Math.sin(frame * 0.03) * 350 + Math.cos(frame * 0.05) * 150;
      const simCursorY = 300 + Math.cos(frame * 0.02) * 200 + Math.sin(frame * 0.04) * 100;

      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#6366f1';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(simCursorX, simCursorY);
      ctx.lineTo(simCursorX, simCursorY + 20);
      ctx.lineTo(simCursorX + 6, simCursorY + 16);
      ctx.lineTo(simCursorX + 14, simCursorY + 14);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    this.simulationInterval = window.setInterval(renderSimFrame, 1000 / 30);
    renderSimFrame();

    const stream = simCanvas.captureStream(60);
    this.displayStream = stream;
    return stream;
  }
}
