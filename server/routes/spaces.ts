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
