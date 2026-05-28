import { describe, it, expect } from 'vitest';
import { createDb } from '../setup.js';

describe('schema', () => {
  it('creates all tables without error', () => {
    const db = createDb();
    const tables = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table'`
    ).all().map((r: any) => r.name);

    expect(tables).toContain('User');
    expect(tables).toContain('Pantry');
    expect(tables).toContain('PantryMember');
    expect(tables).toContain('Invite');
    expect(tables).toContain('StorageSpace');
    expect(tables).toContain('Product');
    expect(tables).toContain('StockItem');
    expect(tables).toContain('ShoppingListItem');
    expect(tables).toContain('PantryEvent');
  });

  it('enforces foreign_keys pragma', () => {
    const db = createDb();
    const fk = db.pragma('foreign_keys', { simple: true });
    expect(fk).toBe(1);
  });

  it('enforces ShoppingListItem CHECK constraint', () => {
    const db = createDb();
    // Insert a user and pantry first
    const userId = db.prepare(
      `INSERT INTO User (google_id, name, email) VALUES ('g1','Test','t@t.com')`
    ).run().lastInsertRowid;
    const pantryId = db.prepare(
      `INSERT INTO Pantry (slug, display_name, created_by) VALUES ('s','P',?)`
    ).run(userId).lastInsertRowid;

    // Should throw: both product_id and custom_name are null
    expect(() => {
      db.prepare(
        `INSERT INTO ShoppingListItem (pantry_id, added_by) VALUES (?,?)`
      ).run(pantryId, userId);
    }).toThrow();
  });
});
