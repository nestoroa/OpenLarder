import { useEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ open, onClose, title, children, footer }: Props) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

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

  // Adjust overlay to the visual viewport so the keyboard never covers modal content.
  // On iOS Safari the keyboard overlays the layout viewport without resizing it;
  // visualViewport tracks only the visible area above the keyboard.
  useEffect(() => {
    if (!visible) return;
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const el = overlayRef.current;
      if (!el) return;
      el.style.top = `${vv.offsetTop}px`;
      el.style.height = `${vv.height}px`;
      el.style.bottom = 'auto';
    };

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();

    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      const el = overlayRef.current;
      if (el) {
        el.style.top = '';
        el.style.height = '';
        el.style.bottom = '';
      }
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      ref={overlayRef}
      className={`fixed inset-x-0 top-0 z-50 flex items-end sm:items-center justify-center pt-16 px-4 pb-14 sm:pb-4 bg-black/50
        ${closing ? 'animate-fade-out' : 'animate-fade-in'} animate-duration-fast animate-fill-mode-forwards`}
      style={{ height: '100dvh' }}
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
        {footer && <div className="p-4 border-t flex-shrink-0">{footer}</div>}
      </div>
    </div>
  );
}
