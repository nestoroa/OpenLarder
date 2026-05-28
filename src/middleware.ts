import { defineMiddleware } from 'astro:middleware';
import { createHmac } from 'crypto';
import Database from 'better-sqlite3';

const PUBLIC_PATHS = ['/login', '/join', '/auth'];

// Parse and verify express-session signed cookie: "s:SID.SIGNATURE"
function unsignCookie(signed: string, secret: string): string | null {
  if (!signed.startsWith('s:')) return null;
  const val = signed.slice(2);
  const dotIdx = val.lastIndexOf('.');
  if (dotIdx < 0) return null;
  const sid = val.slice(0, dotIdx);
  const sig = val.slice(dotIdx + 1);
  const expected = createHmac('sha256', secret).update(sid).digest('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return sig === expected ? sid : null;
}

// Read session directly from SQLite — avoids localhost HTTP round-trip
function getUserFromSession(cookieHeader: string): { id: number; name: string; email: string; avatar_url: string | null } | null {
  const secret = process.env.SESSION_SECRET || 'dev-secret';
  const dbPath = process.env.DATABASE_PATH || './openlarder.db';

  // Parse connect.sid from cookie header
  const match = cookieHeader.match(/connect\.sid=([^;]+)/);
  if (!match) return null;

  const sid = unsignCookie(decodeURIComponent(match[1]), secret);
  if (!sid) return null;

  try {
    const db = new Database(dbPath, { readonly: true });
    const row = db.prepare('SELECT sess FROM sessions WHERE sid = ?').get(sid) as { sess: string } | undefined;
    db.close();
    if (!row) return null;

    const sess = JSON.parse(row.sess);
    const userId = sess.userId as number | undefined;
    if (!userId) return null;

    // Fetch user from DB
    const db2 = new Database(dbPath, { readonly: true });
    const user = db2.prepare('SELECT id, name, email, avatar_url FROM User WHERE id = ?').get(userId) as { id: number; name: string; email: string; avatar_url: string | null } | undefined;
    db2.close();
    return user ?? null;
  } catch {
    return null;
  }
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  if (
    PUBLIC_PATHS.some(p => pathname.startsWith(p)) ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/auth/')
  ) {
    return next();
  }

  const cookie = context.request.headers.get('cookie') ?? '';
  const user = getUserFromSession(cookie);

  if (!user) return context.redirect('/login');

  context.locals.user = user;
  return next();
});
