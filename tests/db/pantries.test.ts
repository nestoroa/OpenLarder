import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, seedUser, seedPantry } from '../setup.js';
import * as pantriesDb from '../../server/db/pantries.js';

describe('pantries db', () => {
  let db: ReturnType<typeof createDb>;
  let userId: number;

  beforeEach(() => {
    db = createDb();
    userId = seedUser(db);
  });

  it('creates a pantry and adds owner as member', () => {
    const id = pantriesDb.createPantry(db, { slug: 'my-pantry', display_name: 'My Pantry', created_by: userId });
    const pantries = pantriesDb.getPantriesForUser(db, userId);
    expect(pantries).toHaveLength(1);
    expect((pantries[0] as any).role).toBe('owner');
  });

  it('returns null role for non-member', () => {
    const pantryId = seedPantry(db, userId);
    const other = seedUser(db, { google_id: 'g2', email: 'b@b.com', name: 'B' });
    expect(pantriesDb.getMemberRole(db, pantryId, other)).toBeNull();
  });

  it('blocks delete when non-owner members exist', () => {
    const pantryId = seedPantry(db, userId);
    const other = seedUser(db, { google_id: 'g2', email: 'b@b.com', name: 'B' });
    pantriesDb.addMember(db, pantryId, other);
    expect(pantriesDb.countNonOwnerMembers(db, pantryId)).toBe(1);
  });

  it('deletes pantry and all child rows', () => {
    const pantryId = seedPantry(db, userId);
    pantriesDb.deletePantry(db, pantryId);
    expect(pantriesDb.getPantriesForUser(db, userId)).toHaveLength(0);
  });
});
