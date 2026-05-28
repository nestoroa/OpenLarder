import type Database from 'better-sqlite3';

export function getSpaces(db: Database.Database, pantryId: number) {
  return db.prepare(
    `SELECT * FROM StorageSpace WHERE pantry_id = ? ORDER BY sort_order`
  ).all(pantryId);
}

export function createSpace(
  db: Database.Database,
  pantryId: number,
  data: { name: string; icon: string }
) {
  const next = db.prepare(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM StorageSpace WHERE pantry_id = ?`
  ).get(pantryId) as { next: number };
  const result = db.prepare(
    `INSERT INTO StorageSpace (pantry_id, name, icon, sort_order) VALUES (?, ?, ?, ?)`
  ).run(pantryId, data.name, data.icon, next.next);
  return result.lastInsertRowid;
}

export function getSpaceById(db: Database.Database, spaceId: number) {
  return db.prepare(`SELECT * FROM StorageSpace WHERE id = ?`).get(spaceId);
}

export function countItemsInSpace(db: Database.Database, spaceId: number): number {
  const row = db.prepare(
    `SELECT COUNT(*) as n FROM StockItem WHERE storage_space_id = ?`
  ).get(spaceId) as { n: number };
  return row.n;
}

export function deleteSpace(db: Database.Database, spaceId: number) {
  db.prepare(`DELETE FROM StorageSpace WHERE id = ?`).run(spaceId);
}
