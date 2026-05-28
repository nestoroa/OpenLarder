import type Database from 'better-sqlite3';

export interface User {
  id: number;
  google_id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  created_at: string;
}

export function upsertUser(
  db: Database.Database,
  data: Pick<User, 'google_id' | 'name' | 'email' | 'avatar_url'>
): User {
  db.prepare(`
    INSERT INTO User (google_id, name, email, avatar_url)
    VALUES (@google_id, @name, @email, @avatar_url)
    ON CONFLICT(google_id) DO UPDATE SET
      name = excluded.name,
      email = excluded.email,
      avatar_url = excluded.avatar_url
  `).run(data);
  return db.prepare(`SELECT * FROM User WHERE google_id = ?`).get(data.google_id) as User;
}

export function getUserById(db: Database.Database, id: number): User | null {
  return db.prepare(`SELECT * FROM User WHERE id = ?`).get(id) as User | null;
}
