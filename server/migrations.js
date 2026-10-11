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

  // 2 → 3: the TV link (v2 spec §9), one secret token per Household.
  (db) => {
    db.exec('ALTER TABLE households ADD COLUMN tv_token TEXT')
    const set = db.query('UPDATE households SET tv_token = ? WHERE id = ?')
    for (const { id } of db.query('SELECT id FROM households').all()) set.run(randomToken(), id)
    db.exec('CREATE UNIQUE INDEX households_by_tv_token ON households (tv_token)')
  },

  // 3 → 4: TVs paired by code (v2 spec §9), told apart from TV-link viewers for the viewer cap.
  (db) => {
    db.exec(`
      CREATE TABLE paired_devices (
        token TEXT PRIMARY KEY,
        household_id INTEGER NOT NULL REFERENCES households(id),
        paired_at INTEGER NOT NULL
      );
      CREATE INDEX paired_devices_by_household ON paired_devices (household_id);
    `)
  },

  // 4 → 5: nights that go live and end by themselves (v2 spec §7).
  (db, { now }) => {
    db.exec(`
      ALTER TABLE events ADD COLUMN goes_live_at INTEGER;
      ALTER TABLE events ADD COLUMN went_live_at INTEGER;
      ALTER TABLE events ADD COLUMN ended_automatically INTEGER NOT NULL DEFAULT 0;
    `)
    db.query('UPDATE events SET went_live_at = ? WHERE live = 1').run(now())
  },

  // 5 → 6: first-run (v2 spec §6) shows until it's been through once. Households from before it have been.
  (db) => {
    db.exec('ALTER TABLE households ADD COLUMN first_run_passed INTEGER NOT NULL DEFAULT 0')
    db.exec('UPDATE households SET first_run_passed = 1')
  },
]

// A long secret for a URL: 32 random bytes, base64url.
export function randomToken() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url')
}

export function migrate(db, { now }) {
  for (let version = db.query('PRAGMA user_version').get().user_version; version < MIGRATIONS.length; version++) {
    db.transaction(() => {
      MIGRATIONS[version](db, { now })
      db.exec(`PRAGMA user_version = ${version + 1}`)
    })()
  }
}
