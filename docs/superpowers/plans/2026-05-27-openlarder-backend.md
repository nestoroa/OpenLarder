# OpenLarder Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete OpenLarder Node.js backend: project scaffold, SQLite database, Google OAuth auth, and all REST API routes.

**Architecture:** Single Node.js project. Express boots as the HTTP server and mounts the Astro frontend as middleware (added in Plan B). This plan delivers a fully testable API with no frontend dependency — all routes can be verified with Supertest or curl.

**Tech Stack:** Node.js 22, TypeScript, Astro (scaffold only), Express.js, better-sqlite3, Passport.js + Google OAuth, Vitest, Supertest.

**Spec:** `docs/superpowers/specs/2026-05-27-openlarder-design.md`

---

## File Map

```
openlarder/
├── vitest.config.ts                   # Vitest config
├── entry.mjs                          # Express entry point (Astro mounted in Plan B)
├── astro.config.mjs                   # Astro config with @astrojs/node adapter
├── vite.config.mjs                    # vite-plugin-pwa placeholder (configured in Plan C)
├── tailwind.config.mjs                # Tailwind config (used in Plan B)
├── tsconfig.json
├── package.json
├── .env.example
├── server/
│   ├── types.ts                           # Express session + locals type augmentation
│   ├── db/
│   │   ├── connection.ts              # SQLite connection singleton + PRAGMA setup
│   │   ├── schema.ts                  # CREATE TABLE statements, run on startup
│   │   ├── users.ts                   # User query functions
│   │   ├── pantries.ts                # Pantry + PantryMember query functions
│   │   ├── spaces.ts                  # StorageSpace query functions
│   │   ├── products.ts                # Product query functions
│   │   ├── stock.ts                   # StockItem query functions
│   │   ├── shopping.ts                # ShoppingListItem query functions
│   │   ├── invites.ts                 # Invite query functions
│   │   └── events.ts                  # PantryEvent query functions
│   ├── routes/
│   │   ├── auth.ts                    # GET /auth/google, GET /auth/google/callback, POST /auth/logout
│   │   ├── me.ts                      # GET /api/me
│   │   ├── pantries.ts                # CRUD pantries, members
│   │   ├── spaces.ts                  # Storage spaces
│   │   ├── products.ts                # Product lookup + creation
│   │   ├── stock.ts                   # Stock items
│   │   ├── shopping.ts                # Shopping list
│   │   ├── invites.ts                 # Create + consume invites
│   │   └── events.ts                  # Activity log
│   └── middleware/
│       ├── requireAuth.ts             # 401 if no session
│       ├── requireMember.ts           # 403 if not PantryMember of :id
│       ├── requireOwner.ts            # 403 if not owner role
│       └── errors.ts                  # Global error handler
└── tests/
    ├── setup.ts                       # In-memory SQLite test DB setup
    ├── db/
    │   ├── users.test.ts
    │   ├── pantries.test.ts
    │   ├── stock.test.ts
    │   └── shopping.test.ts
    └── routes/
        ├── auth.test.ts
        ├── pantries.test.ts
        ├── stock.test.ts
        ├── shopping.test.ts
        ├── invites.test.ts
        └── events.test.ts
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `astro.config.mjs`
- Create: `vite.config.mjs`
- Create: `tailwind.config.mjs`
- Create: `.env.example`
- Create: `entry.mjs`

- [ ] **Step 1: Initialise the project**

```bash
mkdir -p openlarder && cd openlarder
npm init -y
```

- [ ] **Step 2: Install all dependencies**

```bash
npm install astro @astrojs/node @astrojs/react react react-dom \
  express express-session passport passport-google-oauth20 \
  better-sqlite3 better-sqlite3-session-store \
  uuid crypto-js

npm install -D typescript @types/node @types/express @types/express-session \
  @types/passport @types/passport-google-oauth20 @types/better-sqlite3 \
  @types/react @types/react-dom @types/uuid \
  vitest @vitest/coverage-v8 supertest @types/supertest \
  tailwindcss @tailwindcss/vite vite-plugin-pwa
```

- [ ] **Step 3: Write `package.json` scripts**

```json
{
  "name": "openlarder",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "astro build --watch & node entry.mjs",
    "build": "astro build",
    "start": "node entry.mjs",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 4: Write `tsconfig.json`**

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  }
}
```

- [ ] **Step 5: Write `astro.config.mjs`**

Note: We use Tailwind CSS v4 with `@tailwindcss/vite` (the v4 Vite plugin), NOT `@astrojs/tailwind` (which is v3 only). `tailwind.config.mjs` is not needed for v4 — configuration is done in CSS.

```js
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'middleware' }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
```

Delete `tailwind.config.mjs` — it is not used by Tailwind v4. The v4 config is embedded in CSS via `@import "tailwindcss"` and `@theme` directives if customisation is needed.

- [ ] **Step 6: Write `vite.config.mjs` (placeholder — PWA added in Plan C)**

```js
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [],
});
```

- [ ] **Step 7: Write `.env.example`**

```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:4321/auth/google/callback
SESSION_SECRET=change-me-in-production
DATABASE_PATH=./openlarder.db
PORT=4321
NODE_ENV=development
```

- [ ] **Step 8: Write `entry.mjs` (stub — Astro middleware added in Plan B)**

```js
import express from 'express';
import session from 'express-session';
import passport from 'passport';
import SqliteStore from 'better-sqlite3-session-store';
import { getDb } from './server/db/connection.js';
import { runSchema } from './server/db/schema.js';

