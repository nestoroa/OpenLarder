# OpenLarder Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete OpenLarder frontend: Astro pages, Tailwind mobile-first layout, and all four React island tabs (Stock, Shopping, Activity, Settings).

**Architecture:** Astro pages provide the HTML shell and server-side session check via `src/middleware.ts`. React islands (`client:load`) render all interactive content. A thin `src/lib/api.ts` client wraps fetch calls to the Express backend. Tailwind v4 with mobile-first breakpoints throughout.

**Tech Stack:** Astro 5, React 19, Tailwind CSS v4, TypeScript, Vitest + Testing Library.

**Prerequisite:** Plan A (backend) must be complete. The Express server must be running on port 4321.

**Spec:** `docs/superpowers/specs/2026-05-27-openlarder-design.md`

---

## File Map

```
src/
├── middleware.ts                     # Session check → redirect to /login
├── layouts/
│   └── Base.astro                    # HTML shell, PWA meta, bottom nav
├── pages/
│   ├── index.astro                   # Redirect to /pantries
│   ├── login.astro                   # Google sign-in page
│   ├── pantries.astro                # Pantry list + create form
│   ├── pantry/
│   │   └── [id].astro               # Main pantry view (4 tabs)
│   └── join.astro                    # Invite link confirmation
├── components/
│   ├── PantryList.tsx                # Island: list + create pantry
│   ├── JoinConfirm.tsx               # Island: invite link confirmation
│   ├── PantryTabs.tsx                # Island: tab shell (Stock/Shopping/Activity/Settings)
│   ├── tabs/
│   │   ├── StockTab.tsx              # Island: storage spaces + items + count controls
│   │   ├── ShoppingTab.tsx           # Island: shopping list
│   │   ├── ActivityTab.tsx           # Island: paginated event log
│   │   └── SettingsTab.tsx           # Island: members, invites, spaces, delete
│   └── ui/
│       ├── Button.tsx
│       ├── Input.tsx
│       ├── Modal.tsx
│       ├── Toast.tsx
│       └── Spinner.tsx
└── lib/
    ├── api.ts                        # Typed fetch wrappers for all API routes
    └── types.ts                      # Shared TypeScript types (mirrors API responses)

tests/
└── components/
    ├── StockTab.test.tsx
    ├── ShoppingTab.test.tsx
    └── ActivityTab.test.tsx
```

---

## Task 1: Astro Middleware + Session Guard

**Files:**
- Create: `src/middleware.ts`

- [ ] **Step 1: Write `src/middleware.ts`**

```ts
import { defineMiddleware } from 'astro:middleware';

const PUBLIC_PATHS = ['/login', '/join', '/auth'];

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // Allow public paths and all /auth/* and API routes
  if (
    PUBLIC_PATHS.some(p => pathname.startsWith(p)) ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/auth/')
  ) {
    return next();
  }

  // Read session cookie — Express session stores userId
  // Astro middleware can't directly access Express session, so we proxy to /api/me
  const cookie = context.request.headers.get('cookie') ?? '';
  try {
    const meRes = await fetch(`http://localhost:${process.env.PORT || 4321}/api/me`, {
      headers: { cookie },
    });
    if (!meRes.ok) throw new Error('not authenticated');
    const user = await meRes.json();
    context.locals.user = user;
  } catch {
    return context.redirect('/login');
  }

  return next();
});
```

- [ ] **Step 2: Declare `locals` types in `src/env.d.ts`**

```ts
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PORT: string;
}

declare namespace App {
  interface Locals {
    user: {
      id: number;
      name: string;
      email: string;
      avatar_url: string | null;
    };
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts src/env.d.ts
git commit -m "feat: astro session middleware, route protection"
```

---

## Task 2: Base Layout + Global Styles

**Files:**
- Create: `src/layouts/Base.astro`
- Create: `src/styles/global.css`

- [ ] **Step 1: Write `src/styles/global.css`**

This uses Tailwind v4 syntax (`@import "tailwindcss"` — correct for v4; do NOT use `@tailwind base/components/utilities` which is v3).

```css
@import "tailwindcss";

/* Ensure full-height app shell on mobile */
html, body {
  @apply h-full bg-gray-50 text-gray-900;
}

/* Minimum touch target */
button, a, [role="button"] {
  min-height: 44px;
  min-width: 44px;
}
```

Then import it in `astro.config.mjs` by referencing it in the Astro layout, or import globally via `src/pages/_app.css` — the simplest approach is to add `<link rel="stylesheet" href="/src/styles/global.css" />` or import it in `Base.astro`:
```astro
import '../styles/global.css';
```
(Astro resolves this correctly with the `@tailwindcss/vite` plugin.)

- [ ] **Step 2: Write `src/layouts/Base.astro`**

Note: `manifest.json` and icons are created in Plan C (PWA plan). The `<link>` tags below are included now so the HTML shell is correct, but they will 404 until Plan C adds the files.

```astro
---
import '../styles/global.css';

export interface Props {
  title?: string;
}
const { title = 'OpenLarder' } = Astro.props;
---
<!doctype html>
<html lang="en" class="h-full">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#16a34a" />
    <link rel="manifest" href="/manifest.json" />
    <link rel="apple-touch-icon" href="/icons/icon-192.png" />
    <title>{title}</title>
  </head>
  <body class="h-full flex flex-col">
    <slot />
  </body>
</html>
```

- [ ] **Step 3: Commit**

```bash
git add src/layouts/ src/styles/
git commit -m "feat: base layout, global styles, PWA meta tags"
```

---

## Task 3: Login + Index Pages

**Files:**
- Create: `src/pages/index.astro`
- Create: `src/pages/login.astro`

- [ ] **Step 1: Write `src/pages/index.astro`**

```astro
---
return Astro.redirect('/pantries');
---
```

- [ ] **Step 2: Write `src/pages/login.astro`**

```astro
---
import Base from '../layouts/Base.astro';
---
<Base title="Sign in — OpenLarder">
  <main class="flex flex-col items-center justify-center min-h-full px-4 py-16">
    <div class="w-full max-w-sm space-y-8 text-center">
      <div>
        <h1 class="text-3xl font-bold text-green-700">OpenLarder</h1>
        <p class="mt-2 text-gray-500">Your shared household pantry</p>
      </div>
      <a
        href="/auth/google"
        class="flex items-center justify-center gap-3 w-full rounded-xl border border-gray-300
               bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm
               hover:bg-gray-50 active:bg-gray-100 transition-colors"
      >
        <img src="/icons/google.svg" alt="" class="w-5 h-5" />
        Sign in with Google
      </a>
    </div>
  </main>
</Base>
```

- [ ] **Step 3: Add Google icon SVG to `public/icons/google.svg`**

Create `public/icons/google.svg` with this minimal placeholder (a coloured "G"):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
</svg>
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/index.astro src/pages/login.astro public/icons/
git commit -m "feat: login page and index redirect"
```

---

## Task 4: API Client + Shared Types

**Files:**
- Create: `src/lib/types.ts`
- Create: `src/lib/api.ts`

- [ ] **Step 1: Write `src/lib/types.ts`**

```ts
export interface Pantry {
  id: number;
  slug: string;
  display_name: string;
  created_at: string;
  role: 'owner' | 'member';
}

export interface StorageSpace {
  id: number;
  pantry_id: number;
  name: string;
  icon: string;
  sort_order: number;
}

export interface Product {
  id: number;
  name: string;
  brand: string | null;
  image_url: string | null;
  barcode: string | null;
}

export interface StockItem {
  id: number;
  count: number;
  expiry_date: string | null;
  updated_at: string;
  product: Pick<Product, 'id' | 'name' | 'brand' | 'image_url' | 'barcode'>;
  storage_space: Pick<StorageSpace, 'id' | 'name' | 'icon'>;
}

export interface ShoppingItem {
  id: number;
  quantity: number;
  checked: boolean;
  checked_at: string | null;
  added_at: string;
  updated_at: string;
  custom_name: string | null;
  product: { id: number; name: string } | null;
}

export interface PantryEvent {
  id: number;
  event_type: string;
  payload: string;
  created_at: string;
  user_name: string;
  avatar_url: string | null;
}

export interface Member {
  user_id: number;
  name: string;
  avatar_url: string | null;
  role: 'owner' | 'member';
  joined_at: string;
}
```

- [ ] **Step 2: Write `src/lib/api.ts`**

```ts
import type { Pantry, StockItem, ShoppingItem, PantryEvent, Member, StorageSpace } from './types.js';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error(err.error ?? 'Request failed'), { status: res.status });
  }
  return res.json();
}

export const api = {
  // Pantries
  getPantries: () => request<Pantry[]>('/api/pantries'),
  createPantry: (body: { slug: string; display_name: string }) =>
    request<Pantry>('/api/pantries', { method: 'POST', body: JSON.stringify(body) }),
  getPantry: (id: number) => request<Pantry>(`/api/pantries/${id}`),
  updatePantry: (id: number, body: { display_name: string }) =>
    request<Pantry>(`/api/pantries/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deletePantry: (id: number) =>
    request<{ ok: true }>(`/api/pantries/${id}`, { method: 'DELETE' }),
  joinPantry: (body: { slug: string; code: string }) =>
    request<{ pantry_id: number }>('/api/pantries/join', { method: 'POST', body: JSON.stringify(body) }),

