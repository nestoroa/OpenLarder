import type Database from 'better-sqlite3';
import { randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

export function generateToken(type: 'code' | 'link'): string {
  if (type === 'link') return uuidv4();
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(randomBytes(8))
    .map(b => chars[b % chars.length])
    .join('');
}

export function createInvite(
  db: Database.Database,
  data: {
    pantry_id: number;
    type: 'code' | 'link';
    created_by: number;
    expires_at?: string;
  }
) {
  const token = generateToken(data.type);
  const result = db.prepare(`
    INSERT INTO Invite (pantry_id, type, token, created_by, expires_at)
    VALUES (@pantry_id, @type, @token, @created_by, @expires_at)
  `).run({ ...data, token, expires_at: data.expires_at ?? null });
  return { id: result.lastInsertRowid, token, type: data.type, expires_at: data.expires_at ?? null };
}

export function findValidInvite(db: Database.Database, token: string) {
  return db.prepare(`
    SELECT * FROM Invite
    WHERE token = ?
      AND used_at IS NULL
      AND (expires_at IS NULL OR expires_at > datetime('now'))
  `).get(token);
}

export function consumeInvite(db: Database.Database, inviteId: number, userId: number) {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE Invite SET used_by = ?, used_at = ? WHERE id = ?`
  ).run(userId, now, inviteId);
}