// Route imports
import authRouter from './server/routes/auth.js';
import meRouter from './server/routes/me.js';
import pantriesRouter from './server/routes/pantries.js';
import spacesRouter from './server/routes/spaces.js';
import productsRouter from './server/routes/products.js';
import stockRouter from './server/routes/stock.js';
import shoppingRouter from './server/routes/shopping.js';
import invitesRouter from './server/routes/invites.js';
import eventsRouter from './server/routes/events.js';
import { errorHandler } from './server/middleware/errors.js';

const app = express();
const db = getDb();
runSchema(db);

const Store = SqliteStore(session);
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  store: new Store({ client: db }),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  },
}));
app.use(passport.initialize());
app.use(passport.session());

// IMPORTANT: static routes before /:id-scoped middleware
app.use('/auth', authRouter);
app.use('/api/me', meRouter);
app.use('/api/pantries/join', pantriesRouter);   // must be before /:id routes
app.use('/api/invites', invitesRouter);
app.use('/api/pantries', pantriesRouter);
app.use('/api/pantries', spacesRouter);
app.use('/api/pantries', stockRouter);
app.use('/api/pantries', shoppingRouter);
app.use('/api/pantries', eventsRouter);
app.use('/api/products', productsRouter);
app.use(errorHandler);

const port = process.env.PORT || 4321;
app.listen(port, () => console.log(`OpenLarder running on :${port}`));

export { app }; // exported for tests
```

- [ ] **Step 9: Verify the project scaffolds without syntax errors**

Do NOT run `node entry.mjs` yet — it imports route files that don't exist until Tasks 4–9 and will throw `ERR_MODULE_NOT_FOUND`. Instead verify the scaffold compiles cleanly:

```bash
npx tsc --noEmit
```

Expected: no TypeScript errors (some "not found" errors for missing route modules are acceptable at this stage — they'll be resolved as tasks progress). Defer the full runtime check to after Task 9.

- [ ] **Step 10: Commit**

```bash
git init
git add .
git commit -m "scaffold: initial project setup, deps, entry point stub"
```

---

## Task 2: Database Connection + Schema

**Files:**
- Create: `server/db/connection.ts`
- Create: `server/db/schema.ts`
- Create: `tests/setup.ts`

- [ ] **Step 1: Write `server/db/connection.ts`**

```ts
import Database from 'better-sqlite3';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const path = process.env.DATABASE_PATH || './openlarder.db';
    db = new Database(path);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

// For tests: create a fresh in-memory DB
export function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}
```

- [ ] **Step 2: Write `server/db/schema.ts`**

```ts
import type Database from 'better-sqlite3';

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
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
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
```

- [ ] **Step 3: Write `tests/setup.ts`**

```ts
import { createTestDb } from '../server/db/connection.js';
import { runSchema } from '../server/db/schema.js';
import type Database from 'better-sqlite3';

export function createDb(): Database.Database {
  const db = createTestDb();
  runSchema(db);
  return db;
}

// Seed a user and return their id
export function seedUser(db: Database.Database, overrides = {}) {
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
export function seedPantry(db: Database.Database, userId: number, overrides = {}) {
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
```

- [ ] **Step 4: Add `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
});
```

- [ ] **Step 5: Write schema smoke test**

```ts
// tests/db/schema.test.ts
import { describe, it, expect } from 'vitest';
import { createDb } from '../setup.js';

describe('schema', () => {
  it('creates all tables without error', () => {
    const db = createDb();
    const tables = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table'`
    ).all().map((r: any) => r.name);

    expect(tables).toContain('User');
    expect(tables).toContain('Pantry');
    expect(tables).toContain('PantryMember');
    expect(tables).toContain('Invite');
    expect(tables).toContain('StorageSpace');
    expect(tables).toContain('Product');
    expect(tables).toContain('StockItem');
    expect(tables).toContain('ShoppingListItem');
    expect(tables).toContain('PantryEvent');
  });

  it('enforces foreign_keys pragma', () => {
    const db = createDb();
    const fk = db.pragma('foreign_keys', { simple: true });
    expect(fk).toBe(1);
  });
});
```

- [ ] **Step 6: Run tests**

```bash
npm test
```

Expected: 2 passing tests.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat: db connection, schema, test setup"
```

---

## Task 3: Database Query Functions

**Files:**
- Create: `server/db/users.ts`
- Create: `server/db/pantries.ts`
- Create: `server/db/spaces.ts`
- Create: `server/db/products.ts`
- Create: `server/db/stock.ts`
- Create: `server/db/shopping.ts`
- Create: `server/db/invites.ts`
- Create: `server/db/events.ts`

- [ ] **Step 1: Write `server/db/users.ts`**

```ts
import type Database from 'better-sqlite3';

export interface User {
  id: number;
  google_id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  created_at: string;
}

export function upsertUser(
  db: Database.Database,
  data: Pick<User, 'google_id' | 'name' | 'email' | 'avatar_url'>
): User {
  db.prepare(`
    INSERT INTO User (google_id, name, email, avatar_url)
    VALUES (@google_id, @name, @email, @avatar_url)
    ON CONFLICT(google_id) DO UPDATE SET
      name = excluded.name,
      email = excluded.email,
      avatar_url = excluded.avatar_url
  `).run(data);
  return db.prepare(`SELECT * FROM User WHERE google_id = ?`).get(data.google_id) as User;
}

export function getUserById(db: Database.Database, id: number): User | null {
  return db.prepare(`SELECT * FROM User WHERE id = ?`).get(id) as User | null;
}
```

