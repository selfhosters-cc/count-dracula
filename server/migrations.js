// The database's versioned steps (v2 spec §4), run in order from PRAGMA user_version at startup, each in
// one transaction, on top of v1's tables (the Ledger's SCHEMA). Once sign-up has opened, a step only
// ever adds.
import { randomCode } from '../shared/codes.js'

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

  // 6 → 7: site switches the Operator flips without a redeploy (v2 spec §13): Pause sign-ups.
  (db) => {
    db.exec('CREATE TABLE site_switches (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
  },

  // 7 → 8: Invite links (v2 spec §3). made_by goes to NULL when its Manager leaves: the invite stays.
  (db) => {
    db.exec(`
      CREATE TABLE invites (
        token TEXT PRIMARY KEY,
        household_id INTEGER NOT NULL REFERENCES households(id),
        made_by INTEGER REFERENCES managers(id),
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        used_at INTEGER,
        revoked_at INTEGER
      );
      CREATE INDEX invites_by_household ON invites (household_id);
    `)
  },

  // 8 → 9: the Night summary's nearby slide (v2 spec §12): the Area figures as they stood when the night ended.
  (db) => {
    db.exec('ALTER TABLE events ADD COLUMN summary_nearby TEXT')
  },

  // 9 → 10: Night summary share links and Reports (v2 spec §12, §15). One link per night; turning sharing off
  // deletes it. A Report's reason goes with it when the Operator dismisses it.
  (db) => {
    db.exec(`
      CREATE TABLE share_links (
        token TEXT PRIMARY KEY,
        household_id INTEGER NOT NULL REFERENCES households(id),
        event_id INTEGER NOT NULL UNIQUE REFERENCES events(id),
        hide_name INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE reports (
        id INTEGER PRIMARY KEY,
        household_id INTEGER NOT NULL REFERENCES households(id),
        event_id INTEGER,
        created_at INTEGER NOT NULL,
        reason TEXT
      );
      CREATE INDEX reports_by_household ON reports (household_id);
    `)
  },

  // 10 → 11: an Estimated past event (v2 spec §14): a counts-only night made from a typed-in total.
  (db) => {
    db.exec('ALTER TABLE events ADD COLUMN estimated INTEGER NOT NULL DEFAULT 0')
  },

  // 11 → 12: Event states (spec v2.1 §3). One `state` column, upcoming | live | ended | past, replaces v1's
  // live, frozen and ended flags; went_live_at is the go-live stamp. The v2 starter flag and v1's per-event
  // join key go. A rewriting step, allowed until sign-up opens (spec v2.1 §12): a v2 starter row just
  // becomes an ordinary Event.
  (db, { now }) => {
    db.exec(`
      ALTER TABLE events ADD COLUMN state TEXT NOT NULL DEFAULT 'upcoming';
      UPDATE events SET state = CASE
        WHEN counts_only = 1 OR frozen = 1 THEN 'past'
        WHEN live = 1 AND ended = 1 THEN 'ended'
        WHEN live = 1 THEN 'live'
        ELSE 'upcoming' END;
      DROP INDEX IF EXISTS events_by_household;
      ALTER TABLE events DROP COLUMN live;
      ALTER TABLE events DROP COLUMN frozen;
      ALTER TABLE events DROP COLUMN ended;
      ALTER TABLE events DROP COLUMN rehearsal;
      ALTER TABLE events DROP COLUMN join_key;
      CREATE INDEX events_by_household ON events (household_id, state);
    `)
    db.query("UPDATE events SET went_live_at = ? WHERE state IN ('live', 'ended') AND went_live_at IS NULL").run(now())
  },

  // 12 → 13: what the tick did, noted on the Event it touched (spec v2.1 §5): 'closed' (closed to make room
  // for tick_note_for, at tick_note_at) or 'waiting' (couldn't go live at the cap, since tick_note_at). The
  // auto-end's note is ended_automatically on an Ended Event.
  (db) => {
    db.exec(`
      ALTER TABLE events ADD COLUMN tick_note TEXT;
      ALTER TABLE events ADD COLUMN tick_note_at INTEGER;
      ALTER TABLE events ADD COLUMN tick_note_for TEXT;
    `)
  },

  // 13 → 14: the Household's latest go-live stamp (spec v2.1 §6). Reset clears an Event's went_live_at, so the
  // next Go live can't read "strictly later than any stamp so far" off the events any more.
  (db) => {
    db.exec(`
      ALTER TABLE households ADD COLUMN last_stamp INTEGER;
      UPDATE households SET last_stamp = (SELECT MAX(went_live_at) FROM events WHERE household_id = households.id);
    `)
  },

  // 14 → 15: the Test night sign-up made, by id, never by name (spec v2.1 §8). Households from before have none.
  (db) => {
    db.exec('ALTER TABLE households ADD COLUMN test_night_event_id INTEGER')
  },

  // 15 → 16: Continue with email (spec v2.1 §11). A Manager is found by their address too (same address, same
  // person), and a sign-in link is kept hashed until it's used or 15 minutes pass. A Manager who has only ever
  // used email has google_sub 'email:<address>' until their first Google sign-in, which puts Google's id there:
  // the column stays NOT NULL UNIQUE, so the step only adds.
  (db) => {
    db.exec(`
      CREATE INDEX managers_by_email ON managers (lower(email));
      CREATE TABLE email_links (
        token_hash TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        time_zone TEXT NOT NULL,
        pair TEXT,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        used_at INTEGER
      );
    `)
  },

  // 16 → 17: an Invite link rides with an email sign-in link too (sign-in-simplify 03), as it does through Google.
  (db) => {
    db.exec('ALTER TABLE email_links ADD COLUMN invite TEXT')
  },

  // 17 → 18: the sign-in email carries a 6-digit code too (sign-in-simplify 04), kept hashed, for the same link:
  // using either uses both. tries counts wrong codes; at 5 the code stops working, never the link.
  (db) => {
    db.exec('ALTER TABLE email_links ADD COLUMN code_hash TEXT')
    db.exec('ALTER TABLE email_links ADD COLUMN tries INTEGER NOT NULL DEFAULT 0')
  },

  // 18 → 19: the ready checklist's memory belongs to the Household, not a phone (sign-in-simplify 06): a JSON
  // object of marks, each true once (kid: a kid was counted; night: item 3 skipped; hidden: ✕).
  (db) => {
    db.exec("ALTER TABLE households ADD COLUMN checklist TEXT NOT NULL DEFAULT '{}'")
  },

  // 19 → 20: the devices that joined each night, for /operator's Stats: a phone or TV screen once per Event,
  // by a hash of the Event and the device's own random id, so one device can't be followed across Events.
  // Nights that had already gone live count none, and show "—" (devices_counted 0) until a Reset.
  (db) => {
    db.exec(`
      CREATE TABLE event_devices (
        event_id INTEGER NOT NULL REFERENCES events(id),
        kind TEXT NOT NULL,
        device TEXT NOT NULL,
        PRIMARY KEY (event_id, kind, device)
      );
      ALTER TABLE events ADD COLUMN devices_counted INTEGER NOT NULL DEFAULT 1;
      UPDATE events SET devices_counted = 0 WHERE went_live_at IS NOT NULL OR counts_only = 1;
    `)
  },

  // 20 → 21: the watch code, the TV link's short form, typed under "Got a code?" to watch along.
  (db) => {
    db.exec('ALTER TABLE households ADD COLUMN watch_code TEXT')
    for (const { id } of db.query('SELECT id FROM households').all()) db.query('UPDATE households SET watch_code = ? WHERE id = ?').run(randomKey(), id)
    db.exec('CREATE UNIQUE INDEX households_by_watch_code ON households (watch_code)')
  },

  // 21 → 22: codes a person can type, 6 characters like a TV's pairing code (K7Q-M4X): a join code for each
  // Household (the join key stays what phones keep and write with), and the watch code made as short.
  (db) => {
    db.exec('ALTER TABLE households ADD COLUMN join_code TEXT')
    for (const { id } of db.query('SELECT id FROM households').all()) {
      db.query('UPDATE households SET join_code = ?, watch_code = ? WHERE id = ?').run(freshCode(db), freshCode(db), id)
    }
    db.exec('CREATE UNIQUE INDEX households_by_join_code ON households (join_code)')
  },

  // 22 → 23: visits to the public pages, counted by the server itself (server/visits.js): counts only, per day.
  (db) => {
    db.exec(`
      CREATE TABLE site_visits (
        day TEXT NOT NULL,
        page TEXT NOT NULL,
        views INTEGER NOT NULL DEFAULT 0,
        visitors INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (day, page)
      );
      CREATE TABLE site_sources (
        day TEXT NOT NULL,
        source TEXT NOT NULL,
        visitors INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (day, source)
      );
    `)
  },

  // 23 → 24: Extensions' tables (v2.2 §5–6): each Extension's own step counter, and which of its tables hold a
  // Household or Event id, kept here so a delete reaches them even with the Extension gone (deploy/redelete.js).
  (db) => {
    db.exec(`
      CREATE TABLE extension_versions (name TEXT PRIMARY KEY, version INTEGER NOT NULL);
      CREATE TABLE extension_owns (
        tbl TEXT PRIMARY KEY,
        extension TEXT NOT NULL,
        household_col TEXT,
        event_col TEXT
      );
    `)
  },
]

