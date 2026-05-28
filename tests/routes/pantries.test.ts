import { describe, it, expect } from 'vitest';

describe('slug validation', () => {
  const SLUG_RE = /^[a-z0-9-]{3,32}$/;
  it('rejects uppercase and special chars', () => {
    expect(SLUG_RE.test('My Pantry!')).toBe(false);
  });
  it('accepts valid slug', () => {
    expect(SLUG_RE.test('my-pantry')).toBe(true);
    expect(SLUG_RE.test('kitchen-2')).toBe(true);
  });
  it('rejects slugs shorter than 3 chars', () => {
    expect(SLUG_RE.test('ab')).toBe(false);
  });
});