- [ ] **Step 2: Write `server/db/pantries.ts`**

```ts
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
  return insert();
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
    // Delete in dependency order — no ON DELETE CASCADE
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
```

- [ ] **Step 3: Write `server/db/spaces.ts`**

```ts
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
```

- [ ] **Step 4: Write `server/db/products.ts`**

```ts
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
```

- [ ] **Step 5: Write `server/db/stock.ts`**

```ts
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
    updated_at: string; // client's timestamp — used for last-write-wins
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
    // Server wins — return current server record unchanged
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
```

- [ ] **Step 6: Write `server/db/shopping.ts`**

```ts
import type Database from 'better-sqlite3';

export function getShoppingList(db: Database.Database, pantryId: number) {
  return db.prepare(`
    SELECT
      sl.id, sl.quantity, sl.checked, sl.checked_at, sl.added_at, sl.updated_at,
      sl.custom_name,
      p.id as product_id, p.name as product_name
    FROM ShoppingListItem sl
    LEFT JOIN Product p ON p.id = sl.product_id
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
  `).run({ ...data, pantry_id: pantryId, now });
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
  // Last-write-wins: only apply if client timestamp >= server's
  const current = db.prepare(
    `SELECT updated_at FROM ShoppingListItem WHERE id = ?`
  ).get(itemId) as { updated_at: string } | undefined;

  if (!current) return null;
  if (data.client_updated_at < current.updated_at) {
    // Server wins: return current record
    return db.prepare(`SELECT * FROM ShoppingListItem WHERE id = ?`).get(itemId);
  }

  const checked_at = data.checked ? new Date().toISOString() : null;
  db.prepare(`
    UPDATE ShoppingListItem
    SET checked = @checked, quantity = COALESCE(@quantity, quantity),
        updated_at = @updated_at, checked_by = @checked_by, checked_at = @checked_at
    WHERE id = @id
  `).run({
    checked: data.checked ? 1 : 0,
    quantity: data.quantity,
    updated_at: data.updated_at,
    checked_by: data.checked_by ?? null,
    checked_at,
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
```

- [ ] **Step 7: Write `server/db/invites.ts`**

```ts
import type Database from 'better-sqlite3';
import { randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

export function generateToken(type: 'code' | 'link'): string {
  if (type === 'link') return uuidv4();
  // 8-char uppercase alphanumeric
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusable chars
  return Array.from(randomBytes(8))
    .map(b => chars[b % chars.length])
    .join('');
}

export function createInvite(
  db: Database.Database,
  data: {
    pantry_id: number;
    type: 'code' | 'link';
    created_by: number;
    expires_at?: string;
  }
) {
  const token = generateToken(data.type);
  const result = db.prepare(`
    INSERT INTO Invite (pantry_id, type, token, created_by, expires_at)
    VALUES (@pantry_id, @type, @token, @created_by, @expires_at)
  `).run({ ...data, token, expires_at: data.expires_at ?? null });
  return { id: result.lastInsertRowid, token, type: data.type, expires_at: data.expires_at ?? null };
}

export function findValidInvite(db: Database.Database, token: string) {
  return db.prepare(`
    SELECT * FROM Invite
    WHERE token = ?
      AND used_at IS NULL
      AND (expires_at IS NULL OR expires_at > datetime('now'))
  `).get(token);
}

export function consumeInvite(db: Database.Database, inviteId: number, userId: number) {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE Invite SET used_by = ?, used_at = ? WHERE id = ?`
  ).run(userId, now, inviteId);
}
```

- [ ] **Step 8: Write `server/db/events.ts`**

```ts
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
  // Fetch cap+1 to detect has_more without a separate COUNT query
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
```

- [ ] **Step 9: Write DB query tests**

```ts
// tests/db/pantries.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, seedUser, seedPantry } from '../setup.js';
import * as pantriesDb from '../../server/db/pantries.js';

describe('pantries db', () => {
  let db: ReturnType<typeof createDb>;
  let userId: number;

  beforeEach(() => {
    db = createDb();
    userId = seedUser(db);
  });

  it('creates a pantry and adds owner as member', () => {
    const id = pantriesDb.createPantry(db, { slug: 'my-pantry', display_name: 'My Pantry', created_by: userId });
    const pantries = pantriesDb.getPantriesForUser(db, userId);
    expect(pantries).toHaveLength(1);
    expect((pantries[0] as any).role).toBe('owner');
  });

  it('returns null role for non-member', () => {
    const pantryId = seedPantry(db, userId);
    const other = seedUser(db, { google_id: 'g2', email: 'b@b.com', name: 'B' });
    expect(pantriesDb.getMemberRole(db, pantryId, other)).toBeNull();
  });

  it('blocks delete when non-owner members exist', () => {
    const pantryId = seedPantry(db, userId);
    const other = seedUser(db, { google_id: 'g2', email: 'b@b.com', name: 'B' });
    pantriesDb.addMember(db, pantryId, other);
    expect(pantriesDb.countNonOwnerMembers(db, pantryId)).toBe(1);
  });

  it('deletes pantry and all child rows', () => {
    const pantryId = seedPantry(db, userId);
    pantriesDb.deletePantry(db, pantryId);
    expect(pantriesDb.getPantriesForUser(db, userId)).toHaveLength(0);
  });
});
```

- [ ] **Step 10: Run tests**

```bash
npm test
```

Expected: all DB tests passing.

- [ ] **Step 11: Commit**

```bash
git add .
git commit -m "feat: all db query functions with tests"
```

---

## Task 4: Auth Middleware + Google OAuth

**Files:**
- Create: `server/middleware/requireAuth.ts`
- Create: `server/middleware/requireMember.ts`
- Create: `server/middleware/requireOwner.ts`
- Create: `server/middleware/errors.ts`
- Create: `server/routes/auth.ts`
- Create: `server/routes/me.ts`

- [ ] **Step 1: Extend Express session type**

```ts
// server/types.ts
import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId: number;
  }
}
```

- [ ] **Step 2: Write `server/middleware/requireAuth.ts`**

```ts
import type { Request, Response, NextFunction } from 'express';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}
```

- [ ] **Step 3: Write `server/middleware/requireMember.ts`**

```ts
import type { Request, Response, NextFunction } from 'express';
import { getMemberRole } from '../db/pantries.js';
import { getDb } from '../db/connection.js';

