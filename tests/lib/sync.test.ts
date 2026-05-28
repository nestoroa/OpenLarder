import { describe, it, expect, vi, beforeEach } from 'vitest';

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
