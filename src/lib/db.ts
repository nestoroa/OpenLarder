import { openDB, type IDBPDatabase } from 'idb';
import type { StockItem, ShoppingItem, PantryEvent, Pantry, StorageSpace } from './types.js';

export interface OfflineQueueEntry {
  id: string;
  operation: 'upsert_stock' | 'delete_stock' | 'add_shopping_item' | 'patch_shopping_item' | 'delete_shopping_item' | 'clear_shopping_list';
  payload: Record<string, unknown>;
  local_timestamp: string;
  status: 'pending' | 'synced' | 'error' | 'discarded';
  local_item_id?: string;
}

const DB_NAME = 'openlarder';
const DB_VERSION = 1;

let _db: IDBPDatabase | null = null;

export async function getIdb(): Promise<IDBPDatabase> {
  if (_db) return _db;
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('pantries', { keyPath: 'id' });
      db.createObjectStore('storage_spaces', { keyPath: 'id' });
      db.createObjectStore('products', { keyPath: 'id' });
      const stockStore = db.createObjectStore('stock_items', { keyPath: 'id' });
      stockStore.createIndex('by_pantry', 'pantry_id');
      const shoppingStore = db.createObjectStore('shopping_items', { keyPath: 'id' });
      shoppingStore.createIndex('by_pantry', 'pantry_id');
      const eventsStore = db.createObjectStore('pantry_events', { keyPath: 'id' });
      eventsStore.createIndex('by_pantry', 'pantry_id');
      db.createObjectStore('offline_queue', { keyPath: 'id' });
    },
  });
  return _db;
}

export async function savePantries(pantries: Pantry[]) {
  const db = await getIdb();
  const tx = db.transaction('pantries', 'readwrite');
  await Promise.all([...pantries.map(p => tx.store.put(p)), tx.done]);
}

export async function getCachedPantries(): Promise<Pantry[]> {
  const db = await getIdb();
  return db.getAll('pantries');
}

export async function saveProducts(products: object[]) {
  const db = await getIdb();
  const tx = db.transaction('products', 'readwrite');
  await Promise.all([...(products as any[]).map(p => tx.store.put(p)), tx.done]);
}

export async function getCachedProductByBarcode(barcode: string): Promise<object | null> {
  const db = await getIdb();
  const all = await db.getAll('products') as any[];
  return all.find(p => p.barcode === barcode) ?? null;
}

export async function saveStock(pantryId: number, items: StockItem[]) {
  const db = await getIdb();
  const tx = db.transaction('stock_items', 'readwrite');
  const existing = await tx.store.index('by_pantry').getAllKeys(pantryId);
  await Promise.all(existing.map(k => tx.store.delete(k)));
  await Promise.all([...items.map(i => tx.store.put({ ...i, pantry_id: pantryId })), tx.done]);
}

export async function getCachedStock(pantryId: number): Promise<StockItem[]> {
  const db = await getIdb();
  return db.getAllFromIndex('stock_items', 'by_pantry', pantryId);
}

export async function saveShopping(pantryId: number, items: ShoppingItem[]) {
  const db = await getIdb();
  const tx = db.transaction('shopping_items', 'readwrite');
  const existing = await tx.store.index('by_pantry').getAllKeys(pantryId);
  await Promise.all(existing.map(k => tx.store.delete(k)));
  await Promise.all([...items.map(i => tx.store.put({ ...i, pantry_id: pantryId })), tx.done]);
}

export async function getCachedShopping(pantryId: number): Promise<ShoppingItem[]> {
  const db = await getIdb();
  return db.getAllFromIndex('shopping_items', 'by_pantry', pantryId);
}

export async function saveEvents(pantryId: number, events: PantryEvent[]) {
  const db = await getIdb();
  const tx = db.transaction('pantry_events', 'readwrite');
  await Promise.all([...events.map(e => tx.store.put({ ...e, pantry_id: pantryId })), tx.done]);
}

export async function getCachedEvents(pantryId: number): Promise<PantryEvent[]> {
  const db = await getIdb();
  return db.getAllFromIndex('pantry_events', 'by_pantry', pantryId);
}

export async function saveSpaces(pantryId: number, spaces: StorageSpace[]) {
  const db = await getIdb();
  const tx = db.transaction('storage_spaces', 'readwrite');
  await Promise.all([...spaces.map(s => tx.store.put(s)), tx.done]);
}

export async function getCachedSpaces(pantryId: number): Promise<StorageSpace[]> {
  const db = await getIdb();
  const all = await db.getAll('storage_spaces');
  return all.filter(s => s.pantry_id === pantryId);
}

export async function enqueue(entry: Omit<OfflineQueueEntry, 'status'>): Promise<void> {
  const db = await getIdb();
  await db.put('offline_queue', { ...entry, status: 'pending' });
}

export async function getPendingQueue(): Promise<OfflineQueueEntry[]> {
  const db = await getIdb();
  const all = await db.getAll('offline_queue') as OfflineQueueEntry[];
  return all.filter(e => e.status === 'pending' || e.status === 'error').sort(
    (a, b) => a.local_timestamp.localeCompare(b.local_timestamp)
  );
}

export async function updateQueueEntry(id: string, status: OfflineQueueEntry['status']): Promise<void> {
  const db = await getIdb();
  const entry = await db.get('offline_queue', id) as OfflineQueueEntry | undefined;
  if (entry) await db.put('offline_queue', { ...entry, status });
}

export async function rewriteTempId(localId: string, serverId: number): Promise<void> {
  const db = await getIdb();
  const all = await db.getAll('offline_queue') as OfflineQueueEntry[];
  for (const entry of all) {
    if (entry.status !== 'pending') continue;
    let changed = false;
    const payload = { ...entry.payload };
    if (payload.item_id === localId) { payload.item_id = serverId; changed = true; }
    if (Array.isArray(payload.item_ids)) {
      const newIds = (payload.item_ids as (string | number)[]).map(id => id === localId ? serverId : id);
      if (newIds.some((id, i) => id !== (payload.item_ids as any[])[i])) {
        payload.item_ids = newIds;
        changed = true;
      }
    }
    if (changed) await db.put('offline_queue', { ...entry, payload });
  }
}

export async function purgeErroredEntries(): Promise<void> {
  const db = await getIdb();
  const all = await db.getAll('offline_queue') as OfflineQueueEntry[];
  for (const entry of all) {
    if (entry.status === 'discarded' || entry.status === 'error') {
      await db.delete('offline_queue', entry.id);
    }
  }
}
