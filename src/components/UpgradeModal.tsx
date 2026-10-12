import React, { useState } from 'react';
import {
  X,
  Check,
  Crown,
  Sparkles,
  Key,
  CreditCard,
  Shield,
  ExternalLink,
  Copy,
  RefreshCw,
  Share2
} from 'lucide-react';
import { LicenseInfo } from '../core/types';
import { LicenseService } from '../licensing/licenseService';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  license: LicenseInfo;
}

export const UpgradeModal: React.FC<UpgradeModalProps> = ({ isOpen, onClose, license }) => {
  const [activeTab, setActiveTab] = useState<'plans' | 'sync'>('plans');
  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [syncTokenInput, setSyncTokenInput] = useState('');
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [copiedSync, setCopiedSync] = useState(false);

  if (!isOpen) return null;

  const isPro = license.tier === 'pro';

  const handleActivateKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseKeyInput.trim()) return;

    const res = LicenseService.activateKey(licenseKeyInput);
    setMessage({ text: res.message, isError: !res.success });
    if (res.success) {
      setTimeout(() => {
        onClose();
        setMessage(null);
      }, 1600);
    }
  };

  const handleStartFreeTrial = () => {
    const res = LicenseService.activateKey('DEMO-CREATOR-2026');
    setMessage({ text: res.message, isError: false });
    setTimeout(() => {
      onClose();
      setMessage(null);
    }, 1400);
  };

  const handleSubscribeStripe = () => {
    const url = LicenseService.getCheckoutUrl();
    window.open(url, '_blank', 'noopener,noreferrer');
    setMessage({
      text: '💳 Secure Stripe checkout opened in a new tab. After subscribing, enter your license key here to activate!',
      isError: false
    });
  };

  const handleImportSync = (e: React.FormEvent) => {
    e.preventDefault();
    if (!syncTokenInput.trim()) return;
    const res = LicenseService.importSyncToken(syncTokenInput);
    setMessage({ text: res.message, isError: !res.success });
    if (res.success) {
      setTimeout(() => {
        onClose();
        setMessage(null);
      }, 1400);
    }
  };

  const handleCopySyncToken = () => {
    const token = license.syncToken || LicenseService.createSyncToken(license);
    navigator.clipboard.writeText(token);
    setCopiedSync(true);
    setTimeout(() => setCopiedSync(false), 2000);
  };

  const handleResetToFree = () => {
    LicenseService.resetToFree();
    setMessage({ text: 'Reverted to Free tier.', isError: false });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-[#0e111a] border border-white/10 rounded-2xl shadow-2xl p-6 sm:p-8 overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Glow backdrop */}
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          id="btn-close-upgrade-modal"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-all cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="text-center max-w-md mx-auto mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold mb-3">
            <Crown className="w-3.5 h-3.5" />
            <span>CLIPDESK PRO CREATOR</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Level Up Your Vertical Video
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-2">
            One subscription for Web, Chrome Extension, and Electron Desktop. Record once, publish pristine reels with zero watermarks.
          </p>

          {/* Tab Switcher */}
          <div className="flex justify-center gap-2 mt-4">
            <button
              onClick={() => setActiveTab('plans')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'plans'
                  ? 'bg-white/10 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Subscription Plans
            </button>
            <button
              onClick={() => setActiveTab('sync')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'sync'
                  ? 'bg-white/10 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Share2 className="w-3 h-3 text-indigo-400" />
              <span>Cross-Platform Sync</span>
            </button>
          </div>
        </div>

        {activeTab === 'plans' ? (
          <>
            {/* Comparison Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              {/* Free Tier Card */}
              <div className={`p-5 rounded-xl border ${!isPro ? 'border-white/20 bg-white/[0.03]' : 'border-white/5 bg-transparent'}`}>
                <div className="text-sm font-semibold text-slate-300 mb-1">Free Tier</div>
                <div className="text-2xl font-bold text-white mb-4">$0 <span className="text-xs font-normal text-slate-400">/ forever</span></div>
                <ul className="space-y-2.5 text-xs text-slate-300">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>60 FPS screen & mic capture</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Follow mouse & click zoom</span>
                  </li>
                  <li className="flex items-center gap-2 text-slate-400">
                    <span className="w-4 h-4 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center text-[10px] shrink-0 font-bold">!</span>
                    <span>Includes ClipDesk watermark badge</span>
                  </li>
                  <li className="flex items-center gap-2 text-slate-400">
                    <span className="w-4 h-4 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center text-[10px] shrink-0 font-bold">!</span>
                    <span>Standard export bitrate</span>
                  </li>
                </ul>
              </div>

              {/* Pro Tier Card */}
              <div className={`p-5 rounded-xl border relative ${isPro ? 'border-amber-500/50 bg-amber-500/[0.05]' : 'border-indigo-500/30 bg-gradient-to-b from-indigo-500/10 to-transparent'}`}>
                <div className="absolute top-3 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400 text-black uppercase">
                  Most Popular
                </div>
                <div className="text-sm font-semibold text-amber-400 mb-1 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Pro Creator</span>
                </div>
                <div className="text-2xl font-bold text-white mb-4">$19 <span className="text-xs font-normal text-slate-400">/ month</span></div>
                <ul className="space-y-2.5 text-xs text-white">
                  <li className="flex items-center gap-2 font-medium">
                    <Check className="w-4 h-4 text-amber-400 shrink-0" />
                    <span><strong>No watermark</strong> on any export</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-amber-400 shrink-0" />
                    <span><strong>Unlimited</strong> recording duration</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Dynamic AI Animated Captions</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Ultra-crisp 4K 60FPS high bitrate</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Web, Chrome Extension & Desktop sync</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* License Key Activation Section */}
            <div className="bg-[#141824] rounded-xl p-4 border border-white/5 mb-4">
              <div className="text-xs font-bold text-slate-200 mb-2 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-indigo-400" />
                <span>Have a License Key?</span>
              </div>
              <form onSubmit={handleActivateKey} className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <input
                    id="input-license-key"
                    type="text"
                    value={licenseKeyInput}
                    onChange={(e) => setLicenseKeyInput(e.target.value)}
                    placeholder="Enter key (e.g. CLIP-XXXX-XXXX-XXXX)"
                    className="w-full px-3 py-2 text-xs font-mono bg-black/40 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <button
                  id="btn-activate-license"
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-all shrink-0 cursor-pointer"
                >
                  Activate Key
                </button>
                <button
                  id="btn-quick-demo-key"
                  type="button"
                  onClick={handleStartFreeTrial}
                  className="px-3 py-2 text-xs font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-lg transition-all shrink-0 cursor-pointer"
                  title="Evaluate with full watermark removal for 7 days"
                >
                  7-Day Free Trial
                </button>
              </form>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-white/5">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Shield className="w-4 h-4 text-emerald-400" />
                <span>Verified SSL checkout powered by Stripe</span>
              </div>
              <div className="flex items-center gap-2">
                {isPro && (
                  <button
                    id="btn-reset-free"
                    onClick={handleResetToFree}
                    className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/5 transition-all cursor-pointer"
                  >
                    Reset to Free
                  </button>
                )}
                <button
                  id="btn-subscribe-stripe"
                  onClick={handleSubscribeStripe}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold text-xs shadow-lg shadow-amber-500/25 transition-all cursor-pointer"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Subscribe Now — $19/mo</span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                </button>
              </div>
            </div>
          </>
        ) : (
          /* Cross-Platform Sync Tab */
          <div className="space-y-4 py-2 animate-fadeIn">
            <div className="p-4 rounded-xl bg-[#141824] border border-white/5">
              <h3 className="text-xs font-bold text-white mb-1.5 flex items-center gap-2">
                <Share2 className="w-4 h-4 text-indigo-400" />
                <span>Cross-Platform Ecosystem Sync</span>
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                Sync your Pro Creator subscription between the Web App, Chrome Extension, and Electron Desktop app with one portable sync token.
              </p>

              {isPro ? (
                <div className="space-y-3">
                  <div className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5">
                    <Check className="w-4 h-4" />
                    <span>Your Pro License is Active ({license.planName})</span>
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-300 block mb-1">Your Portable Sync Token:</label>
                    <div className="flex gap-2">
                      <input
                        readOnly
                        value={license.syncToken || LicenseService.createSyncToken(license)}
                        className="flex-1 bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-[10px] font-mono text-slate-300 select-all"
                      />
                      <button
                        onClick={handleCopySyncToken}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white shrink-0 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>{copiedSync ? 'Copied!' : 'Copy Token'}</span>
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Paste this token in your ClipDesk Chrome Extension or Electron App settings to unlock Pro across all devices.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleImportSync} className="space-y-3">
                  <p className="text-xs text-slate-300">
                    Already subscribed on Desktop or Chrome Extension? Paste your sync token below:
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={syncTokenInput}
                      onChange={(e) => setSyncTokenInput(e.target.value)}
                      placeholder="Paste CLIPSYNC_..."
                      className="flex-1 bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white shrink-0 cursor-pointer"
                    >
                      Sync License
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {message && (
          <div
            role="status"
            className={`mt-4 p-3 rounded-xl text-xs flex items-center gap-2 ${
              message.isError
                ? 'bg-rose-500/10 border border-rose-500/20 text-rose-300'
                : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
            }`}
          >
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>{message.text}</span>
          </div>
        )}
      </div>
    </div>
  );
};
