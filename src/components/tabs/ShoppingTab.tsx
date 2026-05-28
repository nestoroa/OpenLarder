import { useState, useEffect } from 'react';
import { api } from '../../lib/api.js';
import type { ShoppingItem } from '../../lib/types.js';
import { Button } from '../ui/Button.js';
import { Input } from '../ui/Input.js';
import { Spinner } from '../ui/Spinner.js';
import { showToast } from '../ui/Toast.js';
import { syncAddShoppingItem, syncPatchShoppingItem, syncDeleteShoppingItem, syncClearShopping } from '../../lib/sync.js';
import { getCachedShopping } from '../../lib/db.js';

export function ShoppingTab({ pantryId }: { pantryId: number }) {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newItem, setNewItem] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (navigator.onLine) {
      api.getShopping(pantryId)
        .then(setItems)
        .catch(() => showToast('Failed to load shopping list', 'error'))
        .finally(() => setLoading(false));
    } else {
      getCachedShopping(pantryId)
        .then(items => setItems(items as any))
        .finally(() => setLoading(false));
    }
  }, [pantryId]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newItem.trim()) return;
    setAdding(true);
    try {
      await syncAddShoppingItem(pantryId, { custom_name: newItem.trim(), quantity: 1 });
      const updated = await (navigator.onLine ? api.getShopping(pantryId) : getCachedShopping(pantryId));
      setItems(updated as any);
      setNewItem('');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setAdding(false);
    }
  }

  async function toggleCheck(item: ShoppingItem) {
    const newChecked = !item.checked;
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, checked: newChecked } : i));
    try {
      await syncPatchShoppingItem(pantryId, item.id, { checked: newChecked });
    } catch {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, checked: item.checked } : i));
      showToast('Failed to update', 'error');
    }
  }

  async function handleDelete(item: ShoppingItem) {
    setItems(prev => prev.filter(i => i.id !== item.id));
    try {
      await syncDeleteShoppingItem(pantryId, item.id);
    } catch {
      const updated = navigator.onLine ? await api.getShopping(pantryId) : await getCachedShopping(pantryId);
      setItems(updated as any);
      showToast('Failed to remove', 'error');
    }
  }

  async function clearChecked() {
    const checkedIds = items.filter(i => i.checked).map(i => i.id);
    if (!checkedIds.length) return;
    setItems(prev => prev.filter(i => !i.checked));
    try {
      await syncClearShopping(pantryId, checkedIds);
      showToast('Cleared checked items', 'success');
    } catch {
      const updated = navigator.onLine ? await api.getShopping(pantryId) : await getCachedShopping(pantryId);
      setItems(updated as any);
      showToast('Failed to clear', 'error');
    }
  }

  const unchecked = items.filter(i => !i.checked);
  const checked = items.filter(i => i.checked);

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  return (
    <div className="px-4 py-4 space-y-4 pb-4">
      <form onSubmit={handleAdd} className="flex gap-2">
        <Input className="flex-1" placeholder="Add item…" value={newItem} onChange={e => setNewItem(e.target.value)} />
        <Button type="submit" loading={adding} disabled={!newItem.trim()}>Add</Button>
      </form>

      <ul className="space-y-2">
        {unchecked.map(item => (
          <li key={item.id} className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-3 py-2.5 min-h-[44px]">
            <button onClick={() => toggleCheck(item)} className="w-6 h-6 rounded-full border-2 border-gray-300 flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center" />
            <span className="flex-1 text-sm">{item.custom_name ?? item.product?.name}</span>
            {item.quantity > 1 && <span className="text-xs text-gray-400">×{item.quantity}</span>}
            <button onClick={() => handleDelete(item)} className="text-gray-300 hover:text-red-500 min-h-[44px] min-w-[44px] flex items-center justify-center text-sm">✕</button>
          </li>
        ))}
      </ul>

      {checked.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide">Done</h3>
            <button onClick={clearChecked} className="text-xs text-red-500 hover:text-red-700 min-h-[44px] px-2">Clear</button>
          </div>
          <ul className="space-y-2">
            {checked.map(item => (
              <li key={item.id} className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 min-h-[44px] opacity-60">
                <button onClick={() => toggleCheck(item)} className="w-6 h-6 rounded-full bg-green-500 flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center text-white text-xs">✓</button>
                <span className="flex-1 text-sm line-through text-gray-400">{item.custom_name ?? item.product?.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {items.length === 0 && <p className="text-center text-gray-400 text-sm py-8">Shopping list is empty</p>}
    </div>
  );
}
