import { useEffect, useState, type ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Modal({ open, onClose, title, children }: Props) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setVisible(true);
      setClosing(false);
    } else if (visible) {
      setClosing(true);
      const t = setTimeout(() => {
        setVisible(false);
        setClosing(false);
      }, 180); // matches animate-duration-fast (200ms) with a tiny buffer
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50
        ${closing ? 'animate-fade-out' : 'animate-fade-in'} animate-duration-fast animate-fill-mode-forwards`}
      onClick={onClose}
    >
      <div
        className={`w-full max-w-md bg-white rounded-2xl shadow-xl flex flex-col max-h-[90dvh]
          ${closing ? 'animate-slide-out-bottom' : 'animate-slide-in-bottom'} animate-duration-fast animate-fill-mode-forwards`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 min-h-[44px] min-w-[44px] flex items-center justify-center">✕</button>
        </div>
        <div className="p-4 overflow-y-auto flex-1 min-h-0">{children}</div>
      </div>
    </div>
  );
}
