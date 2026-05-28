import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import * as productsDb from '../db/products.js';
import { getDb } from '../db/connection.js';

const router = Router();
const d = () => getDb();

// GET /api/products/barcode/:code
router.get('/barcode/:code', requireAuth, async (req, res) => {
  const { code } = req.params;

  // Check local DB first (cache-first per spec)
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
  const id = productsDb.createProduct(d(), { name, brand: brand ?? null, barcode: barcode ?? null, image_url: undefined });
  res.status(201).json(productsDb.getProductById(d(), id as number));
});

export default router;
