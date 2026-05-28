# OpenLarder — Design Spec

**Date:** 2026-05-27  
**Status:** Ready for Planning

---

## 1. Overview

OpenLarder is a Progressive Web App for managing household grocery stock across multiple storage spaces (fridge, freezer, pantry, garage, etc.) and a shared shopping list. Multiple users can share a pantry using a unique slug and an invite mechanism backed by Google OAuth identity.

---

## 2. Architecture

### 2.1 Single Node.js project

One repository, one Hostinger deployment. Astro handles routing and page rendering via the `@astrojs/node` adapter in middleware mode. Express boots as the HTTP server and mounts Astro as a catch-all after registering API and auth routes.

```
openlarder/
├── src/
│   ├── pages/              # .astro pages (file-based routing)
│   │   ├── index.astro     # redirects to /pantries
│   │   ├── pantries.astro  # list of user's pantries
│   │   ├── login.astro
│   │   ├── pantry/
│   │   │   └── [id].astro  # tabbed view: Stock | Shopping | Activity | Settings
│   │   └── join.astro
│   ├── components/         # React islands (client:load)
│   ├── middleware.ts       # Astro middleware — session check, redirect to /login
│   └── lib/                # IndexedDB, sync engine, barcode utils
├── server/
│   ├── routes/             # Express routers: auth, pantries, stock, shopping, invites, events
│   ├── db/                 # SQLite schema + query functions
│   └── middleware/         # session guard, error handler
├── public/                 # static assets, PWA icons, manifest.json
├── entry.mjs               # Express entry point → mounts Astro middleware
├── astro.config.mjs        # @astrojs/node adapter (middleware mode)
├── vite.config.mjs         # vite-plugin-pwa + Workbox
└── package.json
```

### 2.2 Key dependencies



| Concern | Library |
|---|---|
| Frontend | Astro + `@astrojs/react` |
| SSR adapter | `@astrojs/node` (middleware mode) |
| HTTP server | Express.js |
| Styling | Tailwind CSS v4 (`@astrojs/tailwind`) — mobile-first |
| PWA / Service Worker | `vite-plugin-pwa` + Workbox |
| Offline storage | `idb` (IndexedDB wrapper) |
| Barcode scanning | `@zxing/library` |
| Product metadata | Open Food Facts API |
| Auth | Passport.js + `passport-google-oauth20` |
| Sessions | `express-session` + `better-sqlite3-session-store` |
| Database | `better-sqlite3` |

**Design approach:** mobile-first throughout. All layouts designed for small screens (≤375px) first; wider breakpoints (`md:`, `lg:`) used only for progressive enhancement. Touch targets minimum 44×44px. Bottom navigation bar for primary tabs on mobile.

### 2.3 Page structure

`/pantry/[id].astro` is the main pantry view with four tabs rendered as React islands:

| Tab | Contents |
|---|---|
| **Stock** | Storage spaces with item lists, count controls, expiry warnings (≤7 days: yellow; expired: red), barcode scan button, "add to shopping list" action per item |
| **Shopping** | Shopping list with check/uncheck, add item, clear checked |
| **Activity** | Paginated activity log (PantryEvents), newest first, infinite scroll |
| **Settings** | Pantry display name (editable by owner via `PATCH /api/pantries/:id`), members list, invite creation, storage space management (create + delete only), delete pantry (owner only) |

### 2.4 Hostinger deployment

Hostinger auto-detects the project as Astro. Entry point: `entry.mjs`. No manual "Other" framework config needed. Deploy via GitHub integration — push to main triggers rebuild and redeploy.

**SQLite file path:** The database file must live outside the build output directory to survive redeployments. Set via `DATABASE_PATH` environment variable in Hostinger's hPanel environment variables config. Recommended path: `/home/{user}/domains/{domain}/openlarder.db` — outside `nodejs/` build output, preserved across deploys.

---

## 3. Data Model

SQLite database. All timestamps are ISO 8601 UTC strings. Foreign key enforcement must be enabled per-connection with `PRAGMA foreign_keys = ON`. Pantry deletion is implemented as a manual transaction deleting child tables in dependency order (PantryEvents → ShoppingListItems → StockItems → Invites → StorageSpaces → PantryMembers → Pantry) rather than relying on `ON DELETE CASCADE`.

