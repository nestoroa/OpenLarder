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
  const items = raw.map((r: any) => ({
    id: r.id,
    count: r.count,
    expiry_date: r.expiry_date,
    updated_at: r.updated_at,
    product: {
      id: r.product_id,
      name: r.product_name,       // COALESCE(local_name, global_name)
      brand: r.brand,             // COALESCE(local_brand, global_brand)
      image_url: r.image_url,
      barcode: r.barcode,
      uuid: r.uuid,
      local_name: r.local_name,
      local_brand: r.local_brand,
      global_name: r.global_name,
      global_brand: r.global_brand,
    },
    storage_space: { id: r.space_id, name: r.space_name, icon: r.space_icon },
  }));
  res.json(items);
});

// PUT /api/pantries/:id/products/:productId/local — upsert pantry-local name/brand override
router.put('/:id/products/:productId/local', requireAuth, requireMember, (req, res) => {
  const productId = parseInt(req.params.productId, 10);
  const { local_name, local_brand } = req.body;
  productsDb.upsertPantryProduct(d(), (req as any).pantryId, productId, {
    local_name: local_name ?? null,
    local_brand: local_brand ?? null,
  });
  res.json({ ok: true });
});

// PUT /api/pantries/:id/stock
router.put('/:id/stock', requireAuth, requireMember, (req, res) => {
  const { storage_space_id, product_id, count, expiry_date, updated_at } = req.body;
  if (storage_space_id == null || product_id == null || count == null || !updated_at) {
    return res.status(400).json({ error: 'storage_space_id, product_id, count, updated_at required' });
  }
  const pantryId = (req as any).pantryId;

  // Validate space belongs to this pantry
  const space = spacesDb.getSpaceById(d(), storage_space_id) as any;
  if (!space || space.pantry_id !== pantryId) {
    return res.status(400).json({ error: 'Invalid storage_space_id' });
  }

  // Fetch names for event payload before upsert
  const product = productsDb.getProductById(d(), product_id) as any;
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
