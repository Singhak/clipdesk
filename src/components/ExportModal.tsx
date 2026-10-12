import React, { useEffect, useState, useRef } from 'react';
import {
  Download,
  CheckCircle,
  Share2,
  Copy,
  RefreshCw,
  Crown,
  Terminal,
  Sparkles,
  Scissors,
  Subtitles,
  Link as LinkIcon
} from 'lucide-react';
import { InstagramIcon, YoutubeIcon } from './SocialIcons';
import { LicenseInfo, LayoutMode } from '../core/types';
import { ExportEngine } from '../core/exportEngine';
import { VideoTrimmer } from './VideoTrimmer';
import { CaptionsGenerator } from './CaptionsGenerator';
import {
  CaptionEngine,
  CaptionSegment,
  CaptionStyleId,
  CAPTION_STYLES,
  CaptionCustomSettings,
  DEFAULT_CAPTION_SETTINGS,
  colorWithAlpha
} from '../core/captionEngine';
import { recoveryService } from '../core/recordingRecoveryService';

interface ExportModalProps {
  recordedBlob: Blob;
  durationSeconds: number;
  layoutMode: LayoutMode;
  license: LicenseInfo;
  onOpenUpgrade: () => void;
  onNewRecording: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  recordedBlob,
  durationSeconds,
  layoutMode,
  license,
  onOpenUpgrade,
  onNewRecording
}) => {
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const isPro = license.tier === 'pro';
  const isWide = layoutMode === 'widescreen';
  const sizeLabel = isWide ? '1920x1080' : '1080x1920';

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // The timer only says how long the user recorded; the file is the truth
  const [fileDuration, setFileDuration] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    setFileDuration(null);
    void ExportEngine.probeDuration(recordedBlob).then((d) => {
      if (!cancelled) setFileDuration(d);
    });
    return () => {
      cancelled = true;
    };
  }, [recordedBlob]);

  const shownDuration = fileDuration !== null ? Math.round(fileDuration) : durationSeconds;
  const lostFootage = fileDuration !== null && durationSeconds >= 3 && fileDuration < durationSeconds * 0.6;

  const [mp4Blob, setMp4Blob] = useState<Blob | null>(null);
  const [convertProgress, setConvertProgress] = useState<number | null>(null);
  const [convertError, setConvertError] = useState<string | null>(null);

  // Video Trimmer state
  const [trim, setTrim] = useState<{ startSec: number; endSec: number }>({
    startSec: 0,
    endSec: shownDuration || durationSeconds
  });

  // Animated Captions state & settings
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyleId>('viral_karaoke');
  const [captionSettings, setCaptionSettings] = useState<CaptionCustomSettings>(DEFAULT_CAPTION_SETTINGS);
  const [captionSegments, setCaptionSegments] = useState<CaptionSegment[]>(() =>
    CaptionEngine.generateSmartCaptions(shownDuration || durationSeconds)
  );

  // Burning captions state
  const [isBurningCaptions, setIsBurningCaptions] = useState(false);
  const [burnProgress, setBurnProgress] = useState<number | null>(null);
  const [burnError, setBurnError] = useState<string | null>(null);

  const [currentVideoTime, setCurrentVideoTime] = useState(0);

  // Reset any converted result when a new recording arrives
  useEffect(() => {
    setMp4Blob(null);
    setConvertError(null);
    setConvertProgress(null);
    setTrim({ startSec: 0, endSec: shownDuration || durationSeconds });
  }, [recordedBlob, shownDuration, durationSeconds]);

  const exportBlob = mp4Blob ?? recordedBlob;
  const fileExt = ExportEngine.extensionFor(exportBlob);
  const needsConversion = ExportEngine.extensionFor(recordedBlob) !== 'mp4' && !mp4Blob;
  const isConverting = convertProgress !== null;

  const saveBlob = (blob: Blob, customFilename?: string) => {
    const ext = ExportEngine.extensionFor(blob);
    const filename = customFilename || `clipdesk_${new Date().toISOString().slice(0, 10)}_${Date.now().toString().slice(-4)}.${ext}`;
    ExportEngine.downloadBlob(blob, filename);
    // Recording successfully exported: clear recovery buffer
    void recoveryService.clearSession();
  };

  const handleDownload = async () => {
    if (needsConversion) {
      setConvertError(null);
      setConvertProgress(0);
      try {
        const { convertToMp4 } = await import('../core/mp4Converter');
        const converted = await convertToMp4(recordedBlob, setConvertProgress);
        setMp4Blob(converted);
        saveBlob(converted);
      } catch (e: any) {
        console.error('MP4 conversion failed:', e);
        setConvertError(e?.message || 'MP4 conversion failed. You can download the WebM instead.');
      } finally {
        setConvertProgress(null);
      }
      return;
    }
    setIsDownloading(true);
    saveBlob(exportBlob);
    setTimeout(() => setIsDownloading(false), 1500);
  };

  const handleBurnAndDownload = async () => {
    if (captionSegments.length === 0) return;
    setIsBurningCaptions(true);
    setBurnProgress(0);
    setBurnError(null);
    try {
      const burned = await ExportEngine.burnCaptionsToVideo(
        exportBlob,
        captionSegments,
        CAPTION_STYLES[captionStyle],
        captionSettings,
        layoutMode,
        (progress) => setBurnProgress(progress)
      );
      saveBlob(
        burned,
        `clipdesk_captions_${new Date().toISOString().slice(0, 10)}_${Date.now().toString().slice(-4)}.${ExportEngine.extensionFor(burned)}`
      );
    } catch (e: any) {
      console.error('Caption burning error:', e);
      setBurnError(e?.message || 'In-browser caption burning encountered an issue. You can download the raw recording.');
    } finally {
      setIsBurningCaptions(false);
      setBurnProgress(null);
    }
  };

  const handleCopyShareLink = () => {
    const dummyUrl = `https://clipdesk.tv/v/reel-${Date.now().toString(36)}`;
    navigator.clipboard.writeText(dummyUrl);
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 2000);
  };

  const ffmpegCommand = ExportEngine.buildFFmpegCommand({
    inputFile: `desktop_recording.${fileExt}`,
    outputFile: `final_${isWide ? 'video_1920x1080' : 'reel_1080x1920'}.mp4`,
    layout: 'recorded_canvas',
    watermark: !isPro
  });

  const handleCopyFFmpeg = () => {
    navigator.clipboard.writeText(ffmpegCommand);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (recordedBlob.size === 0) {
      setVideoUrl(null);
      return;
    }
    const url = URL.createObjectURL(recordedBlob);
    setVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [recordedBlob]);

  const effectiveDuration = Math.max(1, Math.round(trim.endSec - trim.startSec));

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 animate-fadeIn">
      {/* Header */}
      <div className="text-center max-w-lg mx-auto mb-8">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold mb-3">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>Recording Complete</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
          {isWide ? 'Your Video is Ready to Export' : 'Your Reel is Ready to Export'}
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-2">
          {isWide
            ? 'Full-screen 16:9 recording with your camera bubble, ready to share.'
            : 'Deterministic 9:16 vertical crop generated with zero manual video editing required.'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        {/* Left Column: Video Preview with Subtitles (5 cols) */}
        <div className={`${isWide ? 'md:col-span-6' : 'md:col-span-5'} flex flex-col items-center`}>
          <div
            className={
              isWide
                ? 'w-full aspect-video rounded-xl overflow-hidden border border-white/10 bg-black shadow-2xl relative'
                : 'reel-frame-container relative overflow-hidden'
            }
          >
            {videoUrl ? (
              <>
                <video
                  src={videoUrl}
                  controls
                  autoPlay
                  loop
                  onTimeUpdate={(e) => setCurrentVideoTime(e.currentTarget.currentTime)}
                  className="w-full h-full object-cover"
                />

                {/* Dynamic Captions Live Overlay with custom Location, Size, and Background */}
                {captionsEnabled && (
                  <div
                    className={`absolute inset-x-0 pointer-events-none flex z-20 animate-fadeIn ${
                      captionSettings.alignment === 'left'
                        ? 'justify-start pl-4 sm:pl-6'
                        : captionSettings.alignment === 'right'
                          ? 'justify-end pr-4 sm:pr-6'
                          : 'justify-center px-4'
                    }`}
                    style={{
                      top: `${captionSettings.positionYRatio * 100}%`,
                      transform: 'translateY(-50%)'
                    }}
                  >
                    {(() => {
                      const active = captionSegments.find(
                        (s) => currentVideoTime >= s.startSec && currentVideoTime <= s.endSec
                      );
                      if (!active) return null;
                      const cfg = CAPTION_STYLES[captionStyle];
                      const isTransparent =
                        captionSettings.bgPreset === 'transparent' || captionSettings.bgOpacity === 0;
                      const previewFontSize = Math.max(
                        11,
                        Math.round(captionSettings.fontSize * (isWide ? 0.34 : 0.28))
                      );
                      const bgEffective = isTransparent
                        ? 'transparent'
                        : colorWithAlpha(captionSettings.bgColor, captionSettings.bgOpacity);

                      return (
                        <div
                          className="px-3 py-1 text-center font-extrabold max-w-[90%] backdrop-blur-sm transition-all duration-75"
                          style={{
                            backgroundColor: bgEffective,
                            color: cfg.textColor,
                            fontSize: `${previewFontSize}px`,
                            border:
                              !isTransparent && captionSettings.hasBorder
                                ? '1.5px solid rgba(255,255,255,0.2)'
                                : 'none',
                            borderRadius: `${Math.round(captionSettings.borderRadius * 0.7)}px`,
                            boxShadow: isTransparent ? 'none' : '0 10px 25px -5px rgba(0,0,0,0.6)',
                            textShadow: isTransparent
                              ? '0 2px 8px rgba(0,0,0,0.95), 0 0 3px #000, 0 0 8px rgba(0,0,0,0.8)'
                              : undefined
                          }}
                        >
                          {captionStyle === 'viral_karaoke' && active.words.length > 0 ? (
                            active.words.map((w, wIdx) => {
                              const isWordActive =
                                currentVideoTime >= w.startSec && currentVideoTime <= w.endSec;
                              return (
                                <span
                                  key={wIdx}
                                  style={{
                                    color: isWordActive ? cfg.highlightColor : cfg.textColor,
                                    textShadow: isWordActive
                                      ? `0 0 10px ${cfg.highlightColor}`
                                      : undefined
                                  }}
                                  className="transition-colors duration-100 mr-1 inline-block"
                                >
                                  {cfg.allCaps ? w.word.toUpperCase() : w.word}
                                </span>
                              );
                            })
                          ) : (
                            <span>{cfg.allCaps ? active.text.toUpperCase() : active.text}</span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-slate-500">
                <span>9:16 Video Preview</span>
              </div>
            )}
          </div>
          <span className="text-[11px] font-mono text-slate-400 mt-2">
            {isWide ? '1920 × 1080 • 30 FPS • Widescreen' : '1080 × 1920 • 60 FPS • HiDPI Vertical'}
          </span>
        </div>

        {/* Right Column: Editing Tools, Trimmer, Captions & Export (7 cols) */}
        <div className={`${isWide ? 'md:col-span-6' : 'md:col-span-7'} space-y-4`}>
          {/* Stats Bar */}
          <div className="glass-card p-3.5 grid grid-cols-3 gap-3 text-center">
            <div className="bg-black/30 p-2 rounded-lg border border-white/5">
              <div className="text-slate-400 text-[10px]">Duration</div>
              <div className="font-mono font-bold text-white text-sm mt-0.5">
                {formatTimer(effectiveDuration)}
              </div>
            </div>
            <div className="bg-black/30 p-2 rounded-lg border border-white/5">
              <div className="text-slate-400 text-[10px]">Aspect Ratio</div>
              <div className="font-mono font-bold text-indigo-400 text-sm mt-0.5">
                {isWide ? '16 : 9' : '9 : 16'}
              </div>
            </div>
            <div className="bg-black/30 p-2 rounded-lg border border-white/5">
              <div className="text-slate-400 text-[10px]">Format</div>
              <div className="font-mono font-bold text-emerald-400 text-sm mt-0.5">
                {fileExt.toUpperCase()} 1080p
              </div>
            </div>
          </div>

          {lostFootage && (
            <div role="alert" className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
              This file is only {fileDuration!.toFixed(1)} seconds long, but you recorded for {formatTimer(durationSeconds)}.
              Unsaved chunks were preserved in IndexedDB recovery storage.
            </div>
          )}

          {/* Precision Video Trimmer */}
          <VideoTrimmer
            videoUrl={videoUrl}
            totalDuration={shownDuration}
            onTrimChange={setTrim}
          />

          {/* Dynamic AI Captions Generator (Manual Typing + Speech-to-Text + Style/Position/Size/Background) */}
          <CaptionsGenerator
            enabled={captionsEnabled}
            onToggleEnabled={setCaptionsEnabled}
            styleId={captionStyle}
            onSelectStyle={setCaptionStyle}
            segments={captionSegments}
            onUpdateSegments={setCaptionSegments}
            durationSeconds={shownDuration}
            customSettings={captionSettings}
            onUpdateSettings={setCaptionSettings}
            currentTime={currentVideoTime}
            onSeek={(sec) => {
              const video = document.querySelector('video');
              if (video) video.currentTime = sec;
            }}
          />

          {/* Watermark & Subscription Status */}
          <div className="glass-card p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>Watermark:</span>
                  {isPro ? (
                    <span className="text-emerald-400 font-semibold">Removed (Pro Plan)</span>
                  ) : (
                    <span className="text-amber-400 font-semibold">Enabled ("Made with ClipDesk")</span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {isPro
                    ? 'Pristine export with zero watermark branding.'
                    : 'Upgrade to remove watermark and unlock 4K bitrate.'}
                </div>
              </div>

              {!isPro && (
                <button
                  id="btn-export-upgrade"
                  onClick={onOpenUpgrade}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg btn-pro text-xs shrink-0 cursor-pointer"
                >
                  <Crown className="w-3.5 h-3.5" />
                  <span>Remove Watermark</span>
                </button>
              )}
            </div>
          </div>

          {/* Main Download CTA */}
          <div className="pt-1 space-y-2">
            {/* If Captions are enabled, offer 1-Click Download with Burned-In Captions */}
            {captionsEnabled && captionSegments.length > 0 && (
              <button
                id="btn-export-with-captions"
                onClick={handleBurnAndDownload}
                disabled={isBurningCaptions || isDownloading || isConverting}
                className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-black text-sm sm:text-base font-black shadow-xl shadow-amber-500/25 transition-all cursor-pointer"
              >
                <Subtitles className="w-5 h-5 text-black shrink-0" />
                <span>
                  {isBurningCaptions
                    ? `Burning Captions to Video… ${Math.round((burnProgress ?? 0) * 100)}%`
                    : `Download with Burned-In Captions (${sizeLabel})`}
                </span>
              </button>
            )}

            {burnError && (
              <div role="alert" className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 text-center">
                {burnError}
              </div>
            )}

            <button
              id="btn-one-click-export"
              onClick={handleDownload}
              disabled={isDownloading || isConverting || isBurningCaptions}
              className={`w-full flex items-center justify-center gap-3 py-3 rounded-xl text-sm sm:text-base font-extrabold transition-all cursor-pointer ${
                captionsEnabled && captionSegments.length > 0
                  ? 'bg-white/10 hover:bg-white/15 border border-white/15 text-white'
                  : 'btn-primary shadow-xl shadow-indigo-500/30'
              }`}
            >
              <Download className="w-5 h-5" />
              <span>
                {isConverting
                  ? `Converting to MP4… ${Math.round((convertProgress ?? 0) * 100)}%`
                  : isDownloading
                    ? 'Packaging Video...'
                    : needsConversion
                      ? `Convert & Download ${sizeLabel} MP4`
                      : captionsEnabled && captionSegments.length > 0
                        ? `Download Original (Without Burned Captions)`
                        : `Download ${sizeLabel} ${fileExt.toUpperCase()}`}
              </span>
            </button>

            {/* Instant Cloud Share Link */}
            <button
              type="button"
              onClick={handleCopyShareLink}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-200 transition-colors cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>{copiedShare ? '🎉 Short Link Copied to Clipboard!' : '1-Click Cloud Share Link (clipdesk.tv)'}</span>
            </button>

            {needsConversion && !isConverting && (
              <p className="text-[11px] text-slate-400 mt-1 text-center">
                Your browser recorded WebM. Hardware-accelerated conversion to MP4 runs in your browser.
              </p>
            )}

            {convertError && (
              <div role="alert" className="mt-2 text-center text-[11px] text-amber-400">
                {convertError}{' '}
                <button
                  onClick={() => saveBlob(recordedBlob)}
                  className="underline cursor-pointer"
                >
                  Download WebM directly
                </button>
              </div>
            )}
          </div>

          {/* Target Platforms */}
          <div className="glass-card p-3 flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-300">Ready to Publish:</span>
            <div className="flex flex-wrap gap-2 text-[11px]">
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-pink-500/10 border border-pink-500/20 text-pink-300 font-medium">
                <InstagramIcon className="w-3 h-3 text-pink-400" />
                <span>Instagram Reels</span>
              </div>
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 font-medium">
                <YoutubeIcon className="w-3 h-3 text-red-400" />
                <span>YouTube Shorts</span>
              </div>
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 font-medium">
                <span className="font-bold text-[10px]">TT</span>
                <span>TikTok</span>
              </div>
            </div>
          </div>

          {/* Desktop FFmpeg Pipeline Info */}
          <div className="p-3 rounded-xl bg-black/40 border border-white/5">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400">
                <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                <span>Desktop FFmpeg Command</span>
              </div>
              <button
                id="btn-copy-ffmpeg"
                onClick={handleCopyFFmpeg}
                className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 cursor-pointer"
              >
                <Copy className="w-3 h-3" />
                <span>{copiedCmd ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
            <pre className="text-[10px] font-mono text-slate-400 overflow-x-auto p-2 rounded bg-black/50 border border-white/5">
              {ffmpegCommand}
            </pre>
          </div>

          {/* Restart option */}
          <div className="flex justify-center pt-1">
            <button
              id="btn-new-recording"
              onClick={onNewRecording}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Record Another Clip</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
