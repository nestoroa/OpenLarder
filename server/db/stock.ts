import type Database from 'better-sqlite3';

export function getStock(db: Database.Database, pantryId: number) {
  return db.prepare(`
    SELECT
      si.id, si.count, si.expiry_date, si.updated_at,
      p.id as product_id, p.name as product_name, p.brand, p.image_url, p.barcode,
      ss.id as space_id, ss.name as space_name, ss.icon as space_icon
    FROM StockItem si
    JOIN Product p ON p.id = si.product_id
    JOIN StorageSpace ss ON ss.id = si.storage_space_id
    WHERE si.pantry_id = ?
    ORDER BY ss.sort_order, p.name
  `).all(pantryId);
}

export type UpsertStockResult =
  | { id: number; created: true; record: any }
  | { id: number; created: false; serverWon: false; record: any }
  | { id: number; created: false; serverWon: true; record: any };

export function upsertStock(
  db: Database.Database,
  pantryId: number,
  data: {
    storage_space_id: number;
    product_id: number;
    count: number;
    expiry_date?: string;
    updated_at: string;
    updated_by: number;
  }
): UpsertStockResult {
  const existing = db.prepare(
    `SELECT id, updated_at FROM StockItem WHERE pantry_id = ? AND storage_space_id = ? AND product_id = ?`
  ).get(pantryId, data.storage_space_id, data.product_id) as { id: number; updated_at: string } | undefined;

  if (!existing) {
    const result = db.prepare(`
      INSERT INTO StockItem (pantry_id, storage_space_id, product_id, count, expiry_date, updated_at, updated_by)
      VALUES (@pantry_id, @storage_space_id, @product_id, @count, @expiry_date, @updated_at, @updated_by)
    `).run({ ...data, pantry_id: pantryId });
    const id = result.lastInsertRowid as number;
    return { id, created: true, record: db.prepare('SELECT * FROM StockItem WHERE id=?').get(id) };
  }

  // Last-write-wins: apply only if client timestamp >= server timestamp
  if (data.updated_at < existing.updated_at) {
    return { id: existing.id, created: false, serverWon: true, record: db.prepare('SELECT * FROM StockItem WHERE id=?').get(existing.id) };
  }

  db.prepare(`
    UPDATE StockItem
    SET count = @count, expiry_date = @expiry_date, updated_at = @updated_at, updated_by = @updated_by
    WHERE id = @id
  `).run({ ...data, id: existing.id });
  return { id: existing.id, created: false, serverWon: false, record: db.prepare('SELECT * FROM StockItem WHERE id=?').get(existing.id) };
}

export function getStockItemById(db: Database.Database, itemId: number) {
  return db.prepare(`SELECT * FROM StockItem WHERE id = ?`).get(itemId);
}

export function deleteStockItem(db: Database.Database, itemId: number) {
  db.prepare(`DELETE FROM StockItem WHERE id = ?`).run(itemId);
}
