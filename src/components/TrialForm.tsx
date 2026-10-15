import React, { useState } from 'react';
import { LicenseService } from '../licensing/licenseService';

// Two-step email-verified trial: enter email, then the 6-digit code that was mailed.

interface TrialFormProps {
  onDone: (res: { success: boolean; message: string }) => void;
  className?: string;
}

export const TrialForm: React.FC<TrialFormProps> = ({ onDone, className = '' }) => {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; isError: boolean } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    const res = sent ? await LicenseService.verifyTrial(email, code) : await LicenseService.requestTrialCode(email);
    setBusy(false);
    if (res.success && sent) {
      onDone(res);
      return;
    }
    if (res.success) setSent(true);
    setNote({ text: res.message, isError: !res.success });
  };

  if (!open) {
    return (
      <button
        id="btn-start-trial"
        type="button"
        onClick={() => setOpen(true)}
        className={className}
        title="Full Pro for 7 days, verified by email"
      >
        7-day free trial
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="w-full space-y-1.5">
      {!sent ? (
        <input
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="Email for the free trial"
          className="w-full bg-black/60 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
        />
      ) : (
        <input
          inputMode="numeric"
          required
          autoFocus
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          placeholder="6-digit code"
          aria-label="Verification code"
          className="w-full bg-black/60 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 font-mono tracking-widest"
        />
      )}
      <div className="flex gap-2 text-xs">
        <button
          type="submit"
          disabled={busy || (sent ? code.length !== 6 : !email.trim())}
          className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold cursor-pointer"
        >
          {busy ? '…' : sent ? 'Start trial' : 'Email me a code'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setSent(false);
            setCode('');
            setNote(null);
          }}
          className="text-slate-400 hover:text-white cursor-pointer"
        >
          Cancel
        </button>
      </div>
      {note && <p role="status" className={`text-xs ${note.isError ? 'text-rose-300' : 'text-emerald-300'}`}>{note.text}</p>}
    </form>
  );
};
