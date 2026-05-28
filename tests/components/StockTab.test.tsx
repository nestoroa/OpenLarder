import { describe, it, expect } from 'vitest';
import { expiryClass } from '../../src/components/tabs/StockTab.js';

describe('expiryClass', () => {
  it('returns red for past dates', () => {
    expect(expiryClass('2020-01-01')).toBe('bg-red-50 border-red-200');
  });
  it('returns yellow for within 7 days', () => {
    const soon = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];
    expect(expiryClass(soon)).toBe('bg-yellow-50 border-yellow-200');
  });
  it('returns empty string for null', () => {
    expect(expiryClass(null)).toBe('');
  });
});