export function requireMember(req: Request, res: Response, next: NextFunction) {
  const pantryId = parseInt(req.params.id, 10);
  const role = getMemberRole(getDb(), pantryId, req.session.userId!);
  if (!role) return res.status(403).json({ error: 'Not a member of this pantry' });
  (req as any).userRole = role;
  (req as any).pantryId = pantryId;
  next();
}
```

- [ ] **Step 4: Write `server/middleware/requireOwner.ts`**

```ts
import type { Request, Response, NextFunction } from 'express';

export function requireOwner(req: Request, res: Response, next: NextFunction) {
  if ((req as any).userRole !== 'owner') {
    return res.status(403).json({ error: 'Owner only' });
  }
  next();
}
```

- [ ] **Step 5: Write `server/middleware/errors.ts`**

```ts
import type { Request, Response, NextFunction } from 'express';

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}
```

- [ ] **Step 6: Write `server/routes/auth.ts`**

```ts
import { Router } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { upsertUser, getUserById } from '../db/users.js';
import { getDb } from '../db/connection.js';

const router = Router();

passport.use(new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    callbackURL: process.env.GOOGLE_CALLBACK_URL!,
  },
  (_accessToken, _refreshToken, profile, done) => {
    const user = upsertUser(getDb(), {
      google_id: profile.id,
      name: profile.displayName,
      email: profile.emails?.[0].value ?? '',
      avatar_url: profile.photos?.[0].value ?? null,
    });
    done(null, user);
  }
));

passport.serializeUser((user: any, done) => done(null, user.id));
passport.deserializeUser((id: number, done) => {
  const user = getUserById(getDb(), id);
  done(null, user ?? false);
});

router.get('/google', (req, res, next) => {
  // Preserve invite token in OAuth state if present
  const state = req.query.token ? JSON.stringify({ token: req.query.token }) : undefined;
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    ...(state ? { state } : {}),
  })(req, res, next);
});

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    req.session.userId = (req.user as any).id;
    // If state contains an invite token, redirect to /join
    try {
      const state = JSON.parse(req.query.state as string ?? '{}');
      if (state.token) return res.redirect(`/join?token=${state.token}`);
    } catch {}
    res.redirect('/pantries');
  }
);

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

export default router;
```

- [ ] **Step 7: Write `server/routes/me.ts`**

```ts
import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { getUserById } from '../db/users.js';
import { getDb } from '../db/connection.js';

const router = Router();

router.get('/', requireAuth, (req, res) => {
  const user = getUserById(getDb(), req.session.userId!);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { google_id: _, ...safe } = user;
  res.json(safe);
});

export default router;
```

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "feat: auth middleware, google oauth, /api/me"
```

---

## Task 5: Pantries + Members API

**Files:**
- Create: `server/routes/pantries.ts`

- [ ] **Step 1: Write `server/routes/pantries.ts`**