// A 6-character code no Household has yet, as its join code or its watch code.
export function freshCode(db) {
  let code
  do code = randomCode()
  while (db.query('SELECT 1 FROM households WHERE join_code = ?1 OR watch_code = ?1').get(code))
  return code
}

// A join key: 10 characters with no lookalikes. Kept by phones and links; people type the join code.
const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

export function randomKey(length = 10) {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, (b) => KEY_ALPHABET[b % KEY_ALPHABET.length]).join('')
}

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

// An Extension's own steps (v2.2 §5), after the core's: from its extension_versions row, each in one transaction
// that bumps the row. A step may create, drop or change only what's named <name>_…; anything else rolls it back
// and stops the boot. A marker table made last, before the step, no Extension's name can own: whatever the step
// makes gets a later rowid in sqlite_master, so even a core table dropped and made again as it was is a change.
export function migrateExtension(db, { name, migrations = [] }, { now }) {
  const version = db.query('SELECT version FROM extension_versions WHERE name = ?').get(name)?.version ?? 0
  for (let step = version; step < migrations.length; step++) {
    db.transaction(() => {
      db.exec(`CREATE TABLE ${STEP_MARKER} (x)`)
      const before = schema(db)
      migrations[step](db, { now })
      const after = schema(db)
      for (const key of new Set([...before.keys(), ...after.keys()])) {
        if (same(before.get(key), after.get(key))) continue
        const { type, name: what, tbl_name } = after.get(key) ?? before.get(key)
        if (!ownedBy(name, what, tbl_name)) throw new Error(`The Extension ${name}'s step ${step + 1} touched the ${type} ${what}, not ${name}_…`)
      }
      db.exec(`DROP TABLE ${STEP_MARKER}`)
      db.query('INSERT INTO extension_versions (name, version) VALUES (?, ?) ON CONFLICT (name) DO UPDATE SET version = excluded.version').run(name, step + 1)
    })()
  }
}

