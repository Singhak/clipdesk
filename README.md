# ClipDesk

Record your screen, mic and webcam in the browser and export a vertical 9:16 video for Reels, Shorts and TikTok. Recordings stay on your device; nothing is uploaded.

## Requirements
- A desktop browser with screen sharing (Chrome or Edge recommended; Safari and Firefox work with limits).
- HTTPS or `localhost`. Browsers block screen, camera and mic capture on plain HTTP.

## Run locally
```
npm install
npm run dev      # http://localhost:5173
```

## Build and deploy to Hostinger
```
npm run build
```
1. In hPanel, enable the free SSL certificate for your domain.
2. Open File Manager → `public_html` (or a subfolder) and upload the **contents** of `dist/`, including the hidden `.htaccess` file.
3. Visit your domain over `https://`.

The app has no backend, so shared hosting is enough. The build uses relative paths (`base: './'`), so it works at the domain root or in a subfolder.

## Features
- **Widescreen 16:9 (Loom-style)** 1920x1080 recording with a draggable camera bubble, or **Vertical 9:16** reels with cursor follow and click zoom.
- **Pop-out controls** (Chrome/Edge 116+): an always-on-top mini window with timer, pause, camera toggle and stop, so you can control the recording while another window is on screen.
- **Pen**: draw on the live preview; strokes fade after 4 seconds and are part of the recording.
- **Shortcuts** (while this tab or the pop-out has focus): Alt+Shift+P pause, Alt+Shift+S stop, Alt+Shift+D pen.
- Share links (as in Loom) need a backend and are not included.

## Using it
1. Pick a template, then click Continue (or Quick start).
2. Choose audio and webcam options and press Start Recording.
3. Select a screen or window in the browser prompt. If you cancel, you'll see an error with Try again and an optional demo feed.
4. Stop, then Download. The file is MP4 where the browser records it natively (Chrome 126+, Safari). Otherwise the app converts the WebM to H.264/AAC MP4 on your device with ffmpeg.wasm; the first conversion downloads about 30 MB, and a failed conversion offers the WebM instead.

## Chrome extension (Loom-style)
The extension records the current tab or your screen in the background, with floating controls on every web page, so you don't have to keep the ClipDesk tab in front.

```
npm run build:ext   # output in dist-extension/
```
1. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the `dist-extension` folder. It needs Chrome 126 or later.
2. Pin ClipDesk in the toolbar, open the popup, and click **Allow camera & mic** once.
3. Choose **This tab** or **Screen or window**, pick a format, and press **Start recording**.
4. Control the recording from the floating bar on the page, the toolbar popup, or the shortcuts Alt+Shift+P (pause) and Alt+Shift+S (stop). To make the shortcuts work outside Chrome, change them in `chrome://extensions/shortcuts`.
5. When you stop, a tab opens with the MP4 to download.

How it works: a pinned background tab does the capture, compositing and MP4 encoding. The service worker only coordinates. The page you are recording sends cursor moves and clicks, which drive cursor follow and click zoom in the 9:16 crop.

Extension limitations:
- The floating bar is part of the page, so it can appear in the recording. Minimize it, turn it off in the popup, or use the shortcuts. A browser extension can't hide its own UI from capture; only a native desktop app can.
- Cursor follow and click zoom only work while the pointer is over a normal web page. Chrome pages, the Web Store, and other desktop apps don't report the cursor.
- With **Screen or window**, cursor positions assume Chrome is on the monitor being recorded.
- Closing the pinned recorder tab ends the recording.

## Desktop app (Windows, macOS, Linux)
The Electron app records any screen with Loom-style floating controls that are **hidden from the video**, and follows your cursor across every app, not only web pages.

```
npm run desktop        # build and start
npm run dist:desktop   # build the installer into dist-desktop/ (on Windows: "ClipDesk Setup 1.0.0.exe")
```
1. Pick a screen (or a window), a format and a camera style, then press **Start recording**.
2. After a 3-2-1 countdown, the launcher hides and a floating bar appears at the bottom of the screen: timer, pause, stop, camera toggle, discard and minimize. Drag it by its grip.
3. Pause and stop also work from anywhere with Alt+Shift+P and Alt+Shift+S, and from the tray icon.
4. When you stop, the MP4 is saved to `Videos\ClipDesk` and a window opens to preview it, show it in the folder, save a copy or delete it (to the Recycle Bin).

How it works:
- **Recorder:** a hidden window captures the screen, composites the reel and encodes the MP4, using the same engine as the web app and extension.
- **Floating bar and countdown:** these windows are content-protected, so screen capture leaves them out.
- **Cursor and clicks:** the main process tracks the cursor (Electron's screen API) and clicks (`uiohook-napi`, a global mouse hook) across the desktop. These drive cursor follow and click zoom.

Desktop limitations:
- Cursor follow and click zoom need a **screen** source. Window recording keeps the crop centred.
- System audio recording is Windows-only.
- Hiding the controls from capture needs Windows 10 version 2004 or later. On macOS 15 and later, some capture paths ignore it.
- The installer isn't code-signed, so Windows SmartScreen and macOS Gatekeeper warn on first launch. Sign it before distributing.
- To record on macOS, allow ClipDesk under System Settings → Privacy & Security → Screen Recording (and Camera / Microphone).
- If `npm run desktop` fails with "Cannot read properties of undefined (reading 'commandLine')", `ELECTRON_RUN_AS_NODE` is set in your shell. `scripts/run-electron.mjs` clears it; don't run `electron .` directly from VS Code's terminal.

## Known limitations
- In the web app, cursor tracking only works inside the preview. Use the Chrome extension to track the cursor on any web page, or the desktop app for any app.
- If the web app tab is hidden while recording, the frame rate can drop in browsers other than Chrome and Edge.
- Pro licensing is a placeholder; there is no payment backend.
- Recording length is limited by browser memory.
