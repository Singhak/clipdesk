# Code Quality & Architectural Flaws Audit

> **Status (October 2026): all items below are fixed.** For example, the noise gate now runs on a worker ticker, and the input `MediaStream` is held on the processor. Run `npx vite-node scripts/verify-audit.ts` to re-check them. The line numbers and code excerpts below refer to the old code.


This document details all discovered runtime bugs, architectural limitations, memory leaks, and browser compatibility flaws across the core processing pipeline of the ClipDesk (WtoR) codebase, with primary focus on [`src/core/voiceProcessor.ts`](file:///d:/Hostiger_Deployment/WtoR/src/core/voiceProcessor.ts) and connected core modules ([`src/core/audioMixer.ts`](file:///d:/Hostiger_Deployment/WtoR/src/core/audioMixer.ts), [`src/core/exportEngine.ts`](file:///d:/Hostiger_Deployment/WtoR/src/core/exportEngine.ts), [`src/core/layoutAgent.ts`](file:///d:/Hostiger_Deployment/WtoR/src/core/layoutAgent.ts), and [`src/core/templateManager.ts`](file:///d:/Hostiger_Deployment/WtoR/src/core/templateManager.ts)).

---

## Table of Contents
1. [Core DSP Pipeline: `src/core/voiceProcessor.ts`](#1-core-dsp-pipeline-srccorevoiceprocessorts)
   - [Critical Severity](#critical-severity)
   - [High Severity](#high-severity)
   - [Medium Severity](#medium-severity)
   - [Minor Severity & Hygiene](#minor-severity--hygiene)
2. [Audio Subsystem Integration: `audioMixer.ts` & `recordingService.ts`](#2-audio-subsystem-integration-audiomixerts--recordingservicets)
3. [Export Pipeline: `src/core/exportEngine.ts`](#3-export-pipeline-srccoreexportenginets)
4. [Rendering & Compositing: `src/core/layoutAgent.ts`](#4-rendering--compositing-srccorelayoutagentts)
5. [Template Management: `src/core/templateManager.ts`](#5-template-management-srccoretemplatemanagerts)
6. [Prioritized Remediation Matrix](#6-prioritized-remediation-matrix)

---

## 1. Core DSP Pipeline: `src/core/voiceProcessor.ts`

### Critical Severity

#### 1.1 Background Tab Freezes Noise Gate (`requestAnimationFrame` Throttling)
* **File Location:** [`src/core/voiceProcessor.ts` (Lines 211–244)](file:///d:/Hostiger_Deployment/WtoR/src/core/voiceProcessor.ts#L211-L244)
* **Root Cause:**
  ```typescript
  this.animFrameId = requestAnimationFrame(checkAudioLevel);
  ```
  The dynamic noise gate analysis loop relies entirely on `requestAnimationFrame`.
* **Impact in a Screen Recorder:**
  - ClipDesk is a screen recording tool where users navigate away from the recorder tab into their IDE, browser, terminal, or full-screen applications.
  - All major browsers (Chrome, Edge, Firefox, Safari) throttle `requestAnimationFrame` down to 0–1 fps or suspend it completely when the tab is hidden or minimized.
  - **Failure Mode:** If the user paused speaking right before switching to their code editor, the noise gate closed to its floor level (`gateFloorGain = 0.01`, which is **-40 dB attenuation**). When the user begins speaking in their recorded window, `checkAudioLevel` **does not execute**, leaving the noise gate permanently locked shut. The entire vocal track is recorded as near silence / muffled -40 dB.
  - Conversely, if the user switched windows while speaking, the gate remains permanently stuck open.
  - Note: [`src/core/exportEngine.ts` (Lines 123–151)](file:///d:/Hostiger_Deployment/WtoR/src/core/exportEngine.ts#L123-L151) explicitly wrote a custom Web Worker timer (`startTicker`) specifically because `requestAnimationFrame` freezes in hidden tabs; `voiceProcessor.ts` failed to implement equivalent background execution.

---

#### 1.2 Silent Audio Dropout Due to V8 Garbage Collection of Inline `MediaStream`
* **File Location:** [`src/core/voiceProcessor.ts` (Line 125)](file:///d:/Hostiger_Deployment/WtoR/src/core/voiceProcessor.ts#L125)
* **Root Cause:**
  ```typescript
  this.sourceNode = ctx.createMediaStreamSource(new MediaStream([track]));
  ```
  The `new MediaStream([track])` constructor creates an anonymous, unreferenced JS object.
* **Impact:**
  - Under Chromium (Chromium Issues `crbug.com/123281`, `crbug.com/933677`), `AudioContext.createMediaStreamSource()` holds only a weak internal reference to the JavaScript `MediaStream`.
  - When V8 triggers garbage collection (common during video canvas recording sessions), the unreferenced `MediaStream` wrapper is garbage collected.
  - **Failure Mode:** The audio input abruptly goes silent minutes into a recording session with no errors thrown and no disconnection callback fired.

---

#### 1.3 AudioParam Timeline Congestion (`setTargetAtTime` Fired Every Frame)
* **File Location:** [`src/core/voiceProcessor.ts` (Lines 226–236)](file:///d:/Hostiger_Deployment/WtoR/src/core/voiceProcessor.ts#L226-L236)
* **Root Cause:**
  ```typescript
  if (db >= profile.gateThresholdDb) {
    this.isGateOpen = true;
    this.gateHoldUntil = now + profile.gateHoldMs;
    gateGain.gain.setTargetAtTime(1.0, this.ctx.currentTime, profile.gateAttackTime);
  } else {
    if (now >= this.gateHoldUntil) {
      this.isGateOpen = false;
      gateGain.gain.setTargetAtTime(profile.gateFloorGain, this.ctx.currentTime, profile.gateReleaseTime);
    }
  }
  ```
* **Impact:**
  - While the speaker is talking, `setTargetAtTime` is invoked **60 times every second** (~every 16 ms) indefinitely, even when the gate is already fully open.
  - Each invocation restarts the AudioParam exponential curve calculation from the current instantaneous value, flooding the Web Audio engine timeline with redundant automation events.
  - In WebKit and Blink audio threads, this causes unnecessary CPU overhead, audio thread queuing, and can produce audible zipper or micro-click noise.
  - Transitioning between attack and release without calling `cancelScheduledValues(this.ctx.currentTime)` or checking whether the state actually changed (`if (!this.isGateOpen)`) causes automation conflicts.

---

### High Severity

#### 1.4 Analyser Tapped Pre-Filter (Desk Fan Drone Defeats Noise Gate)
* **File Location:** [`src/core/voiceProcessor.ts` (Lines 196–198)](file:///d:/Hostiger_Deployment/WtoR/src/core/voiceProcessor.ts#L196-L198)
* **Root Cause:**
  ```typescript
  // Sidechain analyser to track vocal RMS and trigger the noise gate
  this.analyserNode = ctx.createAnalyser();
  // Monitor pre-gate signal from highpass to detect speech accurately
  this.highpassNode.connect(this.analyserNode);
  ```
* **Impact:**
  - The audio pipeline is structured as:
    `sourceNode` ➔ `highpassNode` ➔ `notchNode` (220–280 Hz fan drone cut) ➔ `presenceNode` ➔ `highshelfNode` (air hiss cut) ➔ `gateGainNode` ➔ `compressorNode`.
  - Notice the `analyserNode` is tapped directly from `highpassNode`, **bypassing the notch and highshelf filters**.
  - If a user has a loud computer fan or desk fan with resonance around 220–280 Hz, the notch filter attenuates it for the audible output, **but the gate detector hears it at full volume**.
  - If fan noise at the highpass output exceeds `gateThresholdDb` (e.g. -42 dB or -36 dB), **the gate will never close**, defeating the entire noise suppression profile.

---

#### 1.5 Insufficient FFT Window (512 Samples) Induces Pitch Flutter
* **File Location:** [`src/core/voiceProcessor.ts` (Lines 194, 209)](file:///d:/Hostiger_Deployment/WtoR/src/core/voiceProcessor.ts#L194-L209)
* **Root Cause:**
  - At standard 48 kHz sample rate, `512 samples / 48000 = 10.66 ms`.
  - The fundamental frequency of a deep male voice sits between 85 Hz and 110 Hz.
  - One period of an 85 Hz wave is `11.76 ms` (564 samples).
* **Impact:**
  - A 512-sample time-domain buffer cannot fit a single complete wave cycle for low-pitched speech.
  - When the 10.6 ms window lands on a waveform zero-crossing, the calculated RMS drops sharply; when centered on a peak, it spikes.
  - This produces massive frame-to-frame variance in computed `db`, causing erratic VU readings and gate fluttering near the threshold.

---

#### 1.6 `smoothingTimeConstant = 0.2` Is Completely Ineffective
* **File Location:** [`src/core/voiceProcessor.ts` (Line 195)](file:///d:/Hostiger_Deployment/WtoR/src/core/voiceProcessor.ts#L195)
* **Root Cause:**
  - In the W3C Web Audio API specification:
    > *"The `smoothingTimeConstant` attribute is only used for `getByteFrequencyData` and `getFloatFrequencyData`."*
  - It has zero effect on `getFloatTimeDomainData()`.
* **Impact:**
  - `getFloatTimeDomainData()` always delivers raw instantaneous samples. The expected time-domain smoothing does not occur.

---

### Medium Severity

#### 1.7 Missing Dynamic Profile Switching (`setMode`)
* **File Location:** [`src/core/voiceProcessor.ts` (Lines 97–130, 247–249)](file:///d:/Hostiger_Deployment/WtoR/src/core/voiceProcessor.ts#L97-L130)
* **Root Cause:** `VoiceProcessor` sets its profile solely in the constructor; there is no `setMode(mode: NoiseSuppressionMode)` method.
* **Impact:** When a user toggles noise suppression presets in the UI (`studio`, `fan_killer`, `mild`, `off`), the existing node graph cannot update its parameters. The caller is forced to tear down the entire processor, disconnect nodes, and recreate it, inducing audio pops and requiring destination reconnection.

---

#### 1.8 Mode `'off'` Disables Level Metering
* **File Location:** [`src/core/voiceProcessor.ts` (Lines 127–130)](file:///d:/Hostiger_Deployment/WtoR/src/core/voiceProcessor.ts#L127-L130)
* **Root Cause:** When `mode === 'off'`, constructor returns early before setting up `analyserNode` or starting `startGateLoop`.
* **Impact:** `options.onLevelChange` is never called. Any UI VU meter or audio activity indicator freezes or reports 0 volume whenever noise cancellation is disabled.

---

#### 1.9 Dynamics Compressor Attack Conflated with Gate Attack
* **File Location:** [`src/core/voiceProcessor.ts` (Line 187)](file:///d:/Hostiger_Deployment/WtoR/src/core/voiceProcessor.ts#L187)
* **Root Cause:**
  ```typescript
  this.compressorNode.attack.setValueAtTime(profile.gateAttackTime, ctx.currentTime);
  this.compressorNode.release.setValueAtTime(0.22, ctx.currentTime);
  ```
* **Impact:**
  - `profile.gateAttackTime` (0.004–0.006 s) is calibrated for downward noise gate expansion, yet it is assigned directly to `compressorNode.attack`.
  - Vocal compressors require distinct attack (typically 10–25 ms) and release parameters. Hardcoding release to 0.22 s and binding attack to the gate attack overly clamps vocal transients.

---

#### 1.10 Timebase Mismatch Between `performance.now()` and `AudioContext.currentTime`
* **File Location:** [`src/core/voiceProcessor.ts` (Lines 223, 228, 230)](file:///d:/Hostiger_Deployment/WtoR/src/core/voiceProcessor.ts#L223-L230)
* **Root Cause:** The gate hold timer calculates expiration using `performance.now()` (system wall clock in ms), while the gain node schedules automation using `this.ctx.currentTime` (hardware audio clock in seconds).
* **Impact:** If `AudioContext` is suspended or resumes (e.g. system wake from sleep, device unplug/replug), `performance.now()` advances while `ctx.currentTime` stays paused, causing the gate state machine to desynchronize from actual audio playback.

---

### Minor Severity & Hygiene

#### 1.11 AudioNode References Retained After `close()`
* **File Location:** [`src/core/voiceProcessor.ts` (Lines 251–269)](file:///d:/Hostiger_Deployment/WtoR/src/core/voiceProcessor.ts#L251-L269)
* **Root Cause:** `close()` invokes `.disconnect()` on each node, but never sets the internal references (`this.highpassNode = null`, etc.) to `null`.
* **Impact:** If the `VoiceProcessor` reference is retained by a parent closure, all associated Web Audio internal nodes and buffers remain pinned in memory.

#### 1.12 Unused `inputTrack` Field & Unhandled Track Lifecycle
* **File Location:** [`src/core/voiceProcessor.ts` (Lines 103, 121)](file:///d:/Hostiger_Deployment/WtoR/src/core/voiceProcessor.ts#L103)
* **Root Cause:** `private inputTrack: MediaStreamTrack` is stored but never read. It also lacks event listeners for `ended` or `mute` events, so hardware disconnection cannot notify the UI.

---

## 2. Audio Subsystem Integration: `audioMixer.ts` & `recordingService.ts`

#### 2.1 Level Meter Callback Unwired in Main Recording Pipeline
* **File Location:** [`src/core/recordingService.ts` (Lines 101–109)](file:///d:/Hostiger_Deployment/WtoR/src/core/recordingService.ts#L101-L109)
* **Root Cause:**
  ```typescript
  this.mixedAudio = await mixAudioTracks({
    micTrack: this.micStream?.getAudioTracks()[0] ?? null,
    systemTrack: this.displayStream?.getAudioTracks()[0] ?? null,
    noiseCancellation: audioConfig?.noiseCancellation ?? 'studio'
  });
  ```
* **Impact:** While `AudioMixOptions` supports `onAudioLevel`, `recordingService.ts` never supplies it. The studio recording UI never receives vocal meter signals from the active `VoiceProcessor`.

#### 2.2 Inline `MediaStream` GC Vulnerability in Mixer Passthrough
* **File Location:** [`src/core/audioMixer.ts` (Lines 87, 93)](file:///d:/Hostiger_Deployment/WtoR/src/core/audioMixer.ts#L87-L93)
* **Root Cause:**
  ```typescript
  ctx.createMediaStreamSource(new MediaStream([micTrack])).connect(dest);
  ctx.createMediaStreamSource(new MediaStream([systemTrack])).connect(dest);
  ```
* **Impact:** System audio tracks and mic tracks in un-filtered mode suffer from the exact same Chromium GC audio cutoff bug detailed in 1.2.

---

## 3. Export Pipeline: `src/core/exportEngine.ts`

#### 3.1 FFmpeg Filtergraph Injection & Unescaped Paths
* **File Location:** [`src/core/exportEngine.ts` (Lines 20–44)](file:///d:/Hostiger_Deployment/WtoR/src/core/exportEngine.ts#L20-L44)
* **Root Cause:**
  ```typescript
  return `ffmpeg -y -i "${inputFile}" ${audioFile ? audioParam : ''} -filter_complex ${filter} -map "[v]" -c:v libx264 -preset fast -b:v ${bitrate} -pix_fmt yuv420p "${outputFile}"`;
  ```
* **Impact:** If `inputFile` or `outputFile` contains special characters (quotes, backslashes, semicolons in Windows/POSIX paths) or if custom watermark text is interpolated, the resulting command string breaks or causes filtergraph command injection.

#### 3.2 Corrupt 0-Byte Blob on Immediate Recording Stop
* **File Location:** [`src/core/exportEngine.ts` (Lines 84–92, 105–118)](file:///d:/Hostiger_Deployment/WtoR/src/core/exportEngine.ts#L84-L118)
* **Root Cause:** `recorder.start(250)` receives timesliced chunks. If `stop()` is called quickly before the first 250 ms tick completes, `chunks` is empty, creating an invalid 0-byte video blob.

#### 3.3 Event Listener Leak in `probeDuration` Timeout
* **File Location:** [`src/core/exportEngine.ts` (Lines 208–227)](file:///d:/Hostiger_Deployment/WtoR/src/core/exportEngine.ts#L208-L227)
* **Root Cause:** When `timeoutMs` triggers, `finish(null)` revokes the blob URL, but fails to nullify or remove `video.onloadedmetadata` and `video.onerror`.

---

## 4. Rendering & Compositing: `src/core/layoutAgent.ts`

#### 4.1 Unbounded GPU/VRAM Leak in Layer Cache (`LayoutAgent.layers`)
* **File Location:** [`src/core/layoutAgent.ts` (Lines 131, 168–183)](file:///d:/Hostiger_Deployment/WtoR/src/core/layoutAgent.ts#L131-L183)
* **Root Cause:**
  ```typescript
  private static layers = new Map<string, HTMLCanvasElement | OffscreenCanvas>();
  // ...
  const fullKey = `${key}:${pw}x${ph}`;
  LayoutAgent.layers.set(fullKey, made);
  ```
* **Impact:** As the user resizes the browser window, toggles zoom factors, or adjusts output scales, new `OffscreenCanvas` instances are allocated and retained indefinitely in `layers`. There is no size limit, TTL, or LRU eviction policy, leading to continuous VRAM growth.

#### 4.2 Aspect Ratio Distortion for Non-16:9 Screen Captures
* **File Location:** [`src/core/layoutAgent.ts` (Lines 229, 271, 329)](file:///d:/Hostiger_Deployment/WtoR/src/core/layoutAgent.ts#L229-L329)
* **Root Cause:**
  ```typescript
  const targetW = canvasWidth - margin * 2;
  const targetH = (targetW * 9) / 16; // 16:9 ratio card
  ctx.drawImage(source, 0, 0, sourceWidth, sourceHeight, targetX, targetY, targetW, targetH);
  ```
* **Impact:** Card height is hardcoded to `(targetW * 9) / 16`. If a creator records an ultrawide monitor (21:9), vertical monitor (9:16), or 16:10 MacBook display, the video feed is forcefully stretched and squished into 16:9.

#### 4.3 Static Backdrop State Collision Across Concurrent Renderers
* **File Location:** [`src/core/layoutAgent.ts` (Lines 129–130, 206–213)](file:///d:/Hostiger_Deployment/WtoR/src/core/layoutAgent.ts#L129-L130)
* **Root Cause:** `LayoutAgent.backdropAt` and `LayoutAgent.backdrop` are static class members.
* **Impact:** If multiple instances (e.g. live studio preview canvas and export recording canvas) render concurrently, they mutate each other's timestamps and dimensions, leading to visual flickering and frame drops.

---

## 5. Template Management: `src/core/templateManager.ts`

#### 5.1 Global Mutable State Pollution via `getTemplate`
* **File Location:** [`src/core/templateManager.ts` (Line 78)](file:///d:/Hostiger_Deployment/WtoR/src/core/templateManager.ts#L78)
* **Root Cause:**
  ```typescript
  public static getTemplate(id: TemplateId): TemplateConfig {
    return TEMPLATES[id] || TEMPLATES.coding;
  }
  ```
* **Impact:** Returns a direct reference to the singleton template definition. Any component mutating a property (e.g. `template.defaultZoom = 1.6`) permanently modifies that template for all subsequent uses across the entire application session.

---

## 6. Prioritized Remediation Matrix

| Area | Issue Summary | Severity | Recommended Fix |
| :--- | :--- | :--- | :--- |
| **DSP** | `requestAnimationFrame` freezes noise gate in hidden tabs | 🚨 **Critical** | Drive analysis with a Web Worker timer (similar to `ExportEngine.startTicker`) or `AudioWorkletNode`. |
| **Audio** | Anonymous `MediaStream` GC cuts mic audio | 🚨 **Critical** | Store `MediaStream` instances on class properties (`this.inputStream = stream`). |
| **DSP** | `setTargetAtTime` called every frame | 🚨 **Critical** | Only schedule automation on state transitions (`isOpen !== wasOpen`), and cancel prior scheduled values. |
| **DSP** | Analyser tapped before fan notch & shelf filters | 🟡 **High** | Route the analyser tap after notch/shelf filters, or through a dedicated voice bandpass filter. |
| **DSP** | Small FFT (512) causes pitch flutter | 🟡 **High** | Increase FFT to 1024/2048 and apply exponential moving average (EMA) smoothing to the RMS dB calculation. |
| **DSP** | Missing dynamic mode switching | 🟠 **Medium** | Implement `public setMode(mode: NoiseSuppressionMode)` to update filter parameters in place. |
| **Canvas** | Unbounded `LayoutAgent.layers` cache growth | 🟠 **Medium** | Introduce LRU eviction (cap at 10 items) or explicit canvas disposal on layout changes. |
| **Canvas** | Hardcoded 16:9 card aspect ratio | 🟠 **Medium** | Calculate card dimensions based on `sourceWidth / sourceHeight` rather than hardcoding `9 / 16`. |
| **Export** | FFmpeg command string formatting | 🟠 **Medium** | Sanitize and quote input/output paths safely against shell escaping. |
| **Templates** | Mutable template reference leak | ⚪ **Minor** | Return a shallow/deep clone: `return { ...(TEMPLATES[id] || TEMPLATES.coding) }`. |
