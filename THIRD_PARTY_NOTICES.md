# Third-party notices

ClipDesk is licensed under the GNU General Public License v3.0 or later (see `LICENSE`).
It includes or downloads the following third-party software. Each component keeps its own license.

## Bundled in the desktop installer

### FFmpeg (via `ffmpeg-static`)
- License: GNU GPL v3.0 or later (the static builds enable GPL components such as libx264)
- Used for: MP4 conversion, noise cancellation, cutting and caption burn-in in the desktop app
- The binary runs as a separate process; ClipDesk does not link against it.
- Source code: https://ffmpeg.org/download.html and build scripts at https://github.com/eugeneware/ffmpeg-static
- Written offer: on request we will provide the exact FFmpeg source matching any ClipDesk release for at least three years after that release. Open an issue on the ClipDesk repository to ask for it.

### Electron
- License: MIT. Includes Chromium (BSD-3-Clause and others) and Node.js (MIT).
- Full notices ship as `LICENSES.chromium.html` inside the installed app.
- https://github.com/electron/electron

### uiohook-napi
- License: MIT
- https://github.com/SnosMe/uiohook-napi

### electron-updater
- License: MIT
- https://github.com/electron-userland/electron-builder

## Bundled in the web app, extension and desktop app

### ffmpeg.wasm (`@ffmpeg/ffmpeg`, `@ffmpeg/util`, `@ffmpeg/core`)
- `@ffmpeg/ffmpeg` and `@ffmpeg/util`: MIT
- `@ffmpeg/core` (FFmpeg compiled to WebAssembly): GNU GPL v2.0 or later
- Source code: https://github.com/ffmpegwasm/ffmpeg.wasm

### Transformers.js (`@xenova/transformers`)
- License: Apache-2.0
- https://github.com/xenova/transformers.js

### OpenAI Whisper model weights (`Xenova/whisper-tiny`, `Xenova/whisper-tiny.en`)
- License: MIT. Downloaded from Hugging Face on first use, not bundled.
- https://github.com/openai/whisper

### TweetNaCl.js (`tweetnacl`)
- License: Unlicense (public domain)
- https://github.com/dchest/tweetnacl-js

### React and React DOM
- License: MIT
- https://github.com/facebook/react

### lucide-react
- License: ISC
- https://github.com/lucide-icons/lucide

### Tailwind CSS
- License: MIT
- https://github.com/tailwindlabs/tailwindcss

### clsx
- License: MIT
- https://github.com/lukeed/clsx

## Licensing server (`server/`)

### Cashfree Payments JS SDK
- Loaded from `sdk.cashfree.com` on the hosted checkout page only. Not bundled.
