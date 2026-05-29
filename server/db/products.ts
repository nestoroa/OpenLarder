import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

export function getProductByBarcode(db: Database.Database, barcode: string) {
  return db.prepare(`SELECT * FROM Product WHERE barcode = ?`).get(barcode);
}

export function createProduct(
  db: Database.Database,
  data: { name: string; brand?: string | null; image_url?: string; barcode?: string | null }
) {
  const uuid = randomUUID();
  const result = db.prepare(
    `INSERT INTO Product (name, brand, image_url, barcode, uuid) VALUES (@name, @brand, @image_url, @barcode, @uuid)`
  ).run({ ...data, uuid });
  return result.lastInsertRowid;
}

export function getProductById(db: Database.Database, id: number) {
  return db.prepare(`SELECT * FROM Product WHERE id = ?`).get(id);
}

export function updateProduct(
  db: Database.Database,
  id: number,
  data: { name: string; brand?: string | null; barcode?: string | null }
) {
  db.prepare(
    `UPDATE Product SET name = @name, brand = @brand, barcode = @barcode WHERE id = @id`
  ).run({ name: data.name, brand: data.brand ?? null, barcode: data.barcode ?? null, id });
  return db.prepare(`SELECT * FROM Product WHERE id = ?`).get(id);
}

export function getPantryProduct(db: Database.Database, pantryId: number, productId: number) {
  return db.prepare(
    `SELECT * FROM PantryProduct WHERE pantry_id = ? AND product_id = ?`
  ).get(pantryId, productId);
}

export function upsertPantryProduct(
  db: Database.Database,
  pantryId: number,
  productId: number,
  data: { local_name: string | null; local_brand: string | null }
) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO PantryProduct (pantry_id, product_id, local_name, local_brand, updated_at)
    VALUES (@pantry_id, @product_id, @local_name, @local_brand, @updated_at)
    ON CONFLICT (pantry_id, product_id) DO UPDATE
      SET local_name  = excluded.local_name,
          local_brand = excluded.local_brand,
          updated_at  = excluded.updated_at
  `).run({ pantry_id: pantryId, product_id: productId, ...data, updated_at: now });
}
