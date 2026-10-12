import React, { useState } from 'react';
import { X, Check, Crown, Sparkles, Key, CreditCard, Shield } from 'lucide-react';
import { LicenseInfo } from '../core/types';
import { LicenseService } from '../licensing/licenseService';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  license: LicenseInfo;
}

export const UpgradeModal: React.FC<UpgradeModalProps> = ({ isOpen, onClose, license }) => {
  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

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
      }, 1500);
    }
  };

  const handleQuickDemoPro = () => {
    setLicenseKeyInput('PRO-CREATOR-2026');
    const res = LicenseService.activateKey('PRO-CREATOR-2026');
    setMessage({ text: res.message, isError: false });
    setTimeout(() => {
      onClose();
      setMessage(null);
    }, 1200);
  };

  const handleResetToFree = () => {
    LicenseService.resetToFree();
    setMessage({ text: 'Reverted to Free tier.', isError: false });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-[#0e111a] border border-white/10 rounded-2xl shadow-2xl p-6 sm:p-8 overflow-hidden">
        {/* Glow backdrop */}
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          id="btn-close-upgrade-modal"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-all"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="text-center max-w-md mx-auto mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold mb-3">
            <Crown className="w-3.5 h-3.5" />
            <span>CLIPDESK PRO CREATOR</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Level Up Your Vertical Video
          </h2>
          <p className="text-sm text-slate-400 mt-2">
            One subscription for both Desktop and Web apps. Record once, publish pristine reels with zero watermarks.
          </p>
        </div>

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
                <span>Max 90 seconds per recording</span>
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
                <span>Ultra-high 4K 60FPS bitrate</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Custom brand canvas & custom logo</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Desktop + Web sync with offline license</span>
              </li>
            </ul>
          </div>
        </div>

        {/* License Key Activation Section */}
        <div className="bg-[#141824] rounded-xl p-4 border border-white/5 mb-4">
          <form onSubmit={handleActivateKey} className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Key className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="input-license-key"
                type="text"
                value={licenseKeyInput}
                onChange={(e) => setLicenseKeyInput(e.target.value)}
                placeholder="Enter License Key (e.g. PRO-CREATOR-2026)"
                className="w-full pl-9 pr-3 py-2 text-xs font-mono bg-black/40 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
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
              onClick={handleQuickDemoPro}
              className="px-3 py-2 text-xs font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-lg transition-all shrink-0 cursor-pointer"
            >
              Use Demo Key
            </button>
          </form>

          {message && (
            <div className={`mt-2 text-xs ${message.isError ? 'text-rose-400' : 'text-emerald-400'}`}>
              {message.text}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-white/5">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span>Secure billing via Stripe / LemonSqueezy</span>
          </div>
          <div className="flex items-center gap-2">
            {isPro && (
              <button
                id="btn-reset-free"
                onClick={handleResetToFree}
                className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/5 transition-all"
              >
                Reset to Free
              </button>
            )}
            <button
              id="btn-subscribe-stripe"
              onClick={handleQuickDemoPro}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold text-xs shadow-lg shadow-amber-500/25 transition-all cursor-pointer"
            >
              <CreditCard className="w-4 h-4" />
              <span>Subscribe Now — $19/mo</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
