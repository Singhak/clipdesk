import type { ReelApi } from '../preload';

declare global {
  interface Window {
    reel: ReelApi;
  }
}

export {};
