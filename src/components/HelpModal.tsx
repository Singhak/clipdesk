import React, { useId } from 'react';
import { X, Keyboard } from 'lucide-react';
import { Modal } from './Modal';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SECTIONS: { title: string; items: { keys: string[]; label: string }[] }[] = [
  {
    title: 'While recording',
    items: [
      { keys: ['Alt', 'Shift', 'P'], label: 'Pause or resume' },
      { keys: ['Alt', 'Shift', 'S'], label: 'Stop and export' },
      { keys: ['Alt', 'Shift', 'D'], label: 'Toggle the drawing pen' },
      { keys: ['Esc'], label: 'Cancel the countdown' }
    ]
  },
  {
    title: 'Cut editor',
    items: [
      { keys: ['I'], label: 'Mark in point' },
      { keys: ['O'], label: 'Mark out point' },
      { keys: ['Delete'], label: 'Cut the selected part' },
      { keys: ['Ctrl', 'Z'], label: 'Undo' },
      { keys: ['Ctrl', 'Y'], label: 'Redo (or Ctrl+Shift+Z)' },
      { keys: ['Esc'], label: 'Clear the selection' }
    ]
  },
  {
    title: 'General',
    items: [
      { keys: ['?'], label: 'Open this help' },
      { keys: ['Esc'], label: 'Close a dialog' }
    ]
  }
];

const Key: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="px-1.5 py-0.5 rounded-md bg-white/10 border border-white/15 text-xs font-mono text-slate-200">
    {children}
  </kbd>
);

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  const titleId = useId();
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      labelledBy={titleId}
      panelClassName="w-full max-w-lg max-h-[85vh] overflow-y-auto bg-[#0e111a] border border-white/10 rounded-2xl shadow-2xl p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 id={titleId} className="flex items-center gap-2 text-base font-bold text-white">
          <Keyboard className="w-4 h-4 text-indigo-400" />
          Help and shortcuts
        </h2>
        <button
          type="button"
          aria-label="Close help"
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-5">
        {SECTIONS.map((s) => (
          <section key={s.title}>
            <h3 className="text-xs uppercase tracking-wider font-bold text-slate-400 mb-2">{s.title}</h3>
            <ul className="divide-y divide-white/5">
              {s.items.map((i) => (
                <li key={i.label} className="flex items-center justify-between gap-4 py-1.5 text-sm text-slate-200">
                  <span>{i.label}</span>
                  <span className="flex items-center gap-1 shrink-0">
                    {i.keys.map((k, idx) => (
                      <React.Fragment key={k}>
                        {idx > 0 && <span className="text-slate-500 text-xs">+</span>}
                        <Key>{k}</Key>
                      </React.Fragment>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="text-xs text-slate-400 mt-5">
        Recording shortcuts work while this tab has focus. In the desktop app they work in any app. On Mac, use Cmd
        instead of Ctrl.
      </p>
    </Modal>
  );
};