// Which of an Extension's tables hold a Household or Event id (v2.2 §6), recorded in place of what it said
// last boot, after its steps (so its tables exist). Each is named <name>_…, exists, and has the columns named.
export function recordOwns(db, { name, owns = {} }) {
  const rows = Object.entries(owns).map(([table, { household = null, event = null, ...other }]) => {
    if (!table.startsWith(`${name}_`)) throw new Error(`The Extension ${name} owns only tables named ${name}_…, not ${table}`)
    if (Object.keys(other).length) throw new Error(`The Extension ${name}'s ${table} names a household and an event column, not ${Object.keys(other).join(', ')}`)
    const columns = db.query('SELECT name FROM pragma_table_info(?)').all(table).map((c) => c.name)
    if (!columns.length) throw new Error(`The Extension ${name} owns ${table}, which none of its steps made`)
    for (const col of [household, event]) {
      if (col != null && !columns.includes(col)) throw new Error(`The Extension ${name}'s ${table} has no column ${col}`)
    }
    return [table, name, household, event]
  })
  db.transaction(() => {
    db.query('DELETE FROM extension_owns WHERE extension = ?').run(name)
    const insert = db.query('INSERT INTO extension_owns (tbl, extension, household_col, event_col) VALUES (?, ?, ?, ?)')
    for (const row of rows) insert.run(...row)
  })()
}

// Every recorded Extension table's rows for a Household (by its household column, and by its event column for
// that Household's Events, so call it before they go) or for one Event (v2.2 §6). Run inside the core's own
// delete, so both go or neither. A recorded table that no longer exists (its Extension removed) is skipped.
export function deleteOwned(db, { household, event }) {
  for (const { tbl, household_col, event_col } of db.query('SELECT tbl, household_col, event_col FROM extension_owns').all()) {
    if (!db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tbl)) continue
    if (household != null) {
      if (household_col) db.query(`DELETE FROM ${quoted(tbl)} WHERE ${quoted(household_col)} = ?`).run(household)
      if (event_col) db.query(`DELETE FROM ${quoted(tbl)} WHERE ${quoted(event_col)} IN (SELECT id FROM events WHERE household_id = ?)`).run(household)
    } else if (event_col) {
      db.query(`DELETE FROM ${quoted(tbl)} WHERE ${quoted(event_col)} = ?`).run(event)
    }
  }
}

const quoted = (identifier) => `"${identifier.replaceAll('"', '""')}"`

const STEP_MARKER = '_extension_step' // <name>_… never starts with _

// What sqlite_master holds, by type and name: each row with its rowid and root page, so an object dropped and made
// again, even with the same sql, isn't the same row.
function schema(db) {
  return new Map(db.query('SELECT rowid, type, name, tbl_name, rootpage, sql FROM sqlite_master').all().map((row) => [`${row.type} ${row.name}`, row]))
}

const same = (a, b) => a?.rowid === b?.rowid && a?.tbl_name === b?.tbl_name && a?.rootpage === b?.rootpage && a?.sql === b?.sql

// Named <name>_… and on a table named so; SQLite's own indexes and AUTOINCREMENT counter for such a table too.
function ownedBy(name, what, table) {
  const prefix = `${name}_`
  if (what === 'sqlite_sequence') return true
  return table.startsWith(prefix) && (what.startsWith(prefix) || what.startsWith(`sqlite_autoindex_${prefix}`))
}