  // Members
  getMembers: (pantryId: number) => request<Member[]>(`/api/pantries/${pantryId}/members`),
  removeMember: (pantryId: number, userId: number) =>
    request<{ ok: true }>(`/api/pantries/${pantryId}/members/${userId}`, { method: 'DELETE' }),

  // Storage spaces
  getSpaces: (pantryId: number) => request<StorageSpace[]>(`/api/pantries/${pantryId}/spaces`),
  createSpace: (pantryId: number, body: { name: string; icon: string }) =>
    request<StorageSpace>(`/api/pantries/${pantryId}/spaces`, { method: 'POST', body: JSON.stringify(body) }),
  deleteSpace: (pantryId: number, spaceId: number) =>
    request<{ ok: true }>(`/api/pantries/${pantryId}/spaces/${spaceId}`, { method: 'DELETE' }),

  // Stock
  getStock: (pantryId: number) => request<StockItem[]>(`/api/pantries/${pantryId}/stock`),
  upsertStock: (pantryId: number, body: object) =>
    request<{ id: number; created: boolean }>(`/api/pantries/${pantryId}/stock`, {
      method: 'PUT', body: JSON.stringify(body),
    }),
  deleteStock: (pantryId: number, itemId: number) =>
    request<{ ok: true }>(`/api/pantries/${pantryId}/stock/${itemId}`, { method: 'DELETE' }),

  // Shopping
  getShopping: (pantryId: number) => request<ShoppingItem[]>(`/api/pantries/${pantryId}/shopping`),
  addShoppingItem: (pantryId: number, body: object) =>
    request<{ id: number }>(`/api/pantries/${pantryId}/shopping`, { method: 'POST', body: JSON.stringify(body) }),
  patchShoppingItem: (pantryId: number, itemId: number, body: object) =>
    request<ShoppingItem>(`/api/pantries/${pantryId}/shopping/${itemId}`, {
      method: 'PATCH', body: JSON.stringify(body),
    }),
  deleteShoppingItem: (pantryId: number, itemId: number) =>
    request<{ ok: true }>(`/api/pantries/${pantryId}/shopping/${itemId}`, { method: 'DELETE' }),
  clearShopping: (pantryId: number, item_ids: number[]) =>
    request<{ cleared: number }>(`/api/pantries/${pantryId}/shopping`, {
      method: 'DELETE', body: JSON.stringify({ item_ids }),
    }),

  // Events
  getEvents: (pantryId: number, before?: number, limit = 50) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.set('before', String(before));
    return request<{ events: PantryEvent[]; has_more: boolean }>(
      `/api/pantries/${pantryId}/events?${params}`
    );
  },

  // Invites
  createInvite: (pantryId: number, body: { type: 'code' | 'link'; expires_at?: string }) =>
    request<{ token: string; type: string; expires_at: string | null }>(
      `/api/pantries/${pantryId}/invites`, { method: 'POST', body: JSON.stringify(body) }
    ),
  useInvite: (token: string) =>
    request<{ pantry_id: number }>('/api/invites/use', {
      method: 'POST', body: JSON.stringify({ token }),
    }),

  // Products
  lookupBarcode: (code: string) => request<{ id: number; name: string; brand: string | null; barcode: string | null }>(`/api/products/barcode/${code}`),
  createProduct: (body: { name: string; brand?: string; barcode?: string }) =>
    request<{ id: number; name: string; barcode: string | null }>('/api/products', { method: 'POST', body: JSON.stringify(body) }),