### User
```
id            INTEGER PK AUTOINCREMENT
google_id     TEXT UNIQUE NOT NULL
name          TEXT NOT NULL
email         TEXT UNIQUE NOT NULL
avatar_url    TEXT
created_at    TEXT NOT NULL
```

### Pantry
```
id            INTEGER PK AUTOINCREMENT
slug          TEXT UNIQUE NOT NULL   -- human-readable join identifier, user-provided on creation
display_name  TEXT NOT NULL
created_by    INTEGER → User
created_at    TEXT NOT NULL
```

**Slug rules:** provided by the user when creating a pantry (lowercase, alphanumeric + hyphens, 3–32 chars). Server validates uniqueness and format; returns `409` if already taken.

### PantryMember
```
pantry_id     INTEGER → Pantry
user_id       INTEGER → User
role          TEXT NOT NULL          -- 'owner' | 'member'
joined_at     TEXT NOT NULL
PRIMARY KEY (pantry_id, user_id)
```

### Invite
```
id            INTEGER PK AUTOINCREMENT
pantry_id     INTEGER → Pantry
type          TEXT NOT NULL          -- 'code' | 'link'
token         TEXT UNIQUE NOT NULL   -- 8-char uppercase alphanum for code (e.g. 'X7K2AB9F'), UUID v4 for link
created_by    INTEGER → User
created_at    TEXT NOT NULL
expires_at    TEXT                   -- nullable, owner-set expiry
used_by       INTEGER → User         -- nullable, set on use
used_at       TEXT                   -- nullable, set on use (single-use enforcement)
```

### StorageSpace
```
id            INTEGER PK AUTOINCREMENT
pantry_id     INTEGER → Pantry
name          TEXT NOT NULL          -- e.g. 'Fridge', 'Freezer', 'Pantry'
icon          TEXT NOT NULL          -- emoji
sort_order    INTEGER NOT NULL
created_at    TEXT NOT NULL
```

**Sort order:** `sort_order` is auto-assigned by the server at creation using `MAX(sort_order) + 1` for that pantry (0 if no spaces exist). Storage spaces are immutable after creation — no rename, icon change, or reorder in v1.

**Deletion behaviour:** `DELETE /api/pantries/:id/spaces/:spaceId` is blocked if any `StockItem` rows reference the space. The API returns `409` with a message indicating how many items remain. The client must prompt the user to remove those items before deleting the space.

### Product
Global catalog shared across all pantries.
```
id            INTEGER PK AUTOINCREMENT
barcode       TEXT UNIQUE            -- EAN/UPC, nullable for manual entries
name          TEXT NOT NULL
brand         TEXT
image_url     TEXT
created_at    TEXT NOT NULL
```

### StockItem
One record per `(pantry, storage_space, product)`. A `PUT` upsert that sets `count=0` keeps the row in place — zero-count items are valid and rendered in the UI (they may still have an expiry date worth tracking). Rows are only removed via explicit `DELETE /api/pantries/:id/stock/:itemId`.
```
id                INTEGER PK AUTOINCREMENT
pantry_id         INTEGER → Pantry
storage_space_id  INTEGER → StorageSpace
product_id        INTEGER → Product
count             INTEGER NOT NULL DEFAULT 0
expiry_date       TEXT               -- nullable, YYYY-MM-DD
updated_at        TEXT NOT NULL
updated_by        INTEGER → User
UNIQUE (pantry_id, storage_space_id, product_id)
```

### ShoppingListItem
```
id            INTEGER PK AUTOINCREMENT
pantry_id     INTEGER → Pantry
product_id    INTEGER → Product      -- nullable
custom_name   TEXT                   -- nullable, for free-text items
quantity      INTEGER NOT NULL DEFAULT 1
checked       INTEGER NOT NULL DEFAULT 0   -- boolean (0/1)
added_by      INTEGER → User
added_at      TEXT NOT NULL
updated_at    TEXT NOT NULL          -- used for offline last-write-wins conflict resolution
checked_by    INTEGER → User         -- nullable
checked_at    TEXT                   -- nullable
CHECK (product_id IS NOT NULL OR custom_name IS NOT NULL)
```

