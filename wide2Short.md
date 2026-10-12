code-generation workflow, don't think of the app as "a screen recorder". Think of it as:

"A Vertical Content Workspace for Desktop Creators"

The agent should generate a complete product with zero editing required.

1. Product Vision

Name: ReelScreen / ScreenShorts / ClipDesk

Goal: Convert laptop activity into social-media-ready vertical content.

Target users:

SaaS founders
Developers
Teachers
Course creators
Digital marketers
2. No-Code User Journey
First Launch
Welcome Screen
-------------------------------------
 Turn Your Desktop Into Reels
-------------------------------------

[ Create New Recording ]

Templates

○ Product Demo
○ Coding Tutorial
○ Presentation
○ Browser Walkthrough
○ Custom

Continue →

Recording Setup
-------------------------------------
 Recording Setup
-------------------------------------

Recording Source

○ Full Screen
○ Specific Window
○ Custom Region

Output Format

☑ Instagram Reel
☑ YouTube Short
☑ TikTok

Resolution

☑ 1080x1920

Enhancement Options

No AI Version

------------------------------------
 Smart Features
------------------------------------

☑ Follow Mouse
☑ Zoom on Click
☑ Cursor Highlight
☑ Blur Side Areas
☑ Smooth Camera Movement

[ Start Recording ]


No AI involved.

Only deterministic rules.

Recording Screen

Split view

 ------------------------------------------------
| Desktop Recording                              |
|                                                 |
|                                                 |
 ------------------------------------------------

             Live Vertical Preview

          ----------------
          |              |
          | Reels View   |
          |              |
          ----------------

[ Pause ]
[ Stop ]


This preview is your biggest differentiator.

Users instantly know what the final reel looks like.

Export Screen
 Recording Complete

 Duration : 02:10

 Export Format

 ☑ Reel
 ☑ Short
 ☑ TikTok

 [Export]


One-click export.

3. Agentic Specification

Instead of coding manually, define an autonomous product-building agent.

Agent Architecture
Agent 1: Recording Agent

Responsibility:

Capture Screen
Capture Audio
Capture Mouse Events
Capture Keyboard Events


Output:

{
  "video": "raw.mp4",
  "mouse": [],
  "clicks": [],
  "windows": []
}

Agent 2: Camera Agent

Responsibility:

Generate virtual camera movement.

Input

{
  "screenWidth": 1920,
  "screenHeight": 1080,
  "cursor": {
    "x": 900,
    "y": 300
  }
}


Output

{
  "cropX": 600,
  "cropY": 0,
  "zoom": 1.3
}


Rules:

Keep cursor near center
Do not move abruptly
Add easing transition
Agent 3: Zoom Agent

Responsibility

Detect:

{
 "event":"click"
}


Apply:

{
 "zoom":1.5,
 "duration":1000
}


Timeline generated automatically.

Agent 4: Layout Agent

Converts:

16:9


to

9:16


Options:

Mode A

Fit Width

Mode B

Blur Background

Mode C

Gradient Fill

Mode D

Brand Background

Example:

+-----------+
| Blur      |
| Recording |
| Blur      |
+-----------+

Agent 5: Export Agent

Builds final FFmpeg pipeline.

Input

{
  "template":"coding",
  "resolution":"1080x1920"
}


Output

ffmpeg ...


Produces:

reel.mp4

MVP User Stories
Story 1

As a developer

I want to record VS Code

So I can create a YouTube Short.

Story 2

As a SaaS founder

I want to record product walkthrough

So I can publish Instagram reels.

Story 3

As a teacher

I want cursor tracking

So students can clearly follow.

System Architecture
React/Tauri Desktop App
        |
        |
        ▼
 Recording Engine
        |
        ▼
 Event Tracker
(Mouse + Window)
        |
        ▼
 Timeline Generator
        |
        ▼
 Crop & Zoom Engine
        |
        ▼
 FFmpeg Renderer
        |
        ▼
 MP4 Export

Agentic Coding Prompt (for Cursor/Windsurf/Cline)
Build a cross-platform desktop application using Tauri + React.

Requirements:

1. Record screen audio and microphone.
2. Support full screen, window, and region capture.
3. Show live vertical preview (9:16).
4. Track mouse position at 60 FPS.
5. Automatically keep cursor in visible area.
6. Create smooth camera movement based on cursor.
7. Add click zoom animation.
8. Add cursor highlight effect.
9. Export 1080x1920 MP4 using FFmpeg.
10. Support templates:
   - Coding
   - Product Demo
   - Presentation
11. Build modular architecture:

Modules:
- RecordingService
- CursorTracker
- CropEngine
- ZoomEngine
- ExportEngine
- TemplateManager

Use React for UI and Tauri for native performance.

Provide complete folder structure, implementation plan, data models, and production-ready code.


Do not make AI mandatory.

Launch v1 as:

"OBS for Reels"

Users can record once and instantly get a vertical video. Then add AI later as a premium upgrade. This dramatically reduces complexity and lets you ship a usable MVP in 2-4 weeks.