import { v4 as uuidv4 } from 'uuid';
import { api } from './api.js';
import {
  saveStock, saveShopping, saveSpaces, saveEvents, savePantries, saveProducts,
  enqueue, getPendingQueue, updateQueueEntry, rewriteTempId, purgeErroredEntries,
  getCachedStock, getCachedShopping, type OfflineQueueEntry,
} from './db.js';
import { showToast } from '../components/ui/Toast.js';

export async function fullRefresh(pantryId: number): Promise<void> {
  await purgeErroredEntries();
  const [stock, shopping, spaces, { events }] = await Promise.all([
    api.getStock(pantryId),
    api.getShopping(pantryId),
    api.getSpaces(pantryId),
    api.getEvents(pantryId),
  ]);
  const products = stock.map(s => s.product).filter(Boolean);
  const uniqueProducts = Array.from(new Map(products.map(p => [(p as any).id, p])).values());
  await Promise.all([
    saveStock(pantryId, stock),
    saveShopping(pantryId, shopping),
    saveSpaces(pantryId, spaces),
    saveEvents(pantryId, events),
    saveProducts(uniqueProducts),
  ]);
}

export async function refreshAllPantries(): Promise<void> {
  const pantries = await api.getPantries();
  await savePantries(pantries);
  await Promise.all(pantries.map(p => fullRefresh(p.id)));
}

function isOnline(): boolean { return navigator.onLine; }

export async function syncUpsertStock(
  pantryId: number,
  payload: { storage_space_id: number; product_id: number; count: number; expiry_date?: string }
): Promise<void> {
  const updated_at = new Date().toISOString();
  const body = { ...payload, updated_at };
  if (isOnline()) {
    await api.upsertStock(pantryId, body);
    const stock = await api.getStock(pantryId);
    await saveStock(pantryId, stock);
  } else {
    const cached = await getCachedStock(pantryId);
    const existing = cached.find(s =>
      s.storage_space.id === payload.storage_space_id && s.product.id === payload.product_id
    );
    if (existing) {
      await saveStock(pantryId, cached.map(s =>
        s.id === existing.id ? { ...s, count: payload.count, expiry_date: payload.expiry_date ?? null, updated_at } : s
      ));
    }
    await enqueue({ id: uuidv4(), operation: 'upsert_stock', payload: { pantry_id: pantryId, ...body }, local_timestamp: updated_at });
  }
}

export async function syncDeleteStock(pantryId: number, itemId: number): Promise<void> {
  if (isOnline()) {
    await api.deleteStock(pantryId, itemId);
  } else {
    const cached = await getCachedStock(pantryId);
    await saveStock(pantryId, cached.filter(s => s.id !== itemId));
    await enqueue({ id: uuidv4(), operation: 'delete_stock', payload: { pantry_id: pantryId, item_id: itemId }, local_timestamp: new Date().toISOString() });
  }
}

export async function syncAddShoppingItem(
  pantryId: number,
  body: { custom_name?: string; product_id?: number; quantity: number }
): Promise<void> {
  const updated_at = new Date().toISOString();
  if (isOnline()) {
    await api.addShoppingItem(pantryId, body);
    const shopping = await api.getShopping(pantryId);
    await saveShopping(pantryId, shopping);
  } else {
    const localId = uuidv4();
    const cached = await getCachedShopping(pantryId);
    const tempItem = { id: localId as any, pantry_id: pantryId, quantity: body.quantity, checked: false, checked_at: null, added_at: updated_at, updated_at, custom_name: body.custom_name ?? null, product: null };
    await saveShopping(pantryId, [...cached, tempItem as any]);
    await enqueue({ id: uuidv4(), operation: 'add_shopping_item', payload: { pantry_id: pantryId, ...body }, local_timestamp: updated_at, local_item_id: localId });
  }
}

export async function syncPatchShoppingItem(
  pantryId: number,
  itemId: number | string,
  body: { checked?: boolean; quantity?: number }
): Promise<void> {
  const updated_at = new Date().toISOString();
  const fullBody = { ...body, updated_at };
  if (isOnline() && typeof itemId === 'number') {
    await api.patchShoppingItem(pantryId, itemId, fullBody);
    const shopping = await api.getShopping(pantryId);
    await saveShopping(pantryId, shopping);
  } else {
    const cached = await getCachedShopping(pantryId);
    await saveShopping(pantryId, cached.map(i => i.id == itemId ? { ...i, ...body, updated_at } : i));
    await enqueue({ id: uuidv4(), operation: 'patch_shopping_item', payload: { pantry_id: pantryId, item_id: itemId, ...fullBody }, local_timestamp: updated_at, local_item_id: typeof itemId === 'string' ? itemId : undefined });
  }
}