### PantryEvent
Append-only activity log. Never updated or deleted.
```
id            INTEGER PK AUTOINCREMENT
pantry_id     INTEGER → Pantry
user_id       INTEGER → User
event_type    TEXT NOT NULL
payload       TEXT NOT NULL          -- JSON snapshot
created_at    TEXT NOT NULL
```

**Event types:**

| event_type | Triggered when |
|---|---|
| `stock_added` | New StockItem created |
| `stock_updated` | StockItem count changed (any value including 0) |
| `stock_removed` | StockItem row deleted via `DELETE /api/pantries/:id/stock/:itemId` |
| `shopping_item_added` | ShoppingListItem added |
| `shopping_item_checked` | ShoppingListItem checked off (unchecking is not logged) |
| `shopping_item_removed` | Single ShoppingListItem deleted via `DELETE /api/pantries/:id/shopping/:itemId` |
| `shopping_list_cleared` | Checked items cleared from list (`DELETE /api/pantries/:id/shopping`) |
| `member_joined` | User added to PantryMember |
| `member_removed` | User removed from PantryMember |
| `storage_space_added` | StorageSpace created |
| `storage_space_deleted` | StorageSpace deleted |

**Payload shapes for all event types:**

| event_type | Payload |
|---|---|
| `stock_added` | `{ product_name, storage_space, count, expiry_date }` |
| `stock_updated` | `{ product_name, storage_space, count_before, count_after, expiry_date }` |
| `stock_removed` | `{ product_name, storage_space }` |
| `shopping_item_added` | `{ item_name }` (product name or custom_name) |
| `shopping_item_checked` | `{ item_name }` |
| `shopping_item_removed` | `{ item_name }` |
| `shopping_list_cleared` | `{ items_cleared: number }` |
| `member_joined` | `{ user_name, invite_type }` |
| `member_removed` | `{ user_name }` |
| `storage_space_added` | `{ space_name, icon }` |
| `storage_space_deleted` | `{ space_name }` |

### OfflineQueue (client-side only — IndexedDB)
```
id                TEXT    -- local UUID
operation         TEXT    -- see enum below
payload           Object  -- mutation data
local_timestamp   TEXT    -- ISO 8601
status            TEXT    -- 'pending' | 'synced' | 'error' | 'discarded'
local_item_id     TEXT    -- nullable; temp client UUID for offline-added shopping items
```

**Valid `operation` values:**
- `upsert_stock` — maps to `PUT /api/pantries/:id/stock`
- `delete_stock` — maps to `DELETE /api/pantries/:id/stock/:itemId`
- `add_shopping_item` — maps to `POST /api/pantries/:id/shopping`
- `patch_shopping_item` — maps to `PATCH /api/pantries/:id/shopping/:itemId`
- `delete_shopping_item` — maps to `DELETE /api/pantries/:id/shopping/:itemId`
- `clear_shopping_list` — maps to `DELETE /api/pantries/:id/shopping`. Payload must include `{ item_ids: (number | string)[] }` — the IDs of the checked items at the time of the offline action (may contain local UUID strings for offline-added items not yet synced). The server deletes only those specific IDs. During queue drain, temp ID rewriting must scan `payload.item_ids` arrays as well as scalar references in other operations, replacing local UUIDs with server-assigned IDs after a successful `add_shopping_item`.

---

## 4. Auth Flow

### Login
1. User visits app with no session → redirect to `/login`
2. User clicks "Sign in with Google"
3. Passport.js redirects to Google OAuth consent
4. Google calls back to `GET /auth/google/callback`
5. Passport upserts User record (by `google_id`)
6. Session created → redirect to `/pantries`

### Session
- `express-session` with `better-sqlite3-session-store`
- Cookie: `httpOnly`, `secure: true` in production, `sameSite: lax`, `maxAge: 30 days`
- Session payload: `{ userId }`

### Join via invite code
1. Logged-in user navigates to "Join a pantry"
2. Enters pantry slug + short code
3. `POST /api/pantries/join { slug, code }`
4. Server: find Pantry by slug → find Invite where `token=code AND used_at IS NULL AND (expires_at IS NULL OR expires_at > now())` → verify user not already a member → create PantryMember → mark Invite used → log `member_joined` event
5. Redirect to `/pantry/:id`

