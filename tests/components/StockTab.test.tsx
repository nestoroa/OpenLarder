import { describe, it, expect } from 'vitest';
import {
  expiryClass,
  getExpiryBucket,
  sortItems,
  groupItems,
  filterItems,
} from '../../src/components/tabs/StockTab.js';
import type { StockItem, StorageSpace } from '../../src/lib/types.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<StockItem> = {}): StockItem {
  return {
    id: 1,
    count: 1,
    expiry_date: null,
    updated_at: '2026-01-01T00:00:00Z',
    product: {
      id: 1,
      name: 'Product A',
      brand: null,
      image_url: null,
      barcode: null,
      uuid: 'uuid-1',
      local_name: null,
      local_brand: null,
      global_name: 'Product A',
      global_brand: null,
    },
    storage_space: { id: 1, name: 'Pantry', icon: '🥫' },
    ...overrides,
  };
}

function makeSpace(overrides: Partial<StorageSpace> = {}): StorageSpace {
  return { id: 1, pantry_id: 1, name: 'Pantry', icon: '🥫', sort_order: 0, ...overrides };
}

/** Item with a specific product name. */
function withName(name: string, id = 1): StockItem {
  const base = makeItem({ id });
  return { ...base, product: { ...base.product, name, global_name: name } };
}

/** Item with a specific brand (null allowed). */
function withBrand(brand: string | null, id = 1): StockItem {
  const base = makeItem({ id });
  return { ...base, product: { ...base.product, brand, global_brand: brand } };
}

/** Item with a specific expiry date (null = no expiry). */
function withExpiry(expiry_date: string | null, id = 1): StockItem {
  return makeItem({ id, expiry_date });
}

/** Item belonging to a given storage space id. */
function withSpace(spaceId: number, id = 1): StockItem {
  const base = makeItem({ id });
  return { ...base, storage_space: { id: spaceId, name: `Space ${spaceId}`, icon: '📦' } };
}

/** YYYY-MM-DD string n days from now (UTC). */
function daysFromNow(n: number): string {
  return new Date(Date.now() + n * 86400000).toISOString().split('T')[0];
}

// ── expiryClass (existing) ────────────────────────────────────────────────────

describe('expiryClass', () => {
  it('returns red for past dates', () => {
    expect(expiryClass('2020-01-01')).toBe('border-l-4 border-l-red-500');
  });
  it('returns yellow for within 7 days', () => {
    const soon = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];
    expect(expiryClass(soon)).toBe('border-l-4 border-l-yellow-400');
  });
  it('returns empty string for null', () => {
    expect(expiryClass(null)).toBe('');
  });
});

// ── getExpiryBucket ───────────────────────────────────────────────────────────

describe('getExpiryBucket', () => {
  it('returns "No expiry" for null', () => {
    expect(getExpiryBucket(null)).toBe('No expiry');
  });

  it('returns "Expired" for a past date', () => {
    expect(getExpiryBucket('2020-01-01')).toBe('Expired');
  });

  it('returns "This week" for today', () => {
    expect(getExpiryBucket(daysFromNow(0))).toBe('This week');
  });

  it('returns "This week" for 7 days from now (boundary)', () => {
    expect(getExpiryBucket(daysFromNow(7))).toBe('This week');
  });

  it('returns "This month" for 8 days from now (boundary)', () => {
    expect(getExpiryBucket(daysFromNow(8))).toBe('This month');
  });

  it('returns "This month" for 30 days from now (boundary)', () => {
    expect(getExpiryBucket(daysFromNow(30))).toBe('This month');
  });

  it('returns "Later" for 31 days from now (boundary)', () => {
    expect(getExpiryBucket(daysFromNow(31))).toBe('Later');
  });
});

// ── sortItems ─────────────────────────────────────────────────────────────────

