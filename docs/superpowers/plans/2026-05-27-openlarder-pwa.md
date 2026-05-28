# OpenLarder PWA + Offline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full PWA capabilities to OpenLarder: barcode scanning, IndexedDB local storage, offline sync engine (with temp ID rewriting), and Workbox service worker.

**Architecture:** A sync engine (`src/lib/sync.ts`) wraps all API calls — online calls go straight through; offline calls write to IndexedDB + enqueue in `offline_queue`. On reconnect, the queue drains in timestamp order with temp ID rewriting for offline-added shopping items. `vite-plugin-pwa` generates the Workbox service worker at build time.

**Tech Stack:** `idb` (IndexedDB), `@zxing/library` (camera barcode scan), `vite-plugin-pwa` + Workbox, Vitest.

**Prerequisite:** Plans A and B must be complete. The app must build and run with working frontend and backend.

**Spec:** `docs/superpowers/specs/2026-05-27-openlarder-design.md`

---

## File Map

```
src/lib/
├── db.ts              # IndexedDB setup and store access (via `idb`)
├── sync.ts            # Sync engine: online passthrough + offline queue + drain
└── barcode.ts         # Barcode scanner wrapper (@zxing/library)
src/components/
└── BarcodeScanner.tsx # Camera UI component, calls barcode.ts
public/
├── manifest.json      # PWA manifest
└── icons/
    ├── icon-192.png
    └── icon-512.png
astro.config.mjs       # Updated: VitePWA plugin added under vite.plugins
tests/lib/
├── sync.test.ts
└── db.test.ts
```

---

## Task 1: PWA Manifest + Icons

**Files:**
- Create: `public/manifest.json`
- Create: `public/icons/icon-192.png`
- Create: `public/icons/icon-512.png`

- [ ] **Step 1: Write `public/manifest.json`**

```json
{
  "name": "OpenLarder",
  "short_name": "OpenLarder",
  "description": "Your shared household pantry",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#ffffff",
  "theme_color": "#16a34a",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

- [ ] **Step 2: Generate app icons programmatically**

The project uses ESM (`"type": "module"`), so use `--input-type=commonjs` to run a CJS snippet inline:

```bash
npm install -D sharp
node --input-type=commonjs << 'EOF'
const sharp = require('sharp');
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" rx="80" fill="#16a34a"/><text x="256" y="330" font-family="sans-serif" font-size="220" font-weight="bold" fill="white" text-anchor="middle">OL</text></svg>');
sharp(svg).resize(192).png().toFile('public/icons/icon-192.png', (e) => e && console.error(e));
sharp(svg).resize(512).png().toFile('public/icons/icon-512.png', (e) => e && console.error(e));
EOF
```

This generates solid green icons with white "OL" monogram — replace with proper artwork before production.

- [ ] **Step 3: Verify manifest is served**

```bash
npm start
curl http://localhost:4321/manifest.json
```

Expected: JSON manifest with the correct fields.

- [ ] **Step 4: Commit**

```bash
git add public/manifest.json public/icons/
git commit -m "feat: PWA manifest and icons"
```

---

## Task 2: Service Worker with Workbox

**Files:**
- Modify: `astro.config.mjs`

- [ ] **Step 1: Add vite-plugin-pwa to `astro.config.mjs`**

Astro's build pipeline reads Vite plugins from `astro.config.mjs` under the `vite` key — a standalone `vite.config.mjs` is ignored by `astro build`. Update `astro.config.mjs`:

```js
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'middleware' }),
  integrations: [react()],
  vite: {
    plugins: [
      tailwindcss(),
      VitePWA({
        strategies: 'generateSW',
        registerType: 'autoUpdate',
        manifest: false, // managed manually via public/manifest.json
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          runtimeCaching: [
            {
              urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith('/api/'),
              handler: 'NetworkFirst' as const,
              options: {
                cacheName: 'api-cache',
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 100, maxAgeSeconds: 24 * 60 * 60 },
              },
            },
          ],
          navigateFallback: null,
        },
        devOptions: { enabled: false },
      }),
    ],
  },
});
```

- [ ] **Step 2: Add service worker registration to `src/layouts/Base.astro`**

Add before `</body>`:

```astro
<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(console.error);
    });
  }
