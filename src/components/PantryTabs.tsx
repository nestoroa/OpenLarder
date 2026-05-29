import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api.js';
import type { Pantry } from '../lib/types.js';
import { StockTab } from './tabs/StockTab.js';
import { ShoppingTab } from './tabs/ShoppingTab.js';
import { ActivityTab } from './tabs/ActivityTab.js';
import { SettingsTab } from './tabs/SettingsTab.js';
import { ToastContainer } from './ui/Toast.js';
import { Spinner } from './ui/Spinner.js';
import { fullRefresh, registerSyncListener } from '../lib/sync.js';

type Tab = 'stock' | 'shopping' | 'activity' | 'settings';

const primaryTabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'stock',    label: 'Stock',    icon: '🥫' },
  { id: 'shopping', label: 'Shopping', icon: '🛒' },
];

const menuItems: { id: Tab; label: string; icon: string }[] = [
  { id: 'activity', label: 'Activity', icon: '📋' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

export default function PantryTabs({ pantryId }: { pantryId: number }) {
  const [pantry, setPantry] = useState<Pantry | null>(null);
  const [active, setActive] = useState<Tab>('stock');
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getPantry(pantryId)
      .then(async (p) => {
        setPantry(p);
        if (navigator.onLine) await fullRefresh(pantryId);
      })
      .catch(() => { window.location.href = '/pantries'; })
      .finally(() => setLoading(false));

    return registerSyncListener();
  }, [pantryId]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  if (loading) return <div className="flex items-center justify-center h-full"><Spinner className="w-8 h-8" /></div>;
  if (!pantry) return null;

  return (
    <div className="flex flex-col h-full">
      <header className="sticky top-0 z-10 bg-white border-b">

        {/* Row 1: back | pantry name | hamburger */}
        <div className="px-4 py-3 flex items-center gap-3">
          <a href="/pantries" className="text-green-600 font-medium text-sm min-h-[44px] flex items-center">‹ Back</a>
          <h1 className="text-base font-semibold truncate flex-1">{pantry.display_name}</h1>

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(o => !o)}
              className={`min-h-[44px] min-w-[44px] flex items-center justify-center text-xl rounded-md transition-colors
                ${menuOpen ? 'text-green-600 bg-green-50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
              aria-label="More options"
            >
              ☰
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 min-w-[160px]">
                {menuItems.map(item => (
                  <button
                    key={item.id}
                    onClick={() => { setActive(item.id); setMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-2 text-sm text-left transition-colors min-h-[44px]
                      ${active === item.id ? 'text-green-600 bg-green-50' : 'text-gray-700 hover:bg-gray-50'}`}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Row 2: Stock | Shopping tab selector */}
        <div className="flex border-t">
          {primaryTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 min-h-[44px] text-sm font-medium transition-colors border-b-2
                ${active === tab.id
                  ? 'text-green-600 border-green-600'
                  : 'text-gray-500 border-transparent hover:text-gray-700'}`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

      </header>

      <div key={active} className="flex-1 overflow-auto animate-fade-in animate-duration-fast">
        {active === 'stock'    && <StockTab    pantryId={pantryId} role={pantry.role} />}
        {active === 'shopping' && <ShoppingTab pantryId={pantryId} />}
        {active === 'activity' && <ActivityTab pantryId={pantryId} />}
        {active === 'settings' && <SettingsTab pantryId={pantryId} pantry={pantry} onPantryUpdate={setPantry} />}
      </div>

      <ToastContainer />
    </div>
  );
}