### Join via invite link
1. User clicks `/join?token=<uuid>`
2. If not logged in → OAuth flow is initiated with the token encoded in the OAuth `state` parameter → on callback, Passport decodes `state` and redirects to `/join?token=<uuid>`
3. If logged in → `/join` page shows a confirmation screen: pantry display name + "Join this pantry?" button. User clicks → client calls `POST /api/invites/use { token }` → server validates token: `used_at IS NULL AND (expires_at IS NULL OR expires_at > now())`, verifies user not already a member (`409` if so), creates PantryMember, marks Invite used, logs `member_joined`
4. Redirect to `/pantry/:id`

Note: the code-based join flow (`POST /api/pantries/join`) also requires the user to be already logged in. If an unauthenticated user visits `/join` with a link token, they authenticate via OAuth then see the confirmation screen. There is no equivalent state preservation for code-based join — unauthenticated users entering a slug+code are redirected to `/login` and must re-enter the code after login. This asymmetry is intentional.

### Route protection
- All `/api/*` routes: Express middleware checks `req.session.userId` → 401 if missing
- All Astro pages: Astro middleware reads session → redirect to `/login` if missing
- `/join` and `/auth/*` are public routes
- All pantry-scoped routes (`/api/pantries/:id/*`) verify the requesting user is a `PantryMember` of that pantry → `403` if not. This check runs after authentication, before role checks.

### Authorization matrix (role-based)

| Action | Member | Owner |
|---|---|---|
| View stock, shopping list, events | ✓ | ✓ |
| Add / update / remove stock items | ✓ | ✓ |
| Add / check / clear shopping items | ✓ | ✓ |
| Create invite (code or link) | ✗ | ✓ |
| Remove a member | ✗ | ✓ |
| Add / delete storage spaces | ✗ | ✓ |
| Delete the pantry | ✗ | ✓ |

Owner-only routes return `403` if the requesting user's `PantryMember.role` is `'member'`.

**Member self-removal:** Members cannot remove themselves. `DELETE /api/pantries/:id/members/:userId` where `:userId` matches the session user and the user is a `'member'` (not owner) returns `403`. Leaving a pantry is out of scope for v1.

**Owner self-removal:** `DELETE /api/pantries/:id/members/:userId` where `:userId` is the owner themselves returns `403` — an owner cannot remove themselves. To leave a pantry, the owner must first transfer ownership (out of scope for v1) or delete the pantry entirely.

---

## 5. Offline Sync

### IndexedDB stores
| Store | Contents |
|---|---|
| `pantries` | User's pantry list |
| `storage_spaces` | Spaces per pantry |
| `products` | Product catalog |
| `stock_items` | Full stock per pantry |
| `shopping_items` | Shopping list per pantry |
| `pantry_events` | Recent activity log |
| `offline_queue` | Pending mutations |

### Sync lifecycle

**App opens with connectivity:**
- Full refresh sequence: `GET /api/pantries` → for each pantry: `GET /api/pantries/:id/spaces`, `GET /api/pantries/:id/stock`, `GET /api/pantries/:id/shopping`, `GET /api/pantries/:id/events` (first page only)
- Write all results to IndexedDB (overwrite)
- Service worker caches static assets + API GET responses

**User makes a change online:**
- Send mutation to API immediately
- On success → update IndexedDB

**User makes a change offline:**
- Write to IndexedDB directly
- Append entry to `offline_queue` with `local_timestamp`
- **Offline stock additions are limited to products already in local IndexedDB cache.** If a product isn't cached (e.g. a barcode not previously scanned), the user must wait for connectivity to resolve the product before adding it to stock. `POST /api/products` and barcode lookup always require network.

**App regains connectivity (`online` event):**
- Drain `offline_queue` in timestamp order
- For each entry → send to API; server applies last-write-wins by `updated_at`
- **Temp ID rewriting:** When an `add_shopping_item` entry succeeds, the server returns `{ id: <server_id> }`. The sync engine immediately rewrites all subsequent queue entries that reference `local_item_id` matching the temp ID, replacing it with the real server ID before continuing the drain. This ensures downstream `patch_shopping_item`, `delete_shopping_item`, and `clear_shopping_list` entries reference valid server IDs.
- On queue drained → full refresh from API into IndexedDB

