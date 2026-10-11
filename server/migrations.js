// The database's versioned steps (v2 spec §4), run in order from PRAGMA user_version at startup, each in
// one transaction, on top of v1's tables (the Ledger's SCHEMA). Once sign-up has opened, a step only
// ever adds.
const MIGRATIONS = [
  // 0 → 1: Households. A v1 database's nights, taps and TV mix become Household #1; a fresh one gets none.
  (db, { now }) => {
    db.exec(`
      CREATE TABLE households (
        id INTEGER PRIMARY KEY,
        display_name TEXT NOT NULL DEFAULT '',
        time_zone TEXT NOT NULL,
        join_key TEXT NOT NULL UNIQUE,
        mix TEXT,
        location_cell TEXT,
        suspended_since INTEGER,
        signed_up_at INTEGER NOT NULL
      );
      ALTER TABLE events ADD COLUMN household_id INTEGER REFERENCES households(id);
      ALTER TABLE events ADD COLUMN rehearsal INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX events_by_household ON events (household_id, live);
    `)
    const live = db.query('SELECT join_key FROM events WHERE live = 1').get()
    if (!live) return
    const mix = db.query("SELECT value FROM kv WHERE key = 'mix'").get()?.value ?? null
    db.query("INSERT INTO households (id, time_zone, join_key, mix, signed_up_at) VALUES (1, 'America/Toronto', ?, ?, ?)").run(live.join_key, mix, now())
    db.exec("UPDATE events SET household_id = 1; UPDATE events SET rehearsal = 1 WHERE name = 'Rehearsal'; DELETE FROM kv WHERE key = 'mix'")
  },

  // 1 → 2: Managers, their sessions, and the deletions log (v2 spec §3, §16).
  (db) => {
    db.exec(`
      CREATE TABLE managers (
        id INTEGER PRIMARY KEY,
        google_sub TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL,
        name TEXT,
        household_id INTEGER NOT NULL REFERENCES households(id),
        last_sign_in_at INTEGER NOT NULL
      );
      CREATE INDEX managers_by_household ON managers (household_id);
      CREATE TABLE sessions (
        token TEXT PRIMARY KEY,
        manager_id INTEGER NOT NULL REFERENCES managers(id),
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE deletions (
        household_id INTEGER NOT NULL,
        deleted_at INTEGER NOT NULL
      );
    `)
  },
]

export function migrate(db, { now }) {
  for (let version = db.query('PRAGMA user_version').get().user_version; version < MIGRATIONS.length; version++) {
    db.transaction(() => {
      MIGRATIONS[version](db, { now })
      db.exec(`PRAGMA user_version = ${version + 1}`)
    })()
  }
}