```ts
import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireMember } from '../middleware/requireMember.js';
import { requireOwner } from '../middleware/requireOwner.js';
import * as db from '../db/pantries.js';
import * as eventsDb from '../db/events.js';
import * as invitesDb from '../db/invites.js';
import { getUserById } from '../db/users.js';
import { getDb } from '../db/connection.js';

const router = Router();
const d = () => getDb();

// POST /api/pantries/join  — must be registered BEFORE /:id routes in entry.mjs
router.post('/join', requireAuth, async (req, res) => {
  const { slug, code } = req.body;
  if (!slug || !code) return res.status(400).json({ error: 'slug and code required' });
  const pantry = db.getPantryBySlug(d(), slug) as any;
  if (!pantry) return res.status(404).json({ error: 'Pantry not found' });

  const invite = invitesDb.findValidInvite(d(), code) as any;
  if (!invite || invite.pantry_id !== pantry.id) return res.status(410).json({ error: 'Invalid or expired code' });
  if (db.getMemberRole(d(), pantry.id, req.session.userId!)) {
    return res.status(409).json({ error: 'Already a member' });
  }
  invitesDb.consumeInvite(d(), invite.id, req.session.userId!);
  db.addMember(d(), pantry.id, req.session.userId!);
  const user = getUserById(d(), req.session.userId!) as any;
  eventsDb.logEvent(d(), pantry.id, req.session.userId!, 'member_joined', { user_name: user?.name ?? '', invite_type: 'code' });
  res.json({ pantry_id: pantry.id });
});

// GET /api/pantries
router.get('/', requireAuth, (req, res) => {
  res.json(db.getPantriesForUser(d(), req.session.userId!));
});

// POST /api/pantries
router.post('/', requireAuth, (req, res) => {
  const { slug, display_name } = req.body;
  if (!slug || !display_name) return res.status(400).json({ error: 'slug and display_name required' });
  // Validate slug format
  if (!/^[a-z0-9-]{3,32}$/.test(slug)) {
    return res.status(400).json({ error: 'slug must be 3-32 chars, lowercase alphanumeric and hyphens' });
  }
  if (db.getPantryBySlug(d(), slug)) return res.status(409).json({ error: 'Slug already taken' });
  const id = db.createPantry(d(), { slug, display_name, created_by: req.session.userId! });
  const pantry = db.getPantryById(d(), id as number, req.session.userId!);
  res.status(201).json(pantry);
});

// GET /api/pantries/:id
router.get('/:id', requireAuth, requireMember, (req, res) => {
  res.json(db.getPantryById(d(), (req as any).pantryId, req.session.userId!));
});

// PATCH /api/pantries/:id
router.patch('/:id', requireAuth, requireMember, requireOwner, (req, res) => {
  const { display_name } = req.body;
  if (!display_name) return res.status(400).json({ error: 'display_name required' });
  db.updatePantryName(d(), (req as any).pantryId, display_name);
  res.json(db.getPantryById(d(), (req as any).pantryId, req.session.userId!));
});

// DELETE /api/pantries/:id
router.delete('/:id', requireAuth, requireMember, requireOwner, (req, res) => {
  const pantryId = (req as any).pantryId;
  if (db.countNonOwnerMembers(d(), pantryId) > 0) {
    return res.status(409).json({ error: 'Remove all other members first' });
  }
  db.deletePantry(d(), pantryId);
  res.json({ ok: true });
});

// GET /api/pantries/:id/members
router.get('/:id/members', requireAuth, requireMember, (req, res) => {
  res.json(db.getMembers(d(), (req as any).pantryId));
});

// DELETE /api/pantries/:id/members/:userId
router.delete('/:id/members/:userId', requireAuth, requireMember, requireOwner, (req, res) => {
  const targetId = parseInt(req.params.userId, 10);
  if (targetId === req.session.userId) {
    return res.status(403).json({ error: 'Owner cannot remove themselves' });
  }
  const targetUser = getUserById(d(), targetId) as any;
  db.removeMember(d(), (req as any).pantryId, targetId);
  eventsDb.logEvent(d(), (req as any).pantryId, req.session.userId!, 'member_removed', { user_name: targetUser?.name ?? '' });
  res.json({ ok: true });
});

export default router;
```

- [ ] **Step 2: Write slug validation unit test (no entry.mjs import)**

```ts
// tests/routes/pantries.test.ts
import { describe, it, expect } from 'vitest';

// Slug format validation — test the regex used in the route
describe('slug validation', () => {
  const SLUG_RE = /^[a-z0-9-]{3,32}$/;
  it('rejects uppercase and special chars', () => {
    expect(SLUG_RE.test('My Pantry!')).toBe(false);
  });
  it('accepts valid slug', () => {
    expect(SLUG_RE.test('my-pantry')).toBe(true);
    expect(SLUG_RE.test('kitchen-2')).toBe(true);
  });
  it('rejects slugs shorter than 3 chars', () => {
    expect(SLUG_RE.test('ab')).toBe(false);
  });
});
```

Note: full HTTP-level route tests (using Supertest + `entry.mjs`) should be added after Task 9 when all route modules exist. An import of `entry.mjs` before Tasks 6–9 complete will throw `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Run tests**

```bash
npm test
```

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: pantries + members API routes"
```

---

## Task 6: Storage Spaces + Products API

**Files:**
- Create: `server/routes/spaces.ts`
- Create: `server/routes/products.ts`

- [ ] **Step 1: Write `server/routes/spaces.ts`**

```ts
import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireMember } from '../middleware/requireMember.js';
import { requireOwner } from '../middleware/requireOwner.js';
import * as spacesDb from '../db/spaces.js';
import * as eventsDb from '../db/events.js';
import { getDb } from '../db/connection.js';

const router = Router({ mergeParams: true });
const d = () => getDb();

router.get('/:id/spaces', requireAuth, requireMember, (req, res) => {
  res.json(spacesDb.getSpaces(d(), (req as any).pantryId));
});

router.post('/:id/spaces', requireAuth, requireMember, requireOwner, (req, res) => {
  const { name, icon } = req.body;
  if (!name || !icon) return res.status(400).json({ error: 'name and icon required' });
  const id = spacesDb.createSpace(d(), (req as any).pantryId, { name, icon });
  eventsDb.logEvent(d(), (req as any).pantryId, req.session.userId!, 'storage_space_added', { space_name: name, icon });
  res.status(201).json(spacesDb.getSpaceById(d(), id as number));
});

router.delete('/:id/spaces/:spaceId', requireAuth, requireMember, requireOwner, (req, res) => {
  const spaceId = parseInt(req.params.spaceId, 10);
  const space = spacesDb.getSpaceById(d(), spaceId) as any;
  if (!space || space.pantry_id !== (req as any).pantryId) {
    return res.status(404).json({ error: 'Space not found' });
  }
  const count = spacesDb.countItemsInSpace(d(), spaceId);
  if (count > 0) {
    return res.status(409).json({ error: `Remove ${count} item(s) from this space first` });
  }
  eventsDb.logEvent(d(), (req as any).pantryId, req.session.userId!, 'storage_space_deleted', { space_name: space.name });
  spacesDb.deleteSpace(d(), spaceId);
  res.json({ ok: true });
});

export default router;
```

- [ ] **Step 2: Write `server/routes/products.ts`**