describe('sortItems', () => {
  it('does not mutate the original array', () => {
    const items = [withName('Zucchini', 1), withName('Apple', 2)];
    sortItems(items, 'name-asc');
    expect(items[0].product.name).toBe('Zucchini');
    expect(items[1].product.name).toBe('Apple');
  });

  it('returns an empty array unchanged', () => {
    expect(sortItems([], 'name-asc')).toEqual([]);
  });

  it('sorts by name ascending', () => {
    const items = [withName('Zucchini', 1), withName('Apple', 2), withName('Milk', 3)];
    expect(sortItems(items, 'name-asc').map(i => i.product.name)).toEqual(['Apple', 'Milk', 'Zucchini']);
  });

  it('sorts by name descending', () => {
    const items = [withName('Zucchini', 1), withName('Apple', 2), withName('Milk', 3)];
    expect(sortItems(items, 'name-desc').map(i => i.product.name)).toEqual(['Zucchini', 'Milk', 'Apple']);
  });

  it('sorts by brand ascending, null brand last', () => {
    const items = [withBrand(null, 1), withBrand('Zeta', 2), withBrand('Alpha', 3)];
    expect(sortItems(items, 'brand-asc').map(i => i.product.brand)).toEqual(['Alpha', 'Zeta', null]);
  });

  it('sorts by brand descending, null brand still last', () => {
    const items = [withBrand(null, 1), withBrand('Zeta', 2), withBrand('Alpha', 3)];
    expect(sortItems(items, 'brand-desc').map(i => i.product.brand)).toEqual(['Zeta', 'Alpha', null]);
  });

  it('sorts by expiry ascending, null expiry last', () => {
    const items = [withExpiry(null, 1), withExpiry('2026-12-01', 2), withExpiry('2026-06-01', 3)];
    expect(sortItems(items, 'expiry-asc').map(i => i.expiry_date)).toEqual(['2026-06-01', '2026-12-01', null]);
  });

  it('sorts by expiry descending, null expiry still last', () => {
    const items = [withExpiry(null, 1), withExpiry('2026-12-01', 2), withExpiry('2026-06-01', 3)];
    expect(sortItems(items, 'expiry-desc').map(i => i.expiry_date)).toEqual(['2026-12-01', '2026-06-01', null]);
  });

  it('puts all null expiry dates last regardless of direction', () => {
    const items = [withExpiry(null, 1), withExpiry(null, 2), withExpiry('2026-06-01', 3)];
    const asc = sortItems(items, 'expiry-asc');
    const desc = sortItems(items, 'expiry-desc');
    expect(asc[0].expiry_date).toBe('2026-06-01');
    expect(asc[1].expiry_date).toBeNull();
    expect(asc[2].expiry_date).toBeNull();
    expect(desc[0].expiry_date).toBe('2026-06-01');
    expect(desc[1].expiry_date).toBeNull();
  });
});

// ── groupItems ────────────────────────────────────────────────────────────────

