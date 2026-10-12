<div align="center">

# 🎬 ClipDesk

### *OBS for Reels — The Vertical Content Workspace for Desktop Creators*

Turn widescreen (16:9) desktop and browser recordings into viral, studio-grade 9:16 vertical videos for **Instagram Reels**, **YouTube Shorts**, and **TikTok** — with zero manual editing, keyframing, or cropping required.

<br/>

[![React 19](https://img.shields.io/badge/React-19.0-61dafb?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-6.1-646cff?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev)
[![Electron](https://img.shields.io/badge/Electron-44.7-47848F?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org)
[![Chrome MV3](https://img.shields.io/badge/Chrome_Extension-MV3-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/)
[![FFmpeg](https://img.shields.io/badge/FFmpeg-Wasm%20%2B%20Static-007808?style=for-the-badge&logo=ffmpeg&logoColor=white)](https://ffmpeg.org)
[![Tailwind 4](https://img.shields.io/badge/TailwindCSS-v4.3-38bdf8?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Privacy First](https://img.shields.io/badge/Privacy-100%25%20On--Device-success?style=for-the-badge&logo=shield)](https://github.com)

<br/>

[📖 Overview](#-overview--product-vision) •
[✨ Key Features](#-key-features) •
[🧠 Core Engines Deep Dive](#-core-engines-deep-dive) •
[📊 Platform Ecosystem](#-platform-ecosystem--matrix) •
[📂 Project Structure](#-project-structure) •
[🚀 Getting Started](#-getting-started--developer-guide) •
[⌨️ Shortcuts](#️-keyboard-shortcuts) •
[🌐 Hostinger Deployment](#-deployment-to-hostinger) •
[🛠️ Troubleshooting](#️-troubleshooting--os-permissions)

---

</div>

## 📖 Overview & Product Vision

Creators, SaaS founders, and software developers build and demonstrate software on **widescreen (16:9) displays** (1920×1080 or larger). However, modern audience discovery happens predominantly on **vertical (9:16) feeds** like TikTok, Instagram Reels, and YouTube Shorts.

Traditionally, converting widescreen desktop screen recordings into high-converting vertical shorts required:
1. Importing massive screen recordings into Premiere Pro, Final Cut, or CapCut.
2. Manually keyframing pan and zoom to keep the mouse pointer centered.
3. Manually cropping and positioning the webcam bubble.
4. Manually layering blurred background duplicates or aesthetic frames.
5. Exporting and compressing for mobile feeds.

**ClipDesk eliminates this manual editing loop entirely.** Using a deterministic real-time compositor, ClipDesk automates camera following, click-triggered zoom, speech audio enhancement, circular camera bubble picture-in-picture, and multi-layout rendering directly on your machine.

### Who is ClipDesk for?
- **SaaS Founders & Marketers:** Record quick feature teasers, updates, and conversion-focused product demos.
- **Developers & Engineers:** Show off terminal workflows, code snippets, git diffs, and pull request walkthroughs.
- **Educators & Course Creators:** Record step-by-step tutorials without needing a video editing team.
- **Technical Advocates:** Create fast social snippets of documentation, browser tools, and CLI utilities.

---

## ✨ Key Features

<table>
  <tr>
    <td width="50%">
      <h3>🎯 Dynamic Cursor Follow & Auto-Zoom</h3>
      <p>Follows your cursor with frame-rate-independent easing, so motion feels the same at 30, 60 or 144 FPS and on any screen size. Clicks trigger a short zoom punch-in (240 ms in, 750 ms hold, 450 ms out). The desktop app tracks the cursor anywhere on screen; the web app only over its preview, the extension only over Chrome pages.</p>
    </td>
    <td width="50%">
      <h3>🎙️ Studio Voice DSP Enhancer</h3>
      <p>Built-in Web Audio digital signal processing pipeline with a background-safe noise gate (-45 dB), 3-band voice EQ (low cut, presence boost, air), and dynamic compressor to output crisp, podcast-grade voice-overs.</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>⚡ Dynamic Captions (Local Whisper.wasm)</h3>
      <p>Auto-generate viral, word-animated subtitles directly on-device using <b>Whisper.wasm (Transformers.js)</b> with <b>zero API keys required</b> (the ~40 MB model is downloaded once; audio stays on the device). Also supports bring-your-own-key Groq & OpenAI Whisper (audio is sent to that provider), and standard <code>.srt</code> / <code>.vtt</code> import & export. The desktop app burns captions in with native FFmpeg.</p>
    </td>
    <td width="50%">
      <h3>💻 Signed Windows Desktop App</h3>
      <p>Bypasses browser sandboxing with low-level <code>uiohook-napi</code> global cursor hooks across VS Code, Figma, and Terminal. Pre-configured code-signing pipeline generates signed <code>.exe</code> (NSIS) installers with desktop shortcuts.</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>🎥 Draggable Camera Bubble</h3>
      <p>Circular webcam PIP with glowing animated borders, quick size toggles (Small: 180px, Medium: 220px, Large: 280px), one-click horizontal mirror flipping, and fluid drag-and-drop boundary clamping.</p>
    </td>
    <td width="50%">
      <h3>📐 Intelligent Reel Layouts</h3>
      <p>Choose from <b>Follow Cursor</b> (dynamic 9:16 crop), <b>Blurred Backdrop</b> (ambient glow with 25px Gaussian blur), <b>Gradient Mesh</b> (modern aesthetic card framing), or <b>16:9 Classic</b> (Loom-style landscape).</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>✏️ Live Pen & Telestrator</h3>
      <p>Draw and highlight directly on your live capture during tutorials. Strokes fade gracefully after 4 seconds and are rendered straight into the final recording canvas.</p>
    </td>
    <td width="50%">
      <h3>🔒 100% Private & Local-First</h3>
      <p>Zero cloud uploads, zero telemetry, and zero backend servers. All compositing, on-device Whisper transcription, and FFmpeg MP4 encoding execute completely on your device.</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>✂️ Cut Anywhere, Undo Anything</h3>
      <p>Remove any part of a take, from the start, the end or the middle, as many times as you like. Drag over a part and press <kbd>Delete</kbd>; the preview skips what you cut. Every change can be undone (<kbd>Ctrl</kbd>+<kbd>Z</kbd>) or redone, and the original recording is never changed.</p>
    </td>
    <td width="50%">
      <h3>🔄 Auto-Update & Crash Logs</h3>
      <p>The installed desktop app updates itself from GitHub Releases in the background and installs on quit. Crashes and errors are written to a local log and minidump folder that users can open from the tray; nothing is uploaded.</p>
    </td>
  </tr>
</table>

---

## 🧠 Core Engines Deep Dive

ClipDesk is engineered around specialized modular agents located in [`src/core/`](file:///d:/Hostiger_Deployment/WtoR/src/core):

```mermaid
flowchart TD
    subgraph CaptureSources ["Input Sources"]
        S_Screen["Screen / Window / Tab"]
        S_Cam["Webcam Stream"]
        S_Mic["Microphone Audio"]
        S_Input["Mouse Coordinates & Clicks"]
    end

    subgraph CoreEngine ["ClipDesk Real-Time Core Pipeline"]
        CA["CameraAgent<br/>• 9:16 Viewport Math<br/>• Lerp Damping (factor: 0.08)<br/>• Deadzone Bounding Box"]
        ZE["ZoomEngine<br/>• Attack-Hold-Decay Curve<br/>• 1.4x Click Easing<br/>• Spring Interpolation"]
        AP["AudioMixer & VoiceProcessor<br/>• Noise Gate (-45 dB)<br/>• 3-Band Parametric EQ<br/>• Dynamic Compressor (3:1)"]
        RC["ReelCompositor & LayoutAgent<br/>• 60 FPS Offscreen Canvas<br/>• Layout Framing (Split / Blur / Mesh)<br/>• Camera Bubble Clipping"]
        EE["ExportEngine & MP4Converter<br/>• In-Browser FFmpeg.wasm<br/>• Local ffmpeg-static<br/>• Watermark Pipeline"]
    end

    subgraph Targets ["Distribution Targets"]
        T_Web["🌐 Web Studio (/src)"]
        T_Ext["🧩 Chrome MV3 Extension (/extension)"]
        T_Desk["💻 Electron Desktop (/electron)"]
    end

    S_Screen --> CA
    S_Input --> CA
    S_Input --> ZE
    S_Cam --> RC
    S_Mic --> AP
    CA --> RC
    ZE --> RC
    AP --> RC
    RC --> EE
    EE --> Targets
    Targets --> FinalOutput["🎬 1080x1920 MP4 Video"]
```

### 1. `CameraAgent` (`src/core/cameraAgent.ts`)
- **Aspect Ratio Transformation:** Calculates a vertical 9:16 crop window (source height ÷ zoom) from a capture of any size.
- **Lerp Damping:** Rather than snapping abruptly to cursor movement, the camera eases towards its target (factor 0.14 per 60 Hz frame, scaled to the real frame time by `src/core/smoothing.ts`) to prevent viewer motion sickness.
- **Deadzone Filtering:** Includes a centered bounding box deadzone so minor cursor tremors don't cause jitter.
- **Edge Boundary Clamping:** Clamps camera coordinates within `[0, sourceWidth - cropWidth]`, guaranteeing that no black voids appear outside the screen area.

### 2. `ZoomEngine` (`src/core/zoomEngine.ts`)
- **Click Detection Physics:** When the creator clicks their mouse, the zoom engine triggers an **Attack-Hold-Decay** envelope:
  - **Attack Phase (0–240ms):** Ease-out zoom from the resting 1.35× to the peak (1.55× subtle, 1.95× deep, 2.35× ultra) centered on the click.
  - **Hold Phase (240–990ms):** Holds the peak zoom while the interaction finishes.
  - **Decay Phase (990–1440ms):** Eases back to the resting zoom.

### 3. `AudioMixer` & `VoiceProcessor` (`src/core/audioMixer.ts`, `src/core/voiceProcessor.ts`)
- **Web Audio DSP Chain:**
  - **Noise Gate:** Suppresses room noise and keyboard clatter when volume drops below -45 dB with customizable 10ms attack and 150ms release.
  - **Voice EQ:** High-pass filter cuts sub-80Hz desk rumble; 2.5kHz peaking boost adds vocal clarity; 10kHz high-shelf brings crisp broadcast air.
  - **Compressor:** Smooth 3:1 ratio with fast 10ms attack prevents audio clipping during loud speaking moments.
  - **Stereo Mixer:** Blends system audio (desktop sound) with mic voiceover into a unified stereo stream.

### 4. `LayoutAgent` & `ReelCompositor` (`src/core/layoutAgent.ts`, `src/core/reelCompositor.ts`)
- **Real-Time Canvas Compositing:** Renders all layers at the recording frame rate (30 FPS on desktop) into a canvas:
  1. **Background Layer:** Ambient blur, gradient background, or solid fill.
  2. **Screen Capture Layer:** Dynamic 9:16 crop with smooth cursor focus.
  3. **Pen Annotation Layer:** Real-time fading telestrator strokes.
  4. **Camera Bubble Layer:** Clipped circular webcam video with glowing border stroke.
  5. **Branding Layer:** Creator handle and optional Pro watermark badge.

### 5. `ExportEngine` & `Mp4Converter` (`src/core/exportEngine.ts`, `src/core/mp4Converter.ts`)
- **Native MP4 Recording:** Uses browser native H.264/MP4 encoding where available (Chrome 126+, Safari).
- **Client-Side Transcoding:** Where browser only outputs WebM, client-side `@ffmpeg/ffmpeg` (Wasm) converts the media into high-bitrate H.264/AAC MP4 on-device with zero server compute.
- **Subtitle Burning:** In the browser, the video is replayed onto a canvas with the captions drawn on it (takes as long as the video, keeps the aspect ratio; with cuts it burns onto the cut file). On desktop, captions are converted to an ASS script and burned in by FFmpeg/libass, faster than real time.
- **Desktop Hardware Acceleration:** In the Electron app, bundled `ffmpeg-static` converts recordings near-instantaneously without browser memory limits.

### 6. `CaptionEngine` (`src/core/captionEngine.ts`)
- **Local Whisper (Transformers.js):** On-device speech-to-text with quantized ONNX models (`whisper-tiny.en` and `whisper-tiny`), run in a Web Worker so the page stays responsive. The audio is decoded to 16 kHz mono and never leaves the device; the model itself is downloaded once from Hugging Face.
- **Cloud Whisper Integration:** Optional high-speed transcription using Groq (`whisper-large-v3-turbo`) and OpenAI (`whisper-1`) with word-level precision timestamps.
- **Live Take Transcription (web only):** Captures spoken sentences during recording via the browser's Web Speech API. In Chrome this sends audio to Google's speech service; it is not available in the desktop app.
- **Subtitle Interoperability:** Full bidirectional parsing and exporting of standard SubRip (`.srt`) and WebVTT (`.vtt`) files.
- **Viral Word Animation:** Karaoke-style animated word highlighting (Hormozi, Beast, Neon, Minimal) with customizable Y-position, font size, and background pill opacity.

### 7. `CutList` & Cut Editor (`src/core/cutList.ts`, `src/components/cutTimeline.ts`)
- **Non-Destructive Edits:** An edit is a list of removed time ranges over the untouched recording. Overlapping cuts are merged, slivers under 0.1 s are absorbed, and at least 0.5 s of video must stay.
- **Undo / Redo:** Every cut, restore (↺) and reset is a snapshot in an undo history (up to 200 steps), so any change can be taken back. On desktop the history carries on after you save; if you close and reopen the result window, the saved cuts come back and can still be put back with ↺ or Reset.
- **Gapless Preview:** While the preview plays, cut parts are skipped every frame, and playback stops at the end of the last kept part.
- **Caption Remapping:** Captions stay timed against the original. On export they are moved onto the cut timeline: lines inside a cut are dropped, and a line a cut runs through keeps only its remaining words.
- **Frame-Accurate Export:** The kept parts are trimmed from the decoded stream and joined with an FFmpeg `trim`/`atrim` + `concat` filter graph. The web app runs it with ffmpeg.wasm. The desktop app runs it with native FFmpeg, saves an `(edited).mp4` copy next to the original and burns captions in the same pass.
- **One Widget, Two Apps:** The timeline is plain DOM, so the React web export screen and the framework-free desktop result window share it.

---

## 📊 Platform Ecosystem & Matrix

ClipDesk comes in three specialized versions sharing the exact same core rendering architecture:

| Feature / Capability | 🌐 Web Studio | 🧩 Chrome Extension (MV3) | 💻 Electron Desktop App |
| :--- | :---: | :---: | :---: |
| **Installation Required** | None (instant web URL) | Load Unpacked in Chrome | Native Installer (Windows .exe; macOS/Linux builds not shipped yet) |
| **Display Aspect Ratio** | 9:16 Vertical & 16:9 | 9:16 Vertical & 16:9 | 9:16 Vertical & 16:9 |
| **Cursor Tracking Scope** | Inside Preview Window | Any Chrome Web Page | **Entire Desktop & Any Native App** |
| **Mouse Click Tracking** | DOM Click Events | Browser Event Listener | **Global OS Hook (`uiohook-napi`)** |
| **Floating Controls UI** | Document PiP Window | Shadow DOM Injected Bar | **Always-On-Top Native Transparent Window** |
| **UI Hidden From Video** | ✅ Yes | *(Must minimize bar)* | **✅ Yes (`setWindowContentProtection`)** |
| **Desktop System Audio** | Browser Prompt Share | Tab Audio Capture | **Native Loopback System Audio (Win)** |
| **Offline Transcoding** | In-Browser WebAssembly | In-Browser WebAssembly | **Bundled Local Static FFmpeg** |
| **Cut & Trim Editor (with Undo)** | ✅ Cut on export (ffmpeg.wasm) | ❌ Download only | **✅ Saves an editable `(edited)` copy** |
| **Auto-Update & Crash Logs** | — (always latest) | Via Chrome Web Store once published | **✅ GitHub Releases + local logs** |
| **Recording Save Target** | Browser Download | Browser Download | **Direct to `Videos/ClipDesk` folder** |

---

## 📂 Project Structure

```
WtoR/
├── .github/                   # CI/CD and repository workflows
├── .gitignore                 # Excludes node_modules, build artifacts, logs
├── index.html                 # Web Studio entry point
├── package.json               # Project manifest, dependencies, and build scripts
├── tsconfig.json              # TypeScript compilation rules
├── README.md                  # Comprehensive interactive project documentation
├── wide2Short.md              # Original specification and product vision blueprint
│
├── public/                    # 🌐 Static Assets & Downloads
│   ├── .htaccess              # Hostinger COOP/COEP headers for Wasm FFmpeg
│   └── downloads/             # Pre-built distribution packages
│       ├── clipdesk-extension.zip # Packaged Chrome/Edge extension ready to load
│       └── ClipDesk-Setup-1.0.0.exe # Signed Windows NSIS installer binary
│
├── src/                       # 🌐 Web Studio & Shared Core Engines
│   ├── main.tsx               # Web Studio bootstrap
│   ├── App.tsx                # Main app state machine (welcome -> setup -> studio)
│   ├── index.css              # Tailwind CSS 4 styling and animations
│   ├── components/            # React UI components
│   │   ├── TopNav.tsx                 # Navigation bar and Pro status indicator
│   │   ├── WelcomeScreen.tsx          # Hero landing screen & template selector
│   │   ├── RecordingSetup.tsx         # Source picker, camera toggle, mic selector
│   │   ├── LiveStudio.tsx             # Live 60 FPS studio recording workspace
│   │   ├── VerticalCanvas.tsx         # Real-time 9:16 preview canvas renderer
│   │   ├── FloatingRecordingBar.tsx   # Floating recording controls bar
│   │   ├── FocusPicker.tsx            # Manual focus point selector
│   │   ├── FramingOverlay.tsx         # Interactive crop grid overlay
│   │   ├── BubbleStyleControls.tsx    # Webcam border and size adjustment modal
│   │   ├── CountdownOverlay.tsx       # 3-2-1 animated countdown overlay
│   │   ├── CaptionsGenerator.tsx      # Dynamic Captions Studio (Whisper.wasm + Cloud)
│   │   ├── CutEditor.tsx              # React host for the shared cut timeline
│   │   ├── cutTimeline.ts             # Cut timeline widget (select, cut, restore, undo/redo), shared with desktop
│   │   ├── ExportModal.tsx            # Export preview, cut editor, caption burning, download
│   │   └── UpgradeModal.tsx           # Pro creator licensing dialog
│   ├── core/                  # 🧠 Deterministic Real-Time Engines
│   │   ├── types.ts                   # Core interfaces and data structures
│   │   ├── cameraAgent.ts             # 9:16 viewport math & 60 FPS Lerp damping
│   │   ├── zoomEngine.ts              # Attack-Hold-Decay click-zoom physics
│   │   ├── audioMixer.ts              # Web Audio API multi-stream mixer
│   │   ├── voiceProcessor.ts          # Noise gate, parametric EQ, and compressor DSP
│   │   ├── captionEngine.ts           # On-device Whisper.wasm, Groq/OpenAI, .SRT parser
│   │   ├── whisper.worker.ts          # Web Worker running on-device Whisper transcription
│   │   ├── cutList.ts                 # Cut ranges, caption remapping, FFmpeg cut graph, undo history
│   │   ├── smoothing.ts               # Frame-rate-independent easing helpers
│   │   ├── focusRegion.ts             # Focus region bounding box detector
│   │   ├── frameSource.ts             # Display media and camera stream sampler
│   │   ├── layoutAgent.ts             # Layout orchestrator (Follow, Blur, Mesh, 16:9)
│   │   ├── reelCompositor.ts          # Canvas composition and frame-by-frame renderer
│   │   ├── templateManager.ts         # Pre-configured creator reel templates
│   │   ├── recordingService.ts        # Recording state machine and mock demo generator
│   │   ├── exportEngine.ts            # FFmpeg filtergraph generator & export pipeline
│   │   ├── mp4Converter.ts            # In-browser WebM to H.264/AAC converter and cutter via Wasm
│   │   └── __tests__/                 # Vitest unit tests for the core engines
│   └── licensing/             # 👑 Monetization & Entitlements
│       ├── licenseService.ts          # Offline key validation & localStorage cache
│       └── tierFeatures.ts            # Free vs. Pro entitlement matrices
│
├── extension/                 # 🧩 Chrome Extension (Manifest V3)
│   ├── public/
│   │   ├── manifest.json      # MV3 configuration, permissions, background worker
│   │   └── icons/             # 16px, 32px, 48px, 128px extension icons
│   ├── permissions.html       # Camera & mic one-time grant tab
│   ├── popup.html             # Toolbar popup interface
│   ├── recorder.html          # Pinned background offscreen recording tab
│   ├── result.html            # Completed recording review and download page
│   └── src/
│       ├── background.ts      # Extension service worker coordinator
│       ├── content.ts         # Injected shadow-DOM floating controls bar
│       ├── popup.tsx          # React popup setup wizard
│       ├── recorder.ts        # Background tab capture & stream compositing
│       ├── result.ts          # Download and review handlers
│       └── shared.ts          # Extension IPC message contracts & IndexedDB storage
│
├── electron/                  # 💻 Electron Desktop Application
│   ├── main.ts                # Main process, window manager, IPC, global shortcuts
│   ├── preload.ts             # Secure IPC bridge exposing window.reel API
│   ├── ffmpegManager.ts       # Bundled FFmpeg: MP4 conversion, cuts and caption burn-in
│   ├── updater.ts             # Auto-update from GitHub Releases (electron-updater)
│   ├── diagnostics.ts         # Local crash dumps and rotating error log
│   ├── shared.ts              # Desktop state interfaces and IPC events
│   ├── launcher.html          # Initial launcher setup window
│   ├── controls.html          # Floating mini control bar overlay
│   ├── countdown.html         # Fullscreen 3-2-1 transparent countdown window
│   ├── camera.html            # Transparent draggable floating camera bubble
│   ├── recorder.html          # Hidden compositor window capturing desktop
│   ├── result.html            # Post-recording review and folder opener
│   └── src/
│       ├── launcher.tsx       # React setup window UI
│       ├── controls.ts        # Native floating bar controller
│       ├── camera.ts          # Bubble physics, resizing, and mirror toggles
│       ├── countdown.ts       # Countdown animation controller
│       ├── recorder.ts        # Desktop capture, uiohook cursor bridge, encoding
│       └── result.ts          # Review window: cut editor, captions, save as, open folder, delete
│
└── scripts/                   # ⚙️ Build and Tooling Scripts
    ├── run-electron.mjs       # Safe Electron bootstrap clearing env flags
    ├── make-extension-icons.mjs # Canvas generator for all extension icon sizes
    ├── package-downloads.mjs  # Packages extension into .zip and syncs installers
    ├── create-code-signing-cert.ps1 # Generates self-signed RSA-2048 code signing PFX
    └── build-signed-windows.ps1 # Builds signed Windows desktop NSIS installer (.exe)
```

---

## 🚀 Getting Started & Developer Guide

### Prerequisites
- **Node.js**: v18.0.0 or later (Node 20+ recommended)
- **npm**: v9.0.0 or later
- **Modern Browser**: Google Chrome or Microsoft Edge (Chrome 126+ recommended for native MP4 recording)

### Installation
Clone the repository and install all dependencies:
```bash
git clone https://github.com/Singhak/clipdesk.git
cd clipdesk
npm install
```

---

### Running the Targets

#### 1. 🌐 Web Studio (Browser)
Starts the local development server:
```bash
npm run dev
# Server ready at http://localhost:5173
```
- Open `http://localhost:5173` in Chrome or Edge.
- Select a template (e.g. *Coding Tutorial* or *Product Demo*).
- Configure your camera and microphone, click **Start Recording**, and pick your target screen or window.

#### 2. 🧩 Chrome Extension (Manifest V3)
Compile the extension bundle:
```bash
npm run build:ext
# Output generated in: dist-extension/
```
1. Open Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** (top right switch).
3. Click **Load unpacked** and select the [`dist-extension/`](file:///d:/Hostiger_Deployment/WtoR/dist-extension) folder.
4. Pin **ClipDesk** to your toolbar.
5. Click the extension icon and click **Allow camera & mic** once to grant persistent permissions.
6. Optional: turn on **Follow on every page** in the popup. ClipDesk installs with no site access and only touches the tab you start recording from; this toggle asks Chrome for access to all pages so the controls and cursor follow keep working on pages you open mid-recording.

#### 3. 💻 Electron Desktop Application
Launch the desktop application in developer mode:
```bash
npm run desktop
```
Build standalone Windows installer:
```bash
npm run dist:win
# Generates native NSIS installer inside dist-desktop/ClipDesk-Setup-1.0.0.exe
```

#### 4. 🔐 Windows Code Signing & Signed Packaging
Generate a local RSA-2048 Code Signing Certificate and compile a fully signed installer using Windows `signtool.exe`:
A self-signed certificate is for local testing only: Windows SmartScreen still shows "Unknown publisher". Public releases need an OV/EV certificate or Microsoft Trusted Signing.
```powershell
# The certificate password is read from this variable (it is not stored in the repo)
$env:CLIPDESK_CERT_PASSWORD = "<your password>"

# Step 1: Generate self-signed certificate (saved to certs/clipdesk-codesign.pfx)
powershell -ExecutionPolicy Bypass -File scripts\create-code-signing-cert.ps1

# Step 2: Build signed Windows NSIS installer with signtool.exe
powershell -ExecutionPolicy Bypass -File scripts\build-signed-windows.ps1

# Release: also upload the installer and latest.yml to a GitHub release so installed copies update
$env:GH_TOKEN = "<token with repo access>"
powershell -ExecutionPolicy Bypass -File scripts\build-signed-windows.ps1 -Publish
```

#### Updates and crash reports
- **Auto-update:** the installed app checks [GitHub Releases](https://github.com/Singhak/clipdesk/releases) 15 seconds after start and every 6 hours. Updates download in the background and install when the app quits. The tray also offers **Restart to update**, but not while a recording is running. Bump `version` in `package.json` before each release; `npm run release:win` publishes an unsigned build. Updates need the NSIS installer (the MSI can't update itself), and a signed install only accepts updates signed by the same publisher name, so keep the certificate subject unchanged when the certificate is renewed or replaced.
- **Crash reports:** native crashes write minidumps to `%APPDATA%\clipdesk\Crashpad\reports`, and JavaScript errors from every window go to `%APPDATA%\clipdesk\logs\clipdesk.log` (rotated at 2 MB). Nothing is uploaded. Users can open the folder from the tray (**Open logs and crash reports**) and attach the files to a support request.

#### 5. 📦 Package Downloads for Web Distribution
Pre-package the Chrome Extension `.zip` and synchronize desktop installers for direct downloads:
```bash
# Zips extension into public/downloads/clipdesk-extension.zip and syncs installers
npm run package:downloads

# Build Web, Desktop, Extension, and packaging in one command:
npm run package:all
```

---

### Tests
Unit tests for the shared engines (camera, zoom, smoothing, captions, cut editing and undo, FFmpeg command building) run with Vitest:
```bash
npm test
npm run typecheck
```
CI (`.github/workflows/ci.yml`) runs both plus the web, desktop and extension builds on every push and pull request.

---

## ⌨️ Keyboard Shortcuts

ClipDesk features built-in shortcuts accessible during active recording:

| Shortcut | Scope | Action | Description |
| :--- | :--- | :--- | :--- |
| <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> | Global (Desktop) / In-Tab | **Pause / Resume** | Pauses video timer and halts frame capture |
| <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd> | Global (Desktop) / In-Tab | **Stop & Export** | Finalizes the take and opens export review |
| <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>D</kbd> | Web Studio | **Toggle Pen** | Activates the live telestrator drawing tool |

The cut editor (web export screen and desktop result window) has its own keys. They are ignored while you type in a text field:

| Shortcut | Action |
| :--- | :--- |
| Drag on the timeline | Select a part |
| <kbd>I</kbd> / <kbd>O</kbd> | Start / end the selection at the playhead |
| <kbd>Delete</kbd> or <kbd>Backspace</kbd> | Cut the selected part |
| <kbd>Esc</kbd> | Clear the selection |
| <kbd>Ctrl</kbd> + <kbd>Z</kbd> | Undo |
| <kbd>Ctrl</kbd> + <kbd>Y</kbd> or <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd> | Redo |
| <kbd>Space</kbd> | Play / pause (desktop result window) |

> **Pro-Tip for Chrome Extension:** You can configure the extension shortcuts to work globally across your entire OS by visiting `chrome://extensions/shortcuts` and switching the shortcut scope from **In Chrome** to **Global**.

---

## 🌐 Deployment to Hostinger

ClipDesk is completely client-side and requires **no database, node backend, or server infrastructure**. You can host it on any static web server, Hostinger shared hosting, Cloudflare Pages, Vercel, or Netlify.

### 1. Build the Production Bundle
```bash
npm run build
# Output generated in: dist/
```

### 2. Deploy to Hostinger via hPanel
1. Log into your **Hostinger hPanel**.
2. Go to **Websites** → Select your domain → Enable your free **SSL Certificate** (browsers will deny screen/camera capture on insecure `http://`).
3. Open **File Manager** and navigate to your web root (`public_html/` or a subfolder).
4. Upload all files from the [`dist/`](file:///d:/Hostiger_Deployment/WtoR/dist) folder.
5. **Crucial:** Ensure the included [`.htaccess`](file:///d:/Hostiger_Deployment/WtoR/public/.htaccess) file is uploaded to `public_html/`. It sets the required security headers:
   ```apache
   # Required for WebAssembly FFmpeg SharedArrayBuffer support
   Header set Cross-Origin-Embedder-Policy "require-corp"
   Header set Cross-Origin-Opener-Policy "same-origin"
   ```
6. Visit `https://yourdomain.com` in your browser.

---

## 🛠️ Troubleshooting & OS Permissions

### macOS Permissions
macOS requires explicit system-level permissions for screen recording and input monitoring:
- If screen capture shows a blank black screen, open **System Settings → Privacy & Security → Screen Recording** and toggle **ClipDesk** (or Google Chrome) to **Allowed**.
- If camera or microphone fails, check **Privacy & Security → Camera / Microphone**.
- After toggling permissions on macOS, you must restart the application.

### Windows `ELECTRON_RUN_AS_NODE`
If you attempt to run `electron .` directly in VS Code's integrated terminal on Windows, you may encounter:
```
TypeError: Cannot read properties of undefined (reading 'commandLine')
```
This happens because VS Code injects `ELECTRON_RUN_AS_NODE=1` into child terminal shells. Always start the desktop app using:
```bash
npm run desktop
```
which uses [`scripts/run-electron.mjs`](file:///d:/Hostiger_Deployment/WtoR/scripts/run-electron.mjs) to automatically strip that environment variable.

### Browser Memory Limits
In the Web Studio and Chrome Extension, recordings are browser Blobs, which Chrome moves to disk once they get large (the web app also keeps a copy in IndexedDB for crash recovery). ffmpeg.wasm reads the recording straight from the Blob, but the converted MP4 is built in WebAssembly memory, which is capped at about 2 GB. For long recordings, use the **ClipDesk Desktop Application**, which writes each chunk to `Videos/ClipDesk` as it is recorded, so a crash keeps everything up to that point.

---

## 📄 License & Attribution

Distributed under the MIT License. Built with ❤️ for developers, founders, and content creators.
