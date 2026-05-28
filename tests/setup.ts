import { createTestDb } from '../server/db/connection.js';
import { runSchema } from '../server/db/schema.js';
import type Database from 'better-sqlite3';

export function createDb(): Database.Database {
  const db = createTestDb();
  runSchema(db);
  return db;
}

// Seed a user and return their id
export function seedUser(db: Database.Database, overrides: Record<string, unknown> = {}) {
  const defaults = {
    google_id: 'google-test-123',
    name: 'Test User',
    email: 'test@example.com',
    avatar_url: null,
  };
  const u = { ...defaults, ...overrides };
  const result = db.prepare(
    `INSERT INTO User (google_id, name, email, avatar_url) VALUES (?,?,?,?)`
  ).run(u.google_id, u.name, u.email, u.avatar_url);
  return result.lastInsertRowid as number;
}

// Seed a pantry and make userId its owner
export function seedPantry(db: Database.Database, userId: number, overrides: Record<string, unknown> = {}) {
  const defaults = { slug: 'test-pantry', display_name: 'Test Pantry' };
  const p = { ...defaults, ...overrides };
  const result = db.prepare(
    `INSERT INTO Pantry (slug, display_name, created_by) VALUES (?,?,?)`
  ).run(p.slug, p.display_name, userId);
  const pantryId = result.lastInsertRowid as number;
  db.prepare(
    `INSERT INTO PantryMember (pantry_id, user_id, role) VALUES (?,?,'owner')`
  ).run(pantryId, userId);
  return pantryId;
}
