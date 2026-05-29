import { useState, useEffect, useMemo } from 'react';
import { api } from '../../lib/api.js';
import type { StockItem, StorageSpace } from '../../lib/types.js';
import { Button } from '../ui/Button.js';
import { Input } from '../ui/Input.js';
import { Modal } from '../ui/Modal.js';
import { Spinner } from '../ui/Spinner.js';
import { showToast } from '../ui/Toast.js';
import { syncUpsertStock, syncDeleteStock } from '../../lib/sync.js';
import { getCachedStock, getCachedSpaces, getCachedProductByBarcode } from '../../lib/db.js';
import { BarcodeScanner } from '../BarcodeScanner.js';

export function expiryClass(expiry: string | null): string {
  if (!expiry) return '';
  const days = Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000);
  if (days < 0) return 'border-l-4 border-l-red-500';
  if (days <= 7) return 'border-l-4 border-l-yellow-400';
  return '';
}

function expiryWarning(expiry: string | null): boolean {
  if (!expiry) return false;
  const days = Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000);
  return days <= 7;
}

export function StockTab({ pantryId, role }: { pantryId: number; role: string }) {
  const [stock, setStock] = useState<StockItem[]>([]);
  const [spaces, setSpaces] = useState<StorageSpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState(false);
  const [selectedSpace, setSelectedSpace] = useState<number | null>(null);
  const [productName, setProductName] = useState('');
  const [count, setCount] = useState(1);
  const [expiry, setExpiry] = useState('');
  const [saving, setSaving] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
  const [scannedProductId, setScannedProductId] = useState<number | null>(null);
  const [brand, setBrand] = useState('');
  const [expandedItemId, setExpandedItemId] = useState<number | null>(null);

  useEffect(() => {
    if (navigator.onLine) {
      Promise.all([api.getStock(pantryId), api.getSpaces(pantryId)])
        .then(([s, sp]) => { setStock(s); setSpaces(sp); })
        .catch(() => showToast('Failed to load stock', 'error'))
        .finally(() => setLoading(false));
    } else {
      Promise.all([getCachedStock(pantryId), getCachedSpaces(pantryId)])
        .then(([s, sp]) => { setStock(s as any); setSpaces(sp as any); })
        .finally(() => setLoading(false));
    }
  }, [pantryId]);

  const bySpace = useMemo(() => {
    return spaces.map(space => ({
      space,
      items: stock.filter(s => s.storage_space.id === space.id),
    }));
  }, [spaces, stock]);

  async function adjustCount(item: StockItem, delta: number) {
    const newCount = Math.max(0, item.count + delta);
    setStock(prev => prev.map(s => s.id === item.id ? { ...s, count: newCount } : s));
    try {
      await syncUpsertStock(pantryId, {
        storage_space_id: item.storage_space.id,
        product_id: item.product.id,
        count: newCount,
        expiry_date: item.expiry_date ?? undefined,
      });
    } catch {
      setStock(prev => prev.map(s => s.id === item.id ? { ...s, count: item.count } : s));
      showToast('Failed to update', 'error');
    }
  }

  async function handleAddStock(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSpace) return;
    setSaving(true);
    try {
      const product = scannedProductId
        ? { id: scannedProductId }
        : await api.createProduct({ name: productName, brand: brand || undefined, barcode: scannedBarcode ?? undefined });
      const now = new Date().toISOString();
      await api.upsertStock(pantryId, {
        storage_space_id: selectedSpace,
        product_id: product.id,
        count,
        expiry_date: expiry || undefined,
        updated_at: now,
      });
      const updated = await api.getStock(pantryId);
      setStock(updated);
      setAddModal(false);
      setProductName(''); setBrand(''); setCount(1); setExpiry('');
      setScannedBarcode(null); setScannedProductId(null);
      showToast('Item added', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleScan(barcode: string) {
    setShowScanner(false);
    setScannedProductId(null);
    try {
     const cached = await getCachedProductByBarcode(barcode) as any;
      if (cached) {
        setProductName(cached.name);
        setScannedBarcode(barcode);
        setScannedProductId(cached.id);
        setAddModal(true);
        return;
      }
      const product = await api.lookupBarcode(barcode);
      setProductName(product.name ?? '');
      setScannedBarcode(barcode);
      setScannedProductId(product.id);
      setAddModal(true);
    } catch (err: any) {
      if (err.status === 404) {
        setScannedBarcode(barcode);
        setProductName('');
        setAddModal(true);
      } else {
        showToast('Failed to look up barcode', 'error');
      }
    }
  }

  async function handleDelete(item: StockItem) {
    // Optimistic remove — restore on failure
    setStock(prev => prev.filter(s => s.id !== item.id));
    try {
      await syncDeleteStock(pantryId, item.id);
    } catch {
      setStock(prev => [...prev, item]);
      showToast('Failed to remove', 'error');
    }
  }

  async function handleAddToShopping(item: StockItem) {
    try {
      await api.addShoppingItem(pantryId, { product_id: item.product.id, quantity: 1 });
      showToast(`${item.product.name} added to shopping list`, 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  return (
    <div className="px-4 py-4 space-y-6 pb-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Stock</h2>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowScanner(true)} className="text-sm px-3 py-2">📷 Scan</Button>
          <Button variant="primary" onClick={() => setAddModal(true)} className="text-sm px-3 py-2">+ Add item</Button>
        </div>
      </div>

      {spaces.length === 0 && (
        <p className="text-center text-gray-400 text-sm py-8">No storage spaces yet. Add one in Settings.</p>
      )}

      {bySpace.map(({ space, items }) => (
        <section key={space.id}>
          <h3 className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
            <span>{space.icon}</span> {space.name}
          </h3>
          {items.length === 0 && <p className="text-xs text-gray-400 pl-6">Empty</p>}
          <ul className="space-y-2">
            {items.map(item => {
              const isExpanded = expandedItemId === item.id;
              const hasWarning = expiryWarning(item.expiry_date);
              return (
                <li
                  key={item.id}
                  className={`rounded-xl border bg-white overflow-hidden cursor-pointer ${expiryClass(item.expiry_date)}`}
                  onClick={() => setExpandedItemId(item.id)}
                >
                  {/* Header row — always visible */}
                  <div className="flex items-start justify-between gap-2 p-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm leading-snug">
                        {hasWarning && <span className="mr-1">⚠️</span>}
                        <span className="font-bold">{item.count}</span>
                        <span className="text-gray-500"> x </span>
                        <span className="font-medium">{item.product.name}</span>
                      </div>
                      {item.product.brand && (
                        <div className="text-xs text-gray-400 mt-0.5">{item.product.brand}</div>
                      )}
                    </div>
                    {isExpanded && (
                      <button
                        onClick={e => { e.stopPropagation(); setExpandedItemId(null); }}
                        className="text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px] flex items-center justify-center text-lg leading-none flex-shrink-0 -mt-1 -mr-1"
                        aria-label="Close"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Expanded action row */}
                  {isExpanded && (
                    <div
                      className="border-t border-gray-100 px-3 py-2 flex items-center gap-2"
                      onClick={e => e.stopPropagation()}
                    >
                      <button
                        onClick={() => adjustCount(item, -1)}
                        className="w-9 h-9 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-50 min-h-[44px] min-w-[44px]"
                      >−</button>
                      <span className="w-8 text-center font-semibold text-sm">{item.count}</span>
                      <button
                        onClick={() => adjustCount(item, 1)}
                        className="w-9 h-9 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-50 min-h-[44px] min-w-[44px]"
                      >+</button>
                      <div className="flex-1" />
                      <button
                        onClick={() => handleDelete(item)}
                        className="text-gray-300 hover:text-red-500 min-h-[44px] min-w-[44px] flex items-center justify-center"
                      >🗑</button>
                      <button
                        onClick={() => handleAddToShopping(item)}
                        title="Add to shopping list"
                        className="text-gray-300 hover:text-green-500 min-h-[44px] min-w-[44px] flex items-center justify-center text-sm"
                      >🛒</button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <Modal open={addModal} onClose={() => { setAddModal(false); setProductName(''); setBrand(''); setCount(1); setExpiry(''); setScannedBarcode(null); setScannedProductId(null); }} title="Add Item">
        <form onSubmit={handleAddStock} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Storage space</label>
            <select value={selectedSpace ?? ''} onChange={e => setSelectedSpace(Number(e.target.value))} required
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm min-h-[44px]">
              <option value="">Select space…</option>
              {spaces.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
            </select>
          </div>
          {scannedBarcode && (
            <p className="text-xs text-green-600">Barcode: {scannedBarcode}</p>
          )}
          <Input label="Product name" value={productName} onChange={e => setProductName(e.target.value)} required placeholder="e.g. Oat milk" />
          <Input label="Brand (optional)" value={brand} onChange={e => setBrand(e.target.value)} placeholder="e.g. Carbonell" />
          <Input label="Count" type="number" min={0} value={count} onChange={e => setCount(Number(e.target.value))} required />
          <Input label="Expiry date (optional)" type="date" value={expiry} onChange={e => setExpiry(e.target.value)} />
          <Button type="submit" className="w-full" loading={saving}>Add to stock</Button>
        </form>
      </Modal>

      {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}
    </div>
  );
}
