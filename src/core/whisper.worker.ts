/// <reference lib="webworker" />
// Runs Whisper (Transformers.js) off the main thread so the page stays responsive while a take
// is transcribed. The page decodes the audio (Web Audio isn't available in workers) and posts
// 16 kHz mono samples here; the loaded model is kept for the next request.

import type { Pipeline } from '@xenova/transformers';

export interface WhisperRequest {
  audio: Float32Array;
  model: string;
  language?: string;
}

export type WhisperMessage =
  | { type: 'progress'; status: string; progress: number }
  | { type: 'result'; chunks: { text: string; timestamp: [number, number | null] }[]; text: string }
  | { type: 'error'; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const loaded = new Map<string, Promise<Pipeline>>();

function post(msg: WhisperMessage): void {
  ctx.postMessage(msg);
}

async function getPipeline(model: string): Promise<Pipeline> {
  let p = loaded.get(model);
  if (!p) {
    p = (async () => {
      const { pipeline, env } = await import('@xenova/transformers');
      env.allowLocalModels = false;
      env.useBrowserCache = true;
      return pipeline('automatic-speech-recognition', model, {
        quantized: true,
        progress_callback: (info: { status?: string; progress?: number; file?: string }) => {
          if (info?.status === 'progress' && typeof info.progress === 'number') {
            post({
              type: 'progress',
              status: `Downloading Whisper model (${info.file || 'weights'}): ${Math.round(info.progress)}%`,
              progress: Math.min(80, Math.round(25 + info.progress * 0.55))
            });
          }
        }
      });
    })();
    p.catch(() => loaded.delete(model));
    loaded.set(model, p);
  }
  return p;
}

ctx.onmessage = async (e: MessageEvent<WhisperRequest>) => {
  const { audio, model, language } = e.data;
  try {
    post({ type: 'progress', status: 'Loading Whisper model (~40 MB, downloaded once)...', progress: 25 });
    const transcriber = await getPipeline(model);
    post({ type: 'progress', status: 'Transcribing speech on this device...', progress: 85 });
    const result = (await transcriber(audio, {
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: 'word',
      language: language && language !== 'auto' ? language : undefined
    })) as { text?: string; chunks?: { text: string; timestamp: [number, number | null] }[] };
    post({ type: 'result', chunks: result?.chunks ?? [], text: result?.text ?? '' });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
