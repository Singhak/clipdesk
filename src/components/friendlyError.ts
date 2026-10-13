/** Turns raw engine/browser errors into short, plain-language messages. The raw text still goes to the console. */
export type ErrorContext = 'transcribe' | 'convert' | 'burn' | 'capture' | 'camera';

const FALLBACKS: Record<ErrorContext, string> = {
  transcribe: 'We could not create captions from this clip. Check your connection and try again, or type the captions instead.',
  convert: 'We could not convert the video to MP4. Try again, or download the original recording instead.',
  burn: 'We could not add captions to the video. Try again, or download the video without burned-in captions.',
  capture: 'We could not start screen capture. Try again, and choose a screen, window or tab to share.',
  camera: 'We could not use your camera or microphone. Check that no other app is using it and try again.'
};

export function friendlyError(err: unknown, context: ErrorContext): string {
  const e = err as { name?: string; message?: string } | null;
  const name = e?.name ?? '';
  const raw = (e?.message ?? (typeof err === 'string' ? err : '')).toLowerCase();

  if (name === 'AbortError' && context !== 'capture') return 'Cancelled.';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || raw.includes('permission denied')) {
    return context === 'camera'
      ? 'Camera or microphone access was blocked. Allow access in your browser settings and try again.'
      : 'Permission was denied. Allow access in your browser and try again.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'We could not find that camera or microphone. Check it is plugged in and pick another one.';
  }
  if (name === 'NotReadableError') return 'The device is busy. Close other apps that are using it and try again.';
  if (name === 'NotSupportedError' || raw.includes('not supported')) {
    return 'This browser does not support that feature. Try the latest Chrome or Edge on a desktop computer.';
  }
  if (raw.includes('401') || raw.includes('invalid api key') || raw.includes('incorrect api key')) {
    return 'The API key was not accepted. Check that it is correct and try again.';
  }
  if (raw.includes('429') || raw.includes('rate limit') || raw.includes('quota')) {
    return 'The service is busy or your quota is used up. Wait a moment and try again.';
  }
  if (raw.includes('failed to fetch') || raw.includes('networkerror') || raw.includes('network') || raw.includes('load failed')) {
    return 'The connection failed. Check your internet and try again.';
  }
  if (raw.includes('memory') || raw.includes('out of bounds') || raw.includes('allocation')) {
    return 'The video is too large to process in the browser. Try a shorter clip, or download the original recording.';
  }
  if (raw.includes('decode') || raw.includes('audio track') || raw.includes('encodingerror')) {
    return 'We could not read the audio in this clip. Make sure it has sound and try again.';
  }
  return FALLBACKS[context];
}