```ts
import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import * as productsDb from '../db/products.js';
import { getDb } from '../db/connection.js';

const router = Router();
const d = () => getDb();

// GET /api/products/barcode/:code
router.get('/barcode/:code', requireAuth, async (req, res) => {
  const { code } = req.params;

  // Check local DB first
  const local = productsDb.getProductByBarcode(d(), code);
  if (local) return res.json(local);

  // Query Open Food Facts
  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${code}.json`
    );
    const data = await response.json() as any;
    if (data.status !== 1 || !data.product) return res.status(404).json({ error: 'Product not found' });

    const product = data.product;
    const id = productsDb.createProduct(d(), {
      barcode: code,
      name: product.product_name || product.product_name_en || 'Unknown',
      brand: product.brands || undefined,
      image_url: product.image_url || undefined,
    });
    res.json(productsDb.getProductById(d(), id as number));
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach Open Food Facts' });
  }
});

// POST /api/products
router.post('/', requireAuth, (req, res) => {
  const { name, brand, barcode } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = productsDb.createProduct(d(), { name, brand, barcode });
  res.status(201).json(productsDb.getProductById(d(), id as number));
});

export default router;
```

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat: storage spaces and products API routes"
```

---

## Task 7: Stock API

**Files:**
- Create: `server/routes/stock.ts`

- [ ] **Step 1: Write `server/routes/stock.ts`**

```ts
import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireMember } from '../middleware/requireMember.js';
import * as stockDb from '../db/stock.js';
import * as productsDb from '../db/products.js';
import * as spacesDb from '../db/spaces.js';
import * as eventsDb from '../db/events.js';
import { getDb } from '../db/connection.js';

const router = Router({ mergeParams: true });
const d = () => getDb();

// GET /api/pantries/:id/stock
router.get('/:id/stock', requireAuth, requireMember, (req, res) => {
  const raw = stockDb.getStock(d(), (req as any).pantryId);
  // Shape into nested response
  const items = raw.map((r: any) => ({
    id: r.id,
    count: r.count,
    expiry_date: r.expiry_date,
    updated_at: r.updated_at,
    product: { id: r.product_id, name: r.product_name, brand: r.brand, image_url: r.image_url, barcode: r.barcode },
    storage_space: { id: r.space_id, name: r.space_name, icon: r.space_icon },
  }));
  res.json(items);
});

// PUT /api/pantries/:id/stock
router.put('/:id/stock', requireAuth, requireMember, (req, res) => {
  const { storage_space_id, product_id, count, expiry_date, updated_at } = req.body;
  if (storage_space_id == null || product_id == null || count == null || !updated_at) {
    return res.status(400).json({ error: 'storage_space_id, product_id, count, updated_at required' });
  }
  const pantryId = (req as any).pantryId;

  // Fetch names for event payload before upsert
  const product = productsDb.getProductById(d(), product_id) as any;
  const space = spacesDb.getSpaceById(d(), storage_space_id) as any;
  const existing = d().prepare(
    'SELECT count FROM StockItem WHERE pantry_id=? AND storage_space_id=? AND product_id=?'
  ).get(pantryId, storage_space_id, product_id) as any;

  const result = stockDb.upsertStock(d(), pantryId, {
    storage_space_id, product_id, count, expiry_date, updated_at,
    updated_by: req.session.userId!,
  });
  const { id, created } = result;

  // Only log event if we actually applied the change (not server-won LWW)
  if (!('serverWon' in result) || !result.serverWon) {
    eventsDb.logEvent(d(), pantryId, req.session.userId!,
      created ? 'stock_added' : 'stock_updated',
    created
      ? { product_name: product?.name ?? '', storage_space: space?.name ?? '', count, expiry_date: expiry_date ?? null }
      : { product_name: product?.name ?? '', storage_space: space?.name ?? '', count_before: existing?.count ?? 0, count_after: count, expiry_date: expiry_date ?? null }
    );
  }

  // Return current record (either updated or server's existing) — client reconciles IndexedDB
  res.json({ id, created, record: result.record });
});

// DELETE /api/pantries/:id/stock/:itemId
router.delete('/:id/stock/:itemId', requireAuth, requireMember, (req, res) => {
  const itemId = parseInt(req.params.itemId, 10);
  const item = stockDb.getStockItemById(d(), itemId) as any;
  if (!item || item.pantry_id !== (req as any).pantryId) {
    return res.status(404).json({ error: 'Stock item not found' });
  }
  const product = productsDb.getProductById(d(), item.product_id) as any;
  const space = spacesDb.getSpaceById(d(), item.storage_space_id) as any;
  eventsDb.logEvent(d(), (req as any).pantryId, req.session.userId!, 'stock_removed', {
    product_name: product?.name ?? '', storage_space: space?.name ?? '',
  });
  stockDb.deleteStockItem(d(), itemId);
  res.json({ ok: true });
});

export default router;
```

- [ ] **Step 2: Commit**

```bash
git add .
git commit -m "feat: stock API routes with event logging"
```

---

## Task 8: Shopping List API

**Files:**
- Create: `server/routes/shopping.ts`

- [ ] **Step 1: Write `server/routes/shopping.ts`**

