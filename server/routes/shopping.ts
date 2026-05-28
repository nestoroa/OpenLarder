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