describe('groupItems', () => {
  // none ───────────────────────────────────────────────────────────────────────

  it('flat list: returns a single group with empty label', () => {
    const items = [makeItem({ id: 1 }), makeItem({ id: 2 })];
    const groups = groupItems(items, 'none', []);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('');
    expect(groups[0].key).toBe('all');
    expect(groups[0].items).toHaveLength(2);
  });

  it('flat list: preserves item order (respects upstream sort)', () => {
    const items = [withName('Zucchini', 1), withName('Apple', 2)];
    const groups = groupItems(items, 'none', []);
    expect(groups[0].items.map(i => i.product.name)).toEqual(['Zucchini', 'Apple']);
  });

  // space ──────────────────────────────────────────────────────────────────────

  it('space grouping: group order follows spaces[] order', () => {
    const s1 = makeSpace({ id: 1, name: 'Fridge', sort_order: 0 });
    const s2 = makeSpace({ id: 2, name: 'Pantry', sort_order: 1 });
    // Items are in reverse space order — groups should still follow spaces[]
    const items = [withSpace(2, 1), withSpace(1, 2)];
    const groups = groupItems(items, 'space', [s1, s2]);
    expect(groups.map(g => g.label)).toEqual(['Fridge', 'Pantry']);
  });

  it('space grouping: places items in the correct group', () => {
    const s1 = makeSpace({ id: 1, name: 'Fridge' });
    const s2 = makeSpace({ id: 2, name: 'Pantry' });
    const item1 = withSpace(1, 1);
    const item2 = withSpace(2, 2);
    const groups = groupItems([item1, item2], 'space', [s1, s2]);
    expect(groups.find(g => g.label === 'Fridge')!.items).toContain(item1);
    expect(groups.find(g => g.label === 'Pantry')!.items).toContain(item2);
  });

  it('space grouping: omits spaces that have no items', () => {
    const s1 = makeSpace({ id: 1, name: 'Fridge' });
    const s2 = makeSpace({ id: 2, name: 'Pantry' });
    const s3 = makeSpace({ id: 3, name: 'Freezer' });
    const items = [withSpace(1, 1), withSpace(3, 2)]; // Pantry is empty
    const groups = groupItems(items, 'space', [s1, s2, s3]);
    expect(groups.map(g => g.label)).toEqual(['Fridge', 'Freezer']);
  });

  // expiry ─────────────────────────────────────────────────────────────────────

  it('expiry grouping: places items in correct buckets', () => {
    const items = [
      withExpiry('2020-01-01', 1),    // Expired
      withExpiry(daysFromNow(3), 2),  // This week
      withExpiry(daysFromNow(15), 3), // This month
      withExpiry(daysFromNow(60), 4), // Later
      withExpiry(null, 5),            // No expiry
    ];
    const groups = groupItems(items, 'expiry', []);
    const byLabel = Object.fromEntries(groups.map(g => [g.label, g.items]));
    expect(byLabel['Expired'][0].id).toBe(1);
    expect(byLabel['This week'][0].id).toBe(2);
    expect(byLabel['This month'][0].id).toBe(3);
    expect(byLabel['Later'][0].id).toBe(4);
    expect(byLabel['No expiry'][0].id).toBe(5);
  });

  it('expiry grouping: preserves fixed bucket order', () => {
    const items = [
      withExpiry(null, 1),            // No expiry
      withExpiry(daysFromNow(60), 2), // Later
      withExpiry('2020-01-01', 3),    // Expired
    ];
    const groups = groupItems(items, 'expiry', []);
    expect(groups.map(g => g.label)).toEqual(['Expired', 'Later', 'No expiry']);
  });

  it('expiry grouping: omits empty buckets', () => {
    const items = [withExpiry(daysFromNow(60), 1), withExpiry(null, 2)];
    const groups = groupItems(items, 'expiry', []);
    expect(groups.map(g => g.label)).toEqual(['Later', 'No expiry']);
  });

  it('expiry grouping: null expiry goes to "No expiry" bucket', () => {
    const groups = groupItems([withExpiry(null, 1)], 'expiry', []);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('No expiry');
  });
});

// ── filterItems ───────────────────────────────────────────────────────────────

