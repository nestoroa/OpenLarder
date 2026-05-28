import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('idb', () => {
  const stores: Record<string, Map<unknown, unknown>> = {};
  const getStore = (name: string) => {
    if (!stores[name]) stores[name] = new Map();
    return stores[name];
  };
  return {
    openDB: vi.fn(async (_name: string, _version: number, { upgrade }: any) => {
      // Reset all stores so each test starts clean (vi.resetModules re-imports db.ts which calls getIdb)
      Object.keys(stores).forEach(k => stores[k].clear());
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
