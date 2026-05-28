import { describe, it, expect, vi, beforeEach } from 'vitest';

// navigator.onLine must be writable for tests
Object.defineProperty(navigator, 'onLine', { writable: true, value: true });

// Top-level mocks — hoisted by Vitest before any imports
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
    // Flip online state and use the module-level enqueue mock
    (navigator as any).onLine = false;
    const { syncUpsertStock } = await import('../../src/lib/sync.js');
    const { enqueue } = await import('../../src/lib/db.js');
    await syncUpsertStock(1, { storage_space_id: 1, product_id: 1, count: 2 });
    expect(enqueue).toHaveBeenCalledOnce();
  });
});