describe('filterItems', () => {
  // Helpers
  function withCount(count: number, id = 1): StockItem {
    return makeItem({ id, count });
  }

  it('no filters active → returns all items unchanged', () => {
    const items = [makeItem({ id: 1 }), makeItem({ id: 2 })];
    expect(filterItems(items, '', null, null, false)).toEqual(items);
  });

  it('does not mutate the input array', () => {
    const items = [makeItem({ id: 1 }), makeItem({ id: 2 })];
    filterItems(items, 'x', null, null, false);
    expect(items).toHaveLength(2);
  });

  // ── text search ─────────────────────────────────────────────────────────────

  it('query matches product name (case-insensitive)', () => {
    const items = [withName('Oat Milk', 1), withName('Eggs', 2)];
    expect(filterItems(items, 'oat', null, null, false)).toEqual([items[0]]);
  });

  it('query matches brand (case-insensitive)', () => {
    const items = [withBrand('Alpro', 1), withBrand('Generic', 2)];
    expect(filterItems(items, 'ALPRO', null, null, false)).toEqual([items[0]]);
  });

  it('query matches neither name nor brand → empty', () => {
    const items = [withName('Eggs', 1), withBrand('Generic', 2)];
    expect(filterItems(items, 'zzz', null, null, false)).toEqual([]);
  });

  it('empty query (whitespace only) is treated as no filter', () => {
    const items = [makeItem({ id: 1 }), makeItem({ id: 2 })];
    expect(filterItems(items, '   ', null, null, false)).toEqual(items);
  });

  it('null brand is treated as empty string for search (no crash)', () => {
    const item = makeItem({ id: 1 }); // brand is null by default
    expect(() => filterItems([item], 'anything', null, null, false)).not.toThrow();
  });

  // ── space filter ─────────────────────────────────────────────────────────────

  it('space filter: only items in that space pass', () => {
    const a = withSpace(1, 1);
    const b = withSpace(2, 2);
    expect(filterItems([a, b], '', 1, null, false)).toEqual([a]);
  });

  it('space filter null → all spaces pass', () => {
    const items = [withSpace(1, 1), withSpace(2, 2)];
    expect(filterItems(items, '', null, null, false)).toEqual(items);
  });

  // ── expiry bucket filter ──────────────────────────────────────────────────────

  it('expiry filter: only items in that bucket pass', () => {
    const expired = withExpiry('2020-01-01', 1);
    const later   = withExpiry(daysFromNow(60), 2);
    const noExp   = withExpiry(null, 3);
    expect(filterItems([expired, later, noExp], '', null, 'Expired', false)).toEqual([expired]);
    expect(filterItems([expired, later, noExp], '', null, 'Later', false)).toEqual([later]);
    expect(filterItems([expired, later, noExp], '', null, 'No expiry', false)).toEqual([noExp]);
  });

  it('expiry filter null → all buckets pass', () => {
    const items = [withExpiry('2020-01-01', 1), withExpiry(null, 2)];
    expect(filterItems(items, '', null, null, false)).toEqual(items);
  });

  // ── zero stock filter ─────────────────────────────────────────────────────────

  it('zero stock filter: only count === 0 items pass', () => {
    const zero    = withCount(0, 1);
    const nonZero = withCount(3, 2);
    expect(filterItems([zero, nonZero], '', null, null, true)).toEqual([zero]);
  });

  it('zero stock filter false → all counts pass', () => {
    const items = [withCount(0, 1), withCount(5, 2)];
    expect(filterItems(items, '', null, null, false)).toEqual(items);
  });

  // ── multiple predicates AND-ed ────────────────────────────────────────────────

  it('multiple active filters are AND-ed', () => {
    const a = { ...makeItem({ id: 1, count: 0 }), product: { ...makeItem().product, name: 'Milk', global_name: 'Milk' }, storage_space: { id: 1, name: 'Fridge', icon: '🧊' } };
    const b = { ...makeItem({ id: 2, count: 0 }), product: { ...makeItem().product, name: 'Milk', global_name: 'Milk' }, storage_space: { id: 2, name: 'Pantry', icon: '🥫' } };
    const c = { ...makeItem({ id: 3, count: 0 }), product: { ...makeItem().product, name: 'Eggs', global_name: 'Eggs' }, storage_space: { id: 1, name: 'Fridge', icon: '🧊' } };
    const d = { ...makeItem({ id: 4, count: 2 }), product: { ...makeItem().product, name: 'Milk', global_name: 'Milk' }, storage_space: { id: 1, name: 'Fridge', icon: '🧊' } };

    const result = filterItems([a, b, c, d], 'milk', 1, null, true);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });
});
