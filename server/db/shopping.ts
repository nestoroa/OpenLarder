import type Database from 'better-sqlite3';

export function getShoppingList(db: Database.Database, pantryId: number) {
  return db.prepare(`
    SELECT
      sl.id, sl.quantity, sl.checked, sl.checked_at, sl.added_at, sl.updated_at,
      sl.custom_name,
      p.id AS product_id,
      COALESCE(pp.local_name, p.name) AS product_name
    FROM ShoppingListItem sl
    LEFT JOIN Product p ON p.id = sl.product_id
    LEFT JOIN PantryProduct pp ON pp.product_id = p.id AND pp.pantry_id = sl.pantry_id
    WHERE sl.pantry_id = ?
    ORDER BY sl.added_at
  `).all(pantryId);
}

export function addShoppingItem(
  db: Database.Database,
  pantryId: number,
  data: {
    product_id?: number;
    custom_name?: string;
    quantity: number;
    added_by: number;
  }
) {
  const now = new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO ShoppingListItem (pantry_id, product_id, custom_name, quantity, added_by, added_at, updated_at)
    VALUES (@pantry_id, @product_id, @custom_name, @quantity, @added_by, @now, @now)
  `).run({ product_id: null, custom_name: null, ...data, pantry_id: pantryId, now });
  return result.lastInsertRowid;
}

export function patchShoppingItem(
  db: Database.Database,
  itemId: number,
  data: {
    checked?: boolean;
    quantity?: number;
    updated_at: string;
    client_updated_at: string;
    checked_by?: number;
  }
) {
  const current = db.prepare(
    `SELECT updated_at FROM ShoppingListItem WHERE id = ?`
  ).get(itemId) as { updated_at: string } | undefined;

  if (!current) return null;
  if (data.client_updated_at < current.updated_at) {
    return db.prepare(`SELECT * FROM ShoppingListItem WHERE id = ?`).get(itemId);
  }

  // Use COALESCE for checked so quantity-only patches don't silently uncheck items
  const checked_at = data.checked === true ? new Date().toISOString() : null;
  db.prepare(`
    UPDATE ShoppingListItem
    SET checked    = CASE WHEN @checked IS NOT NULL THEN @checked ELSE checked END,
        checked_at = CASE WHEN @checked IS NOT NULL THEN @checked_at ELSE checked_at END,
        checked_by = CASE WHEN @checked IS NOT NULL THEN @checked_by ELSE checked_by END,
        quantity   = COALESCE(@quantity, quantity),
        updated_at = @updated_at
    WHERE id = @id
  `).run({
    checked: data.checked !== undefined ? (data.checked ? 1 : 0) : null,
    quantity: data.quantity ?? null,
    updated_at: data.updated_at,
    checked_by: data.checked !== undefined ? (data.checked_by ?? null) : null,
    checked_at: data.checked !== undefined ? checked_at : null,
    id: itemId,
  });
  return db.prepare(`SELECT * FROM ShoppingListItem WHERE id = ?`).get(itemId);
}

export function deleteShoppingItem(db: Database.Database, itemId: number) {
  db.prepare(`DELETE FROM ShoppingListItem WHERE id = ?`).run(itemId);
}

export function clearShoppingItems(db: Database.Database, pantryId: number, itemIds: number[]) {
  if (!itemIds.length) return 0;
  const placeholders = itemIds.map(() => '?').join(',');
  const result = db.prepare(
    `DELETE FROM ShoppingListItem WHERE pantry_id = ? AND id IN (${placeholders})`
  ).run(pantryId, ...itemIds);
  return result.changes;
}