</script>
```

- [ ] **Step 3: Build and verify service worker is generated**

```bash
npm run build
ls dist/ | grep sw
```

Expected: `sw.js` and `workbox-*.js` files present in `dist/`.

- [ ] **Step 4: Commit**

```bash
git add astro.config.mjs src/layouts/Base.astro
git commit -m "feat: Workbox service worker, Cache First + Network First strategies"
```

---

## Task 3: IndexedDB Setup

**Files:**
- Create: `src/lib/db.ts`
- Create: `tests/lib/db.test.ts`

- [ ] **Step 1: Install idb**

```bash
npm install idb
```

- [ ] **Step 2: Write `src/lib/db.ts`**

```ts
import { openDB, type IDBPDatabase } from 'idb';
import type { StockItem, ShoppingItem, PantryEvent, Pantry, StorageSpace } from './types.js';

export interface OfflineQueueEntry {
  id: string;
  operation: 'upsert_stock' | 'delete_stock' | 'add_shopping_item' | 'patch_shopping_item' | 'delete_shopping_item' | 'clear_shopping_list';
  payload: Record<string, unknown>;
  local_timestamp: string;
  status: 'pending' | 'synced' | 'error' | 'discarded';
  local_item_id?: string; // for offline-added shopping items
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

// --- Pantries ---
export async function savePantries(pantries: Pantry[]) {
  const db = await getIdb();
  const tx = db.transaction('pantries', 'readwrite');
  await Promise.all([...pantries.map(p => tx.store.put(p)), tx.done]);
}

export async function getCachedPantries(): Promise<Pantry[]> {
  const db = await getIdb();
  return db.getAll('pantries');
}

// --- Stock ---
export async function saveStock(pantryId: number, items: StockItem[]) {
  const db = await getIdb();
  const tx = db.transaction('stock_items', 'readwrite');
  // Clear existing for this pantry
  const existing = await tx.store.index('by_pantry').getAllKeys(pantryId);
  await Promise.all(existing.map(k => tx.store.delete(k)));
  await Promise.all([...items.map(i => tx.store.put({ ...i, pantry_id: pantryId })), tx.done]);
}

export async function getCachedStock(pantryId: number): Promise<StockItem[]> {
  const db = await getIdb();
  return db.getAllFromIndex('stock_items', 'by_pantry', pantryId);
}

// --- Shopping ---
// --- Products ---
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

// --- Shopping ---
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

// --- Events ---
export async function saveEvents(pantryId: number, events: PantryEvent[]) {
  const db = await getIdb();
  const tx = db.transaction('pantry_events', 'readwrite');
  // Only save first page — don't clear existing, just upsert
  await Promise.all([...events.map(e => tx.store.put({ ...e, pantry_id: pantryId })), tx.done]);
}

export async function getCachedEvents(pantryId: number): Promise<PantryEvent[]> {
  const db = await getIdb();
  return db.getAllFromIndex('pantry_events', 'by_pantry', pantryId);
}

// --- Spaces ---
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

// --- Offline Queue ---
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
    // Rewrite scalar references
    if (payload.item_id === localId) { payload.item_id = serverId; changed = true; }
    // Rewrite array references (clear_shopping_list)
    if (Array.isArray(payload.item_ids)) {
      const newIds = (payload.item_ids as (string | number)[]).map(id => id === localId ? serverId : id);
      if (newIds.some((id, i) => id !== payload.item_ids![i])) {
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
```

- [ ] **Step 3: Write `tests/lib/db.test.ts`**

Note: IndexedDB tests require a browser-like environment. Use `@vitest/browser` or mock `idb`.

```ts
// tests/lib/db.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock idb for Node test environment
vi.mock('idb', () => {
  const store = new Map();
  const stores: Record<string, Map<unknown, unknown>> = {};

  const getStore = (name: string) => {
    if (!stores[name]) stores[name] = new Map();
    return stores[name];
  };

  return {
    openDB: vi.fn(async (_name: string, _version: number, { upgrade }: any) => {
      const db = {
        put: vi.fn(async (storeName: string, val: any) => getStore(storeName).set(val.id ?? val.key, val)),
        get: vi.fn(async (storeName: string, key: any) => getStore(storeName).get(key)),
        getAll: vi.fn(async (storeName: string) => Array.from(getStore(storeName).values())),
        delete: vi.fn(async (storeName: string, key: any) => getStore(storeName).delete(key)),
        getAllFromIndex: vi.fn(async (storeName: string, _index: string, value: any) =>
          Array.from(getStore(storeName).values()).filter((v: any) => v.pantry_id === value)
        ),
        transaction: vi.fn((storeName: string) => ({
          store: {
            put: (val: any) => getStore(storeName).set(val.id, val),
            delete: (key: any) => getStore(storeName).delete(key),
            index: () => ({ getAllKeys: async () => [] }),
          },
          done: Promise.resolve(),
        })),
        createObjectStore: vi.fn(() => ({ createIndex: vi.fn() })),
      };
      upgrade?.(db);
      return db;
    }),
  };
});

describe('offline queue operations', () => {
  beforeEach(() => vi.resetModules());

  it('rewriteTempId replaces local UUID with server ID in scalar references', async () => {
    const { enqueue, rewriteTempId, getPendingQueue } = await import('../../src/lib/db.js');
    const localId = 'local-abc-123';
    await enqueue({
      id: 'q1',
      operation: 'patch_shopping_item',
      payload: { item_id: localId },
      local_timestamp: new Date().toISOString(),
      local_item_id: localId,
    });
    await rewriteTempId(localId, 42);
    const queue = await getPendingQueue();
    expect((queue[0].payload as any).item_id).toBe(42);
  });

  it('rewriteTempId replaces local UUID inside item_ids arrays', async () => {
    const { enqueue, rewriteTempId, getPendingQueue } = await import('../../src/lib/db.js');
    const localId = 'local-xyz';
    await enqueue({
      id: 'q2',
      operation: 'clear_shopping_list',
      payload: { item_ids: [1, localId, 3] },
      local_timestamp: new Date().toISOString(),
    });
    await rewriteTempId(localId, 99);
    const queue = await getPendingQueue();
    expect((queue[0].payload as any).item_ids).toEqual([1, 99, 3]);
  });
});
```

- [ ] **Step 4: Run tests**

```bash
npm test tests/lib/db.test.ts
```

Expected: 2 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.ts tests/lib/
git commit -m "feat: IndexedDB client with offline queue and temp ID rewriting"
```

---

## Task 4: Sync Engine

**Files:**
- Create: `src/lib/sync.ts`
- Create: `tests/lib/sync.test.ts`

- [ ] **Step 1: Write `src/lib/sync.ts`**

```ts
import { v4 as uuidv4 } from 'uuid';
import { api } from './api.js';
import {
  saveStock, saveShopping, saveSpaces, saveEvents, savePantries, saveProducts,
  enqueue, getPendingQueue, updateQueueEntry, rewriteTempId, purgeErroredEntries,
  getCachedStock, getCachedShopping, type OfflineQueueEntry,
} from './db.js';
import { showToast } from '../components/ui/Toast.js';

// ---- Full refresh ----

export async function fullRefresh(pantryId: number): Promise<void> {
  // Purge errored/discarded entries before fresh data
  await purgeErroredEntries();

  const [stock, shopping, spaces, { events }] = await Promise.all([
    api.getStock(pantryId),
    api.getShopping(pantryId),
    api.getSpaces(pantryId),
    api.getEvents(pantryId),
  ]);

  // Extract and cache products from stock items (cache-first for barcode lookup)
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

// ---- Mutation wrappers ----
// Online: call API immediately + update local cache
// Offline: write to cache + enqueue

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
    // Optimistic: update local cache
    const cached = await getCachedStock(pantryId);
    const existing = cached.find(s =>
      s.storage_space.id === payload.storage_space_id &&
      s.product.id === payload.product_id
    );
    if (existing) {
      await saveStock(pantryId, cached.map(s =>
        s.id === existing.id ? { ...s, count: payload.count, expiry_date: payload.expiry_date ?? null, updated_at } : s
      ));
    }
    await enqueue({
      id: uuidv4(),
      operation: 'upsert_stock',
      payload: { pantry_id: pantryId, ...body },
      local_timestamp: updated_at,
    });
  }
}

export async function syncDeleteStock(pantryId: number, itemId: number): Promise<void> {
  if (isOnline()) {
    await api.deleteStock(pantryId, itemId);
  } else {
    const cached = await getCachedStock(pantryId);
    await saveStock(pantryId, cached.filter(s => s.id !== itemId));
    await enqueue({
      id: uuidv4(),
      operation: 'delete_stock',
      payload: { pantry_id: pantryId, item_id: itemId },
      local_timestamp: new Date().toISOString(),
    });
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
    // Optimistic local item
    const cached = await getCachedShopping(pantryId);
    const tempItem = {
      id: localId as any, // temp string ID — will be replaced on sync
      pantry_id: pantryId,
      quantity: body.quantity,
      checked: false,
      checked_at: null,
      added_at: updated_at,
      updated_at,
      custom_name: body.custom_name ?? null,
      product: null,
    };
    await saveShopping(pantryId, [...cached, tempItem as any]);
    await enqueue({
      id: uuidv4(),
      operation: 'add_shopping_item',
      payload: { pantry_id: pantryId, ...body },
      local_timestamp: updated_at,
      local_item_id: localId,
    });
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
    // Optimistic
    const cached = await getCachedShopping(pantryId);
    await saveShopping(pantryId, cached.map(i =>
      i.id == itemId ? { ...i, ...body, updated_at } : i
    ));
    await enqueue({
      id: uuidv4(),
      operation: 'patch_shopping_item',
      payload: { pantry_id: pantryId, item_id: itemId, ...fullBody },
      local_timestamp: updated_at,
      local_item_id: typeof itemId === 'string' ? itemId : undefined,
    });
  }
}

export async function syncDeleteShoppingItem(pantryId: number, itemId: number | string): Promise<void> {
  if (isOnline() && typeof itemId === 'number') {
    await api.deleteShoppingItem(pantryId, itemId);
  } else {
    const cached = await getCachedShopping(pantryId);
    await saveShopping(pantryId, cached.filter(i => i.id != itemId));
    await enqueue({
      id: uuidv4(),
      operation: 'delete_shopping_item',
      payload: { pantry_id: pantryId, item_id: itemId },
      local_timestamp: new Date().toISOString(),
      local_item_id: typeof itemId === 'string' ? itemId : undefined,
    });
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
    await enqueue({
      id: uuidv4(),
      operation: 'clear_shopping_list',
      payload: { pantry_id: pantryId, item_ids: itemIds },
      local_timestamp: new Date().toISOString(),
    });
  }
}

// ---- Queue drain ----

export async function drainQueue(): Promise<void> {
  const queue = await getPendingQueue();
  if (!queue.length) return;

  let hadErrors = false;
  // In-memory map of localId → serverId built during drain
  // Used to rewrite temp IDs in the in-memory queue without re-fetching from IDB
  const idMap = new Map<string, number>();

  for (const entry of queue) {
    // Apply any in-memory ID rewrites accumulated so far
    const resolvedEntry = applyIdMap(entry, idMap);
    try {
      await processQueueEntry(resolvedEntry, idMap);
      await updateQueueEntry(entry.id, 'synced');
      // Also update IDB (rewriteTempId may have already updated payloads, but mark synced)
    } catch (err: any) {
      hadErrors = true;
      const is4xx = err.status >= 400 && err.status < 500;
      await updateQueueEntry(entry.id, is4xx ? 'discarded' : 'error');
    }
  }

  if (hadErrors) {
    showToast("Some changes couldn't be synced", 'error');
  }

  // Full refresh after drain
  const pantryIds = [...new Set(queue.map(e => (e.payload as any).pantry_id as number))];
  await Promise.all(pantryIds.map(id => fullRefresh(id)));
}

function applyIdMap(entry: OfflineQueueEntry, idMap: Map<string, number>): OfflineQueueEntry {
  if (!idMap.size) return entry;
  const payload = { ...entry.payload } as any;
  // Rewrite scalar item_id
  if (typeof payload.item_id === 'string' && idMap.has(payload.item_id)) {
    payload.item_id = idMap.get(payload.item_id);
  }
  // Rewrite array item_ids
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
    case 'upsert_stock':
      await api.upsertStock(p.pantry_id, p);
      break;
    case 'delete_stock':
      await api.deleteStock(p.pantry_id, p.item_id);
      break;
    case 'add_shopping_item': {
      const result = await api.addShoppingItem(p.pantry_id, p) as any;
      // Record the localId → serverId mapping for subsequent queue entries
      if (entry.local_item_id) {
        idMap.set(entry.local_item_id, result.id);
        // Also update IDB so future sessions don't retry with stale temp IDs
        await rewriteTempId(entry.local_item_id, result.id);
      }
      break;
    }
    case 'patch_shopping_item':
      await api.patchShoppingItem(p.pantry_id, p.item_id, p);
      break;
    case 'delete_shopping_item':
      await api.deleteShoppingItem(p.pantry_id, p.item_id);
      break;
    case 'clear_shopping_list': {
      const numericIds = (p.item_ids as (number | string)[]).filter((id): id is number => typeof id === 'number');
      await api.clearShopping(p.pantry_id, numericIds);
      break;
    }
  }
}

// ---- Register online event listener ----

export function registerSyncListener(): () => void {
  const handler = async () => {
    console.log('[sync] Online — draining queue');
    await drainQueue();
  };
  window.addEventListener('online', handler);
  return () => window.removeEventListener('online', handler);
}
```

- [ ] **Step 2: Write `tests/lib/sync.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock navigator.onLine
Object.defineProperty(navigator, 'onLine', { writable: true, value: true });

vi.mock('../../src/lib/api.js', () => ({
  api: {
    upsertStock: vi.fn().mockResolvedValue({ id: 1, created: true }),
    getStock: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../src/lib/db.js', () => ({
  getCachedStock: vi.fn().mockResolvedValue([]),
  saveStock: vi.fn().mockResolvedValue(undefined),
  enqueue: vi.fn().mockResolvedValue(undefined),
  getPendingQueue: vi.fn().mockResolvedValue([]),
  updateQueueEntry: vi.fn(),
  rewriteTempId: vi.fn(),
  purgeErroredEntries: vi.fn(),
}));

vi.mock('../../src/components/ui/Toast.js', () => ({ showToast: vi.fn() }));

describe('sync engine', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls API directly when online', async () => {
    (navigator as any).onLine = true;
    const { syncUpsertStock } = await import('../../src/lib/sync.js');
    const { api } = await import('../../src/lib/api.js');
    await syncUpsertStock(1, { storage_space_id: 1, product_id: 1, count: 2 });
    expect(api.upsertStock).toHaveBeenCalledOnce();
  });

  it('enqueues mutation when offline', async () => {
    (navigator as any).onLine = false;
    vi.resetModules();

    vi.mock('../../src/lib/api.js', () => ({ api: { upsertStock: vi.fn(), getStock: vi.fn().mockResolvedValue([]) } }));
    vi.mock('../../src/lib/db.js', () => ({
      getCachedStock: vi.fn().mockResolvedValue([]),
      saveStock: vi.fn(),
      enqueue: vi.fn().mockResolvedValue(undefined),
    }));

    const { syncUpsertStock } = await import('../../src/lib/sync.js');
    const { enqueue } = await import('../../src/lib/db.js');
    await syncUpsertStock(1, { storage_space_id: 1, product_id: 1, count: 2 });
    expect(enqueue).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npm test tests/lib/sync.test.ts
```

Expected: 2 tests passing.

- [ ] **Step 4: Commit**

```bash
git add src/lib/sync.ts tests/lib/sync.test.ts
git commit -m "feat: sync engine — online passthrough, offline queue, drain with temp ID rewriting"
```

---

## Task 5: Wire Sync Engine into Components

**Files:**
- Modify: `src/components/tabs/StockTab.tsx`
- Modify: `src/components/tabs/ShoppingTab.tsx`
- Modify: `src/components/PantryTabs.tsx`

- [ ] **Step 1: Update `PantryTabs.tsx` to register sync listener and full refresh**

Add to `PantryTabs.tsx` after imports:

```ts
import { fullRefresh, registerSyncListener } from '../lib/sync.js';
```

Add to the `useEffect` that loads the pantry:

```ts
useEffect(() => {
  api.getPantry(pantryId)
    .then(async (p) => {
      setPantry(p);
      // Full refresh on app open
      if (navigator.onLine) await fullRefresh(pantryId);
    })
    .catch(() => { window.location.href = '/pantries'; })
    .finally(() => setLoading(false));

  return registerSyncListener(); // cleanup removes the 'online' listener
}, [pantryId]);
```

- [ ] **Step 2: Update `StockTab.tsx` to use sync engine instead of direct API calls**

Replace direct `api.upsertStock` calls with `syncUpsertStock`, and `api.deleteStock` with `syncDeleteStock`:

```ts
import { syncUpsertStock, syncDeleteStock } from '../../lib/sync.js';
import { getCachedStock, getCachedSpaces } from '../../lib/db.js';
```

Update `adjustCount`:
```ts
async function adjustCount(item: StockItem, delta: number) {
  const newCount = Math.max(0, item.count + delta);
  // Optimistic UI update
  setStock(prev => prev.map(s => s.id === item.id ? { ...s, count: newCount } : s));
  try {
    await syncUpsertStock(pantryId, {
      storage_space_id: item.storage_space.id,
      product_id: item.product.id,
      count: newCount,
      expiry_date: item.expiry_date ?? undefined,
    });
  } catch {
    // Rollback optimistic update
    setStock(prev => prev.map(s => s.id === item.id ? { ...s, count: item.count } : s));
    showToast('Failed to update', 'error');
  }
}
```

Update initial load to prefer cached data when offline:
```ts
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
```

- [ ] **Step 3: Update `ShoppingTab.tsx` to use sync engine**

Replace direct API calls:
```ts
import { syncAddShoppingItem, syncPatchShoppingItem, syncDeleteShoppingItem, syncClearShopping } from '../../lib/sync.js';
import { getCachedShopping } from '../../lib/db.js';
```

Update initial load:
```ts
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
```

Replace `api.addShoppingItem` → `syncAddShoppingItem`, `api.patchShoppingItem` → `syncPatchShoppingItem`, `api.deleteShoppingItem` → `syncDeleteShoppingItem`, `api.clearShopping` → `syncClearShopping`.

- [ ] **Step 3b: Update `ActivityTab.tsx` to serve cached events when offline**

The `fullRefresh` call in `sync.ts` already populates the `pantry_events` IndexedDB store. Update the `loadFirst` function in `ActivityTab.tsx` to read from that cache when offline:

```ts
import { getCachedEvents } from '../../lib/db.js';

const loadFirst = useCallback(async () => {
  if (!navigator.onLine) {
    // Serve first-page cached events; disable infinite scroll
    try {
      const cached = await getCachedEvents(pantryId);
      // Events are stored unsorted — sort by id DESC to match server order
      const sorted = cached.sort((a: any, b: any) => b.id - a.id).slice(0, 50);
      setEvents(sorted as any);
      setHasMore(false); // no pagination when offline
    } finally {
      setOffline(true);
      setLoading(false);
    }
    return;
  }
  try {
    const { events: e, has_more } = await api.getEvents(pantryId);
    setEvents(e);
    setHasMore(has_more);
  } catch {
    setOffline(true);
  } finally {
    setLoading(false);
  }
}, [pantryId]);
```

- [ ] **Step 4: Run build to verify no type errors**

```bash
npm run build
```

Expected: builds without errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/
git commit -m "feat: wire sync engine into Stock and Shopping tabs, full offline support"
```

---

## Task 6: Barcode Scanning

**Files:**
- Create: `src/lib/barcode.ts`
- Create: `src/components/BarcodeScanner.tsx`
- Modify: `src/components/tabs/StockTab.tsx`

- [ ] **Step 1: Install @zxing/library**

```bash
npm install @zxing/library
```

- [ ] **Step 2: Write `src/lib/barcode.ts`**

```ts
import { BrowserMultiFormatReader } from '@zxing/library';

let reader: BrowserMultiFormatReader | null = null;

export function getReader(): BrowserMultiFormatReader {
  if (!reader) reader = new BrowserMultiFormatReader();
  return reader;
}

export async function startScan(
  videoEl: HTMLVideoElement,
  onResult: (barcode: string) => void,
  onError: (err: Error) => void
): Promise<void> {
  const r = getReader();
  try {
    const devices = await BrowserMultiFormatReader.listVideoInputDevices();
    // Prefer rear camera on mobile
    const rear = devices.find(d => /back|rear|environment/i.test(d.label));
    const deviceId = rear?.deviceId ?? devices[0]?.deviceId;
    r.decodeFromVideoDevice(deviceId ?? null, videoEl, (result, err) => {
      if (result) {
        onResult(result.getText());
        r.reset();
      } else if (err && err.name !== 'NotFoundException') {
        onError(err as Error);
      }
    });
  } catch (err) {
    onError(err as Error);
  }
}

export function stopScan(): void {
  reader?.reset();
}
```

- [ ] **Step 3: Write `src/components/BarcodeScanner.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import { startScan, stopScan } from '../lib/barcode.js';
import { Button } from './ui/Button.js';

interface Props {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

export function BarcodeScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!videoRef.current) return;
    startScan(
      videoRef.current,
      (barcode) => { onScan(barcode); onClose(); },
      (err) => console.error('Scan error:', err)
    );
    return () => stopScan();
  }, [onScan, onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between p-4">
        <h2 className="text-white font-medium">Scan Barcode</h2>
        <button onClick={onClose} className="text-white min-h-[44px] min-w-[44px] flex items-center justify-center text-xl">✕</button>
      </div>
      <div className="flex-1 relative">
        <video ref={videoRef} className="w-full h-full object-cover" />
        {/* Viewfinder overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-64 h-40 border-2 border-white rounded-lg opacity-70" />
        </div>
      </div>
      <div className="p-4 text-center">
        <p className="text-white text-sm opacity-70">Point camera at barcode</p>
        <Button variant="secondary" onClick={onClose} className="mt-3">Cancel</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Integrate barcode scanner into `StockTab.tsx`**

Apply these four additions to `StockTab.tsx`. Each is a distinct, non-duplicate change — add each once only:

**1. Add one import at the top of the file:**
```ts
import { BarcodeScanner } from '../BarcodeScanner.js';
```

**2. Add three state declarations** inside the component (after the existing `saving` state):
```ts
const [showScanner, setShowScanner] = useState(false);
const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
const [scannedProductId, setScannedProductId] = useState<number | null>(null);
```

**3. Replace the existing `handleAddStock` function** with this version that uses `scannedProductId` when available:
```ts
async function handleAddStock(e: React.FormEvent) {
  e.preventDefault();
  if (!selectedSpace) return;
  setSaving(true);
  try {
    const product = scannedProductId
      ? { id: scannedProductId }
      : await api.createProduct({ name: productName, barcode: scannedBarcode ?? undefined });
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
    setProductName(''); setCount(1); setExpiry('');
    setScannedBarcode(null); setScannedProductId(null);
    showToast('Item added', 'success');
  } catch (err: any) {
    showToast(err.message, 'error');
  } finally {
    setSaving(false);
  }
}
```

**4. Add one new `handleScan` function** (after `handleAddStock`):
```ts
async function handleScan(barcode: string) {
  setShowScanner(false);
  setScannedProductId(null);
  try {
    const { getCachedProductByBarcode } = await import('../../lib/db.js');
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
```

**5. Add scan button** next to the existing "+ Add item" button in the JSX:
```tsx
<Button variant="secondary" onClick={() => setShowScanner(true)} className="text-sm px-3 py-2">📷 Scan</Button>
```

**6. Add scanner modal** at the bottom of the returned JSX (before the closing `</div>`):
```tsx
{showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}
```

- [ ] **Step 5: Note on barcode tests**

`@zxing/library` requires a real browser environment with `getUserMedia` — it cannot run in Vitest/Node. There are no unit tests for `barcode.ts`. Test the barcode flow manually in Step 6 using a real phone camera or a barcode image on screen. The `handleScan` logic in `StockTab.tsx` (cache-first lookup → API fallback → manual entry) is testable by mocking `getCachedProductByBarcode` and `api.lookupBarcode` in a component test if desired.

- [ ] **Step 6: Run build**

```bash
npm run build
```

Expected: builds without errors. ZXing will be code-split into a separate chunk.

- [ ] **Step 7: Commit**

```bash
git add src/lib/barcode.ts src/components/BarcodeScanner.tsx
git commit -m "feat: barcode scanning with @zxing/library, integrated into Stock tab"
```

---

## Task 7: Final Build + Installability Verification

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 2: Production build**

```bash
npm run build
npm start
```

- [ ] **Step 3: Verify PWA installability in Chrome DevTools**

Open `http://localhost:4321` in Chrome.

- Open DevTools → Application → Manifest
  - [ ] Name: "OpenLarder"
  - [ ] Icons: 192px and 512px present
  - [ ] Display: standalone

- Open DevTools → Application → Service Workers
  - [ ] Service worker registered and activated
  - [ ] Status: "running"

- Open DevTools → Lighthouse → Mobile
  - [ ] Run PWA audit
  - [ ] Expect: "Installable" checks passing

- [ ] **Step 4: Test offline mode**

In Chrome DevTools → Network → select "Offline":
- [ ] Navigate to `/pantries` — app loads from cache
- [ ] Navigate to a pantry → Stock tab — items load from IndexedDB
- [ ] Increment a count — change is reflected immediately (optimistic)
- [ ] Go back online — sync drains, stock refreshes

- [ ] **Step 5: Test install on mobile**

On an Android device with Chrome:
- Open `http://<your-ip>:4321`
- [ ] "Add to Home Screen" prompt appears or is available in browser menu
- [ ] App installs and opens in standalone mode (no browser chrome)

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "feat: PWA complete — manifest, service worker, offline sync, barcode scanning"
```

---

## Task 8: Hostinger Deployment Config

**Files:**
- Create: `.gitignore`
- Create: `.env.production.example`

- [ ] **Step 1: Write `.gitignore`**

```
node_modules/
dist/
*.db
.env
.env.local
.DS_Store
```

- [ ] **Step 2: Write `.env.production.example`**

```
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
GOOGLE_CALLBACK_URL=https://yourdomain.com/auth/google/callback
SESSION_SECRET=<generate-with-openssl-rand-base64-32>
DATABASE_PATH=/home/<user>/domains/<domain>/openlarder.db
PORT=3000
NODE_ENV=production
```

- [ ] **Step 3: Verify `package.json` start script**

Ensure:
```json
"start": "node entry.mjs",
"build": "astro build"
```

Hostinger runs `npm run build` then `npm start`.

- [ ] **Step 4: Push to GitHub and deploy on Hostinger**

```bash
git remote add origin <github-repo-url>
git push -u origin main
```

In Hostinger hPanel:
1. Add Website → Node.js Apps
2. Import Git Repository → select repo
3. Framework: Astro (auto-detected)
4. Entry file: `entry.mjs`
5. Add environment variables from `.env.production.example`
6. Deploy

- [ ] **Step 5: Set Google OAuth callback URL**

In Google Cloud Console → OAuth 2.0 credentials:
- Add `https://yourdomain.com/auth/google/callback` to Authorized redirect URIs

- [ ] **Step 6: Verify production deployment**

- [ ] App loads at `https://yourdomain.com`
- [ ] Google login works
- [ ] Can create a pantry
- [ ] PWA installs from mobile browser

- [ ] **Step 7: Final commit**

```bash
git add .gitignore .env.production.example
git commit -m "chore: deployment config, gitignore, env template"
```

---

**OpenLarder is complete.** All three plans implemented:
- Plan A: Full backend (DB, auth, all API routes)
- Plan B: Full frontend (Astro pages, Tailwind, all React tabs)
- Plan C: PWA + offline sync + barcode scanning + Hostinger deployment
