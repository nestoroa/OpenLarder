import { describe, it, expect } from 'vitest';
import { expiryClass } from '../../src/components/tabs/StockTab.js';

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
