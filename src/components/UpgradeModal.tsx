import React, { useState } from 'react';
import { X, Check, Crown, Sparkles, Key, CreditCard, Shield, ExternalLink, Laptop } from 'lucide-react';
import { LicenseInfo } from '../core/types';
import { Modal, ConfirmDialog } from './Modal';
import { LicenseService } from '../licensing/licenseService';
import { DISPLAY_PRICES, getTierConfig } from '../licensing/tierFeatures';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  license: LicenseInfo;
}

const FREE_LIMIT = getTierConfig(false).maxDurationSeconds;

export const UpgradeModal: React.FC<UpgradeModalProps> = ({ isOpen, onClose, license }) => {
  const [activeTab, setActiveTab] = useState<'plans' | 'devices'>('plans');
  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  if (!isOpen) return null;

  const isPro = license.tier === 'pro';

  const run = async (action: () => Promise<{ success: boolean; message: string }>, closeOnSuccess: boolean) => {
    setBusy(true);
    setMessage(null);
    const res = await action();
    setBusy(false);
    setMessage({ text: res.message, isError: !res.success });
    if (res.success && closeOnSuccess) {
      setLicenseKeyInput('');
      setTimeout(() => {
        onClose();
        setMessage(null);
      }, 1600);
    }
  };

  const handleActivateKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseKeyInput.trim()) return;
    void run(() => LicenseService.activateKey(licenseKeyInput), true);
  };

  const openCheckout = (plan: 'monthly' | 'lifetime') => {
    window.open(LicenseService.getCheckoutUrl(plan), '_blank', 'noopener,noreferrer');
    setMessage({
      text: '💳 Checkout opened in a new tab. After paying you get a license key on screen and by email. Paste it here to activate.',
      isError: false
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="upgrade-modal-title"
      panelClassName="relative w-full max-w-2xl bg-[#0e111a] border border-white/10 rounded-2xl shadow-2xl p-6 sm:p-8 overflow-hidden max-h-[90vh] overflow-y-auto"
    >
      <>
        {/* Glow backdrop */}
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          id="btn-close-upgrade-modal"
          aria-label="Close"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-all cursor-pointer"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>

        {/* Modal Header */}
        <div className="text-center max-w-md mx-auto mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold mb-3">
            <Crown className="w-3.5 h-3.5" />
            <span>CLIPDESK PRO CREATOR</span>
          </div>
          <h2 id="upgrade-modal-title" className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Level Up Your Vertical Video</h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-2">
            One license for Web, the Chrome Extension and the Desktop app. ClipDesk is open source; Pro supports development and
            unlocks watermark-free exports in the official builds.
          </p>

          {/* Tab Switcher */}
          <div className="flex justify-center gap-2 mt-4">
            <button
              aria-pressed={activeTab === 'plans'}
              onClick={() => setActiveTab('plans')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'plans' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Plans
            </button>
            <button
              aria-pressed={activeTab === 'devices'}
              onClick={() => setActiveTab('devices')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'devices' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Laptop className="w-3 h-3 text-indigo-400" />
              <span>Your Devices</span>
            </button>
          </div>
        </div>

        {activeTab === 'plans' ? (
          <>
            {/* Comparison Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              {/* Free Tier Card */}
              <div className={`p-5 rounded-xl border ${!isPro ? 'border-white/20 bg-white/[0.03]' : 'border-white/5 bg-transparent'}`}>
                <div className="text-sm font-semibold text-slate-300 mb-1">Free</div>
                <div className="text-2xl font-bold text-white mb-4">
                  ₹0 <span className="text-xs font-normal text-slate-400">/ forever</span>
                </div>
                <ul className="space-y-2.5 text-xs text-slate-300">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Follow mouse & click zoom</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>On-device captions (Whisper)</span>
                  </li>
                  <li className="flex items-center gap-2 text-slate-400">
                    <span className="w-4 h-4 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center text-xs shrink-0 font-bold">!</span>
                    <span>{FREE_LIMIT}-second recording limit</span>
                  </li>
                  <li className="flex items-center gap-2 text-slate-400">
                    <span className="w-4 h-4 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center text-xs shrink-0 font-bold">!</span>
                    <span>ClipDesk watermark</span>
                  </li>
                  <li className="flex items-center gap-2 text-slate-400">
                    <span className="w-4 h-4 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center text-xs shrink-0 font-bold">!</span>
                    <span>Standard export bitrate (6 Mbps)</span>
                  </li>
                </ul>
              </div>

              {/* Pro Tier Card */}
              <div
                className={`p-5 rounded-xl border relative ${
                  isPro ? 'border-amber-500/50 bg-amber-500/[0.05]' : 'border-indigo-500/30 bg-gradient-to-b from-indigo-500/10 to-transparent'
                }`}
              >
                <div className="absolute top-3 right-3 text-xs font-bold px-2 py-0.5 rounded-full bg-amber-400 text-black uppercase">
                  Best value
                </div>
                <div className="text-sm font-semibold text-amber-400 mb-1 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Pro Creator</span>
                </div>
                <div className="text-2xl font-bold text-white">
                  {DISPLAY_PRICES.lifetime} <span className="text-xs font-normal text-slate-400">/ lifetime</span>
                </div>
                <div className="text-xs text-slate-400 mb-4">or {DISPLAY_PRICES.monthly} for a 30-day pass</div>
                <ul className="space-y-2.5 text-xs text-white">
                  <li className="flex items-center gap-2 font-medium">
                    <Check className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      <strong>No watermark</strong> on any export
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      <strong>Unlimited</strong> recording length
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      <strong>16 Mbps</strong> high-bitrate export
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      <strong>All Pro templates</strong>
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Use on up to 3 devices</span>
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
                    aria-label="License key"
                    type="text"
                    value={licenseKeyInput}
                    onChange={(e) => setLicenseKeyInput(e.target.value)}
                    placeholder="CLIP-XXXX-XXXX-XXXX"
                    className="w-full px-3 py-2 text-xs font-mono bg-black/40 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <button
                  id="btn-activate-license"
                  type="submit"
                  disabled={busy || !licenseKeyInput.trim()}
                  className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg transition-all shrink-0 cursor-pointer"
                >
                  {busy ? 'Checking…' : 'Activate Key'}
                </button>
                {!isPro && (
                  <button
                    id="btn-start-trial"
                    type="button"
                    disabled={busy}
                    onClick={() => void run(() => LicenseService.startTrial(), true)}
                    className="px-3 py-2 text-xs font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 disabled:opacity-50 rounded-lg transition-all shrink-0 cursor-pointer"
                    title="Full Pro on this device for 7 days"
                  >
                    7-Day Free Trial
                  </button>
                )}
              </form>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-white/5">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Shield className="w-4 h-4 text-emerald-400" />
                <span>Secure UPI, card & netbanking checkout by Cashfree</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  id="btn-buy-monthly"
                  onClick={() => openCheckout('monthly')}
                  className="text-xs text-slate-300 hover:text-white px-3 py-2 rounded-lg border border-white/10 hover:bg-white/5 transition-all cursor-pointer"
                >
                  {license.plan === 'monthly' ? 'Renew' : '30 days'} — {DISPLAY_PRICES.monthly}
                </button>
                <button
                  id="btn-buy-lifetime"
                  onClick={() => openCheckout('lifetime')}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold text-xs shadow-lg shadow-amber-500/25 transition-all cursor-pointer"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Lifetime — {DISPLAY_PRICES.lifetime}</span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                </button>
              </div>
            </div>
          </>
        ) : (
          /* Devices Tab */
          <div className="space-y-4 py-2 animate-fadeIn">
            <div className="p-4 rounded-xl bg-[#141824] border border-white/5 space-y-3">
              <h3 className="text-xs font-bold text-white flex items-center gap-2">
                <Laptop className="w-4 h-4 text-indigo-400" />
                <span>Use Pro on another device</span>
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Enter the same license key in the ClipDesk Desktop app or the Chrome extension popup. One key works on up to 3
                devices; deactivate one here to free its slot.
              </p>
              {isPro ? (
                <div className="space-y-2">
                  <div className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5">
                    <Check className="w-4 h-4" />
                    <span>
                      {license.planName}
                      {license.expiresAt && ` · until ${new Date(license.expiresAt).toLocaleDateString()}`}
                    </span>
                  </div>
                  {license.licenseKey && (
                    <div className="text-xs text-slate-300">
                      Key: <span className="font-mono select-all">{license.licenseKey}</span>
                    </div>
                  )}
                  {license.licenseKey ? (
                    <button
                      id="btn-deactivate-device"
                      disabled={busy}
                      onClick={() => setConfirmDeactivate(true)}
                      className="text-xs text-slate-300 hover:text-rose-300 px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 disabled:opacity-50 transition-all cursor-pointer"
                    >
                      Deactivate this device
                    </button>
                  ) : (
                    <button
                      onClick={() => LicenseService.resetToFree()}
                      className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/5 transition-all cursor-pointer"
                    >
                      End trial
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-500">No active license on this device.</p>
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

        <ConfirmDialog
          isOpen={confirmDeactivate}
          title="Deactivate this device?"
          message="This device will go back to the free plan (watermark and time limit). You can activate it again later with your license key."
          confirmLabel="Deactivate"
          danger
          onCancel={() => setConfirmDeactivate(false)}
          onConfirm={() => {
            setConfirmDeactivate(false);
            void run(() => LicenseService.deactivate(), false);
          }}
        />
      </>
    </Modal>
  );
};
