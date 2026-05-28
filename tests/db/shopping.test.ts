import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, seedUser, seedPantry } from '../setup.js';
import * as shoppingDb from '../../server/db/shopping.js';

describe('shopping db', () => {
  let db: ReturnType<typeof createDb>;
  let userId: number;
  let pantryId: number;

  beforeEach(() => {
    db = createDb();
    userId = seedUser(db);
    pantryId = seedPantry(db, userId);
  });

  it('adds a free-text item', () => {
    const id = shoppingDb.addShoppingItem(db, pantryId, {
      custom_name: 'Oat milk', quantity: 2, added_by: userId,
    });
    const list = shoppingDb.getShoppingList(db, pantryId);
    expect(list).toHaveLength(1);
    expect((list[0] as any).custom_name).toBe('Oat milk');
  });

  it('clears only the specified ids', () => {
    const a = shoppingDb.addShoppingItem(db, pantryId, { custom_name: 'A', quantity: 1, added_by: userId });
    const b = shoppingDb.addShoppingItem(db, pantryId, { custom_name: 'B', quantity: 1, added_by: userId });
    shoppingDb.clearShoppingItems(db, pantryId, [a as number]);
    const list = shoppingDb.getShoppingList(db, pantryId);
    expect(list).toHaveLength(1);
    expect((list[0] as any).custom_name).toBe('B');
  });
});
