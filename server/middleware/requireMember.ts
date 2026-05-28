import type { Request, Response, NextFunction } from 'express';
import { getMemberRole } from '../db/pantries.js';
import { getDb } from '../db/connection.js';

export function requireMember(req: Request, res: Response, next: NextFunction) {
  const pantryId = parseInt(req.params.id, 10);
  const role = getMemberRole(getDb(), pantryId, req.session.userId!);
  if (!role) return res.status(403).json({ error: 'Not a member of this pantry' });
  (req as any).userRole = role;
  (req as any).pantryId = pantryId;
  next();
}
