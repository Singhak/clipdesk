/// <reference types="vite/client" />

declare module '@ffmpeg/core?url' {
  const url: string;
  export default url;
}
declare module '@ffmpeg/core/wasm?url' {
  const url: string;
  export default url;
}

/** True in the Chrome extension build (vite define) */
declare const __EXTENSION_BUILD__: boolean;
