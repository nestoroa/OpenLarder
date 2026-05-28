import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireMember } from '../middleware/requireMember.js';
import { requireOwner } from '../middleware/requireOwner.js';
import * as invitesDb from '../db/invites.js';
import * as pantriesDb from '../db/pantries.js';
import * as eventsDb from '../db/events.js';
import { getUserById } from '../db/users.js';
import { getDb } from '../db/connection.js';

const d = () => getDb();

// Router 1: POST /api/pantries/:id/invites
// Mount as: app.use('/api/pantries', invitePantryRouter)
export const invitePantryRouter = Router({ mergeParams: true });

invitePantryRouter.post('/:id/invites', requireAuth, requireMember, requireOwner, (req, res) => {
  const { type, expires_at } = req.body;
  if (!type || !['code', 'link'].includes(type)) {
    return res.status(400).json({ error: 'type must be "code" or "link"' });
  }
  const invite = invitesDb.createInvite(d(), {
    pantry_id: (req as any).pantryId,
    type,
    created_by: req.session.userId!,
    expires_at,
  });
  res.status(201).json(invite);
});

// Router 2: POST /api/invites/use
// Mount as: app.use('/api/invites', inviteUseRouter) — BEFORE /:id routes
export const inviteUseRouter = Router();

inviteUseRouter.post('/use', requireAuth, (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'token required' });
  const invite = invitesDb.findValidInvite(d(), token) as any;
  if (!invite) return res.status(410).json({ error: 'Invalid or expired invite' });
  if (pantriesDb.getMemberRole(d(), invite.pantry_id, req.session.userId!)) {
    return res.status(409).json({ error: 'Already a member' });
  }
  const user = getUserById(d(), req.session.userId!) as any;
  // Atomic: consume invite + add member in one transaction
  d().transaction(() => {
    invitesDb.consumeInvite(d(), invite.id, req.session.userId!);
    pantriesDb.addMember(d(), invite.pantry_id, req.session.userId!);
    eventsDb.logEvent(d(), invite.pantry_id, req.session.userId!, 'member_joined', {
      user_name: user?.name ?? '', invite_type: 'link',
    });
  })();
  res.json({ pantry_id: invite.pantry_id });
});
