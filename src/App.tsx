import React, { useState, useEffect } from 'react';
import { TopNav } from './components/TopNav';
import { WelcomeScreen } from './components/WelcomeScreen';
import { RecordingSetup } from './components/RecordingSetup';
import { LiveStudio } from './components/LiveStudio';
import { ExportModal } from './components/ExportModal';
import { UpgradeModal } from './components/UpgradeModal';
import { RecordingService } from './core/recordingService';
import { LicenseService } from './licensing/licenseService';
import { TEMPLATES } from './core/templateManager';
import { recoveryService, SessionMetadata } from './core/recordingRecoveryService';
import {
  TemplateId,
  RecordingSource,
  SmartFeatures,
  AudioConfig,
  LayoutMode,
  LicenseInfo,
  WebcamConfig
} from './core/types';
import { CaptionSegment } from './core/captionEngine';

export const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<'welcome' | 'setup' | 'studio' | 'export'>('welcome');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>('coding');
  const [source, setSource] = useState<RecordingSource>('screen');
  const [cameraOnly, setCameraOnly] = useState(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('dynamic_crop');

  const [smartFeatures, setSmartFeatures] = useState<SmartFeatures>({
    followMouse: true,
    zoomOnClick: true,
    cursorHighlight: true,
    blurSideAreas: true,
    smoothCameraDamping: true
  });

  const [audioConfig, setAudioConfig] = useState<AudioConfig>({
    recordMic: true,
    recordSystemAudio: true,
    noiseCancellation: 'studio'
  });

  const [webcamConfig, setWebcamConfig] = useState<WebcamConfig>({
    enabled: true,
    size: 'medium',
    position: { x: 0.82, y: 0.85 },
    presetPosition: 'bottom_right',
    mirror: true
  });

  const [license, setLicense] = useState<LicenseInfo>(LicenseService.getLicense());
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);

  // Recording state
  const [recordingService] = useState(() => new RecordingService());
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null);
  const [activeAudioStream, setActiveAudioStream] = useState<MediaStream | null>(null);
  const [activeWebcamStream, setActiveWebcamStream] = useState<MediaStream | null>(null);
  const [isSimulatedStream, setIsSimulatedStream] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [captureWarnings, setCaptureWarnings] = useState<string[]>([]);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedDuration, setRecordedDuration] = useState(0);
  const [recordedCaptions, setRecordedCaptions] = useState<CaptionSegment[]>([]);

  // Crash recovery state
  const [recoverableSession, setRecoverableSession] = useState<{ metadata: SessionMetadata; blob: Blob } | null>(null);

  // Inspect IndexedDB for recoverable sessions on page mount
  useEffect(() => {
    let cancelled = false;
    void recoveryService.getRecoverableSession().then((session) => {
      if (!cancelled && session && session.blob.size > 0) {
        setRecoverableSession(session);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Protect against accidental tab close, reload, or back navigation during recording takes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (currentStep === 'studio' || (currentStep === 'export' && recordedBlob)) {
        e.preventDefault();
        e.returnValue = 'You have an active or unsaved recording session. Are you sure you want to exit?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [currentStep, recordedBlob]);

  // Sync with License changes
  useEffect(() => {
    const unsubscribe = LicenseService.subscribe((newLicense) => {
      setLicense(newLicense);
    });
    return unsubscribe;
  }, []);

  // Update layout default when template changes
  const handleSelectTemplate = (templateId: TemplateId) => {
    const tmpl = TEMPLATES[templateId];
    if (tmpl?.proOnly && license.tier !== 'pro') {
      setIsUpgradeModalOpen(true);
      return;
    }
    setSelectedTemplate(templateId);
    if (tmpl) {
      // A widescreen choice is kept; vertical defaults to the focus crop so the reel shows what you picked
      setLayoutMode((current) => (current === 'widescreen' ? current : 'dynamic_crop'));
      setSmartFeatures((prev) => ({
        ...prev,
        cursorHighlight: tmpl.showCursorHalo
      }));
    }
  };

  const handleSelectFormat = (format: 'widescreen' | 'vertical') => {
    setLayoutMode(format === 'widescreen' ? 'widescreen' : 'dynamic_crop');
  };

  const handleToggleFeature = (key: keyof SmartFeatures) => {
    setSmartFeatures((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleToggleAudio = (key: keyof AudioConfig) => {
    setAudioConfig((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleToggleWebcam = async () => {
    if (webcamConfig.enabled) {
      setWebcamConfig((prev) => ({ ...prev, enabled: false }));
    } else {
      setWebcamConfig((prev) => ({ ...prev, enabled: true }));
      if (!activeWebcamStream && currentStep === 'studio') {
        try {
          const { stream: camStream } = await recordingService.startWebcamCapture(undefined, isSimulatedStream);
          setActiveWebcamStream(camStream);
        } catch (e) {
          console.warn('Failed to start webcam:', e);
          setWebcamConfig((prev) => ({ ...prev, enabled: false }));
          setCaptureWarnings((w) => [...w, 'Camera is blocked or unavailable, so the camera bubble stays off.']);
        }
      }
    }
  };

  // Launch Recording Studio
  const handleStartRecording = async (useDemoFeed = false) => {
    setCaptureError(null);
    setCaptureWarnings([]);
    let captured: { stream: MediaStream; isSimulated: boolean; warnings: string[] };
    try {
      captured = cameraOnly
        ? await recordingService.startCameraOnlyCapture(audioConfig, useDemoFeed)
        : await recordingService.startCapture(audioConfig, useDemoFeed);
    } catch (e) {
      const denied = e instanceof DOMException && e.name === 'NotAllowedError';
      setCaptureError(
        denied
          ? cameraOnly
            ? 'Camera access was blocked. Allow the camera in the browser address bar and try again.'
            : 'Screen capture was cancelled or blocked. Choose a screen or window in the browser prompt to start recording.'
          : cameraOnly
            ? 'The camera is unavailable. It needs a secure (HTTPS) page and a connected camera.'
            : 'Screen capture is unavailable. It needs a secure (HTTPS) page and a browser that supports screen sharing.'
      );
      setCurrentStep('setup');
      return;
    }
    const { stream, isSimulated } = captured;
    const warnings = [...captured.warnings];
    setActiveStream(stream);
    setActiveAudioStream(recordingService.getMixedAudioStream());
    setIsSimulatedStream(isSimulated);

    if (webcamConfig.enabled && !cameraOnly) {
      try {
        const { stream: camStream } = await recordingService.startWebcamCapture(undefined, isSimulated);
        setActiveWebcamStream(camStream);
      } catch (e) {
        console.warn('Webcam capture failed on studio start:', e);
        setWebcamConfig((prev) => ({ ...prev, enabled: false }));
        warnings.push('Camera is blocked or unavailable, so the camera bubble is off. Allow camera access in the browser address bar and turn it on in the studio.');
      }
    }

    setCaptureWarnings(warnings);
    setCurrentStep('studio');
  };

  const handleFinishRecording = (blob: Blob, durationSec: number, liveCaptions?: CaptionSegment[]) => {
    recordingService.stop();
    setActiveWebcamStream(null);
    setRecordedBlob(blob);
    setRecordedDuration(durationSec);
    setRecordedCaptions(liveCaptions || []);
    setCurrentStep('export');
  };

  const handleCancelStudio = () => {
    recordingService.stop();
    setActiveStream(null);
    setActiveWebcamStream(null);
    setCurrentStep('setup');
  };

  // Steps that need data (a live stream or a finished take) can't be opened by clicking the nav
  const handleNavigate = (step: 'welcome' | 'setup' | 'studio' | 'export') => {
    if (step === currentStep) return;
    if (step === 'studio') return;
    if (step === 'export' && !recordedBlob) {
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1920;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#0a0d16';
        ctx.fillRect(0, 0, 1080, 1920);
        ctx.fillStyle = '#6366f1';
        ctx.font = 'bold 44px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('ClipDesk Demo Reel', 540, 960);
      }
      canvas.toBlob((b) => {
        if (b) {
          setRecordedBlob(b);
          setRecordedDuration(12);
        }
        setCurrentStep('export');
      }, 'video/webm');
      return;
    }
    if (currentStep === 'studio') {
      // Leaving a live studio discards the take: release screen, mic and camera
      recordingService.stop();
      setActiveStream(null);
      setActiveWebcamStream(null);
    }
    setCaptureError(null);
    setCaptureWarnings([]);
    setCurrentStep(step);
  };

  const handleNewRecording = () => {
    setActiveStream(null);
    setRecordedBlob(null);
    setRecordedDuration(0);
    setCurrentStep('welcome');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#07080c] text-slate-100 selection:bg-indigo-500/30">
      {/* Global Navigation */}
      <TopNav
        currentStep={currentStep}
        onNavigate={handleNavigate}
        license={license}
        onOpenUpgrade={() => setIsUpgradeModalOpen(true)}
      />

      {/* Main Workspace Body */}
      <main className="flex-1 pb-16">
        {captureError && (
          <div
            role="alert"
            className="max-w-3xl mx-auto mt-4 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-sm text-rose-200 flex flex-col sm:flex-row sm:items-center gap-3"
          >
            <span className="flex-1">{captureError}</span>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => handleStartRecording()}
                className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-xs font-bold cursor-pointer"
              >
                Try again
              </button>
              <button
                onClick={() => handleStartRecording(true)}
                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs cursor-pointer"
              >
                Use demo feed instead
              </button>
            </div>
          </div>
        )}
        {captureWarnings.length > 0 && currentStep === 'studio' && (
          <div
            role="status"
            className="max-w-3xl mx-auto mt-4 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-sm text-amber-200 flex items-start gap-3"
          >
            <ul className="flex-1 list-disc pl-4 space-y-1">
              {captureWarnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <button
              onClick={() => setCaptureWarnings([])}
              className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-xs cursor-pointer shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}
        {/* Unsaved Recording Recovered Alert */}
        {recoverableSession && currentStep !== 'studio' && (
          <div
            role="status"
            className="max-w-3xl mx-auto mt-4 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-sm text-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg animate-fadeIn"
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>
                <strong>Unsaved Take Recovered:</strong> Found a {(recoverableSession.blob.size / 1e6).toFixed(1)} MB clip preserved in IndexedDB crash storage.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  setRecordedBlob(recoverableSession.blob);
                  setRecordedDuration(recoverableSession.metadata.durationSeconds || 10);
                  if (recoverableSession.metadata.layoutMode) {
                    setLayoutMode(recoverableSession.metadata.layoutMode as LayoutMode);
                  }
                  setRecoverableSession(null);
                  setCurrentStep('export');
                }}
                className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold cursor-pointer transition-colors"
              >
                Restore & Export
              </button>
              <button
                onClick={() => {
                  void recoveryService.clearSession(recoverableSession.metadata.id);
                  setRecoverableSession(null);
                }}
                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-slate-300 cursor-pointer transition-colors"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {currentStep === 'welcome' && (
          <WelcomeScreen
            selectedTemplate={selectedTemplate}
            onSelectTemplate={handleSelectTemplate}
            onContinue={() => setCurrentStep('setup')}
            onQuickStart={() => handleStartRecording()}
            isPro={license.tier === 'pro'}
            onOpenUpgrade={() => setIsUpgradeModalOpen(true)}
          />
        )}

        {currentStep === 'setup' && (
          <RecordingSetup
            selectedTemplate={selectedTemplate}
            source={source}
            onSelectSource={setSource}
            smartFeatures={smartFeatures}
            onToggleFeature={handleToggleFeature}
            audioConfig={audioConfig}
            onToggleAudio={handleToggleAudio}
            layoutMode={layoutMode}
            onSelectLayout={setLayoutMode}
            onSelectFormat={handleSelectFormat}
            onBack={() => setCurrentStep('welcome')}
            onStartRecording={() => handleStartRecording()}
            webcamConfig={webcamConfig}
            onUpdateWebcamConfig={setWebcamConfig}
            onToggleWebcam={handleToggleWebcam}
            cameraOnly={cameraOnly}
            onSetCameraOnly={setCameraOnly}
            onUpdateZoomIntensity={(intensity) =>
              setSmartFeatures((prev) => ({ ...prev, zoomIntensity: intensity }))
            }
            onUpdateNoiseCancellation={(mode) => {
              setAudioConfig((prev) => ({ ...prev, noiseCancellation: mode }));
              recordingService.setNoiseCancellation(mode);
            }}
            onSelectMicDevice={(deviceId) => {
              setAudioConfig((prev) => ({ ...prev, micDeviceId: deviceId }));
            }}
          />
        )}

        {currentStep === 'studio' && (
          <LiveStudio
            stream={activeStream}
            audioStream={activeAudioStream}
            webcamStream={activeWebcamStream}
            webcamConfig={webcamConfig}
            onUpdateWebcamConfig={setWebcamConfig}
            onToggleWebcam={handleToggleWebcam}
            cameraOnly={cameraOnly}
            isSimulated={isSimulatedStream}
            template={TEMPLATES[selectedTemplate]}
            smartFeatures={smartFeatures}
            layoutMode={layoutMode}
            license={license}
            onLayoutChange={setLayoutMode}
            onFinishRecording={handleFinishRecording}
            onCancel={handleCancelStudio}
          />
        )}

        {currentStep === 'export' && recordedBlob && (
          <ExportModal
            recordedBlob={recordedBlob}
            durationSeconds={recordedDuration}
            layoutMode={layoutMode}
            license={license}
            onOpenUpgrade={() => setIsUpgradeModalOpen(true)}
            onNewRecording={handleNewRecording}
            initialCaptions={recordedCaptions}
          />
        )}
      </main>

      {/* Upgrade & License Modal */}
      <UpgradeModal
        isOpen={isUpgradeModalOpen}
        onClose={() => setIsUpgradeModalOpen(false)}
        license={license}
      />
    </div>
  );
};

export default App;
