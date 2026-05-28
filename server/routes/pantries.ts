import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireMember } from '../middleware/requireMember.js';
import { requireOwner } from '../middleware/requireOwner.js';
import * as db from '../db/pantries.js';
import * as eventsDb from '../db/events.js';
import * as invitesDb from '../db/invites.js';
import { getUserById } from '../db/users.js';
import { getDb } from '../db/connection.js';

const router = Router();
const d = () => getDb();

// POST /api/pantries/join  — registered BEFORE /:id routes
router.post('/join', requireAuth, async (req, res) => {
  const { slug, code } = req.body;
  if (!slug || !code) return res.status(400).json({ error: 'slug and code required' });
  const pantry = db.getPantryBySlug(d(), slug) as any;
  if (!pantry) return res.status(404).json({ error: 'Pantry not found' });

  const invite = invitesDb.findValidInvite(d(), code) as any;
  if (!invite || invite.pantry_id !== pantry.id) return res.status(410).json({ error: 'Invalid or expired code' });
  if (db.getMemberRole(d(), pantry.id, req.session.userId!)) {
    return res.status(409).json({ error: 'Already a member' });
  }
  const user = getUserById(d(), req.session.userId!) as any;
  // Atomic: consume invite + add member in one transaction
  d().transaction(() => {
    invitesDb.consumeInvite(d(), invite.id, req.session.userId!);
    db.addMember(d(), pantry.id, req.session.userId!);
    eventsDb.logEvent(d(), pantry.id, req.session.userId!, 'member_joined', { user_name: user?.name ?? '', invite_type: 'code' });
  })();
  res.json({ pantry_id: pantry.id });
});

// GET /api/pantries
router.get('/', requireAuth, (req, res) => {
  res.json(db.getPantriesForUser(d(), req.session.userId!));
});

// POST /api/pantries
router.post('/', requireAuth, (req, res) => {
  const { slug, display_name } = req.body;
  if (!slug || !display_name) return res.status(400).json({ error: 'slug and display_name required' });
  if (!/^[a-z0-9-]{3,32}$/.test(slug)) {
    return res.status(400).json({ error: 'slug must be 3-32 chars, lowercase alphanumeric and hyphens' });
  }
  try {
    const id = db.createPantry(d(), { slug, display_name, created_by: req.session.userId! });
    const pantry = db.getPantryById(d(), id as number, req.session.userId!);
    res.status(201).json(pantry);
  } catch (err: any) {
    if (err.message === 'SLUG_TAKEN') return res.status(409).json({ error: 'Slug already taken' });
    throw err;
  }
});

// GET /api/pantries/:id
router.get('/:id', requireAuth, requireMember, (req, res) => {
  res.json(db.getPantryById(d(), (req as any).pantryId, req.session.userId!));
});

// PATCH /api/pantries/:id
router.patch('/:id', requireAuth, requireMember, requireOwner, (req, res) => {
  const { display_name } = req.body;
  if (!display_name) return res.status(400).json({ error: 'display_name required' });
  db.updatePantryName(d(), (req as any).pantryId, display_name);
  res.json(db.getPantryById(d(), (req as any).pantryId, req.session.userId!));
});

// DELETE /api/pantries/:id
router.delete('/:id', requireAuth, requireMember, requireOwner, (req, res) => {
  const pantryId = (req as any).pantryId;
  if (db.countNonOwnerMembers(d(), pantryId) > 0) {
    return res.status(409).json({ error: 'Remove all other members first' });
  }
  db.deletePantry(d(), pantryId);
  res.json({ ok: true });
});

// GET /api/pantries/:id/members
router.get('/:id/members', requireAuth, requireMember, (req, res) => {
  res.json(db.getMembers(d(), (req as any).pantryId));
});

// DELETE /api/pantries/:id/members/:userId
router.delete('/:id/members/:userId', requireAuth, requireMember, requireOwner, (req, res) => {
  const targetId = parseInt(req.params.userId, 10);
  if (targetId === req.session.userId) {
    return res.status(403).json({ error: 'Owner cannot remove themselves' });
  }
  const targetUser = getUserById(d(), targetId) as any;
  db.removeMember(d(), (req as any).pantryId, targetId);
  eventsDb.logEvent(d(), (req as any).pantryId, req.session.userId!, 'member_removed', { user_name: targetUser?.name ?? '' });
  res.json({ ok: true });
});

export default router;
