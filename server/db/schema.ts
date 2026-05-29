import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

export function runSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS User (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      google_id   TEXT    UNIQUE NOT NULL,
      name        TEXT    NOT NULL,
      email       TEXT    UNIQUE NOT NULL,
      avatar_url  TEXT,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS Pantry (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      slug         TEXT    UNIQUE NOT NULL,
      display_name TEXT    NOT NULL,
      created_by   INTEGER NOT NULL REFERENCES User(id),
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS PantryMember (
      pantry_id  INTEGER NOT NULL REFERENCES Pantry(id),
      user_id    INTEGER NOT NULL REFERENCES User(id),
      role       TEXT    NOT NULL CHECK (role IN ('owner','member')),
      joined_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (pantry_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS Invite (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      pantry_id   INTEGER NOT NULL REFERENCES Pantry(id),
      type        TEXT    NOT NULL CHECK (type IN ('code','link')),
      token       TEXT    UNIQUE NOT NULL,
      created_by  INTEGER NOT NULL REFERENCES User(id),
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      expires_at  TEXT,
      used_by     INTEGER REFERENCES User(id),
      used_at     TEXT
    );

    CREATE TABLE IF NOT EXISTS StorageSpace (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      pantry_id   INTEGER NOT NULL REFERENCES Pantry(id),
      name        TEXT    NOT NULL,
      icon        TEXT    NOT NULL,
      sort_order  INTEGER NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS Product (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      barcode     TEXT    UNIQUE,
      name        TEXT    NOT NULL,
      brand       TEXT,
      image_url   TEXT,
      uuid        TEXT    UNIQUE,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS PantryProduct (
      pantry_id   INTEGER NOT NULL REFERENCES Pantry(id) ON DELETE CASCADE,
      product_id  INTEGER NOT NULL REFERENCES Product(id) ON DELETE CASCADE,
      local_name  TEXT,
      local_brand TEXT,
      updated_at  TEXT    NOT NULL,
      PRIMARY KEY (pantry_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS StockItem (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      pantry_id         INTEGER NOT NULL REFERENCES Pantry(id),
      storage_space_id  INTEGER NOT NULL REFERENCES StorageSpace(id),
      product_id        INTEGER NOT NULL REFERENCES Product(id),
      count             INTEGER NOT NULL DEFAULT 0,
      expiry_date       TEXT,
      updated_at        TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_by        INTEGER NOT NULL REFERENCES User(id),
      UNIQUE (pantry_id, storage_space_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS ShoppingListItem (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      pantry_id   INTEGER NOT NULL REFERENCES Pantry(id),
      product_id  INTEGER REFERENCES Product(id),
      custom_name TEXT,
      quantity    INTEGER NOT NULL DEFAULT 1,
      checked     INTEGER NOT NULL DEFAULT 0,
      added_by    INTEGER NOT NULL REFERENCES User(id),
      added_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      checked_by  INTEGER REFERENCES User(id),
      checked_at  TEXT,
      CHECK (product_id IS NOT NULL OR custom_name IS NOT NULL)
    );

    CREATE TABLE IF NOT EXISTS PantryEvent (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      pantry_id   INTEGER NOT NULL REFERENCES Pantry(id),
      user_id     INTEGER NOT NULL REFERENCES User(id),
      event_type  TEXT    NOT NULL,
      payload     TEXT    NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

export function runMigrations(db: Database.Database): void {
  // Add uuid column to Product if it doesn't exist (existing deployments).
  // SQLite does not allow UNIQUE in ALTER TABLE ADD COLUMN, so we add the
  // column first and create a separate unique index afterward.
  try {
    db.exec(`ALTER TABLE Product ADD COLUMN uuid TEXT`);
  } catch {
    // Column already exists — safe to ignore
  }
  try {
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_product_uuid ON Product(uuid)`);
  } catch {
    // Index already exists — safe to ignore
  }

  // Add PantryProduct table if it doesn't exist (existing deployments)
  db.exec(`
    CREATE TABLE IF NOT EXISTS PantryProduct (
      pantry_id   INTEGER NOT NULL REFERENCES Pantry(id) ON DELETE CASCADE,
      product_id  INTEGER NOT NULL REFERENCES Product(id) ON DELETE CASCADE,
      local_name  TEXT,
      local_brand TEXT,
      updated_at  TEXT    NOT NULL,
      PRIMARY KEY (pantry_id, product_id)
    )
  `);

  // Backfill uuid for any products that don't have one yet
  const missing = db.prepare(`SELECT id FROM Product WHERE uuid IS NULL`).all() as { id: number }[];
  const update = db.prepare(`UPDATE Product SET uuid = ? WHERE id = ?`);
  const backfill = db.transaction(() => {
    for (const row of missing) {
      update.run(randomUUID(), row.id);
    }
  });
  backfill();
}