### Conflict resolution
Last-write-wins per item, compared by `updated_at`. Applies to both `StockItem` and `ShoppingListItem` (both carry `updated_at`).

- Client sends its local `updated_at` with every mutation
- **Client wins** (server's `updated_at` ≤ client's): server applies the change and returns `200` with the updated record
- **Server wins** (server's `updated_at` > client's): server returns `200` with the current server record — no error, client reconciles IndexedDB with the returned value

Returning `200` in both cases keeps the sync drain loop simple: every queued item resolves without branching on status codes.

### Queue drain failure handling
| Response | Action |
|---|---|
| Network error or 5xx | Mark `status: 'error'`, skip, continue drain. Retry on next sync cycle. |
| 4xx (e.g. 404 item deleted by another user) | Mark `status: 'discarded'`, skip, continue drain. Do **not** retry. |

After drain completes, if any entries errored or discarded, show a non-blocking toast: "Some changes couldn't be synced."

On full refresh (app open with connectivity), the sync engine explicitly deletes all `offline_queue` entries with `status: 'discarded'` or `status: 'error'` from IndexedDB before writing fresh server data. This ensures stale error entries don't accumulate across sessions.

### Service worker caching (Workbox)
| Resource | Strategy |
|---|---|
| Static assets (JS, CSS, icons) | Cache First |
| API GET requests | Network First → fallback to cache |
| API mutations | Not cached — queued in IndexedDB |

Sync uses the `online` DOM event rather than the Background Sync API (inconsistent browser support).

**Activity tab offline behaviour:** Only the first page of events is fetched on app open and cached. Infinite scroll in the Activity tab is unavailable offline — the tab shows cached events and a "no more results available offline" message when pagination fails. This is the expected degraded state.

**No live updates between concurrent online users.** This is intentional — there is no polling or SSE. A user will only see changes made by others after closing and reopening the app (triggering a full refresh). This is an accepted trade-off for the on-refresh sync model.

---

## 6. Barcode Scanning & Product Creation

Every `StockItem` requires a `product_id`. Products are always created as a `Product` row first, whether via barcode or manual entry.

**Barcode scan flow:**
1. `@zxing/library` reads the barcode via `getUserMedia`
2. Look up barcode in local `products` IndexedDB store first (cache hit → skip network)
3. If not found locally → `GET /api/products/barcode/:code`
   - Server checks local `Product` table first (by barcode) → return if found
   - If not in DB → query Open Food Facts API
   - If Open Food Facts returns a result → insert into `Product` table, return record
   - If Open Food Facts returns nothing → return `404`; client falls back to the manual entry form pre-populated with the scanned barcode
4. User confirms or edits product name before adding to stock

**Manual entry flow (no barcode):**
1. User types a product name directly
2. Client calls `POST /api/products { name, brand?, barcode? }` → creates a `Product` row (barcode nullable)
3. Returned `product_id` is used in the subsequent `PUT /api/pantries/:id/stock` call

This means all stock items — barcode or manual — go through a `Product` row. No `custom_name` on `StockItem`.

**Accepted limitation:** `Product.name` has no uniqueness constraint. Manual entries for "Milk" by two different users create two separate Product rows. No dedup in v1.

---

## 7. PWA Configuration

- `manifest.json`: name="OpenLarder", short_name="OpenLarder", display="standalone", theme_color, icons at 192px and 512px
- Service worker generated by `vite-plugin-pwa` at build time
- App is installable on iOS (Safari) and Android (Chrome) from the browser prompt

---

## 8. API Surface

All routes prefixed `/api/`. All require session except `/auth/*` and `/join`.

**Express route registration order:** `POST /api/pantries/join` and `POST /api/invites/use` must be registered before any `/:id`-scoped middleware to avoid "join" or "use" being captured as a pantry id.

