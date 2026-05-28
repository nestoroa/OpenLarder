import { describe, it, expect } from 'vitest';
import { generateToken } from '../../server/db/invites.js';

describe('generateToken', () => {
  it('generates 8-char uppercase alphanum code', () => {
    const token = generateToken('code');
    expect(token).toHaveLength(8);
    expect(/^[A-Z0-9]+$/.test(token)).toBe(true);
  });

  it('generates UUID for link', () => {
    const token = generateToken('link');
    expect(/^[0-9a-f-]{36}$/.test(token)).toBe(true);
  });
});
