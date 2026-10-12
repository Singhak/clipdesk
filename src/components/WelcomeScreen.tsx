import React from 'react';
import {
  Code,
  Sparkles,
  Presentation,
  Globe,
  Sliders,
  ArrowRight,
  Video,
  Zap,
  CheckCircle2,
  MousePointer2,
  Layers,
  ZoomIn,
  ShieldCheck,
  Check
} from 'lucide-react';
import { TemplateId } from '../core/types';
import { TEMPLATES } from '../core/templateManager';

interface WelcomeScreenProps {
  selectedTemplate: TemplateId;
  onSelectTemplate: (id: TemplateId) => void;
  onContinue: () => void;
  onQuickStart: () => void;
  isPro?: boolean;
  onOpenUpgrade?: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  selectedTemplate,
  onSelectTemplate,
  onContinue,
  onQuickStart,
  isPro = false,
  onOpenUpgrade
}) => {
  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8 sm:py-12 animate-fadeIn">
      {/* Hero Section */}
      <div className="relative text-center max-w-3xl mx-auto mb-14">
        {/* Ambient Diffuse Glow Spotlight */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[300px] bg-gradient-to-tr from-indigo-600/20 via-purple-600/15 to-pink-600/10 rounded-full blur-3xl pointer-events-none -z-10" />

        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10 text-indigo-300 text-xs font-semibold mb-5 shadow-inner backdrop-blur-md">
          <Zap className="w-3.5 h-3.5 text-indigo-400 fill-indigo-400" />
          <span>"OBS for Reels" • Zero Editing Required • Studio Presets</span>
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-6xl font-black text-white tracking-tight leading-[1.12] mb-5">
          Turn Desktop Activity Into{' '}
          <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Studio-Grade Reels
          </span>
        </h1>

        {/* Subtitle */}
        <p className="text-base sm:text-lg text-slate-300 leading-relaxed max-w-2xl mx-auto mb-8">
          Record your desktop normally. ClipDesk dynamically pans, centers your cursor at 60 FPS, and crops into viral 9:16 vertical shorts for Instagram, TikTok, and YouTube.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-4">
          <button
            id="btn-welcome-quick-start"
            onClick={onQuickStart}
            className="flex items-center gap-2.5 px-7 py-4 rounded-2xl btn-primary text-sm font-extrabold shadow-xl shadow-indigo-500/30 cursor-pointer"
          >
            <Video className="w-4 h-4 fill-white" />
            <span>Start Recording Studio</span>
          </button>
          <button
            id="btn-welcome-continue"
            onClick={onContinue}
            className="flex items-center gap-2 px-7 py-4 rounded-2xl btn-secondary text-sm font-bold cursor-pointer"
          >
            <span>Configure Setup</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Platform Ecosystem Banner */}
        <div className="mt-8 p-3.5 rounded-2xl bg-black/40 border border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>
              <strong>Web Studio Active:</strong> For OS-wide mouse tracking across native apps (VS Code, terminal, etc.), install the{' '}
              <a
                href="https://github.com/singhak/clipdesk/releases"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 font-bold hover:underline"
              >
                Desktop App
              </a>{' '}
              or{' '}
              <a
                href="https://chrome.google.com/webstore"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 font-bold hover:underline"
              >
                Chrome Extension
              </a>
              .
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href="https://github.com/singhak/clipdesk/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] font-semibold text-white border border-white/10 transition-colors"
            >
              Get Desktop App
            </a>
          </div>
        </div>
      </div>

      {/* Templates Section */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-extrabold text-white flex items-center gap-2.5">
              <span>Choose Recording Template</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Curated camera dynamics, click-zoom sensitivity, and backdrop framing
            </p>
          </div>
          <span className="text-xs font-mono text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-lg border border-indigo-500/20">
            5 Presets Available
          </span>
        </div>

        {/* Template Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* Card 1: Coding Tutorial */}
          <div
            id="template-card-coding"
            onClick={() => onSelectTemplate('coding')}
            className={`group cursor-pointer p-6 rounded-2xl transition-all flex flex-col justify-between ${
              selectedTemplate === 'coding' ? 'studio-card-selected' : 'studio-card'
            }`}
          >
            <div>
              {/* Preset Visual Header (VS Code Mockup) */}
              <div className="h-24 w-full rounded-xl bg-[#090c15] border border-white/10 p-3 mb-5 overflow-hidden relative shadow-inner">
                {/* Editor Dots */}
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-[10px] text-slate-500 font-mono ml-2">code.ts (Dynamic Crop)</span>
                </div>
                {/* Simulated code syntax */}
                <div className="space-y-1 text-[9px] font-mono opacity-80">
                  <div className="text-purple-400">const reel = create916Crop();</div>
                  <div className="text-indigo-400 flex items-center gap-1">
                    <span>camera.trackCursor(60fps);</span>
                    <span className="w-1.5 h-3 bg-indigo-400 animate-pulse" />
                  </div>
                  <div className="text-slate-500">// Auto-centers code typing line</div>
                </div>
                {/* 9:16 vertical crop guide box */}
                <div className="absolute right-3 top-2 bottom-2 w-10 border-2 border-dashed border-indigo-400/60 rounded-md bg-indigo-500/10 flex items-center justify-center">
                  <span className="text-[8px] font-mono text-indigo-300 font-bold">9:16</span>
                </div>
              </div>

              {/* Header Title & Icon */}
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white transition-all">
                    <Code className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white group-hover:text-indigo-300 transition-colors">
                      Coding Tutorial
                    </h3>
                    <p className="text-xs text-indigo-400 font-medium">Deep zoom on active code & terminal</p>
                  </div>
                </div>

                {selectedTemplate === 'coding' && (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-indigo-300 bg-indigo-500/20 px-2 py-0.5 rounded-full border border-indigo-500/40">
                    <Check className="w-3 h-3 text-indigo-400" />
                    Selected
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-400 leading-relaxed mb-5 mt-2">
                Best for VS Code, terminal recordings, and GitHub walkthroughs. Smoothly centers the active typing line.
              </p>
            </div>

            {/* Badges Footer */}
            <div className="pt-3.5 border-t border-white/5 flex flex-wrap gap-2 text-[10px] font-mono text-slate-400">
              <span className="bg-black/50 px-2 py-1 rounded-md border border-white/5 text-indigo-300">
                Zoom: 1.35x
              </span>
              <span className="bg-black/50 px-2 py-1 rounded-md border border-white/5 text-amber-300">
                Click: 1.55x
              </span>
              <span className="bg-black/50 px-2 py-1 rounded-md border border-white/5">
                Dynamic Full Crop
              </span>
            </div>
          </div>

          {/* Card 2: Product Demo */}
          <div
            id="template-card-product_demo"
            onClick={() => onSelectTemplate('product_demo')}
            className={`group cursor-pointer p-6 rounded-2xl transition-all flex flex-col justify-between ${
              selectedTemplate === 'product_demo' ? 'studio-card-selected' : 'studio-card'
            }`}
          >
            <div>
              {/* Preset Visual Header (Ambient Blur Mockup) */}
              <div className="h-24 w-full rounded-xl bg-gradient-to-tr from-purple-900/40 via-indigo-950/50 to-pink-900/30 border border-white/10 p-3 mb-5 overflow-hidden relative shadow-inner flex items-center justify-center">
                {/* Blurred backdrop ambient lines */}
                <div className="absolute inset-0 bg-indigo-500/10 backdrop-blur-md" />
                {/* Centered crisp product card */}
                <div className="relative z-10 w-28 h-14 rounded-lg bg-[#0e1220] border border-white/20 shadow-xl p-2 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="w-10 h-1.5 bg-indigo-400 rounded-full" />
                    <span className="w-3 h-3 rounded-full bg-pink-500/80 animate-ping" />
                  </div>
                  <span className="w-16 h-1.5 bg-slate-600 rounded-full" />
                  <span className="w-12 h-1 bg-slate-700 rounded-full" />
                </div>
              </div>

              {/* Header Title & Icon */}
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-400 group-hover:bg-pink-500 group-hover:text-white transition-all">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white group-hover:text-pink-300 transition-colors">
                      Product Demo
                    </h3>
                    <p className="text-xs text-pink-400 font-medium">Ambient blur with click pulse halos</p>
                  </div>
                </div>

                {selectedTemplate === 'product_demo' && (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-indigo-300 bg-indigo-500/20 px-2 py-0.5 rounded-full border border-indigo-500/40">
                    <Check className="w-3 h-3 text-indigo-400" />
                    Selected
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-400 leading-relaxed mb-5 mt-2">
                Perfect for SaaS founders and marketers. Centers product UI with elegant blurred backdrops and click rings.
              </p>
            </div>

            {/* Badges Footer */}
            <div className="pt-3.5 border-t border-white/5 flex flex-wrap gap-2 text-[10px] font-mono text-slate-400">
              <span className="bg-black/50 px-2 py-1 rounded-md border border-white/5 text-pink-300">
                Zoom: 1.15x
              </span>
              <span className="bg-black/50 px-2 py-1 rounded-md border border-white/5 text-amber-300">
                Click: 1.40x
              </span>
              <span className="bg-black/50 px-2 py-1 rounded-md border border-white/5">
                Blur Backdrop
              </span>
            </div>
          </div>

          {/* Card 3: Keynote & Slides */}
          <div
            id="template-card-presentation"
            onClick={() => onSelectTemplate('presentation')}
            className={`group cursor-pointer p-6 rounded-2xl transition-all flex flex-col justify-between ${
              selectedTemplate === 'presentation' ? 'studio-card-selected' : 'studio-card'
            }`}
          >
            <div>
              {/* Preset Visual Header (Gradient Mesh Mockup) */}
              <div className="h-24 w-full rounded-xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-white/10 p-3 mb-5 overflow-hidden relative shadow-inner flex items-center justify-center">
                {/* Glowing border slide */}
                <div className="w-36 h-16 rounded-lg bg-[#0d101d] border border-cyan-500/40 shadow-lg p-2.5 flex flex-col justify-between">
                  <div className="text-[9px] font-bold text-cyan-300">Q3 Product Keynote</div>
                  <div className="flex gap-1.5 items-end h-5">
                    <span className="w-4 h-2 bg-indigo-500 rounded-sm" />
                    <span className="w-4 h-3.5 bg-cyan-400 rounded-sm" />
                    <span className="w-4 h-5 bg-pink-500 rounded-sm" />
                  </div>
                </div>
              </div>

              {/* Header Title & Icon */}
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 group-hover:bg-cyan-500 group-hover:text-white transition-all">
                    <Presentation className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white group-hover:text-cyan-300 transition-colors">
                      Keynote & Slides
                    </h3>
                    <p className="text-xs text-cyan-400 font-medium">Gentle cinematic pan across slides</p>
                  </div>
                </div>

                {selectedTemplate === 'presentation' && (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-indigo-300 bg-indigo-500/20 px-2 py-0.5 rounded-full border border-indigo-500/40">
                    <Check className="w-3 h-3 text-indigo-400" />
                    Selected
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-400 leading-relaxed mb-5 mt-2">
                Tailored for Pitch Decks, Canva slides, and Keynotes. Balanced framing with cinematic gentle damping.
              </p>
            </div>

            {/* Badges Footer */}
            <div className="pt-3.5 border-t border-white/5 flex flex-wrap gap-2 text-[10px] font-mono text-slate-400">
              <span className="bg-black/50 px-2 py-1 rounded-md border border-white/5 text-cyan-300">
                Zoom: 1.00x
              </span>
              <span className="bg-black/50 px-2 py-1 rounded-md border border-white/5 text-amber-300">
                Click: 1.25x
              </span>
              <span className="bg-black/50 px-2 py-1 rounded-md border border-white/5">
                Gradient Mesh
              </span>
            </div>
          </div>

          {/* Card 4: Browser Walkthrough */}
          <div
            id="template-card-browser"
            onClick={() => onSelectTemplate('browser')}
            className={`group cursor-pointer p-6 rounded-2xl transition-all flex flex-col justify-between ${
              selectedTemplate === 'browser' ? 'studio-card-selected' : 'studio-card'
            }`}
          >
            <div>
              {/* Preset Visual Header (Web Browser Mockup) */}
              <div className="h-24 w-full rounded-xl bg-[#0a0d16] border border-white/10 p-2.5 mb-5 overflow-hidden relative shadow-inner">
                {/* Address bar */}
                <div className="h-5 rounded-md bg-white/5 border border-white/5 flex items-center px-2 gap-1.5 mb-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-[9px] text-slate-400 font-mono">https://yourapp.io/dashboard</span>
                </div>
                {/* Content mockup */}
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="h-9 rounded bg-white/[0.03] border border-white/5 p-1">
                    <span className="w-8 h-1 bg-indigo-400 block rounded mb-1" />
                    <span className="w-12 h-1 bg-slate-600 block rounded" />
                  </div>
                  <div className="h-9 rounded bg-white/[0.03] border border-white/5 p-1">
                    <span className="w-6 h-1 bg-emerald-400 block rounded mb-1" />
                    <span className="w-10 h-1 bg-slate-600 block rounded" />
                  </div>
                </div>
              </div>

              {/* Header Title & Icon */}
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-all">
                    <Globe className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white group-hover:text-blue-300 transition-colors">
                      Browser Walkthrough
                    </h3>
                    <p className="text-xs text-blue-400 font-medium">Fluid tracking over web pages & tabs</p>
                  </div>
                </div>

                {selectedTemplate === 'browser' && (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-indigo-300 bg-indigo-500/20 px-2 py-0.5 rounded-full border border-indigo-500/40">
                    <Check className="w-3 h-3 text-indigo-400" />
                    Selected
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-400 leading-relaxed mb-5 mt-2">
                Follows page scrolls, link clicks, and web dashboards with natural camera transitions.
              </p>
            </div>

            {/* Badges Footer */}
            <div className="pt-3.5 border-t border-white/5 flex flex-wrap gap-2 text-[10px] font-mono text-slate-400">
              <span className="bg-black/50 px-2 py-1 rounded-md border border-white/5 text-blue-300">
                Zoom: 1.25x
              </span>
              <span className="bg-black/50 px-2 py-1 rounded-md border border-white/5 text-amber-300">
                Click: 1.45x
              </span>
              <span className="bg-black/50 px-2 py-1 rounded-md border border-white/5">
                Blur Backdrop
              </span>
            </div>
          </div>

          {/* Card 5: Custom Studio */}
          <div
            id="template-card-custom"
            onClick={() => {
              if (!isPro && onOpenUpgrade) {
                onOpenUpgrade();
              } else {
                onSelectTemplate('custom');
              }
            }}
            className={`group cursor-pointer p-6 rounded-2xl transition-all flex flex-col justify-between ${
              selectedTemplate === 'custom' ? 'studio-card-selected' : 'studio-card'
            }`}
          >
            <div>
              {/* Preset Visual Header (Sliders Studio Mockup) */}
              <div className="h-24 w-full rounded-xl bg-[#090b14] border border-white/10 p-3 mb-5 overflow-hidden relative shadow-inner flex flex-col justify-center gap-2">
                <div className="flex items-center justify-between text-[9px] font-mono text-slate-400">
                  <span>Spring Damping: 0.14</span>
                  <span className="text-amber-400 font-bold">PRO</span>
                </div>
                <div className="w-full h-1.5 bg-black/60 rounded-full overflow-hidden">
                  <div className="w-3/4 h-full bg-gradient-to-r from-amber-500 to-indigo-500 rounded-full" />
                </div>
                <div className="w-full h-1.5 bg-black/60 rounded-full overflow-hidden">
                  <div className="w-1/2 h-full bg-gradient-to-r from-indigo-500 to-pink-500 rounded-full" />
                </div>
              </div>

              {/* Header Title & Icon */}
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 group-hover:bg-amber-500 group-hover:text-black transition-all">
                    <Sliders className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-white group-hover:text-amber-300 transition-colors">
                        Custom Studio
                      </h3>
                      <span className="badge-pro">PRO</span>
                    </div>
                    <p className="text-xs text-amber-400 font-medium">Customizable crop & spring dynamics</p>
                  </div>
                </div>

                {selectedTemplate === 'custom' ? (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-indigo-300 bg-indigo-500/20 px-2 py-0.5 rounded-full border border-indigo-500/40">
                    <Check className="w-3 h-3 text-indigo-400" />
                    Selected
                  </span>
                ) : !isPro ? (
                  <span className="text-[10px] font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                    Unlock with Pro
                  </span>
                ) : null}
              </div>

              <p className="text-xs text-slate-400 leading-relaxed mb-5 mt-2">
                Fine-tune camera spring physics, layout backdrops, and zoom thresholds to your exact taste.
              </p>
            </div>

            {/* Badges Footer */}
            <div className="pt-3.5 border-t border-white/5 flex flex-wrap gap-2 text-[10px] font-mono text-slate-400">
              <span className="bg-black/50 px-2 py-1 rounded-md border border-white/5 text-amber-300">
                Custom Zoom
              </span>
              <span className="bg-black/50 px-2 py-1 rounded-md border border-white/5 text-amber-300">
                Custom Lerp
              </span>
              <span className="bg-black/50 px-2 py-1 rounded-md border border-white/5">
                Multi-Layout
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-between gap-4 p-5 rounded-2xl bg-[#0c0f18]/90 border border-white/10 backdrop-blur-xl shadow-xl">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
            <div>
              <div className="text-xs font-bold text-white">
                Selected: <span className="text-indigo-400">{TEMPLATES[selectedTemplate].name}</span>
              </div>
              <div className="text-[11px] text-slate-400">
                Ready to configure inputs or jump directly to the live recording studio.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              id="btn-welcome-bottom-quick"
              onClick={onQuickStart}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl btn-primary text-xs font-bold cursor-pointer"
            >
              <Video className="w-4 h-4 fill-white" />
              <span>Start Recording</span>
            </button>
            <button
              id="btn-welcome-next-step"
              onClick={onContinue}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl btn-secondary text-xs font-bold cursor-pointer"
            >
              <span>Setup Options</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
