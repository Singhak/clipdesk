import React, { useEffect, useState } from 'react';
import { LicenseInfo } from '../core/types';
import { LicenseService } from '../licensing/licenseService';
import { ConfirmDialog } from './Modal';
import { TrialForm } from './TrialForm';
import { getTierConfig } from '../licensing/tierFeatures';

// Compact license section for the desktop launcher and the extension popup.
// The web studio has the full UpgradeModal instead.

interface LicensePanelProps {
  /** Opens a checkout URL in the user's browser */
  openUrl: (url: string) => void;
}

export const LicensePanel: React.FC<LicensePanelProps> = ({ openUrl }) => {
  const [license, setLicense] = useState<LicenseInfo>(() => LicenseService.getLicense());
  const [keyInput, setKeyInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  useEffect(() => {
    const off = LicenseService.subscribe(setLicense);
    void LicenseService.refresh();
    return off;
  }, []);

  const run = async (action: () => Promise<{ success: boolean; message: string }>) => {
    setBusy(true);
    setMessage(null);
    const res = await action();
    setBusy(false);
    setMessage({ text: res.message, isError: !res.success });
    if (res.success) setKeyInput('');
  };

  if (license.tier === 'pro') {
    return (
      <section className="space-y-1.5 p-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.06]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] font-bold text-amber-300">{license.planName}</span>
          {license.expiresAt && (
            <span className="text-xs text-slate-400">until {new Date(license.expiresAt).toLocaleDateString()}</span>
          )}
        </div>
        <div className="flex gap-3 text-xs">
          {license.plan === 'monthly' && (
            <button onClick={() => openUrl(LicenseService.getCheckoutUrl('monthly'))} className="text-indigo-300 hover:text-indigo-200 cursor-pointer">
              Renew 30 days
            </button>
          )}
          {license.plan === 'trial' && (
            <button onClick={() => openUrl(LicenseService.getCheckoutUrl('lifetime'))} className="text-indigo-300 hover:text-indigo-200 cursor-pointer">
              Buy Pro
            </button>
          )}
          {license.licenseKey && (
            <button
              disabled={busy}
              onClick={() => setConfirmDeactivate(true)}
              className="ml-auto text-slate-400 hover:text-rose-300 disabled:opacity-50 cursor-pointer"
            >
              Deactivate this device
            </button>
          )}
        </div>
        {message && <p role="status" className={`text-xs ${message.isError ? 'text-rose-300' : 'text-emerald-300'}`}>{message.text}</p>}
        <ConfirmDialog
          isOpen={confirmDeactivate}
          title="Deactivate this device?"
          message="This device will go back to the free plan. You can activate it again later with your license key."
          confirmLabel="Deactivate"
          danger
          onCancel={() => setConfirmDeactivate(false)}
          onConfirm={() => {
            setConfirmDeactivate(false);
            void run(() => LicenseService.deactivate());
          }}
        />
      </section>
    );
  }

  return (
    <section className="space-y-2 p-3 rounded-xl border border-white/10 bg-white/[0.03]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-bold">Free plan</span>
        <span className="text-xs text-slate-400">Watermark · {getTierConfig(false).maxDurationSeconds}s limit</span>
      </div>
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (keyInput.trim()) void run(() => LicenseService.activateKey(keyInput));
        }}
      >
        <input
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          placeholder="CLIP-XXXX-XXXX-XXXX"
          aria-label="License key"
          className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-black/40 border border-white/10 text-xs font-mono"
        />
        <button
          type="submit"
          disabled={busy || !keyInput.trim()}
          className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-xs font-bold cursor-pointer"
        >
          {busy ? '…' : 'Activate'}
        </button>
      </form>
      <div className="flex gap-3 text-xs">
        <button onClick={() => openUrl(LicenseService.getCheckoutUrl('lifetime'))} className="text-amber-300 hover:text-amber-200 font-bold cursor-pointer">
          Buy Pro
        </button>
        <button onClick={() => openUrl(LicenseService.getCheckoutUrl('monthly'))} className="text-indigo-300 hover:text-indigo-200 cursor-pointer">
          30-day pass
        </button>
        <TrialForm
          onDone={(res) => setMessage({ text: res.message, isError: false })}
          className="ml-auto text-slate-400 hover:text-white cursor-pointer"
        />
      </div>
      {message && <p role="status" className={`text-xs ${message.isError ? 'text-rose-300' : 'text-emerald-300'}`}>{message.text}</p>}
    </section>
  );
};
