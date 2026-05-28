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
