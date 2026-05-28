import { Router } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { upsertUser, getUserById } from '../db/users.js';
import { getDb } from '../db/connection.js';

const router = Router();

passport.use(new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    callbackURL: process.env.GOOGLE_CALLBACK_URL!,
  },
  (_accessToken, _refreshToken, profile, done) => {
    const user = upsertUser(getDb(), {
      google_id: profile.id,
      name: profile.displayName,
      email: profile.emails?.[0].value ?? '',
      avatar_url: profile.photos?.[0].value ?? null,
    });
    done(null, user);
  }
));

passport.serializeUser((user: any, done) => done(null, user.id));
passport.deserializeUser((id: number, done) => {
  const user = getUserById(getDb(), id);
  done(null, user ?? false);
});

router.get('/google', (req, res, next) => {
  // Preserve invite token in OAuth state if present
  const state = req.query.token ? JSON.stringify({ token: req.query.token }) : undefined;
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    ...(state ? { state } : {}),
  })(req, res, next);
});

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    req.session.userId = (req.user as any).id;
    // If state contains an invite token, redirect to /join
    try {
      const state = JSON.parse(req.query.state as string ?? '{}');
      if (state.token) return res.redirect(`/join?token=${state.token}`);
    } catch {}
    res.redirect('/pantries');
  }
);

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

export default router;
