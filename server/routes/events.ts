import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireMember } from '../middleware/requireMember.js';
import * as eventsDb from '../db/events.js';
import { getDb } from '../db/connection.js';

const router = Router({ mergeParams: true });
const d = () => getDb();

router.get('/:id/events', requireAuth, requireMember, (req, res) => {
  const beforeRaw = parseInt(req.query.before as string, 10);
  const before = Number.isNaN(beforeRaw) ? undefined : beforeRaw;
  const limitRaw = parseInt(req.query.limit as string, 10);
  const limit = Number.isNaN(limitRaw) ? 50 : limitRaw;
  const result = eventsDb.getEvents(d(), (req as any).pantryId, before, limit);
  res.json(result);
});

export default router;
