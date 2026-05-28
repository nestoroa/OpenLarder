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
  getMembers: (pantryId: number) => request<Member[]>(`/api/pantries/${pantryId}/members`),
  removeMember: (pantryId: number, userId: number) =>
    request<{ ok: true }>(`/api/pantries/${pantryId}/members/${userId}`, { method: 'DELETE' }),
  getSpaces: (pantryId: number) => request<StorageSpace[]>(`/api/pantries/${pantryId}/spaces`),
  createSpace: (pantryId: number, body: { name: string; icon: string }) =>
    request<StorageSpace>(`/api/pantries/${pantryId}/spaces`, { method: 'POST', body: JSON.stringify(body) }),
  deleteSpace: (pantryId: number, spaceId: number) =>
    request<{ ok: true }>(`/api/pantries/${pantryId}/spaces/${spaceId}`, { method: 'DELETE' }),
  getStock: (pantryId: number) => request<StockItem[]>(`/api/pantries/${pantryId}/stock`),
  upsertStock: (pantryId: number, body: object) =>
    request<{ id: number; created: boolean }>(`/api/pantries/${pantryId}/stock`, {
      method: 'PUT', body: JSON.stringify(body),
    }),
  deleteStock: (pantryId: number, itemId: number) =>
    request<{ ok: true }>(`/api/pantries/${pantryId}/stock/${itemId}`, { method: 'DELETE' }),
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
  getEvents: (pantryId: number, before?: number, limit = 50) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.set('before', String(before));
    return request<{ events: PantryEvent[]; has_more: boolean }>(
      `/api/pantries/${pantryId}/events?${params}`
    );
  },
  createInvite: (pantryId: number, body: { type: 'code' | 'link'; expires_at?: string }) =>
    request<{ token: string; type: string; expires_at: string | null }>(
      `/api/pantries/${pantryId}/invites`, { method: 'POST', body: JSON.stringify(body) }
    ),
  useInvite: (token: string) =>
    request<{ pantry_id: number }>('/api/invites/use', {
      method: 'POST', body: JSON.stringify({ token }),
    }),
  lookupBarcode: (code: string) =>
    request<{ id: number; name: string; brand: string | null; barcode: string | null }>(`/api/products/barcode/${code}`),
  createProduct: (body: { name: string; brand?: string; barcode?: string }) =>
    request<{ id: number; name: string; barcode: string | null }>('/api/products', { method: 'POST', body: JSON.stringify(body) }),
  getMe: () => request<{ id: number; name: string; email: string; avatar_url: string | null }>('/api/me'),
};