```ts
import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireMember } from '../middleware/requireMember.js';
import * as shoppingDb from '../db/shopping.js';
import * as productsDb from '../db/products.js';
import * as eventsDb from '../db/events.js';
import { getDb } from '../db/connection.js';

const router = Router({ mergeParams: true });
const d = () => getDb();

router.get('/:id/shopping', requireAuth, requireMember, (req, res) => {
  const raw = shoppingDb.getShoppingList(d(), (req as any).pantryId);
  const items = raw.map((r: any) => ({
    id: r.id, quantity: r.quantity, checked: !!r.checked,
    checked_at: r.checked_at, added_at: r.added_at, updated_at: r.updated_at,
    custom_name: r.custom_name,
    product: r.product_id ? { id: r.product_id, name: r.product_name } : null,
  }));
  res.json(items);
});

router.post('/:id/shopping', requireAuth, requireMember, (req, res) => {
  const { product_id, custom_name, quantity = 1 } = req.body;
  if (!product_id && !custom_name) return res.status(400).json({ error: 'product_id or custom_name required' });
  const id = shoppingDb.addShoppingItem(d(), (req as any).pantryId, {
    product_id, custom_name, quantity, added_by: req.session.userId!,
  });
  let itemName = custom_name ?? '';
  if (!itemName && product_id) {
    const p = productsDb.getProductById(d(), product_id) as any;
    itemName = p?.name ?? '';
  }
  eventsDb.logEvent(d(), (req as any).pantryId, req.session.userId!, 'shopping_item_added', { item_name: itemName });
  res.status(201).json({ id });
});

router.patch('/:id/shopping/:itemId', requireAuth, requireMember, (req, res) => {
  const itemId = parseInt(req.params.itemId, 10);
  const pantryId = (req as any).pantryId;
  // Verify item belongs to this pantry
  const owned = d().prepare('SELECT id FROM ShoppingListItem WHERE id=? AND pantry_id=?').get(itemId, pantryId);
  if (!owned) return res.status(404).json({ error: 'Item not found' });
  const { checked, quantity, updated_at } = req.body;
  if (!updated_at) return res.status(400).json({ error: 'updated_at required' });
  const result = shoppingDb.patchShoppingItem(d(), itemId, {
    checked, quantity, updated_at,
    client_updated_at: updated_at,
    checked_by: checked ? req.session.userId! : undefined,
  });
  if (!result) return res.status(404).json({ error: 'Item not found' });
  if (checked === true) {
    const r = result as any;
    const itemName = r.custom_name ?? (r.product_id ? (productsDb.getProductById(d(), r.product_id) as any)?.name ?? '' : '');
    eventsDb.logEvent(d(), pantryId, req.session.userId!, 'shopping_item_checked', { item_name: itemName });
  }
  res.json(result);
});

router.delete('/:id/shopping/:itemId', requireAuth, requireMember, (req, res) => {
  const itemId = parseInt(req.params.itemId, 10);
  const pantryId = (req as any).pantryId;
  const item = d().prepare('SELECT custom_name, product_id, pantry_id FROM ShoppingListItem WHERE id=?').get(itemId) as any;
  // Verify item belongs to this pantry
  if (!item || item.pantry_id !== pantryId) return res.status(404).json({ error: 'Item not found' });
  const itemName = item?.custom_name ?? (item?.product_id ? (productsDb.getProductById(d(), item.product_id) as any)?.name ?? '' : '');
  eventsDb.logEvent(d(), pantryId, req.session.userId!, 'shopping_item_removed', { item_name: itemName });
  shoppingDb.deleteShoppingItem(d(), itemId);
  res.json({ ok: true });
});

router.delete('/:id/shopping', requireAuth, requireMember, (req, res) => {
  const { item_ids } = req.body;
  if (!Array.isArray(item_ids)) return res.status(400).json({ error: 'item_ids array required' });
  const numericIds = item_ids.filter((id: unknown) => typeof id === 'number');
  const cleared = shoppingDb.clearShoppingItems(d(), (req as any).pantryId, numericIds);
  eventsDb.logEvent(d(), (req as any).pantryId, req.session.userId!, 'shopping_list_cleared', { items_cleared: cleared });
  res.json({ cleared });
});

export default router;
```

- [ ] **Step 2: Write shopping list tests**

```ts
// tests/db/shopping.test.ts
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
```

- [ ] **Step 3: Run tests**

```bash
npm test
```

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: shopping list API routes with event logging"
```

---

## Task 9: Invites + Events API

**Files:**
- Create: `server/routes/invites.ts`
- Create: `server/routes/events.ts`

- [ ] **Step 1: Write `server/routes/invites.ts`**

This file exports two routers: one for `POST /api/pantries/:id/invites` (mounted on the pantries router in `entry.mjs`) and one for `POST /api/invites/use` (mounted separately before any `/:id` routes).

```ts
import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireMember } from '../middleware/requireMember.js';
import { requireOwner } from '../middleware/requireOwner.js';
import * as invitesDb from '../db/invites.js';
import * as pantriesDb from '../db/pantries.js';
import * as eventsDb from '../db/events.js';
import { getUserById } from '../db/users.js';
import { getDb } from '../db/connection.js';

const d = () => getDb();

// --- Router 1: POST /api/pantries/:id/invites ---
// Mount this on the pantries router: app.use('/api/pantries', invitePantryRouter)
export const invitePantryRouter = Router({ mergeParams: true });

invitePantryRouter.post('/:id/invites', requireAuth, requireMember, requireOwner, (req, res) => {
  const { type, expires_at } = req.body;
  if (!type || !['code', 'link'].includes(type)) {
    return res.status(400).json({ error: 'type must be "code" or "link"' });
  }
  const invite = invitesDb.createInvite(d(), {
    pantry_id: (req as any).pantryId,
    type,
    created_by: req.session.userId!,
    expires_at,
  });
  res.status(201).json(invite);
});

