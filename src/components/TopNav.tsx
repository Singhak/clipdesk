import React from 'react';
import { Video, Crown, Sparkles, ShieldCheck, Activity } from 'lucide-react';
import { LicenseInfo } from '../core/types';

interface TopNavProps {
  currentStep: 'welcome' | 'setup' | 'studio' | 'export';
  onNavigate: (step: 'welcome' | 'setup' | 'studio' | 'export') => void;
  license: LicenseInfo;
  onOpenUpgrade: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  currentStep,
  onNavigate,
  license,
  onOpenUpgrade
}) => {
  const isPro = license.tier === 'pro';

  const steps = [
    { id: 'welcome' as const, num: '1', label: 'Templates' },
    { id: 'setup' as const, num: '2', label: 'Setup' },
    { id: 'studio' as const, num: '3', label: 'Live Studio' },
    { id: 'export' as const, num: '4', label: 'Export' }
  ];

  return (
    <header className="border-b border-white/10 bg-[#07090e]/85 backdrop-blur-xl sticky top-0 z-40 px-5 sm:px-8 py-3.5 shadow-xl shadow-black/40">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Brand Logo */}
        <div
          id="nav-brand-logo"
          onClick={() => onNavigate('welcome')}
          className="flex items-center gap-3 cursor-pointer group select-none"
        >
          <div className="relative w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 p-0.5 shadow-lg shadow-indigo-500/30 group-hover:shadow-indigo-500/50 transition-all">
            <div className="w-full h-full bg-[#0a0d16] rounded-[10px] flex items-center justify-center">
              <Video className="w-5 h-5 text-indigo-400 group-hover:scale-110 transition-transform" />
            </div>
            {/* Live indicator dot */}
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 rounded-full border-2 border-[#0a0d16] animate-pulse" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg tracking-tight text-white group-hover:text-indigo-200 transition-colors">
                ReelScreen
              </span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                OBS for Reels
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block font-medium">
              Vertical Content Workspace for Desktop Creators
            </p>
          </div>
        </div>

        {/* Workflow Segmented Navigation */}
        <nav className="hidden md:flex items-center gap-1.5 p-1 rounded-2xl bg-black/40 border border-white/10 shadow-inner">
          {steps.map((step) => {
            const isActive = currentStep === step.id;
            return (
              <button
                key={step.id}
                id={`nav-step-${step.id}`}
                onClick={() => onNavigate(step.id)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-md shadow-indigo-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <span
                  className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    isActive ? 'bg-white text-indigo-700' : 'bg-white/10 text-slate-400'
                  }`}
                >
                  {step.num}
                </span>
                <span>{step.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right Status & Pro Tier Actions */}
        <div className="flex items-center gap-3">
          {/* Status pill */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-mono text-emerald-400">
            <Activity className="w-3 h-3 text-emerald-400" />
            <span>60 FPS Engine</span>
          </div>

          {isPro ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold shadow-md shadow-amber-500/10">
              <Crown className="w-3.5 h-3.5 text-amber-400" />
              <span>Pro Creator</span>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 ml-0.5" />
            </div>
          ) : (
            <button
              id="nav-upgrade-btn"
              onClick={onOpenUpgrade}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl btn-pro text-xs shadow-md shadow-amber-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 fill-black" />
              <span>Upgrade to Pro</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
