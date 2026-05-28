import type Database from 'better-sqlite3';

export function getProductByBarcode(db: Database.Database, barcode: string) {
  return db.prepare(`SELECT * FROM Product WHERE barcode = ?`).get(barcode);
}

export function createProduct(
  db: Database.Database,
  data: { name: string; brand?: string; image_url?: string; barcode?: string }
) {
  const result = db.prepare(
    `INSERT INTO Product (name, brand, image_url, barcode) VALUES (@name, @brand, @image_url, @barcode)`
  ).run(data);
  return result.lastInsertRowid;
}

export function getProductById(db: Database.Database, id: number) {
  return db.prepare(`SELECT * FROM Product WHERE id = ?`).get(id);
}