  // Me
  getMe: () => request<{ id: number; name: string; email: string; avatar_url: string | null }>('/api/me'),
};
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/
git commit -m "feat: API client and shared TypeScript types"
```

---

## Task 5: UI Primitives

**Files:**
- Create: `src/components/ui/Button.tsx`
- Create: `src/components/ui/Input.tsx`
- Create: `src/components/ui/Modal.tsx`
- Create: `src/components/ui/Toast.tsx`
- Create: `src/components/ui/Spinner.tsx`

- [ ] **Step 1: Install clsx**

```bash
npm install clsx
```

- [ ] **Step 2: Write `src/components/ui/Button.tsx`**

```tsx
import type { ButtonHTMLAttributes } from 'react';
import { clsx } from 'clsx'; // npm install clsx

const variants = {
  primary: 'bg-green-600 text-white hover:bg-green-700 active:bg-green-800',
  secondary: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  ghost: 'text-gray-600 hover:bg-gray-100',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  loading?: boolean;
}

export function Button({ variant = 'primary', loading, className, children, ...props }: Props) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5',
        'text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        'min-h-[44px]',
        variants[variant],
        className
      )}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
      {children}
    </button>
  );
}
```

- [ ] **Step 3: Write `src/components/ui/Input.tsx`**

```tsx
import type { InputHTMLAttributes } from 'react';
import { clsx } from 'clsx';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className, id, ...props }: Props) {
  return (
    <div className="space-y-1">
      {label && <label htmlFor={id} className="block text-sm font-medium text-gray-700">{label}</label>}
      <input
        id={id}
        className={clsx(
          'w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm',
          'focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent',
          'min-h-[44px]',
          error && 'border-red-500 focus:ring-red-500',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Write `src/components/ui/Modal.tsx`**

```tsx
import { useEffect, type ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Modal({ open, onClose, title, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 min-h-[44px] min-w-[44px] flex items-center justify-center">✕</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write `src/components/ui/Toast.tsx`**

```tsx
import { useEffect, useState } from 'react';

interface ToastMessage { id: number; text: string; type: 'success' | 'error' | 'info'; }

let listeners: Array<(msg: ToastMessage) => void> = [];
let nextId = 0;

export function showToast(text: string, type: ToastMessage['type'] = 'info') {
  const msg = { id: nextId++, text, type };
  listeners.forEach(l => l(msg));
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handler = (msg: ToastMessage) => {
      setToasts(prev => [...prev, msg]);
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== msg.id)), 4000);
    };
    listeners.push(handler);
    return () => { listeners = listeners.filter(l => l !== handler); };
  }, []);

  return (
    <div className="fixed bottom-20 left-0 right-0 flex flex-col items-center gap-2 z-50 px-4 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className={`
          px-4 py-3 rounded-xl text-sm font-medium shadow-lg pointer-events-auto
          ${t.type === 'error' ? 'bg-red-600 text-white' : t.type === 'success' ? 'bg-green-600 text-white' : 'bg-gray-800 text-white'}
        `}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Write `src/components/ui/Spinner.tsx`**

```tsx
export function Spinner({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <span className={`${className} border-2 border-current border-t-transparent rounded-full animate-spin inline-block`} />
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/
git commit -m "feat: UI primitive components (Button, Input, Modal, Toast, Spinner)"
```

> `api.createProduct` return type — update in `src/lib/api.ts` from `request<object>` to `request<{ id: number; name: string; barcode: string | null }>` to avoid `as any` casts in StockTab.

---

## Task 6: Pantries Page

**Files:**
- Create: `src/pages/pantries.astro`
- Create: `src/components/PantryList.tsx`

- [ ] **Step 1: Write `src/pages/pantries.astro`**

```astro
---
import Base from '../layouts/Base.astro';
import PantryList from '../components/PantryList.tsx';
const user = Astro.locals.user;
---
<Base title="My Pantries — OpenLarder">
  <header class="sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center justify-between">
    <h1 class="text-lg font-bold text-green-700">OpenLarder</h1>
    <div class="flex items-center gap-2">
      {user.avatar_url && <img src={user.avatar_url} alt="" class="w-8 h-8 rounded-full" />}
      <form action="/auth/logout" method="post">
        <button class="text-sm text-gray-500 min-h-[44px] px-2">Sign out</button>
      </form>
    </div>
  </header>
  <main class="flex-1 overflow-auto px-4 py-4 pb-safe">
    <PantryList client:load />
  </main>
</Base>
```

- [ ] **Step 2: Write `src/components/PantryList.tsx`**

```tsx
import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import type { Pantry } from '../lib/types.js';
import { Button } from './ui/Button.js';
import { Input } from './ui/Input.js';
import { showToast } from './ui/Toast.js';
import { Spinner } from './ui/Spinner.js';

export default function PantryList() {
  const [pantries, setPantries] = useState<Pantry[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [joinSlug, setJoinSlug] = useState('');
  const [joinCode, setJoinCode] = useState('');

  useEffect(() => {
    api.getPantries().then(setPantries).catch(() => showToast('Failed to load pantries', 'error')).finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      const p = await api.createPantry({ slug, display_name: name });
      setPantries(prev => [...prev, p]);
      setSlug(''); setName('');
      showToast('Pantry created!', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    try {
      const { pantry_id } = await api.joinPantry({ slug: joinSlug, code: joinCode });
      window.location.href = `/pantry/${pantry_id}`;
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-3">Your Pantries</h2>
        {pantries.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">No pantries yet. Create one below.</p>
        )}
        <ul className="space-y-2">
          {pantries.map(p => (
            <li key={p.id}>
              <a href={`/pantry/${p.id}`}
                className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-200 hover:border-green-400 transition-colors min-h-[44px]">
                <div>
                  <div className="font-medium">{p.display_name}</div>
                  <div className="text-xs text-gray-400">{p.slug} · {p.role}</div>
                </div>
                <span className="text-gray-400">›</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-3">Create Pantry</h2>
        <form onSubmit={handleCreate} className="space-y-3 bg-white p-4 rounded-xl border border-gray-200">
          <Input label="Display name" value={name} onChange={e => setName(e.target.value)} placeholder="Home Kitchen" required />
          <Input label="Slug" value={slug} onChange={e => setSlug(e.target.value.toLowerCase())} placeholder="home-kitchen" pattern="[a-z0-9-]{3,32}" required />
          <Button type="submit" className="w-full" disabled={!slug || !name}>Create</Button>
        </form>
      </section>

      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-3">Join Pantry</h2>
        <form onSubmit={handleJoin} className="space-y-3 bg-white p-4 rounded-xl border border-gray-200">
          <Input label="Pantry slug" value={joinSlug} onChange={e => setJoinSlug(e.target.value)} placeholder="home-kitchen" required />
          <Input label="Invite code" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} placeholder="X7K2AB9F" maxLength={8} required />
          <Button type="submit" className="w-full" disabled={!joinSlug || !joinCode}>Join</Button>
        </form>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/pantries.astro src/components/PantryList.tsx
git commit -m "feat: pantries list page with create and join forms"
```

---

## Task 7: Join Page

**Files:**
- Create: `src/pages/join.astro`
- Create: `src/components/JoinConfirm.tsx`

- [ ] **Step 1: Write `src/pages/join.astro`**

```astro
---
import Base from '../layouts/Base.astro';
import JoinConfirm from '../components/JoinConfirm.tsx';
const token = Astro.url.searchParams.get('token') ?? '';
if (!token) return Astro.redirect('/pantries');
---
<Base title="Join Pantry — OpenLarder">
  <main class="flex flex-col items-center justify-center min-h-full px-4">
    <JoinConfirm token={token} client:load />
  </main>
</Base>
```

- [ ] **Step 2: Write `src/components/JoinConfirm.tsx`**

The spec requires that unauthenticated users who click an invite link are sent through Google OAuth with the token preserved in state, then redirected back to `/join?token=...` after login. A 401 from `useInvite` means the user isn't logged in — redirect them to OAuth with the token in the `?token` query param so `auth.ts` can encode it into OAuth state.

```tsx
import { useState } from 'react';
import { api } from '../lib/api.js';
import { Button } from './ui/Button.js';
import { showToast } from './ui/Toast.js';

export default function JoinConfirm({ token }: { token: string }) {
  const [loading, setLoading] = useState(false);

  async function handleJoin() {
    setLoading(true);
    try {
      const { pantry_id } = await api.useInvite(token);
      window.location.href = `/pantry/${pantry_id}`;
    } catch (err: any) {
      if (err.status === 401) {
        // Not logged in — redirect to Google OAuth, preserving the token in state
        window.location.href = `/auth/google?token=${encodeURIComponent(token)}`;
        return;
      }
      showToast(err.message, 'error');
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm text-center space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-green-700">You've been invited!</h1>
        <p className="text-gray-500 mt-2 text-sm">Click below to join this pantry.</p>
      </div>
      <Button onClick={handleJoin} loading={loading} className="w-full">
        Join Pantry
      </Button>
      <a href="/pantries" className="block text-sm text-gray-400 hover:text-gray-600">Cancel</a>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/join.astro src/components/JoinConfirm.tsx
git commit -m "feat: invite link join confirmation page"
```

---

## Task 8: Pantry Page Shell + Tabs

**Files:**
- Create: `src/pages/pantry/[id].astro`
- Create: `src/components/PantryTabs.tsx`

- [ ] **Step 1: Write `src/pages/pantry/[id].astro`**

```astro
---
import Base from '../../layouts/Base.astro';
import PantryTabs from '../../components/PantryTabs.tsx';
const { id } = Astro.params;
if (!id || isNaN(Number(id))) return Astro.redirect('/pantries');
---
<Base>
  <PantryTabs pantryId={Number(id)} client:load />
</Base>
```

- [ ] **Step 2: Write `src/components/PantryTabs.tsx`**

```tsx
import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import type { Pantry } from '../lib/types.js';
import { StockTab } from './tabs/StockTab.js';
import { ShoppingTab } from './tabs/ShoppingTab.js';
import { ActivityTab } from './tabs/ActivityTab.js';
import { SettingsTab } from './tabs/SettingsTab.js';
import { ToastContainer } from './ui/Toast.js';
import { Spinner } from './ui/Spinner.js';

type Tab = 'stock' | 'shopping' | 'activity' | 'settings';

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'stock', label: 'Stock', icon: '🥫' },
  { id: 'shopping', label: 'Shopping', icon: '🛒' },
  { id: 'activity', label: 'Activity', icon: '📋' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

export default function PantryTabs({ pantryId }: { pantryId: number }) {
  const [pantry, setPantry] = useState<Pantry | null>(null);
  const [active, setActive] = useState<Tab>('stock');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getPantry(pantryId)
      .then(setPantry)
      .catch(() => { window.location.href = '/pantries'; })
      .finally(() => setLoading(false));
  }, [pantryId]);

  if (loading) return <div className="flex items-center justify-center h-full"><Spinner className="w-8 h-8" /></div>;
  if (!pantry) return null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center gap-3">
        <a href="/pantries" className="text-green-600 font-medium text-sm min-h-[44px] flex items-center">‹ Back</a>
        <h1 className="text-base font-semibold truncate flex-1">{pantry.display_name}</h1>
      </header>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {active === 'stock' && <StockTab pantryId={pantryId} role={pantry.role} />}
        {active === 'shopping' && <ShoppingTab pantryId={pantryId} />}
        {active === 'activity' && <ActivityTab pantryId={pantryId} />}
        {active === 'settings' && <SettingsTab pantryId={pantryId} pantry={pantry} onPantryUpdate={setPantry} />}
      </div>

      {/* Bottom nav */}
      <nav className="sticky bottom-0 bg-white border-t flex">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={`flex-1 flex flex-col items-center justify-center py-2 min-h-[56px] text-xs gap-1 transition-colors
              ${active === tab.id ? 'text-green-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <span className="text-lg leading-none">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      <ToastContainer />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/pantry/ src/components/PantryTabs.tsx
git commit -m "feat: pantry page shell with bottom nav tabs"
```

---

## Task 9: Stock Tab

**Files:**
- Create: `src/components/tabs/StockTab.tsx`

- [ ] **Step 1: Write `src/components/tabs/StockTab.tsx`**

```tsx
import { useState, useEffect, useMemo } from 'react';
import { api } from '../../lib/api.js';
import type { StockItem, StorageSpace } from '../../lib/types.js';
import { Button } from '../ui/Button.js';
import { Input } from '../ui/Input.js';
import { Modal } from '../ui/Modal.js';
import { Spinner } from '../ui/Spinner.js';
import { showToast } from '../ui/Toast.js';

function expiryClass(expiry: string | null): string {
  if (!expiry) return '';
  const days = Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000);
  if (days < 0) return 'bg-red-50 border-red-200';
  if (days <= 7) return 'bg-yellow-50 border-yellow-200';
  return '';
}

function expiryLabel(expiry: string | null): string | null {
  if (!expiry) return null;
  const days = Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000);
  if (days < 0) return '⚠️ Expired';
  if (days === 0) return '⚠️ Expires today';
  if (days <= 7) return `⚠️ Expires in ${days}d`;
  return null;
}

export function StockTab({ pantryId, role }: { pantryId: number; role: string }) {
  const [stock, setStock] = useState<StockItem[]>([]);
  const [spaces, setSpaces] = useState<StorageSpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState(false);
  const [selectedSpace, setSelectedSpace] = useState<number | null>(null);
  const [productName, setProductName] = useState('');
  const [count, setCount] = useState(1);
  const [expiry, setExpiry] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api.getStock(pantryId), api.getSpaces(pantryId)])
      .then(([s, sp]) => { setStock(s); setSpaces(sp); })
      .catch(() => showToast('Failed to load stock', 'error'))
      .finally(() => setLoading(false));
  }, [pantryId]);

  const bySpace = useMemo(() => {
    return spaces.map(space => ({
      space,
      items: stock.filter(s => s.storage_space.id === space.id),
    }));
  }, [spaces, stock]);

  async function adjustCount(item: StockItem, delta: number) {
    const newCount = Math.max(0, item.count + delta);
    const now = new Date().toISOString();
    try {
      await api.upsertStock(pantryId, {
        storage_space_id: item.storage_space.id,
        product_id: item.product.id,
        count: newCount,
        expiry_date: item.expiry_date,
        updated_at: now,
      });
      setStock(prev => prev.map(s => s.id === item.id ? { ...s, count: newCount } : s));
    } catch {
      showToast('Failed to update', 'error');
    }
  }

  async function handleAddStock(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSpace) return;
    setSaving(true);
    try {
      // Create product first
      const product = await api.createProduct({ name: productName }) as any;
      const now = new Date().toISOString();
      await api.upsertStock(pantryId, {
        storage_space_id: selectedSpace,
        product_id: product.id,
        count,
        expiry_date: expiry || undefined,
        updated_at: now,
      });
      const updated = await api.getStock(pantryId);
      setStock(updated);
      setAddModal(false);
      setProductName(''); setCount(1); setExpiry('');
      showToast('Item added', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: StockItem) {
    try {
      await api.deleteStock(pantryId, item.id);
      setStock(prev => prev.filter(s => s.id !== item.id));
      showToast('Item removed', 'success');
    } catch {
      showToast('Failed to remove', 'error');
    }
  }

  async function handleAddToShopping(item: StockItem) {
    try {
      await api.addShoppingItem(pantryId, { product_id: item.product.id, quantity: 1 });
      showToast(`${item.product.name} added to shopping list`, 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  return (
    <div className="px-4 py-4 space-y-6 pb-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Stock</h2>
        <Button variant="primary" onClick={() => setAddModal(true)} className="text-sm px-3 py-2">+ Add item</Button>
      </div>

      {spaces.length === 0 && (
        <p className="text-center text-gray-400 text-sm py-8">No storage spaces yet. Add one in Settings.</p>
      )}

      {bySpace.map(({ space, items }) => (
        <section key={space.id}>
          <h3 className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
            <span>{space.icon}</span> {space.name}
          </h3>
          {items.length === 0 && (
            <p className="text-xs text-gray-400 pl-6">Empty</p>
          )}
          <ul className="space-y-2">
            {items.map(item => (
              <li key={item.id} className={`rounded-xl border p-3 bg-white ${expiryClass(item.expiry_date)}`}>
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{item.product.name}</div>
                    {item.product.brand && <div className="text-xs text-gray-400">{item.product.brand}</div>}
                    {expiryLabel(item.expiry_date) && (
                      <div className="text-xs text-red-600 mt-0.5">{expiryLabel(item.expiry_date)}</div>
                    )}
                  </div>
                  {/* Count controls */}
                  <div className="flex items-center gap-2">
                    <button onClick={() => adjustCount(item, -1)}
                      className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-50 min-h-[44px] min-w-[44px]">−</button>
                    <span className="w-8 text-center font-semibold text-sm">{item.count}</span>
                    <button onClick={() => adjustCount(item, 1)}
                      className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-50 min-h-[44px] min-w-[44px]">+</button>
                  </div>
                  <button onClick={() => handleDelete(item)} className="text-gray-300 hover:text-red-500 min-h-[44px] min-w-[44px] flex items-center justify-center">🗑</button>
                  <button
                    onClick={() => handleAddToShopping(item)}
                    title="Add to shopping list"
                    className="text-gray-300 hover:text-green-500 min-h-[44px] min-w-[44px] flex items-center justify-center text-sm"
                  >🛒</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <Modal open={addModal} onClose={() => setAddModal(false)} title="Add Item">
        <form onSubmit={handleAddStock} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Storage space</label>
            <select
              value={selectedSpace ?? ''}
              onChange={e => setSelectedSpace(Number(e.target.value))}
              required
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm min-h-[44px]"
            >
              <option value="">Select space…</option>
              {spaces.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
            </select>
          </div>
          <Input label="Product name" value={productName} onChange={e => setProductName(e.target.value)} required placeholder="e.g. Oat milk" />
          <Input label="Count" type="number" min={0} value={count} onChange={e => setCount(Number(e.target.value))} required />
          <Input label="Expiry date (optional)" type="date" value={expiry} onChange={e => setExpiry(e.target.value)} />
          <Button type="submit" className="w-full" loading={saving}>Add to stock</Button>
        </form>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 2: Write Stock tab test**

```tsx
// tests/components/StockTab.test.tsx
// Note: @testing-library/react not installed — test pure helper logic only
import { describe, it, expect } from 'vitest';

function expiryClass(expiry: string | null): string {
  if (!expiry) return '';
  const days = Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000);
  if (days < 0) return 'bg-red-50 border-red-200';
  if (days <= 7) return 'bg-yellow-50 border-yellow-200';
  return '';
}

describe('expiryClass', () => {
  it('returns red for past dates', () => {
    expect(expiryClass('2020-01-01')).toBe('bg-red-50 border-red-200');
  });
  it('returns yellow for within 7 days', () => {
    const soon = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];
    expect(expiryClass(soon)).toBe('bg-yellow-50 border-yellow-200');
  });
  it('returns empty string for null', () => {
    expect(expiryClass(null)).toBe('');
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npm test
```

- [ ] **Step 4: Commit**

```bash
git add src/components/tabs/StockTab.tsx tests/components/
git commit -m "feat: stock tab with count controls, expiry warnings, add item modal"
```

---

## Task 10: Shopping Tab

**Files:**
- Create: `src/components/tabs/ShoppingTab.tsx`

- [ ] **Step 1: Write `src/components/tabs/ShoppingTab.tsx`**

```tsx
import { useState, useEffect } from 'react';
import { api } from '../../lib/api.js';
import type { ShoppingItem } from '../../lib/types.js';
import { Button } from '../ui/Button.js';
import { Input } from '../ui/Input.js';
import { Spinner } from '../ui/Spinner.js';
import { showToast } from '../ui/Toast.js';

export function ShoppingTab({ pantryId }: { pantryId: number }) {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newItem, setNewItem] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    api.getShopping(pantryId)
      .then(setItems)
      .catch(() => showToast('Failed to load shopping list', 'error'))
      .finally(() => setLoading(false));
  }, [pantryId]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newItem.trim()) return;
    setAdding(true);
    try {
      const { id } = await api.addShoppingItem(pantryId, { custom_name: newItem.trim(), quantity: 1 });
      const updated = await api.getShopping(pantryId);
      setItems(updated);
      setNewItem('');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setAdding(false);
    }
  }

  async function toggleCheck(item: ShoppingItem) {
    const now = new Date().toISOString();
    const newChecked = !item.checked;
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, checked: newChecked } : i));
    try {
      await api.patchShoppingItem(pantryId, item.id, { checked: newChecked, updated_at: now });
    } catch {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, checked: item.checked } : i));
      showToast('Failed to update', 'error');
    }
  }

  async function handleDelete(item: ShoppingItem) {
    setItems(prev => prev.filter(i => i.id !== item.id));
    try {
      await api.deleteShoppingItem(pantryId, item.id);
    } catch {
      const updated = await api.getShopping(pantryId);
      setItems(updated);
      showToast('Failed to remove', 'error');
    }
  }

  async function clearChecked() {
    const checkedIds = items.filter(i => i.checked).map(i => i.id);
    if (!checkedIds.length) return;
    setItems(prev => prev.filter(i => !i.checked));
    try {
      await api.clearShopping(pantryId, checkedIds);
      showToast('Cleared checked items', 'success');
    } catch {
      const updated = await api.getShopping(pantryId);
      setItems(updated);
      showToast('Failed to clear', 'error');
    }
  }

  const unchecked = items.filter(i => !i.checked);
  const checked = items.filter(i => i.checked);

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  return (
    <div className="px-4 py-4 space-y-4 pb-4">
      {/* Add item form */}
      <form onSubmit={handleAdd} className="flex gap-2">
        <Input
          className="flex-1"
          placeholder="Add item…"
          value={newItem}
          onChange={e => setNewItem(e.target.value)}
        />
        <Button type="submit" loading={adding} disabled={!newItem.trim()}>Add</Button>
      </form>

      {/* Unchecked items */}
      <ul className="space-y-2">
        {unchecked.map(item => (
          <li key={item.id} className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-3 py-2.5 min-h-[44px]">
            <button onClick={() => toggleCheck(item)} className="w-6 h-6 rounded-full border-2 border-gray-300 flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center" />
            <span className="flex-1 text-sm">{item.custom_name ?? item.product?.name}</span>
            {item.quantity > 1 && <span className="text-xs text-gray-400">×{item.quantity}</span>}
            <button onClick={() => handleDelete(item)} className="text-gray-300 hover:text-red-500 min-h-[44px] min-w-[44px] flex items-center justify-center text-sm">✕</button>
          </li>
        ))}
      </ul>

      {/* Checked items */}
      {checked.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide">Done</h3>
            <button onClick={clearChecked} className="text-xs text-red-500 hover:text-red-700 min-h-[44px] px-2">Clear</button>
          </div>
          <ul className="space-y-2">
            {checked.map(item => (
              <li key={item.id} className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 min-h-[44px] opacity-60">
                <button onClick={() => toggleCheck(item)} className="w-6 h-6 rounded-full bg-green-500 flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center text-white text-xs">✓</button>
                <span className="flex-1 text-sm line-through text-gray-400">{item.custom_name ?? item.product?.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {items.length === 0 && (
        <p className="text-center text-gray-400 text-sm py-8">Shopping list is empty</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/tabs/ShoppingTab.tsx
git commit -m "feat: shopping list tab with check, delete, clear checked"
```

---

## Task 11: Activity Tab

**Files:**
- Create: `src/components/tabs/ActivityTab.tsx`

- [ ] **Step 1: Write `src/components/tabs/ActivityTab.tsx`**

```tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../../lib/api.js';
import type { PantryEvent } from '../../lib/types.js';
import { Spinner } from '../ui/Spinner.js';
import { showToast } from '../ui/Toast.js';

function eventDescription(event: PantryEvent): string {
  try {
    const p = JSON.parse(event.payload);
    switch (event.event_type) {
      case 'stock_added': return `Added ${p.product_name ?? 'item'} to ${p.storage_space ?? 'stock'}`;
      case 'stock_updated': return `Updated ${p.product_name ?? 'item'}: ${p.count_before} → ${p.count_after}`;
      case 'stock_removed': return `Removed ${p.product_name ?? 'item'} from stock`;
      case 'shopping_item_added': return `Added "${p.item_name}" to shopping list`;
      case 'shopping_item_checked': return `Checked off "${p.item_name}"`;
      case 'shopping_item_removed': return `Removed "${p.item_name}" from list`;
      case 'shopping_list_cleared': return `Cleared ${p.items_cleared} checked item(s)`;
      case 'member_joined': return `${p.user_name || event.user_name} joined via ${p.invite_type}`;
      case 'member_removed': return `Removed ${p.user_name || 'a member'}`;
      case 'storage_space_added': return `Added storage space: ${p.space_name} ${p.icon}`;
      case 'storage_space_deleted': return `Deleted storage space: ${p.space_name}`;
      default: return event.event_type;
    }
  } catch { return event.event_type; }
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function ActivityTab({ pantryId }: { pantryId: number }) {
  const [events, setEvents] = useState<PantryEvent[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offline, setOffline] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadFirst = useCallback(async () => {
    try {
      const { events: e, has_more } = await api.getEvents(pantryId);
      setEvents(e);
      setHasMore(has_more);
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, [pantryId]);

  useEffect(() => { loadFirst(); }, [loadFirst]);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    if (!sentinelRef.current || !hasMore || loadingMore || offline) return;
    const observer = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting) return;
      setLoadingMore(true);
      const before = events[events.length - 1]?.id;
      if (!before) { setLoadingMore(false); return; }
      try {
        const { events: more, has_more } = await api.getEvents(pantryId, before);
        setEvents(prev => [...prev, ...more]);
        setHasMore(has_more);
      } catch {
        showToast('No more results available offline', 'info');
        setHasMore(false);
      } finally {
        setLoadingMore(false);
      }
    }, { threshold: 1.0 });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [events, hasMore, loadingMore, offline, pantryId]);

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  return (
    <div className="px-4 py-4 space-y-2 pb-4">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Activity</h2>

      {offline && (
        <p className="text-center text-gray-400 text-sm py-4">Showing cached events. Go online to load more.</p>
      )}

      {events.length === 0 && !offline && (
        <p className="text-center text-gray-400 text-sm py-8">No activity yet</p>
      )}

      <ul className="space-y-2">
        {events.map(event => (
          <li key={event.id} className="flex items-start gap-3 bg-white border border-gray-100 rounded-xl p-3">
            {event.avatar_url
              ? <img src={event.avatar_url} alt="" className="w-8 h-8 rounded-full flex-shrink-0 mt-0.5" />
              : <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-medium text-green-700">{event.user_name?.[0]}</div>
            }
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-800">{eventDescription(event)}</p>
              <p className="text-xs text-gray-400 mt-0.5">{event.user_name} · {timeAgo(event.created_at)}</p>
            </div>
          </li>
        ))}
      </ul>

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="py-2 flex justify-center">
        {loadingMore && <Spinner className="w-4 h-4" />}
        {!hasMore && events.length > 0 && !offline && (
          <p className="text-xs text-gray-300">No more events</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/tabs/ActivityTab.tsx
git commit -m "feat: activity tab with paginated event log, offline fallback"
```

---

## Task 12: Settings Tab

**Files:**
- Create: `src/components/tabs/SettingsTab.tsx`

- [ ] **Step 1: Write `src/components/tabs/SettingsTab.tsx`**

```tsx
import { useState, useEffect } from 'react';
import { api } from '../../lib/api.js';
import type { Pantry, Member, StorageSpace } from '../../lib/types.js';
import { Button } from '../ui/Button.js';
import { Input } from '../ui/Input.js';
import { Modal } from '../ui/Modal.js';
import { Spinner } from '../ui/Spinner.js';
import { showToast } from '../ui/Toast.js';

interface Props {
  pantryId: number;
  pantry: Pantry;
  onPantryUpdate: (p: Pantry) => void;
}

const SPACE_ICONS = ['🧊', '🥶', '🍳', '🥫', '🍷', '🧴', '🏠', '🚗'];

export function SettingsTab({ pantryId, pantry, onPantryUpdate }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [spaces, setSpaces] = useState<StorageSpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState(pantry.display_name);
  const [inviteModal, setInviteModal] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteType, setInviteType] = useState<'code' | 'link'>('link');
  const [spaceModal, setSpaceModal] = useState(false);
  const [spaceName, setSpaceName] = useState('');
  const [spaceIcon, setSpaceIcon] = useState('🥫');
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const isOwner = pantry.role === 'owner';

  useEffect(() => {
    Promise.all([api.getMembers(pantryId), api.getSpaces(pantryId)])
      .then(([m, s]) => { setMembers(m); setSpaces(s); })
      .catch(() => showToast('Failed to load settings', 'error'))
      .finally(() => setLoading(false));
  }, [pantryId]);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    try {
      const updated = await api.updatePantry(pantryId, { display_name: displayName });
      onPantryUpdate(updated);
      showToast('Name updated', 'success');
    } catch (err: any) { showToast(err.message, 'error'); }
  }

  async function handleCreateInvite() {
    try {
      const { token, type } = await api.createInvite(pantryId, { type: inviteType });
      setInviteToken(type === 'link' ? `${window.location.origin}/join?token=${token}` : token);
    } catch (err: any) { showToast(err.message, 'error'); }
  }

  async function handleAddSpace(e: React.FormEvent) {
    e.preventDefault();
    try {
      const space = await api.createSpace(pantryId, { name: spaceName, icon: spaceIcon });
      setSpaces(prev => [...prev, space]);
      setSpaceModal(false);
      setSpaceName('');
      showToast('Space added', 'success');
    } catch (err: any) { showToast(err.message, 'error'); }
  }

  async function handleDeleteSpace(space: StorageSpace) {
    try {
      await api.deleteSpace(pantryId, space.id);
      setSpaces(prev => prev.filter(s => s.id !== space.id));
      showToast('Space deleted', 'success');
    } catch (err: any) { showToast(err.message, 'error'); }
  }

  async function handleRemoveMember(m: Member) {
    try {
      await api.removeMember(pantryId, m.user_id);
      setMembers(prev => prev.filter(x => x.user_id !== m.user_id));
      showToast('Member removed', 'success');
    } catch (err: any) { showToast(err.message, 'error'); }
  }

  async function handleDeletePantry() {
    try {
      await api.deletePantry(pantryId);
      window.location.href = '/pantries';
    } catch (err: any) { showToast(err.message, 'error'); }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  return (
    <div className="px-4 py-4 space-y-6 pb-4">

      {/* Pantry name */}
      {isOwner && (
        <section>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Pantry Name</h3>
          <form onSubmit={saveName} className="flex gap-2">
            <Input className="flex-1" value={displayName} onChange={e => setDisplayName(e.target.value)} />
            <Button type="submit" disabled={displayName === pantry.display_name}>Save</Button>
          </form>
        </section>
      )}

      {/* Members */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Members</h3>
          {isOwner && <Button variant="secondary" onClick={() => setInviteModal(true)} className="text-sm px-3 py-1.5">Invite</Button>}
        </div>
        <ul className="space-y-2">
          {members.map(m => (
            <li key={m.user_id} className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-3 py-2.5">
              {m.avatar_url ? <img src={m.avatar_url} alt="" className="w-8 h-8 rounded-full" /> : <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-xs font-medium text-green-700">{m.name[0]}</div>}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{m.name}</div>
                <div className="text-xs text-gray-400">{m.role}</div>
              </div>
              {isOwner && m.role !== 'owner' && (
                <button onClick={() => handleRemoveMember(m)} className="text-gray-300 hover:text-red-500 text-sm min-h-[44px] min-w-[44px] flex items-center justify-center">✕</button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Storage spaces */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Storage Spaces</h3>
          {isOwner && <Button variant="secondary" onClick={() => setSpaceModal(true)} className="text-sm px-3 py-1.5">+ Add</Button>}
        </div>
        <ul className="space-y-2">
          {spaces.map(s => (
            <li key={s.id} className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-3 py-2.5 min-h-[44px]">
              <span>{s.icon}</span>
              <span className="flex-1 text-sm">{s.name}</span>
              {isOwner && (
                <button onClick={() => handleDeleteSpace(s)} className="text-gray-300 hover:text-red-500 text-sm min-h-[44px] min-w-[44px] flex items-center justify-center">✕</button>
              )}
            </li>
          ))}
          {spaces.length === 0 && <p className="text-sm text-gray-400">No spaces yet</p>}
        </ul>
      </section>

      {/* Danger zone */}
      {isOwner && (
        <section>
          <h3 className="text-sm font-semibold text-red-500 uppercase tracking-wide mb-3">Danger Zone</h3>
          <Button variant="danger" onClick={() => setDeleteConfirm(true)} className="w-full">Delete Pantry</Button>
        </section>
      )}

      {/* Invite modal */}
      <Modal open={inviteModal} onClose={() => { setInviteModal(false); setInviteToken(null); }} title="Invite Member">
        <div className="space-y-4">
          <div className="flex gap-2">
            <button onClick={() => setInviteType('link')} className={`flex-1 py-2 rounded-lg text-sm font-medium min-h-[44px] ${inviteType === 'link' ? 'bg-green-600 text-white' : 'border border-gray-300 text-gray-600'}`}>Link</button>
            <button onClick={() => setInviteType('code')} className={`flex-1 py-2 rounded-lg text-sm font-medium min-h-[44px] ${inviteType === 'code' ? 'bg-green-600 text-white' : 'border border-gray-300 text-gray-600'}`}>Code</button>
          </div>
          {!inviteToken ? (
            <Button className="w-full" onClick={handleCreateInvite}>Generate {inviteType === 'link' ? 'Link' : 'Code'}</Button>
          ) : (
            <div className="space-y-3">
              {inviteType === 'code' && (
                <div className="text-xs text-gray-500 text-center">
                  Share both the <strong>slug</strong> and <strong>code</strong> below:
                  <div className="mt-1 font-mono text-sm">Slug: <strong>{pantry.slug}</strong></div>
                </div>
              )}
              <div className="bg-gray-50 rounded-xl p-3 break-all text-sm font-mono text-center">
                {inviteToken}
              </div>
              <Button variant="secondary" className="w-full" onClick={() => {
                const textToCopy = inviteType === 'code'
                  ? `Pantry: ${pantry.slug}\nCode: ${inviteToken}`
                  : inviteToken;
                navigator.clipboard.writeText(textToCopy);
                showToast('Copied!', 'success');
              }}>Copy</Button>
              <p className="text-xs text-gray-400 text-center">Single-use. Share this with the person you want to invite.</p>
            </div>
          )}
        </div>
      </Modal>

      {/* Add space modal */}
      <Modal open={spaceModal} onClose={() => setSpaceModal(false)} title="Add Storage Space">
        <form onSubmit={handleAddSpace} className="space-y-4">
          <Input label="Name" value={spaceName} onChange={e => setSpaceName(e.target.value)} placeholder="e.g. Fridge" required />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Icon</label>
            <div className="flex flex-wrap gap-2">
              {SPACE_ICONS.map(icon => (
                <button key={icon} type="button" onClick={() => setSpaceIcon(icon)}
                  className={`text-2xl p-2 rounded-lg min-h-[44px] min-w-[44px] ${spaceIcon === icon ? 'bg-green-100 ring-2 ring-green-500' : 'hover:bg-gray-100'}`}>{icon}</button>
              ))}
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={!spaceName}>Add Space</Button>
        </form>
      </Modal>

      {/* Delete confirm modal */}
      <Modal open={deleteConfirm} onClose={() => setDeleteConfirm(false)} title="Delete Pantry?">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">This will permanently delete <strong>{pantry.display_name}</strong> and all its data. This cannot be undone.</p>
          <p className="text-xs text-gray-400">You must remove all other members first.</p>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setDeleteConfirm(false)}>Cancel</Button>
            <Button variant="danger" className="flex-1" onClick={handleDeletePantry}>Delete</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/tabs/SettingsTab.tsx
git commit -m "feat: settings tab — name, members, spaces, invites, delete pantry"
```

---

## Task 12b: Mount Astro on Express

**Files:**
- Modify: `entry.mjs`

This step connects the Astro frontend build output to Express as a catch-all handler. Without it, all Astro page routes return unhandled responses.

- [ ] **Step 1: Add Astro handler import and mount to `entry.mjs`**

Add at the bottom of `entry.mjs`, after all API route mounts. Guard with `NODE_ENV !== 'test'` so backend tests that import `entry.mjs` don't fail when the Astro build output doesn't exist:

```js
// Mount Astro SSR handler as catch-all (must come last, after all /api routes)
// Guarded so backend tests (which import entry.mjs) don't fail without a build
if (process.env.NODE_ENV !== 'test') {
  const { handler } = await import('./dist/server/entry.mjs');
  app.use(handler);
}
```

- [ ] **Step 2: Add a guard in `entry.mjs` for test environments**

Wrap `app.listen(...)` to avoid port conflicts when Supertest imports the file during tests:

```js
if (process.env.NODE_ENV !== 'test') {
  const port = process.env.PORT || 4321;
  app.listen(port, () => console.log(`OpenLarder running on :${port}`));
}
```

- [ ] **Step 3: Run build then start**

```bash
npm run build && npm start
```

Expected: server starts, opens `http://localhost:4321`, and the login page renders (not a 404 or blank response).

- [ ] **Step 4: Commit**

```bash
git add entry.mjs
git commit -m "feat: mount Astro SSR handler on Express as catch-all"
```

---

## Task 13: Build Verification

- [ ] **Step 1: Run full build**

```bash
npm run build
```

Expected: Astro builds without errors. Output goes to `dist/` (or wherever Astro's node adapter writes it).

- [ ] **Step 2: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Smoke test the running app**

```bash
npm start
```

Open `http://localhost:4321` in a mobile browser or DevTools mobile emulation. Verify:
- [ ] Login page renders
- [ ] Google OAuth redirects (needs real credentials in `.env`)
- [ ] After login, `/pantries` shows the list
- [ ] Can create a pantry
- [ ] Can navigate to a pantry and see all four tabs
- [ ] Stock tab shows empty state when no spaces
- [ ] Shopping tab — add, check, clear items
- [ ] Activity tab — shows events
- [ ] Settings tab — shows members, spaces, invite modal

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "feat: full frontend complete — all pages, tabs, and UI components"
```

---

**Frontend complete.** Continue with `2026-05-27-openlarder-pwa.md` for barcode scanning, IndexedDB, offline sync, and service worker.
