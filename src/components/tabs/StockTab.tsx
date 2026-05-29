import { useState, useEffect, useMemo, useRef } from 'react';
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

const ADMIN_EMAIL = 'nestor.j.o.a@gmail.com';

// ── Sort / group types ────────────────────────────────────────────────────────

export type SortOption =
  | 'expiry-asc' | 'expiry-desc'
  | 'name-asc'   | 'name-desc'
  | 'brand-asc'  | 'brand-desc';

export type GroupField = 'space' | 'none' | 'expiry';

export type Group = { key: string; label: string; icon?: string; items: StockItem[] };

const EXPIRY_BUCKETS = ['Expired', 'This week', 'This month', 'Later', 'No expiry'] as const;

// ── Pure helpers (exported for tests) ────────────────────────────────────────

export function getExpiryBucket(expiry_date: string | null): string {
  if (!expiry_date) return 'No expiry';
  const diffMs = new Date(expiry_date).getTime() - Date.now();
  const diff = Math.ceil(diffMs / 86400000);
  if (diff < 0) return 'Expired';
  if (diff <= 7) return 'This week';
  if (diff <= 30) return 'This month';
  return 'Later';
}

export function sortItems(items: StockItem[], sortOpt: SortOption): StockItem[] {
  const lastDash = sortOpt.lastIndexOf('-');
  const field = sortOpt.slice(0, lastDash);
  const dir = sortOpt.slice(lastDash + 1) as 'asc' | 'desc';
  return [...items].sort((a, b) => {
    let cmp = 0;
    if (field === 'name') {
      cmp = a.product.name.localeCompare(b.product.name);
    } else if (field === 'brand') {
      const ba = a.product.brand ?? '';
      const bb = b.product.brand ?? '';
      if (!ba && bb) return 1;
      if (ba && !bb) return -1;
      cmp = ba.localeCompare(bb);
    } else if (field === 'expiry') {
      const ea = a.expiry_date;
      const eb = b.expiry_date;
      if (!ea && eb) return 1;
      if (ea && !eb) return -1;
      if (!ea && !eb) return 0;
      cmp = ea! < eb! ? -1 : ea! > eb! ? 1 : 0;
    }
    return dir === 'asc' ? cmp : -cmp;
  });
}

export function groupItems(items: StockItem[], groupBy: GroupField, spaces: StorageSpace[]): Group[] {
  if (groupBy === 'none') {
    return [{ key: 'all', label: '', items }];
  }
  if (groupBy === 'space') {
    return spaces
      .map(space => ({
        key: String(space.id),
        label: space.name,
        icon: space.icon,
        items: items.filter(i => i.storage_space.id === space.id),
      }))
      .filter(g => g.items.length > 0);
  }
  // expiry range
  const buckets: Record<string, StockItem[]> = {};
  for (const item of items) {
    const b = getExpiryBucket(item.expiry_date);
    if (!buckets[b]) buckets[b] = [];
    buckets[b].push(item);
  }
  return EXPIRY_BUCKETS
    .filter(b => buckets[b]?.length)
    .map(b => ({ key: b, label: b, items: buckets[b] }));
}

export function filterItems(
  items: StockItem[],
  query: string,
  spaceId: number | null,
  expiryBucket: string | null,
  zeroStockOnly: boolean,
): StockItem[] {
  const q = query.trim().toLowerCase();
  return items.filter(item => {
    if (q) {
      const name  = item.product.name.toLowerCase();
      const brand = (item.product.brand ?? '').toLowerCase();
      if (!name.includes(q) && !brand.includes(q)) return false;
    }
    if (spaceId !== null && item.storage_space.id !== spaceId) return false;
    if (expiryBucket !== null && getExpiryBucket(item.expiry_date) !== expiryBucket) return false;
    if (zeroStockOnly && item.count !== 0) return false;
    return true;
  });
}

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

function expiryDays(expiry: string | null): number | null {
  if (!expiry) return null;
  return Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000);
}

function expiryText(expiry: string | null): string | null {
  const days = expiryDays(expiry);
  if (days === null) return null;
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return 'Expires today';
  if (days <= 7) return `Expires in ${days}d`;
  return null;
}

