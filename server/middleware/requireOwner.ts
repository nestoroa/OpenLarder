import type { Request, Response, NextFunction } from 'express';

export function requireOwner(req: Request, res: Response, next: NextFunction) {
  if ((req as any).userRole !== 'owner') {
    return res.status(403).json({ error: 'Owner only' });
  }
  next();
}
