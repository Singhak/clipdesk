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
import {
  TemplateId,
  RecordingSource,
  SmartFeatures,
  AudioConfig,
  LayoutMode,
  LicenseInfo,
  WebcamConfig
} from './core/types';

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

  // Sync with License changes
  useEffect(() => {
    const unsubscribe = LicenseService.subscribe((newLicense) => {
      setLicense(newLicense);
    });
    return unsubscribe;
  }, []);

  // Update layout default when template changes
  const handleSelectTemplate = (templateId: TemplateId) => {
    setSelectedTemplate(templateId);
    const tmpl = TEMPLATES[templateId];
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

  const handleFinishRecording = (blob: Blob, durationSec: number) => {
    recordingService.stop();
    setActiveWebcamStream(null);
    setRecordedBlob(blob);
    setRecordedDuration(durationSec);
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
    if (step === 'export' && !recordedBlob) return;
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
        {currentStep === 'welcome' && (
          <WelcomeScreen
            selectedTemplate={selectedTemplate}
            onSelectTemplate={handleSelectTemplate}
            onContinue={() => setCurrentStep('setup')}
            onQuickStart={() => handleStartRecording()}
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
            onUpdateNoiseCancellation={(mode) =>
              setAudioConfig((prev) => ({ ...prev, noiseCancellation: mode }))
            }
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
