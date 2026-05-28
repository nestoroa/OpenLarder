import { useState, useEffect } from 'react';
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

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'stock', label: 'Stock', icon: '🥫' },
  { id: 'shopping', label: 'Shopping', icon: '🛒' },
  { id: 'activity', label: 'Activity', icon: '📋' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

export default function PantryTabs({ pantryId }: { pantryId: number }) {
  const [pantry, setPantry] = useState<Pantry | null>(null);
  const [active, setActive] = useState<Tab>('stock');
  const [loading, setLoading] = useState(true);

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

  if (loading) return <div className="flex items-center justify-center h-full"><Spinner className="w-8 h-8" /></div>;
  if (!pantry) return null;

  return (
    <div className="flex flex-col h-full">
      <header className="sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center gap-3">
        <a href="/pantries" className="text-green-600 font-medium text-sm min-h-[44px] flex items-center">‹ Back</a>
        <h1 className="text-base font-semibold truncate flex-1">{pantry.display_name}</h1>
      </header>

      <div className="flex-1 overflow-auto">
        {active === 'stock' && <StockTab pantryId={pantryId} role={pantry.role} />}
        {active === 'shopping' && <ShoppingTab pantryId={pantryId} />}
        {active === 'activity' && <ActivityTab pantryId={pantryId} />}
        {active === 'settings' && <SettingsTab pantryId={pantryId} pantry={pantry} onPantryUpdate={setPantry} />}
      </div>

      <nav className="sticky bottom-0 bg-white border-t flex">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={`flex-1 flex flex-col items-center justify-center py-2 min-h-[56px] text-xs gap-1 transition-colors
              ${active === tab.id ? 'text-green-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <span className="text-lg leading-none">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      <ToastContainer />
    </div>
  );
}
