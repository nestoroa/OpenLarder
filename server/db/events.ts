import type Database from 'better-sqlite3';

export type EventType =
  | 'stock_added' | 'stock_updated' | 'stock_removed'
  | 'shopping_item_added' | 'shopping_item_checked' | 'shopping_item_removed' | 'shopping_list_cleared'
  | 'member_joined' | 'member_removed'
  | 'storage_space_added' | 'storage_space_deleted';

export function logEvent(
  db: Database.Database,
  pantryId: number,
  userId: number,
  event_type: EventType,
  payload: Record<string, unknown>
) {
  db.prepare(`
    INSERT INTO PantryEvent (pantry_id, user_id, event_type, payload)
    VALUES (?, ?, ?, ?)
  `).run(pantryId, userId, event_type, JSON.stringify(payload));
}

export function getEvents(
  db: Database.Database,
  pantryId: number,
  before?: number,
  limit = 50
): { events: any[]; has_more: boolean } {
  const cap = Math.min(limit, 100);
  const fetchLimit = cap + 1;
  let rows: any[];
  if (before) {
    rows = db.prepare(`
      SELECT pe.*, u.name as user_name, u.avatar_url
      FROM PantryEvent pe JOIN User u ON u.id = pe.user_id
      WHERE pe.pantry_id = ? AND pe.id < ?
      ORDER BY pe.id DESC LIMIT ?
    `).all(pantryId, before, fetchLimit);
  } else {
    rows = db.prepare(`
      SELECT pe.*, u.name as user_name, u.avatar_url
      FROM PantryEvent pe JOIN User u ON u.id = pe.user_id
      WHERE pe.pantry_id = ?
      ORDER BY pe.id DESC LIMIT ?
    `).all(pantryId, fetchLimit);
  }
  const has_more = rows.length > cap;
  return { events: rows.slice(0, cap), has_more };
}