| Method | Path | Description |
|---|---|---|
| GET | `/auth/google` | Start OAuth flow |
| GET | `/auth/google/callback` | OAuth callback |
| POST | `/auth/logout` | Destroy session |
| GET | `/api/me` | Current user info |
| GET | `/api/pantries` | List user's pantries — response: array of `{ id, slug, display_name, role }` |
| POST | `/api/pantries` | Create new pantry — body: `{ slug, display_name }`. Creator is automatically added as `PantryMember` with `role: 'owner'`. Response: `{ id, slug, display_name }`. UI redirects to `/pantry/:id`. UI: inline form on `pantries.astro`. |
| GET | `/api/pantries/:id` | Pantry detail — response includes `{ id, slug, display_name, created_at, role }` where `role` is the requesting user's role in this pantry |
| PATCH | `/api/pantries/:id` | Update pantry display name — body: `{ display_name }`. Owner only. |
| POST | `/api/pantries/join` | Join via slug + code |
| GET | `/api/pantries/:id/members` | List members — response: array of `{ user_id, name, avatar_url, role, joined_at }` |
| DELETE | `/api/pantries/:id/members/:userId` | Remove member |
| POST | `/api/pantries/:id/invites` | Create invite — body: `{ type: 'code' \| 'link', expires_at?: string }`. Response: `{ token, type, expires_at }`. The UI displays the token in a modal with a copy button. For `type: 'link'`, the full URL `/join?token=<uuid>` is shown. For `type: 'code'`, the 8-char token is shown alongside the pantry slug. Invites are fire-and-forget in v1: no list or revoke endpoint. |
| POST | `/api/invites/use` | Consume invite link token |
| GET | `/api/pantries/:id/spaces` | List storage spaces |
| POST | `/api/pantries/:id/spaces` | Create storage space — body: `{ name, icon }` |
| DELETE | `/api/pantries/:id/spaces/:spaceId` | Delete storage space |
| GET | `/api/pantries/:id/stock` | Get all stock items (no pagination — full list returned; household scale assumed). Response includes joined product and space data inline: `{ id, count, expiry_date, updated_at, product: { id, name, brand, image_url, barcode }, storage_space: { id, name, icon } }`. Client stores the full joined objects in IndexedDB. |
| PUT | `/api/pantries/:id/stock` | Upsert stock item — body: `{ storage_space_id, product_id, count, expiry_date?, updated_at }`. Server detects create vs update to emit `stock_added` or `stock_updated` event accordingly. |
| DELETE | `/api/pantries/:id/stock/:itemId` | Remove stock item |
| GET | `/api/pantries/:id/shopping` | Get shopping list (no pagination — full list returned). Response: `{ id, quantity, checked, checked_at, added_at, updated_at, custom_name, product: { id, name } \| null }`. Product data joined inline when `product_id` is set; `null` otherwise. Client stores full objects in IndexedDB. |
| POST | `/api/pantries/:id/shopping` | Add shopping item — body: `{ product_id?, custom_name?, quantity }`. In the UI, users type free text only (`custom_name`). `product_id` is populated automatically when adding a stock item to the shopping list directly (e.g. "add to shopping list" from a stock item row). There is no product search for the shopping list. |
| PATCH | `/api/pantries/:id/shopping/:itemId` | Update item — body: `{ checked?, quantity?, updated_at }` |
| DELETE | `/api/pantries/:id/shopping/:itemId` | Remove a single shopping item |
| DELETE | `/api/pantries/:id/shopping` | Clear specific items — body: `{ item_ids: number[] }`. Deletes the listed IDs if they exist; silently skips missing ones. |
| GET | `/api/pantries/:id/events` | Activity log — cursor-based pagination via `?before=<event_id>&limit=50` (default 50, max 100), ordered by `id DESC` (newest first). Response: `{ events: [...], has_more: boolean }`. `has_more: false` signals end of pagination to the infinite scroll client. |
| DELETE | `/api/pantries/:id` | Delete pantry (owner only) — manually removes all child rows in dependency order (see §3). Blocked if the pantry has members other than the owner (`409`). Owner must remove all other members first. |
| GET | `/api/products/barcode/:code` | Look up product by barcode — `404` if not in Open Food Facts |
| POST | `/api/products` | Create product manually — body: `{ name, brand?, barcode? }`. Requires authentication only (no pantry membership check — products are global). |
