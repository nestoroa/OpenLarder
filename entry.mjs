import express from 'express';
import session from 'express-session';
import passport from 'passport';
import SqliteStore from 'better-sqlite3-session-store';
import { getDb } from './server/db/connection.js';
import { runSchema } from './server/db/schema.js';

// Route imports (created in Tasks 4-9)
import authRouter from './server/routes/auth.js';
import meRouter from './server/routes/me.js';
import { invitePantryRouter, inviteUseRouter } from './server/routes/invites.js';
import pantriesRouter from './server/routes/pantries.js';
import spacesRouter from './server/routes/spaces.js';
import productsRouter from './server/routes/products.js';
import stockRouter from './server/routes/stock.js';
import shoppingRouter from './server/routes/shopping.js';
import eventsRouter from './server/routes/events.js';
import { errorHandler } from './server/middleware/errors.js';

const app = express();
const db = getDb();
runSchema(db);

const Store = SqliteStore(session);
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  store: new Store({ client: db }),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  },
}));
app.use(passport.initialize());
app.use(passport.session());

// IMPORTANT: static routes BEFORE /:id-scoped middleware
app.use('/auth', authRouter);
app.use('/api/me', meRouter);
app.use('/api/invites', inviteUseRouter);          // POST /api/invites/use
app.use('/api/pantries', pantriesRouter);           // includes POST /join (first inside router)
app.use('/api/pantries', invitePantryRouter);       // POST /api/pantries/:id/invites
app.use('/api/pantries', spacesRouter);
app.use('/api/pantries', stockRouter);
app.use('/api/pantries', shoppingRouter);
app.use('/api/pantries', eventsRouter);
app.use('/api/products', productsRouter);
app.use(errorHandler);

// Guard: don't listen during tests
if (process.env.NODE_ENV !== 'test') {
  const port = process.env.PORT || 4321;
  app.listen(port, () => console.log(`OpenLarder running on :${port}`));
}

export { app };
