import React, { useEffect, useState } from 'react';
import {
  Download,
  CheckCircle,
  Share2,
  Copy,
  RefreshCw,
  Crown,
  Terminal
} from 'lucide-react';
import { InstagramIcon, YoutubeIcon } from './SocialIcons';
import { LicenseInfo, LayoutMode } from '../core/types';
import { ExportEngine } from '../core/exportEngine';

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
  const [isDownloading, setIsDownloading] = useState(false);

  const isPro = license.tier === 'pro';
  const isWide = layoutMode === 'widescreen';
  const sizeLabel = isWide ? '1920x1080' : '1080x1920';

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // The timer only says how long the user recorded; the file is the truth (a stalled recorder writes far less)
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

  // Reset any converted result when a new recording arrives
  useEffect(() => {
    setMp4Blob(null);
    setConvertError(null);
    setConvertProgress(null);
  }, [recordedBlob]);

  const exportBlob = mp4Blob ?? recordedBlob;
  const fileExt = ExportEngine.extensionFor(exportBlob);
  const needsConversion = ExportEngine.extensionFor(recordedBlob) !== 'mp4' && !mp4Blob;
  const isConverting = convertProgress !== null;

  const saveBlob = (blob: Blob) => {
    const ext = ExportEngine.extensionFor(blob);
    const filename = `clipdesk_${new Date().toISOString().slice(0, 10)}_${Date.now().toString().slice(-4)}.${ext}`;
    ExportEngine.downloadBlob(blob, filename);
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
      } catch (e) {
        console.error('MP4 conversion failed:', e);
        setConvertError('MP4 conversion failed. You can download the WebM instead.');
      } finally {
        setConvertProgress(null);
      }
      return;
    }
    setIsDownloading(true);
    saveBlob(exportBlob);
    setTimeout(() => setIsDownloading(false), 1500);
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

  // Created and revoked inside one effect so React StrictMode's mount/unmount/mount cycle is safe
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

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 animate-fadeIn">
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
          {isWide ? 'Full-screen 16:9 recording with your camera bubble, ready to share.' : 'Deterministic 9:16 vertical crop generated with zero manual video editing required.'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        {/* Left: Video Preview (5 cols) */}
        <div className={`${isWide ? 'md:col-span-7' : 'md:col-span-5'} flex flex-col items-center`}>
          <div className={isWide ? 'w-full aspect-video rounded-xl overflow-hidden border border-white/10 bg-black shadow-2xl' : 'reel-frame-container'}>
            {videoUrl ? (
              <video
                src={videoUrl}
                controls
                autoPlay
                loop
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-slate-500">
                <span>9:16 Video Preview</span>
              </div>
            )}
          </div>
          <span className="text-[11px] font-mono text-slate-400 mt-2">{isWide ? '1920 × 1080 • 30 FPS • Widescreen' : '1080 × 1920 • 60 FPS • Vertical'}</span>
        </div>

        {/* Right: Export Options & One-Click Download (7 cols) */}
        <div className={`${isWide ? 'md:col-span-5' : 'md:col-span-7'} space-y-5`}>
          {/* Stats Bar */}
          <div className="glass-card p-4 grid grid-cols-3 gap-3 text-center">
            <div className="bg-black/30 p-2.5 rounded-lg border border-white/5">
              <div className="text-slate-400 text-[10px]">Duration</div>
              <div className="font-mono font-bold text-white text-base mt-0.5">{formatTimer(shownDuration)}</div>
            </div>
            <div className="bg-black/30 p-2.5 rounded-lg border border-white/5">
              <div className="text-slate-400 text-[10px]">Aspect Ratio</div>
              <div className="font-mono font-bold text-indigo-400 text-base mt-0.5">{isWide ? '16 : 9' : '9 : 16'}</div>
            </div>
            <div className="bg-black/30 p-2.5 rounded-lg border border-white/5">
              <div className="text-slate-400 text-[10px]">Resolution</div>
              <div className="font-mono font-bold text-emerald-400 text-base mt-0.5">1080p HD</div>
            </div>
          </div>

          {lostFootage && (
            <div role="alert" className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
              This file is only {fileDuration!.toFixed(1)} seconds long, but you recorded for {formatTimer(durationSeconds)}, so part of
              the recording was lost. Keep this tab open while recording, or use the ClipDesk Chrome extension, which keeps recording
              while you work in other windows.
            </div>
          )}

          {/* Target Platforms */}
          <div className="glass-card p-4">
            <div className="text-xs font-bold text-white mb-2.5">Export Targets</div>
            <div className="flex flex-wrap gap-2 text-xs">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pink-500/10 border border-pink-500/20 text-pink-300 font-medium">
                <InstagramIcon className="w-3.5 h-3.5 text-pink-400" />
                <span>Instagram Reel</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 font-medium">
                <YoutubeIcon className="w-3.5 h-3.5 text-red-400" />
                <span>YouTube Short</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 font-medium">
                <span className="font-bold text-xs">TT</span>
                <span>TikTok</span>
              </div>
            </div>
          </div>

          {/* Watermark & Subscription Status */}
          <div className="glass-card p-4">
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
                    ? 'Your export has clean edges with zero branding.'
                    : 'Upgrade to remove watermark and unlock 4K encoding.'}
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
          <div className="pt-2">
            <button
              id="btn-one-click-export"
              onClick={handleDownload}
              disabled={isDownloading || isConverting}
              className="w-full flex items-center justify-center gap-3 py-4 rounded-xl btn-primary text-base font-extrabold shadow-xl shadow-indigo-500/30 cursor-pointer"
            >
              <Download className="w-5 h-5" />
              <span>
                {isConverting
                  ? `Converting to MP4… ${Math.round((convertProgress ?? 0) * 100)}%`
                  : isDownloading
                    ? 'Packaging Video...'
                    : needsConversion
                      ? `Convert & Download ${sizeLabel} MP4`
                      : `Download ${sizeLabel} ${fileExt.toUpperCase()}`}
              </span>
            </button>
            {needsConversion && !isConverting && (
              <p className="text-[11px] text-slate-400 mt-2 text-center">
                Your browser records WebM. Conversion to MP4 runs on your device (first use downloads ~30 MB).
              </p>
            )}
            {convertError && (
              <div role="alert" className="mt-2 text-center text-[11px] text-amber-400">
                {convertError}{' '}
                <button
                  onClick={() => saveBlob(recordedBlob)}
                  className="underline cursor-pointer"
                >
                  Download WebM
                </button>
              </div>
            )}
          </div>

          {/* Desktop FFmpeg Pipeline Info */}
          <div className="p-3.5 rounded-xl bg-black/40 border border-white/5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400">
                <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                <span>Desktop FFmpeg Pipeline Command</span>
              </div>
              <button
                id="btn-copy-ffmpeg"
                onClick={handleCopyFFmpeg}
                className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 cursor-pointer"
              >
                <Copy className="w-3 h-3" />
                <span>{copiedCmd ? 'Copied!' : 'Copy Command'}</span>
              </button>
            </div>
            <pre className="text-[10px] font-mono text-slate-400 overflow-x-auto p-2 rounded bg-black/50 border border-white/5">
              {ffmpegCommand}
            </pre>
          </div>

          {/* Restart option */}
          <div className="flex justify-center pt-2">
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