function expiryDateLabel(expiry: string | null): string | null {
  if (!expiry) return null;
  return new Date(expiry).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function StockTab({ pantryId, role }: { pantryId: number; role: string }) {
  const [stock, setStock] = useState<StockItem[]>([]);
  const [spaces, setSpaces] = useState<StorageSpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Add item modal
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

  // Expand/collapse
  const [expandedItemId, setExpandedItemId] = useState<number | null>(null);
  const [closingItemId, setClosingItemId] = useState<number | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Edit modal
  const [editItem, setEditItem] = useState<StockItem | null>(null);
  const [editScope, setEditScope] = useState<'local' | 'global'>('local');
  const [editName, setEditName] = useState('');
  const [editBrand, setEditBrand] = useState('');
  const [editBarcode, setEditBarcode] = useState('');
  const [editCount, setEditCount] = useState(1);
  const [editExpiry, setEditExpiry] = useState('');
  const [editSpaceId, setEditSpaceId] = useState<number | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // Sort / group — persisted across tab switches via localStorage
  const VALID_GROUP: GroupField[] = ['space', 'none', 'expiry'];
  const VALID_SORT: SortOption[] = [
    'expiry-asc', 'expiry-desc', 'name-asc', 'name-desc', 'brand-asc', 'brand-desc',
  ];
  const [groupBy, setGroupBy] = useState<GroupField>(() => {
    const v = localStorage.getItem('openlarder:stock:groupBy');
    return VALID_GROUP.includes(v as GroupField) ? (v as GroupField) : 'space';
  });
  const [sortOpt, setSortOpt] = useState<SortOption>(() => {
    const v = localStorage.getItem('openlarder:stock:sortOpt');
    return VALID_SORT.includes(v as SortOption) ? (v as SortOption) : 'expiry-asc';
  });

  // Search / filter — ephemeral, not persisted
  const [searchQuery,    setSearchQuery]    = useState('');
  const [filterSpace,    setFilterSpace]    = useState<number | null>(null);
  const [filterExpiry,   setFilterExpiry]   = useState<string | null>(null);
  const [filterZeroStock, setFilterZeroStock] = useState(false);

  // Panel visibility — ephemeral
  const [showSearch,        setShowSearch]        = useState(false);
  const [showControls,      setShowControls]      = useState(false);
  const [isSearchClosing,   setIsSearchClosing]   = useState(false);
  const [isControlsClosing, setIsControlsClosing] = useState(false);

  useEffect(() => { localStorage.setItem('openlarder:stock:groupBy', groupBy); }, [groupBy]);
  useEffect(() => { localStorage.setItem('openlarder:stock:sortOpt', sortOpt); }, [sortOpt]);

  useEffect(() => {
    const stockLoad = navigator.onLine
      ? Promise.all([api.getStock(pantryId), api.getSpaces(pantryId)])
          .then(([s, sp]) => { setStock(s); setSpaces(sp); })
          .catch(() => showToast('Failed to load stock', 'error'))
      : Promise.all([getCachedStock(pantryId), getCachedSpaces(pantryId)])
          .then(([s, sp]) => { setStock(s as any); setSpaces(sp as any); });

    stockLoad.finally(() => setLoading(false));

    api.getMe()
      .then(me => setIsAdmin(me.email === ADMIN_EMAIL))
      .catch(() => {});
  }, [pantryId]);

  function closeExpanded() {
    if (expandedItemId === null) return;
    const id = expandedItemId;
    setExpandedItemId(null);
    setClosingItemId(id);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setClosingItemId(null), 180);
  }

  function openItem(id: number) {
    if (expandedItemId === id) return;
    // Animate out the previously open item
    if (expandedItemId !== null) {
      const prev = expandedItemId;
      setClosingItemId(prev);
      if (closeTimer.current) clearTimeout(closeTimer.current);
      closeTimer.current = setTimeout(() => setClosingItemId(null), 180);
    }
    setExpandedItemId(id);
  }

  const filteredItems = useMemo(
    () => filterItems(stock, searchQuery, filterSpace, filterExpiry, filterZeroStock),
    [stock, searchQuery, filterSpace, filterExpiry, filterZeroStock],
  );
  const sortedItems = useMemo(() => sortItems(filteredItems, sortOpt), [filteredItems, sortOpt]);
  const groups = useMemo(() => groupItems(sortedItems, groupBy, spaces), [sortedItems, groupBy, spaces]);

  const isFiltered = searchQuery.trim() !== '' || filterSpace !== null || filterExpiry !== null || filterZeroStock;
  const hasActiveControls = groupBy !== 'space' || sortOpt !== 'expiry-asc' || filterSpace !== null || filterExpiry !== null || filterZeroStock;

  function clearFilters() {
    setSearchQuery('');
    setFilterSpace(null);
    setFilterExpiry(null);
    setFilterZeroStock(false);
  }

  function toggleSearch() {
    if (showSearch) {
      setIsSearchClosing(true);
      setTimeout(() => { setShowSearch(false); setIsSearchClosing(false); }, 180);
    } else {
      setShowSearch(true);
    }
  }

  function toggleControls() {
    if (showControls) {
      setIsControlsClosing(true);
      setTimeout(() => { setShowControls(false); setIsControlsClosing(false); }, 180);
    } else {
      setShowControls(true);
    }
  }

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

  function openEdit(item: StockItem) {
    setEditItem(item);
    setEditScope('local');
    setEditName(item.product.local_name ?? item.product.global_name);
    setEditBrand(item.product.local_brand ?? item.product.global_brand ?? '');
    setEditBarcode(item.product.barcode ?? '');
    setEditCount(item.count);
    setEditExpiry(item.expiry_date ?? '');
    setEditSpaceId(item.storage_space.id);
  }

  function closeEdit() {
    setEditItem(null);
    setEditScope('local');
  }

  function handleScopeToggle(scope: 'local' | 'global') {
    if (!editItem) return;
    setEditScope(scope);
    if (scope === 'local') {
      setEditName(editItem.product.local_name ?? editItem.product.global_name);
      setEditBrand(editItem.product.local_brand ?? editItem.product.global_brand ?? '');
    } else {
      setEditName(editItem.product.global_name);
      setEditBrand(editItem.product.global_brand ?? '');
      setEditBarcode(editItem.product.barcode ?? '');
    }
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editItem || !editSpaceId) return;
    setEditSaving(true);
    try {
      const now = new Date().toISOString();
      const spaceChanged = editSpaceId !== editItem.storage_space.id;

      // Stock fields: if space changed, delete old + create new; else upsert in place
      if (spaceChanged) {
        await syncDeleteStock(pantryId, editItem.id);
        await syncUpsertStock(pantryId, {
          storage_space_id: editSpaceId,
          product_id: editItem.product.id,
          count: editCount,
          expiry_date: editExpiry || undefined,
        });
      } else {
        await syncUpsertStock(pantryId, {
          storage_space_id: editItem.storage_space.id,
          product_id: editItem.product.id,
          count: editCount,
          expiry_date: editExpiry || undefined,
        });
      }

      // Product fields
      if (editScope === 'local') {
        await api.upsertLocalProduct(pantryId, editItem.product.id, {
          local_name: editName.trim() || null,
          local_brand: editBrand.trim() || null,
        });
      } else {
        await api.updateProduct(editItem.product.id, {
          name: editName.trim(),
          brand: editBrand.trim() || null,
          barcode: editBarcode.trim() || null,
        });
      }

      const updated = await api.getStock(pantryId);
      setStock(updated);
      closeEdit();
      showToast('Item updated', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setEditSaving(false);
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  return (
    <div className="px-4 py-4 space-y-6 pb-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Stock</h2>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Toggle search"
            aria-pressed={showSearch}
            onClick={toggleSearch}
            className={`rounded-xl border px-3 py-2 text-sm min-h-[44px] min-w-[44px] transition-colors ${
              showSearch || searchQuery.trim() !== ''
                ? 'border-gray-800 bg-gray-800 text-white'
                : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
            }`}
          >🔍</button>
          <button
            type="button"
            aria-label="Toggle sort and filter"
            aria-pressed={showControls}
            onClick={toggleControls}
            className={`rounded-xl border px-3 py-2 text-sm min-h-[44px] min-w-[44px] transition-colors ${
              showControls || hasActiveControls
                ? 'border-gray-800 bg-gray-800 text-white'
                : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="4" y1="6" x2="20" y2="6"/><circle cx="8" cy="6" r="2" fill="currentColor" stroke="none"/>
              <line x1="4" y1="12" x2="20" y2="12"/><circle cx="14" cy="12" r="2" fill="currentColor" stroke="none"/>
              <line x1="4" y1="18" x2="20" y2="18"/><circle cx="10" cy="18" r="2" fill="currentColor" stroke="none"/>
            </svg>
          </button>
          <Button variant="secondary" onClick={() => setShowScanner(true)} className="text-sm px-3 py-2">📷 Scan</Button>
          <Button variant="primary" onClick={() => setAddModal(true)} className="text-sm px-3 py-2">+ Add item</Button>
        </div>
      </div>

      {/* Search panel */}
      {(showSearch || isSearchClosing) && (
        <div className={`overflow-hidden transition-[max-height] ease-out duration-[180ms] ${isSearchClosing ? 'max-h-0' : 'max-h-20'}`}>
          <div className={`animate-duration-fast animate-fill-mode-forwards ${isSearchClosing ? 'animate-fade-out' : 'animate-fade-in-down'}`}>
            <Input
              aria-label="Search items"
              placeholder="Search by name or brand…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Controls panel: group / sort / filter */}
      {(showControls || isControlsClosing) && (
        <div className={`overflow-hidden transition-[max-height] ease-out duration-[180ms] ${isControlsClosing ? 'max-h-0' : 'max-h-56'}`}>
          <div className={`space-y-3 animate-duration-fast animate-fill-mode-forwards ${isControlsClosing ? 'animate-fade-out' : 'animate-fade-in-down'}`}>
            {/* Group by / Sort by */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-gray-400 mb-1">Group by</label>
                <select
                  value={groupBy}
                  onChange={e => setGroupBy(e.target.value as GroupField)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white min-h-[44px]"
                >
                  <option value="space">Storage space</option>
                  <option value="none">Flat list</option>
                  <option value="expiry">Expiry range</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-400 mb-1">Sort by</label>
                <select
                  value={sortOpt}
                  onChange={e => setSortOpt(e.target.value as SortOption)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white min-h-[44px]"
                >
                  <option value="expiry-asc">Expiry: soonest first</option>
                  <option value="expiry-desc">Expiry: latest first</option>
                  <option value="name-asc">Name: A → Z</option>
                  <option value="name-desc">Name: Z → A</option>
                  <option value="brand-asc">Brand: A → Z</option>
                  <option value="brand-desc">Brand: Z → A</option>
                </select>
              </div>
            </div>

            {/* Filter row */}
            <div className="flex gap-2 items-center">
              <select
                aria-label="Filter by space"
                value={filterSpace ?? ''}
                onChange={e => setFilterSpace(e.target.value === '' ? null : Number(e.target.value))}
                className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white min-h-[44px]"
              >
                <option value="">All spaces</option>
                {spaces.map(s => (
                  <option key={s.id} value={s.id}>{s.icon} {s.name}</option>
                ))}
              </select>

              <select
                aria-label="Filter by expiry"
                value={filterExpiry ?? ''}
                onChange={e => setFilterExpiry(e.target.value === '' ? null : e.target.value)}
                className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white min-h-[44px]"
              >
                <option value="">All expiry</option>
                {EXPIRY_BUCKETS.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>

              <button
                type="button"
                aria-pressed={filterZeroStock}
                onClick={() => setFilterZeroStock(v => !v)}
                className={`rounded-xl border px-3 py-2 text-sm min-h-[44px] whitespace-nowrap transition-colors ${
                  filterZeroStock
                    ? 'border-gray-800 bg-gray-800 text-white'
                    : 'border-gray-200 bg-white text-gray-500'
                }`}
              >
                Out of stock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active filter indicator — always visible when any filter is on */}
      {isFiltered && (
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>Showing {filteredItems.length} of {stock.length} items</span>
          <button
            type="button"
            onClick={clearFilters}
            className="text-blue-500 hover:text-blue-600 font-medium min-h-[44px] flex items-center"
          >
            Clear filters
          </button>
        </div>
      )}

      {spaces.length === 0 && (
        <p className="text-center text-gray-400 text-sm py-8">No storage spaces yet. Add one in Settings.</p>
      )}

      {isFiltered && filteredItems.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-gray-400 text-sm">No items match your filters.</p>
          <button
            type="button"
            onClick={clearFilters}
            className="text-blue-500 hover:text-blue-600 text-sm font-medium"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <>
          {groups.map(({ key, label, icon, items }) => (
            <section key={key}>
              {label && (
                <h3 className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  {icon && <span>{icon}</span>} {label}
                </h3>
              )}
              {items.length === 0 && <p className="text-xs text-gray-400 pl-6">Empty</p>}
              <ul className="space-y-2">
                {items.map(item => {
                  const isExpanded = expandedItemId === item.id;
                  const isClosing = closingItemId === item.id;
                  const hasWarning = expiryWarning(item.expiry_date);
                  return (
                    <li
                      key={item.id}
                      className={`rounded-xl border bg-white overflow-hidden cursor-pointer ${expiryClass(item.expiry_date)}`}
                      onClick={() => openItem(item.id)}
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
                          {(item.product.brand || expiryText(item.expiry_date)) && (
                            <div className="flex justify-between items-center mt-0.5">
                              <span className="text-xs text-gray-400">{item.product.brand ?? ''}</span>
                              {expiryText(item.expiry_date) && (
                                <span className={`text-xs font-medium ml-2 ${(expiryDays(item.expiry_date) ?? 0) < 0 ? 'text-red-500' : 'text-yellow-600'}`}>
                                  {expiryText(item.expiry_date)}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        {isExpanded && (
                          <button
                            onClick={e => { e.stopPropagation(); closeExpanded(); }}
                            className="text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px] flex items-center justify-center text-lg leading-none flex-shrink-0 -mt-1 -mr-1 animate-fade-in animate-duration-fast"
                            aria-label="Close"
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      {/* Expanded action row — outer div animates height, inner div animates opacity */}
                      {(isExpanded || isClosing) && (
                        <div
                          className={`overflow-hidden transition-[max-height] ease-out duration-[180ms] ${isClosing ? 'max-h-0' : 'max-h-20'}`}
                        >
                        <div
                          className={`border-t border-gray-100 px-3 py-2 flex items-center gap-2 animate-duration-fast animate-fill-mode-forwards ${isClosing ? 'animate-fade-out' : 'animate-fade-in-down'}`}
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
                          {expiryDateLabel(item.expiry_date) && (
                            <span className={`text-xs font-medium ${(expiryDays(item.expiry_date) ?? 0) < 0 ? 'text-red-500' : 'text-yellow-600'}`}>
                              {expiryDateLabel(item.expiry_date)}
                            </span>
                          )}
                          <button
                            onClick={() => openEdit(item)}
                            title="Edit item"
                            className="text-gray-300 hover:text-blue-500 min-h-[44px] min-w-[44px] flex items-center justify-center text-sm"
                          >✏️</button>
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
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </>
      )}

      {/* Add Item modal */}
      <Modal open={addModal} onClose={() => { setAddModal(false); setProductName(''); setBrand(''); setCount(1); setExpiry(''); setScannedBarcode(null); setScannedProductId(null); }} title="Add Item"
        footer={<Button form="add-item-form" type="submit" className="w-full" loading={saving}>Add to stock</Button>}
      >
        <form id="add-item-form" onSubmit={handleAddStock} className="space-y-4">
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
        </form>
      </Modal>

      {/* Edit Item modal */}
      <Modal open={!!editItem} onClose={closeEdit} title="Edit Item"
        footer={<Button form="edit-item-form" type="submit" className="w-full" loading={editSaving}>Save</Button>}
      >
        <form id="edit-item-form" onSubmit={handleEditSave} className="space-y-4">

          {/* Local / Global scope toggle — admin only */}
          {isAdmin && (
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
              <button
                type="button"
                onClick={() => handleScopeToggle('local')}
                className={`flex-1 py-2 font-medium transition-colors ${editScope === 'local' ? 'bg-gray-800 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
              >
                Local
              </button>
              <button
                type="button"
                onClick={() => handleScopeToggle('global')}
                className={`flex-1 py-2 font-medium transition-colors ${editScope === 'global' ? 'bg-gray-800 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
              >
                Global
              </button>
            </div>
          )}

          {/* Product fields */}
          <Input
            label={editScope === 'local' ? 'Local name' : 'Global name'}
            value={editName}
            onChange={e => setEditName(e.target.value)}
            required
            placeholder="Product name"
          />
          <Input
            label={editScope === 'local' ? 'Local brand (optional)' : 'Global brand (optional)'}
            value={editBrand}
            onChange={e => setEditBrand(e.target.value)}
            placeholder="Brand"
          />
          {editScope === 'global' && (
            <Input
              label="Barcode"
              value={editBarcode}
              onChange={e => setEditBarcode(e.target.value)}
              placeholder="e.g. 8410051001234"
            />
          )}

          {/* Divider */}
          <hr className="border-gray-100" />

          {/* Stock fields */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Storage space</label>
            <select
              value={editSpaceId ?? ''}
              onChange={e => setEditSpaceId(Number(e.target.value))}
              required
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm min-h-[44px]"
            >
              <option value="">Select space…</option>
              {spaces.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
            </select>
          </div>
          <Input
            label="Count"
            type="number"
            min={0}
            value={editCount}
            onChange={e => setEditCount(Number(e.target.value))}
            required
          />
          <Input
            label="Expiry date (optional)"
            type="date"
            value={editExpiry}
            onChange={e => setEditExpiry(e.target.value)}
          />

        </form>
      </Modal>

      {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}
    </div>
  );
}
