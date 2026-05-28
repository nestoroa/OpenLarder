import { useEffect, useState } from 'react';

interface ToastMessage { id: number; text: string; type: 'success' | 'error' | 'info'; }

let listeners: Array<(msg: ToastMessage) => void> = [];
let nextId = 0;

export function showToast(text: string, type: ToastMessage['type'] = 'info') {
  const msg = { id: nextId++, text, type };
  listeners.forEach(l => l(msg));
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handler = (msg: ToastMessage) => {
      setToasts(prev => [...prev, msg]);
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== msg.id)), 4000);
    };
    listeners.push(handler);
    return () => { listeners = listeners.filter(l => l !== handler); };
  }, []);

  return (
    <div className="fixed bottom-20 left-0 right-0 flex flex-col items-center gap-2 z-50 px-4 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className={`
          px-4 py-3 rounded-xl text-sm font-medium shadow-lg pointer-events-auto
          ${t.type === 'error' ? 'bg-red-600 text-white' : t.type === 'success' ? 'bg-green-600 text-white' : 'bg-gray-800 text-white'}
        `}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