export async function syncDeleteShoppingItem(pantryId: number, itemId: number | string): Promise<void> {
  if (isOnline() && typeof itemId === 'number') {
    await api.deleteShoppingItem(pantryId, itemId);
  } else {
    const cached = await getCachedShopping(pantryId);
    await saveShopping(pantryId, cached.filter(i => i.id != itemId));
    await enqueue({ id: uuidv4(), operation: 'delete_shopping_item', payload: { pantry_id: pantryId, item_id: itemId }, local_timestamp: new Date().toISOString(), local_item_id: typeof itemId === 'string' ? itemId : undefined });
  }
}

export async function syncClearShopping(pantryId: number, itemIds: (number | string)[]): Promise<void> {
  if (isOnline()) {
    const numericIds = itemIds.filter((id): id is number => typeof id === 'number');
    await api.clearShopping(pantryId, numericIds);
    const shopping = await api.getShopping(pantryId);
    await saveShopping(pantryId, shopping);
  } else {
    const cached = await getCachedShopping(pantryId);
    await saveShopping(pantryId, cached.filter(i => !itemIds.includes(i.id as any)));
    await enqueue({ id: uuidv4(), operation: 'clear_shopping_list', payload: { pantry_id: pantryId, item_ids: itemIds }, local_timestamp: new Date().toISOString() });
  }
}

export async function drainQueue(): Promise<void> {
  const queue = await getPendingQueue();
  if (!queue.length) return;
  let hadErrors = false;
  const idMap = new Map<string, number>();

  for (const entry of queue) {
    const resolvedEntry = applyIdMap(entry, idMap);
    try {
      await processQueueEntry(resolvedEntry, idMap);
      await updateQueueEntry(entry.id, 'synced');
    } catch (err: any) {
      hadErrors = true;
      const is4xx = err.status >= 400 && err.status < 500;
      await updateQueueEntry(entry.id, is4xx ? 'discarded' : 'error');
    }
  }

  if (hadErrors) showToast("Some changes couldn't be synced", 'error');

  const pantryIds = [...new Set(queue.map(e => (e.payload as any).pantry_id as number))];
  await Promise.all(pantryIds.map(id => fullRefresh(id)));
}

function applyIdMap(entry: OfflineQueueEntry, idMap: Map<string, number>): OfflineQueueEntry {
  if (!idMap.size) return entry;
  const payload = { ...entry.payload } as any;
  if (typeof payload.item_id === 'string' && idMap.has(payload.item_id)) payload.item_id = idMap.get(payload.item_id);
  if (Array.isArray(payload.item_ids)) {
    payload.item_ids = payload.item_ids.map((id: string | number) =>
      typeof id === 'string' && idMap.has(id) ? idMap.get(id)! : id
    );
  }
  return { ...entry, payload };
}

async function processQueueEntry(entry: OfflineQueueEntry, idMap: Map<string, number>): Promise<void> {
  const p = entry.payload as any;
  switch (entry.operation) {
    case 'upsert_stock': await api.upsertStock(p.pantry_id, p); break;
    case 'delete_stock': await api.deleteStock(p.pantry_id, p.item_id); break;
    case 'add_shopping_item': {
      const result = await api.addShoppingItem(p.pantry_id, p) as any;
      if (entry.local_item_id) {
        idMap.set(entry.local_item_id, result.id);
        await rewriteTempId(entry.local_item_id, result.id);
      }
      break;
    }
    case 'patch_shopping_item': await api.patchShoppingItem(p.pantry_id, p.item_id, p); break;
    case 'delete_shopping_item': await api.deleteShoppingItem(p.pantry_id, p.item_id); break;
    case 'clear_shopping_list': {
      const numericIds = (p.item_ids as (number | string)[]).filter((id): id is number => typeof id === 'number');
      await api.clearShopping(p.pantry_id, numericIds);
      break;
    }
  }
}

export function registerSyncListener(): () => void {
  const handler = async () => {
    console.log('[sync] Online — draining queue');
    await drainQueue();
  };
  window.addEventListener('online', handler);
  return () => window.removeEventListener('online', handler);
}
