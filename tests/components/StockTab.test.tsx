import { describe, it, expect } from 'vitest';

function expiryClass(expiry: string | null): string {
  if (!expiry) return '';
  const days = Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000);
  if (days < 0) return 'bg-red-50 border-red-200';
  if (days <= 7) return 'bg-yellow-50 border-yellow-200';
  return '';
}

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