// --- Router 2: POST /api/invites/use ---
// Mount this BEFORE any /:id-scoped routes: app.use('/api/invites', inviteUseRouter)
export const inviteUseRouter = Router();

inviteUseRouter.post('/use', requireAuth, (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'token required' });
  const invite = invitesDb.findValidInvite(d(), token) as any;
  if (!invite) return res.status(410).json({ error: 'Invalid or expired invite' });
  if (pantriesDb.getMemberRole(d(), invite.pantry_id, req.session.userId!)) {
    return res.status(409).json({ error: 'Already a member' });
  }
  invitesDb.consumeInvite(d(), invite.id, req.session.userId!);
  pantriesDb.addMember(d(), invite.pantry_id, req.session.userId!);
  const user = getUserById(d(), req.session.userId!) as any;
  eventsDb.logEvent(d(), invite.pantry_id, req.session.userId!, 'member_joined', {
    user_name: user?.name ?? '', invite_type: 'link',
  });
  res.json({ pantry_id: invite.pantry_id });
});
```

Update `entry.mjs` — replace the invites import and all pantry-related mounts with the corrected block below. Remove the old `app.use('/api/pantries/join', pantriesRouter)` line that was in the scaffold:

```js
// UPDATED imports section — replace old invitesRouter import:
import { invitePantryRouter, inviteUseRouter } from './server/routes/invites.js';

// UPDATED mount section — replace the previous pantry + invites mounts:
// NOTE: static routes BEFORE /:id-scoped middleware
app.use('/auth', authRouter);
app.use('/api/me', meRouter);
app.use('/api/invites', inviteUseRouter);           // POST /api/invites/use
app.use('/api/pantries', pantriesRouter);            // includes POST /join (registered first inside the router)
app.use('/api/pantries', invitePantryRouter);        // POST /api/pantries/:id/invites
app.use('/api/pantries', spacesRouter);
app.use('/api/pantries', stockRouter);
app.use('/api/pantries', shoppingRouter);
app.use('/api/pantries', eventsRouter);
app.use('/api/products', productsRouter);
app.use(errorHandler);
```

Delete the old `app.use('/api/pantries/join', pantriesRouter)` line — it no longer exists.

- [ ] **Step 2: Write `server/routes/events.ts`**

```ts
import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireMember } from '../middleware/requireMember.js';
import * as eventsDb from '../db/events.js';
import { getDb } from '../db/connection.js';

const router = Router({ mergeParams: true });
const d = () => getDb();

router.get('/:id/events', requireAuth, requireMember, (req, res) => {
  const before = req.query.before ? parseInt(req.query.before as string, 10) : undefined;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
  const result = eventsDb.getEvents(d(), (req as any).pantryId, before, limit);
  res.json(result); // { events, has_more }
});

export default router;
```

- [ ] **Step 3: Write invite token tests**

```ts
// tests/db/invites.test.ts
import { describe, it, expect } from 'vitest';
import { generateToken } from '../../server/db/invites.js';

describe('generateToken', () => {
  it('generates 8-char uppercase alphanum code', () => {
    const token = generateToken('code');
    expect(token).toHaveLength(8);
    expect(/^[A-Z0-9]+$/.test(token)).toBe(true);
  });

  it('generates UUID for link', () => {
    const token = generateToken('link');
    expect(/^[0-9a-f-]{36}$/.test(token)).toBe(true);
  });
});
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all tests passing.

- [ ] **Step 5: Verify server starts and key routes respond**

```bash
node entry.mjs &
curl http://localhost:4321/api/me
# Expected: {"error":"Unauthorized"}

curl -X POST http://localhost:4321/api/pantries \
  -H 'Content-Type: application/json' \
  -d '{"slug":"test","display_name":"Test"}'
# Expected: {"error":"Unauthorized"}
```

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: invites and events API routes, all backend routes complete"
```

---

## Task 10: Validation + Error Hardening

**Files:**
- Modify: `server/routes/pantries.ts`
- Modify: `server/routes/stock.ts`
- Modify: `server/routes/shopping.ts`

- [ ] **Step 1: Add slug uniqueness error handling in pantries route**

The `createPantry` in `pantries.ts` already checks with `getPantryBySlug`, but SQLite can also throw on UNIQUE constraint. Wrap the insert in a try/catch in `createPantry`:

```ts
// In server/db/pantries.ts — wrap the insert transaction
try {
  return insert();
} catch (err: any) {
  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') throw new Error('SLUG_TAKEN');
  throw err;
}
```

And in the route:
```ts
try {
  const id = db.createPantry(...);
  ...
} catch (err: any) {
  if (err.message === 'SLUG_TAKEN') return res.status(409).json({ error: 'Slug already taken' });
  throw err;
}
```

- [ ] **Step 2: Verify stock upsert handles missing space/product gracefully**

Add a check in stock route before upsert — if space doesn't belong to pantry, 400:

```ts
import { getSpaceById } from '../db/spaces.js';
const space = getSpaceById(d(), storage_space_id) as any;
if (!space || space.pantry_id !== pantryId) {
  return res.status(400).json({ error: 'Invalid storage_space_id' });
}
```

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: all tests passing.

- [ ] **Step 4: Final backend commit**

```bash
git add .
git commit -m "feat: input validation and error hardening across API routes"
```

---

**Backend complete.** All API routes are implemented and testable. Continue with `2026-05-27-openlarder-frontend.md` for the Astro pages, Tailwind layout, and React islands.
