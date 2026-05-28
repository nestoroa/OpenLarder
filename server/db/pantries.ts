import type Database from 'better-sqlite3';

export function getPantriesForUser(db: Database.Database, userId: number) {
  return db.prepare(`
    SELECT p.id, p.slug, p.display_name, p.created_at, pm.role
    FROM Pantry p
    JOIN PantryMember pm ON pm.pantry_id = p.id
    WHERE pm.user_id = ?
  `).all(userId);
}

export function getPantryById(db: Database.Database, pantryId: number, userId: number) {
  return db.prepare(`
    SELECT p.id, p.slug, p.display_name, p.created_at, pm.role
    FROM Pantry p
    JOIN PantryMember pm ON pm.pantry_id = p.id AND pm.user_id = ?
    WHERE p.id = ?
  `).get(userId, pantryId);
}

export function getPantryBySlug(db: Database.Database, slug: string) {
  return db.prepare(`SELECT * FROM Pantry WHERE slug = ?`).get(slug);
}

export function createPantry(
  db: Database.Database,
  data: { slug: string; display_name: string; created_by: number }
) {
  const insert = db.transaction(() => {
    const result = db.prepare(
      `INSERT INTO Pantry (slug, display_name, created_by) VALUES (@slug, @display_name, @created_by)`
    ).run(data);
    const pantryId = result.lastInsertRowid as number;
    db.prepare(
      `INSERT INTO PantryMember (pantry_id, user_id, role) VALUES (?, ?, 'owner')`
    ).run(pantryId, data.created_by);
    return pantryId;
  });
  try {
    return insert();
  } catch (err: any) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') throw new Error('SLUG_TAKEN');
    throw err;
  }
}

export function updatePantryName(
  db: Database.Database,
  pantryId: number,
  display_name: string
) {
  db.prepare(`UPDATE Pantry SET display_name = ? WHERE id = ?`).run(display_name, pantryId);
}

export function getMemberRole(
  db: Database.Database,
  pantryId: number,
  userId: number
): string | null {
  const row = db.prepare(
    `SELECT role FROM PantryMember WHERE pantry_id = ? AND user_id = ?`
  ).get(pantryId, userId) as { role: string } | undefined;
  return row?.role ?? null;
}

export function getMembers(db: Database.Database, pantryId: number) {
  return db.prepare(`
    SELECT u.id as user_id, u.name, u.avatar_url, pm.role, pm.joined_at
    FROM PantryMember pm
    JOIN User u ON u.id = pm.user_id
    WHERE pm.pantry_id = ?
  `).all(pantryId);
}

export function addMember(
  db: Database.Database,
  pantryId: number,
  userId: number,
  role: 'owner' | 'member' = 'member'
) {
  db.prepare(
    `INSERT INTO PantryMember (pantry_id, user_id, role) VALUES (?, ?, ?)`
  ).run(pantryId, userId, role);
}

export function removeMember(db: Database.Database, pantryId: number, userId: number) {
  db.prepare(`DELETE FROM PantryMember WHERE pantry_id = ? AND user_id = ?`).run(pantryId, userId);
}

export function deletePantry(db: Database.Database, pantryId: number) {
  const del = db.transaction(() => {
    db.prepare(`DELETE FROM PantryEvent WHERE pantry_id = ?`).run(pantryId);
    db.prepare(`DELETE FROM ShoppingListItem WHERE pantry_id = ?`).run(pantryId);
    db.prepare(`DELETE FROM StockItem WHERE pantry_id = ?`).run(pantryId);
    db.prepare(`DELETE FROM Invite WHERE pantry_id = ?`).run(pantryId);
    db.prepare(`DELETE FROM StorageSpace WHERE pantry_id = ?`).run(pantryId);
    db.prepare(`DELETE FROM PantryMember WHERE pantry_id = ?`).run(pantryId);
    db.prepare(`DELETE FROM Pantry WHERE id = ?`).run(pantryId);
  });
  del();
}

export function countNonOwnerMembers(db: Database.Database, pantryId: number): number {
  const row = db.prepare(
    `SELECT COUNT(*) as n FROM PantryMember WHERE pantry_id = ? AND role != 'owner'`
  ).get(pantryId) as { n: number };
  return row.n;
}
