import { defineMiddleware } from 'astro:middleware';

const PUBLIC_PATHS = ['/login', '/join', '/auth'];

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
  try {
    const meRes = await fetch(`http://localhost:${process.env.PORT || 4321}/api/me`, {
      headers: { cookie },
    });
    if (!meRes.ok) throw new Error('not authenticated');
    const user = await meRes.json();
    context.locals.user = user;
  } catch {
    return context.redirect('/login');
  }

  return next();
});
