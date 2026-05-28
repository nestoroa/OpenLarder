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
