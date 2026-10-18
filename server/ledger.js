// The Ledger: every write goes through apply(), every read through snapshot(), each on one Household.
// See .scratch/count-dracula/modules.md §1 and .scratch/multi-household/spec.md §4.
import { nextWallTime, toBuckets, zonedTime } from '../shared/night-maths.js'
import { freshCode, migrate, randomKey, randomToken } from './migrations.js'
import { isCell } from '../shared/geohash.js'
import { isBlocked } from './blocklist.js'
import { canRace } from '../shared/race-against.js'

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    live INTEGER NOT NULL DEFAULT 0, -- v1's live, frozen, ended and join_key: migration step 12 replaces
    frozen INTEGER NOT NULL DEFAULT 0, -- them with one state column (spec v2.1 §3)
    ended INTEGER NOT NULL DEFAULT 0,
    join_key TEXT,
    clock_shift_ms INTEGER NOT NULL DEFAULT 0,
    race_against_id INTEGER REFERENCES events(id),
    expected_kids INTEGER,
    visit_window_ms INTEGER NOT NULL DEFAULT 15000,
    golden_count INTEGER NOT NULL DEFAULT 0,
    counts_only INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS ghost_buckets (
    event_id INTEGER NOT NULL REFERENCES events(id),
    slot_start TEXT NOT NULL,
    slot_end TEXT NOT NULL,
    count INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id),
    name TEXT NOT NULL,
    emoji TEXT,
    sort_order INTEGER NOT NULL,
    sound TEXT
  );
  CREATE TABLE IF NOT EXISTS kids (
    id TEXT PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id),
    number INTEGER NOT NULL,
    tag_id INTEGER REFERENCES tags(id),
    phone_name TEXT,
    tapped_at INTEGER NOT NULL,
    received_at INTEGER NOT NULL,
    late INTEGER NOT NULL DEFAULT 0,
    golden INTEGER NOT NULL DEFAULT 0,
    teen INTEGER NOT NULL DEFAULT 0,
    deleted_at INTEGER,
    source TEXT NOT NULL DEFAULT 'tap',
    backfill_batch_id INTEGER
  );
  CREATE TABLE IF NOT EXISTS golden_tickets (
    id INTEGER PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id),
    number INTEGER NOT NULL,
    state TEXT NOT NULL,
    kid_id TEXT,
    expired_from TEXT
  );
  CREATE TABLE IF NOT EXISTS backfill_batches (
    id INTEGER PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id),
    rows TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    removed_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS fired_moments (
    event_id INTEGER NOT NULL REFERENCES events(id),
    moment TEXT NOT NULL,
    state TEXT NOT NULL,
    kid_id TEXT,
    at INTEGER NOT NULL,
    PRIMARY KEY (event_id, moment)
  );
`

// What a new Household's Test night and nights start with (spec §6): site-wide, in code.
const STARTER_COSTUMES = [
  ['Witch', '🧙'],
  ['Superhero', '🦸'],
  ['Princess', '👸'],
  ['Ghost', '👻'],
  ['Vampire', '🧛'],
  ['Skeleton', '💀'],
  ['Dinosaur', '🦖'],
  ['Other', '🎃'],
]

// The night sign-up schedules (spec §6): Oct 31, 4:00 pm in the Household's zone.
// A sign-up from its 3:00 am on Nov 1 on gets no "Halloween 2026" (spec v2.1 §8).
const HALLOWEEN = { name: 'Halloween 2026', date: '2026-10-31', goesLiveAt: '16:00', over: '2026-11-01' }
// The safety net (spec §7): a Live night still on at 3:00 am local is ended.
const AUTO_END_AT = '03:00'
// An Ended night goes Past by itself at noon local after that 3:00 am (spec v2.1 §3).
const PAST_AT = '12:00'
const TEST_NIGHT = 'Test night'
// How long "Closed at 4:00 pm so Halloween 2026 could go live" stays on the closed Event (spec v2.1 §5).
const CLOSED_NOTE_MS = 24 * 60 * 60_000

// Event states (spec v2.1 §3): upcoming → live → ended → past. Live or Ended is open, at most 3 at once.
const OPEN = "state IN ('live', 'ended')"
const MAX_OPEN = 3
// Reset (spec v2.1 §6): above this many kids, the Event's name is typed to confirm.
const RESET_CONFIRM_ABOVE = 20
const isOpen = (event) => event.state === 'live' || event.state === 'ended'
// An events row `e` that is its Household's door's Event: open, with the latest go-live stamp.
const DOOR_ROW = `e.state IN ('live', 'ended') AND e.id = (
  SELECT d.id FROM events d WHERE d.household_id = e.household_id AND d.state IN ('live', 'ended')
  ORDER BY d.went_live_at DESC, d.id DESC LIMIT 1)`

// A command the Ledger refuses; the HTTP layer answers 400.
export class BadCommand extends Error {}

// The TV's volume and mutes from the ☰ menu. Per Household, not per event: a level tuned at the
// test night should survive Go live (builder's latitude, v1 spec §16).
// The soundboard's shared cooldown: one sound per 3 s across every button and phone of a Household (spec §10).
const SOUNDBOARD_COOLDOWN_MS = 3_000

const DEFAULT_MIX = { volume: 1, mutes: { ambience: false, bloops: false, everything: false } }

// A tap that reaches the server more than this long after it was tapped is late (spec §2).
const LATE_AFTER_MS = 10_000

// Must 3–9 (spec §12). Each later feature honours its own switch.
export const DEFAULT_SWITCHES = {
  milestones: true,
  goldenTickets: true,
  costumeLeaderboard: true,
  newTrendAlert: true,
  soundboard: true,
  pumpkinPatch: true,
  recap: true,
  rushMeter: true, // a nice-to-have (ticket 39), switchable like the Musts
  nearby: true, // v2: nearby figures and the Site-wide total, everywhere (spec §17)
  shareLinks: true, // v2: Night summary share links (spec §17)
  estimatedGhost: true, // v2: "About how many kids came last year?" (spec §14)
  siteTopCostume: true, // v2: the site line's "top costume" clause (spec §14), the first extra to drop
  nearbyEdges: true, // v2.1: "near you" across Area edges (spec v2.1 §10); off: the Household's own Area
}

// The estimated ghost's shape (spec §14): our own 2025 night's five half-hours, as fractions of its total, so
// no count is in the code. Read at the same local times in each Household's zone.
const LAST_YEAR_SHAPE = [
  { start: '17:42', end: '18:00', share: 0.040462 },
  { start: '18:00', end: '18:30', share: 0.208092 },
  { start: '18:30', end: '19:00', share: 0.309249 },
  { start: '19:00', end: '19:30', share: 0.343931 },
  { start: '19:30', end: '20:00', share: 0.098266 },
]
const ESTIMATED_NAME = 'Halloween 2025 (estimated)'
const MAX_LAST_YEAR = 100_000

// The ready checklist's marks (sign-in-simplify 06), kept on the Household.
const CHECKLIST_MARKS = ['kid', 'night', 'hidden']

export function openLedger(db, config) {
  const switches = { ...DEFAULT_SWITCHES, ...config.switches }
  const now = config.now ?? Date.now
  const random = config.random ?? Math.random
  const soundboard = (config.soundboard ?? []).slice(0, 6).map((s, i) => ({ slot: i + 1, ...s }))

  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = NORMAL') // a power cut can lose the last commits; no multi-second stalls (spec §4)
  db.exec(SCHEMA)
  // Databases from before teens (Oct 10) get the column; everyone already in them was a kid.
  if (!db.query('PRAGMA table_info(kids)').all().some((c) => c.name === 'teen')) {
    db.exec('ALTER TABLE kids ADD COLUMN teen INTEGER NOT NULL DEFAULT 0')
  }
  migrate(db, { now })

  const opened = new Map() // household id → its Ledger, so seq and the soundboard cooldown live on

  return {
    // Sign-up (spec v2.1 §8), by when it happens in the Household's zone, with its join key and TV link:
    // - before Oct 31, 4:00 pm: a live Test night (starter costumes, no golden tickets) and "Halloween 2026",
    //   Upcoming, going live Oct 31 at 4:00 pm (starter costumes, 5 golden tickets);
    // - from then until Nov 1, 3:00 am: only "Halloween 2026", live now (with no Race against and no Expected
    //   kids yet, it has no golden tickets to draw);
    // - after: only a live Test night.
    // The Test night is an ordinary Event, remembered by id in households.test_night_event_id. Returns the id.
    createHousehold({ displayName, timeZone }) {
      const name = displayNameOf(displayName)
      if (!isTimeZone(timeZone)) throw new BadCommand('A household needs its time zone')
      const at = now()
      const halloweenAt = zonedTime(HALLOWEEN.date, HALLOWEEN.goesLiveAt, timeZone)
      const halloweenOver = zonedTime(HALLOWEEN.over, AUTO_END_AT, timeZone)
      const testNight = at < halloweenAt || at >= halloweenOver
      const halloween = at < halloweenOver
      return db.transaction(() => {
        const { id } = db
          .query('INSERT INTO households (display_name, time_zone, join_key, join_code, tv_token, watch_code, signed_up_at, last_stamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id')
          .get(name, timeZone, randomKey(), freshCode(db), randomToken(), freshCode(db), at, at) // the Event it makes live is stamped `at`
        const insertEvent = db.query(`
          INSERT INTO events (household_id, name, state, golden_count, goes_live_at, went_live_at)
          VALUES (?, ?, ?, ?, ?, ?) RETURNING id
        `)
        const insertTag = db.query('INSERT INTO tags (event_id, name, emoji, sort_order) VALUES (?, ?, ?, ?)')
        const withCostumes = (event) => {
          STARTER_COSTUMES.forEach(([costume, emoji], i) => insertTag.run(event.id, costume, emoji, i + 1))
          return event
        }
        if (testNight) {
          const test = withCostumes(insertEvent.get(id, TEST_NIGHT, 'live', 0, null, at))
          db.query('UPDATE households SET test_night_event_id = ? WHERE id = ?').run(test.id, id)
        }
        if (halloween) {
          const live = at >= halloweenAt
          withCostumes(insertEvent.get(id, HALLOWEEN.name, live ? 'live' : 'upcoming', 5, live ? null : halloweenAt, live ? at : null))
        }
        return id
      })()
    },

    // The minute tick (spec §7, v2.1 §3, §5), in this order, so a tick after a restart catches up on all of it:
    // every Live Event still on at the first 3:00 am local after it went live is ended, by name; every Ended
    // Event is Past from noon after that 3:00 am; then every Upcoming Event whose Goes live at has passed goes
    // live, closing its Household's oldest Ended Event at the 3-open cap, or waiting while all 3 are Live.
    // Returns [{ householdId, deltas }] to publish, leaving out what told screens nothing.
    // nearbyFor(householdId): the Area figures to keep on a night the tick ends, for its summary.
    tick({ nearbyFor = () => null } = {}) {
      const at = now()
      const done = []
      const publish = (householdId, deltas) => deltas.length && done.push({ householdId, deltas })
      const nightsIn = (state) =>
        db
          .query(`
            SELECT e.id, e.household_id, e.went_live_at, h.time_zone FROM events e JOIN households h ON h.id = e.household_id
            WHERE e.state = ? AND e.went_live_at IS NOT NULL ORDER BY e.id
          `)
          .all(state)
      const autoEndAt = (night) => nextWallTime(night.went_live_at, AUTO_END_AT, night.time_zone)
      for (const night of nightsIn('live')) {
        if (at < autoEndAt(night)) continue
        const house = householdOf(night.household_id)
        publish(night.household_id, house.apply({ type: 'end', eventId: night.id, stamp: night.went_live_at, automatically: true, nearby: nearbyFor(night.household_id) }))
      }
      for (const night of nightsIn('ended')) {
        if (at < nextWallTime(autoEndAt(night), PAST_AT, night.time_zone)) continue
        publish(night.household_id, householdOf(night.household_id).apply({ type: 'close', eventId: night.id }))
      }
      const due = db
        .query("SELECT id, household_id FROM events WHERE goes_live_at <= ? AND state = 'upcoming' AND counts_only = 0 ORDER BY goes_live_at, id")
        .all(at)
      for (const event of due) publish(event.household_id, householdOf(event.household_id).apply({ type: 'goesLive', eventId: event.id }))
      return done
    },

    // The door's Event (spec v2.1 §2): the Household's open Event with the latest go-live stamp, as Setup's
    // event summary, or null with none open. TV links, door phones, nearby and the Operator follow it.
    doorEvent(householdId) {
      return householdOf(householdId)?.doorEvent() ?? null
    },

    // One Household's Ledger, or null if there's no such Household.
    household(id) {
      return householdOf(id)
    },

    // The Household a phone's join key belongs to, or null.
    householdByJoinKey(key) {
      if (typeof key !== 'string' || key === '') return null
      return db.query('SELECT id FROM households WHERE join_key = ?').get(key)?.id ?? null
    },

    // Delete my Household (spec §3): every event and everything they hold, then the Household itself.
    // The Accounts module deletes its own rows in the same transaction.
    deleteHousehold(id) {
      db.transaction(() => {
        const events = 'SELECT id FROM events WHERE household_id = ?'
        for (const table of ['kids', 'tags', 'ghost_buckets', 'fired_moments', 'golden_tickets', 'backfill_batches', 'event_devices']) {
          db.query(`DELETE FROM ${table} WHERE event_id IN (${events})`).run(id)
        }
        db.query('DELETE FROM events WHERE household_id = ?').run(id)
        db.query('DELETE FROM paired_devices WHERE household_id = ?').run(id)
        db.query('DELETE FROM share_links WHERE household_id = ?').run(id)
        db.query('DELETE FROM reports WHERE household_id = ?').run(id)
        db.query('DELETE FROM households WHERE id = ?').run(id)
      })()
      opened.delete(id)
    },

    // Suspend / Unsuspend (spec §13): switched off by the Operator, with nothing deleted.
    setSuspended(id, on) {
      db.query('UPDATE households SET suspended_since = ? WHERE id = ?').run(on ? now() : null, id)
    },

    isSuspended(id) {
      return db.query('SELECT suspended_since FROM households WHERE id = ?').get(id)?.suspended_since != null
    },

    // Site switches (spec §4): the Operator's, kept in the database so they need no redeploy.
    siteSwitch(key) {
      return db.query('SELECT value FROM site_switches WHERE key = ?').get(key)?.value === 'on'
    },

    setSiteSwitch(key, on) {
      db.query('INSERT OR REPLACE INTO site_switches (key, value) VALUES (?, ?)').run(key, on ? 'on' : 'off')
    },

    // Every Household's door's Event, for /operator: [{ householdId, eventId, state ('live' | 'ended'), kids,
    // lastKidAt }], one per Household with an open Event. lastKidAt is the latest tap time; only a counted
    // kid is activity.
    doorNights() {
      return db
        .query(`
          SELECT e.household_id AS householdId, e.id AS eventId, e.state AS state,
            COUNT(k.id) AS kids, MAX(k.tapped_at) AS lastKidAt
          FROM events e LEFT JOIN kids k ON k.event_id = e.id AND k.deleted_at IS NULL
          WHERE ${DOOR_ROW} GROUP BY e.id
        `)
        .all()
    },

    // Every Household's door's Event with what Nearby needs (spec §11, v2.1 §10): its Household's cell, whether
    // it's Suspended, whether the Event is Live (not Ended), its kids, its kids in the 30 minutes before `at`, and
    // its costumes' counts. One row per Household with an open Event; its other open Events add nothing.
    nearbyNights(at) {
      const costumes = db.query(`
        SELECT t.name, t.emoji, COUNT(*) AS count FROM kids k JOIN tags t ON t.id = k.tag_id
        WHERE k.event_id = ? AND k.deleted_at IS NULL GROUP BY t.id
      `)
      return db
        .query(`
          SELECT e.id AS eventId, e.household_id AS householdId, h.location_cell AS cell,
            h.suspended_since IS NOT NULL AS suspended, e.state = 'live' AS live,
            (SELECT COUNT(*) FROM kids k WHERE k.event_id = e.id AND k.deleted_at IS NULL) AS kids,
            (SELECT COUNT(*) FROM kids k WHERE k.event_id = e.id AND k.deleted_at IS NULL AND k.tapped_at > ?) AS kids30
          FROM events e JOIN households h ON h.id = e.household_id WHERE ${DOOR_ROW}
        `)
        .all(at - 30 * 60_000)
        .map((n) => ({ ...n, suspended: n.suspended === 1, live: n.live === 1, costumes: costumes.all(n.eventId) }))
    },

    // When the last kid was counted anywhere, for /operator's Last tap tile.
    lastTapAt() {
      return db.query('SELECT MAX(received_at) AS at FROM kids WHERE deleted_at IS NULL').get().at
    },

    // A phone or TV screen that opened a stream joins its Household's door's Event, once per Event and kind
    // (/operator's Stats). Only a hash of the Event and its id is kept, never the id itself.
    countDevice(householdId, deviceId, kind) {
      const door = db.query(`SELECT e.id FROM events e WHERE e.household_id = ? AND ${DOOR_ROW}`).get(householdId)
      if (!door) return
      const device = new Bun.CryptoHasher('sha256').update(`${door.id}:${deviceId}`).digest('base64url')
      db.query('INSERT OR IGNORE INTO event_devices (event_id, kind, device) VALUES (?, ?, ?)').run(door.id, kind, device)
    },

    // Every Event that went live (or is Upcoming), for /operator's Stats, or one Household's: [{ id, householdId,
    // name, state, wentLiveAt, testNight, kids, phones, tvScreens }]. Imported and estimated counts aren't nights;
    // phones and tvScreens are null on a night that went live before devices were counted.
    nights(householdId = null) {
      return db
        .query(`
          SELECT e.id, e.household_id AS householdId, e.name, e.state, e.went_live_at AS wentLiveAt,
            e.id IS h.test_night_event_id AS testNight,
            (SELECT COUNT(*) FROM kids k WHERE k.event_id = e.id AND k.deleted_at IS NULL) AS kids,
            CASE WHEN e.devices_counted THEN (SELECT COUNT(*) FROM event_devices d WHERE d.event_id = e.id AND d.kind = 'phone') END AS phones,
            CASE WHEN e.devices_counted THEN (SELECT COUNT(*) FROM event_devices d WHERE d.event_id = e.id AND d.kind = 'tv') END AS tvScreens
          FROM events e JOIN households h ON h.id = e.household_id
          WHERE e.counts_only = 0 AND (?1 IS NULL OR e.household_id = ?1) ORDER BY e.id
        `)
        .all(householdId)
        .map((n) => ({ ...n, testNight: n.testNight === 1 }))
    },

    // TVs paired by code, across the site.
    pairedTvs() {
      return db.query('SELECT COUNT(*) AS n FROM paired_devices').get().n
    },

    // A Night summary share link's night: { householdId, eventId, hideName }, or null.
    byShareToken(token) {
      if (typeof token !== 'string' || token === '') return null
      const row = db.query('SELECT household_id, event_id, hide_name FROM share_links WHERE token = ?').get(token)
      return row ? { householdId: row.household_id, eventId: row.event_id, hideName: row.hide_name === 1 } : null
    },

    // ---- Reports (spec §15): a stranger's flag on a public page that shows a night, with an optional short reason.
    addReport({ householdId, eventId, reason }) {
      const text = typeof reason === 'string' ? reason.trim().slice(0, 200) : ''
      db.query('INSERT INTO reports (household_id, event_id, created_at, reason) VALUES (?, ?, ?, ?)').run(householdId, eventId, now(), text || null)
    },

    // Each names its night (v2.2 §9): eventName is null once that Event is gone.
    reports(householdId) {
      return db
        .query('SELECT r.id, r.event_id AS eventId, e.name AS eventName, r.created_at AS at, r.reason FROM reports r LEFT JOIN events e ON e.id = r.event_id WHERE r.household_id = ? ORDER BY r.id')
        .all(householdId)
    },

    // Dismissing deletes the Report, its reason with it.
    dismissReport(householdId, reportId) {
      const { changes } = db.query('DELETE FROM reports WHERE id = ? AND household_id = ?').run(reportId, householdId)
      if (!changes) throw new BadCommand('No such Report')
    },

    // Whether a device token is a TV this Household paired by code (and hasn't rotated away since).
    isPairedDevice(householdId, token) {
      if (typeof token !== 'string' || token === '') return false
      return !!db.query('SELECT 1 FROM paired_devices WHERE token = ? AND household_id = ?').get(token, householdId)
    },

    // The Household a join code belongs to, or null.
    householdByJoinCode(code) {
      if (typeof code !== 'string' || code === '') return null
      return db.query('SELECT id FROM households WHERE join_code = ?').get(code)?.id ?? null
    },

    // Whether a 6-character code is already a Household's, for a new TV pairing code to steer clear of.
    isHouseholdCode(code) {
      return !!db.query('SELECT 1 FROM households WHERE join_code = ?1 OR watch_code = ?1').get(code)
    },

    // The TV link a watch code stands for (its token), or null.
    tvTokenByWatchCode(code) {
      if (typeof code !== 'string' || code === '') return null
      return db.query('SELECT tv_token FROM households WHERE watch_code = ? AND suspended_since IS NULL').get(code)?.tv_token ?? null
    },

    // The Household whose TV link carries this token, or null.
    householdByTvToken(token) {
      if (typeof token !== 'string' || token === '') return null
      return db.query('SELECT id FROM households WHERE tv_token = ?').get(token)?.id ?? null
    },

    households() {
      return db
        .query(`
          SELECT id, display_name AS displayName, time_zone AS timeZone, location_cell AS location,
            suspended_since AS suspendedSince, signed_up_at AS signedUpAt
          FROM households ORDER BY id
        `)
        .all()
    },
  }

  function householdOf(id) {
    if (!opened.has(id)) {
      if (!db.query('SELECT 1 FROM households WHERE id = ?').get(id)) return null
      opened.set(id, householdLedger(id))
    }
    return opened.get(id)
  }

  function householdLedger(householdId) {
    let lastBoardAt = -Infinity

    // Golden tickets (spec §9): drawn blind at Go live, one per band across 10–80% of the Race-against
    // total, or of Expected kids with no ghost. Integer maths, so the bands don't drift with float error.
    function drawGoldenTickets(event) {
      if (!switches.goldenTickets) return
      const base = ghostOf(event)?.total ?? event.expected_kids
      if (!base) return
      const lo = Math.ceil(base / 10)
      const hi = Math.floor((base * 8) / 10)
      const size = hi - lo + 1
      const insert = db.query("INSERT INTO golden_tickets (event_id, number, state) VALUES (?, ?, 'hidden')")
      for (let band = 0; band < event.golden_count; band++) {
        const start = lo + Math.floor((band * size) / event.golden_count)
        const end = lo + Math.floor(((band + 1) * size) / event.golden_count) - 1
        if (end >= start) insert.run(event.id, start + Math.floor(random() * (end - start + 1)))
      }
    }

    // The recap's golden card (spec §7 Ended): every number revealed, but only once the night is over —
    // Ended or Past. While the night is on, the numbers never leave the Ledger.
    function recapOf(event) {
      if (!(event.state === 'ended' || event.state === 'past') || event.counts_only) return null
      const tickets = db
        .query(`
          SELECT t.number, t.state, k.number AS kidNumber
          FROM golden_tickets t LEFT JOIN kids k ON k.id = t.kid_id
          WHERE t.event_id = ? ORDER BY t.number
        `)
        .all(event.id)
      return { tickets }
    }

    // All a client ever learns about the tickets: how many are left, and whether the next kid wins one.
    function goldenSummary(event) {
      if (!switches.goldenTickets) return null
      const unclaimed = "event_id = ? AND kid_id IS NULL AND state IN ('hidden', 'rolled', 'released')"
      const left = db.query(`SELECT COUNT(*) AS n FROM golden_tickets WHERE ${unclaimed}`).get(event.id).n
      const next = liveCount.get(event.id).n + 1
      const waiting = db.query("SELECT 1 FROM golden_tickets WHERE event_id = ? AND kid_id IS NULL AND state IN ('rolled', 'released')").get(event.id)
      const nextIsGolden = !!waiting || !!db.query("SELECT 1 FROM golden_tickets WHERE event_id = ? AND state = 'hidden' AND number = ?").get(event.id, next)
      return { left, nextIsGolden }
    }

    // One of this Household's events by id, or null. There's no default: a command names its Event.
    function eventById(id) {
      if (id == null) return null
      return db.query('SELECT * FROM events WHERE id = ? AND household_id = ?').get(id, householdId) ?? null
    }

    // The door's Event's row (spec v2.1 §2), or null with none open.
    function doorRow() {
      return db.query(`SELECT * FROM events WHERE household_id = ? AND ${OPEN} ORDER BY went_live_at DESC, id DESC LIMIT 1`).get(householdId) ?? null
    }

    // What a screen with nothing open shows (spec v2.1 §4): the Upcoming Event that goes live soonest, else
    // the oldest Upcoming one (with no countdown), else null.
    function nextUpcoming() {
      const row =
        db.query("SELECT * FROM events WHERE household_id = ? AND state = 'upcoming' AND counts_only = 0 AND goes_live_at IS NOT NULL ORDER BY goes_live_at, id LIMIT 1").get(householdId) ??
        db.query("SELECT * FROM events WHERE household_id = ? AND state = 'upcoming' AND counts_only = 0 ORDER BY id LIMIT 1").get(householdId)
      return row ? { id: row.id, name: row.name, goesLiveAt: row.goes_live_at } : null
    }

    // The open Event a night command names, checked against the go-live stamp the device saw (spec v2.1 §4):
    // a missing, Upcoming or Past Event, or a stamp from before a reset, is refused (400).
    function openNight({ eventId, stamp }) {
      const event = eventById(eventId)
      if (!event) throw new BadCommand('Name the night: no such event')
      if (!isOpen(event)) throw new BadCommand(`"${event.name}" isn't on`)
      if (stamp !== event.went_live_at) throw new BadCommand(`"${event.name}" has gone live again since`)
      return event
    }

    // Go live stamps strictly later than any earlier go-live of the Household, so the door's Event is never a
    // tie, and a tap under a stamp from before a Reset (or a deleted Event) never matches again. The Household
    // remembers its latest stamp, since Reset clears an Event's.
    function nextStamp() {
      const { at } = db.query('SELECT MAX(went_live_at) AS at FROM events WHERE household_id = ?').get(householdId)
      const last = Math.max(household().last_stamp ?? -Infinity, at ?? -Infinity)
      const stamp = Math.max(now(), last + 1)
      db.query('UPDATE households SET last_stamp = ? WHERE id = ?').run(stamp, householdId)
      return stamp
    }

    // The Race-against event as half-hour buckets: stored for a counts-only event, else from its own taps.
    function ghostOf(event) {
      if (event.race_against_id == null) return null
      const against = eventById(event.race_against_id)
      const buckets = against.counts_only
        ? db
            .query('SELECT slot_start AS start, slot_end AS end, count FROM ghost_buckets WHERE event_id = ? ORDER BY slot_start')
            .all(against.id)
        : toBuckets(
            db.query('SELECT tapped_at FROM kids WHERE event_id = ? AND deleted_at IS NULL').all(against.id).map((r) => r.tapped_at),
            against.clock_shift_ms,
            household().time_zone,
          )
      return {
        eventId: against.id,
        // "2025: 346" on the chart; an Estimated past event says so wherever it shows (spec §14).
        label: against.estimated ? 'last year (estimated)' : (against.name.match(/\b(?:19|20)\d\d\b/)?.[0] ?? against.name),
        estimated: against.estimated === 1,
        total: buckets.reduce((sum, b) => sum + b.count, 0),
        buckets,
      }
    }

    let seq = 0

    const insertKid = db.query(`
      INSERT INTO kids (id, event_id, number, tag_id, phone_name, tapped_at, received_at, late, teen, source, backfill_batch_id)
      VALUES ($id, $eventId, $number, $tagId, $phoneName, $tappedAt, $receivedAt, $late, $teen, $source, $batchId)
      ON CONFLICT(id) DO NOTHING
      RETURNING *
    `)
    const softDeleteKid = db.query(
      'UPDATE kids SET deleted_at = ? WHERE id = ? AND event_id = ? AND deleted_at IS NULL RETURNING id',
    )
    const liveCount = db.query('SELECT COUNT(*) AS n FROM kids WHERE event_id = ? AND deleted_at IS NULL')

    const insertTag = db.query(`
      INSERT INTO tags (event_id, name, emoji, sort_order)
      VALUES ($eventId, $name, $emoji, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM tags WHERE event_id = $eventId))
      RETURNING *
    `)

    const mostRecentUntagged = db.query(`
      SELECT id FROM kids WHERE event_id = ? AND tag_id IS NULL AND deleted_at IS NULL
      ORDER BY tapped_at DESC, rowid DESC LIMIT ?
    `)
    const setTag = db.query('UPDATE kids SET tag_id = ? WHERE id = ?')
    const kidExists = db.query('SELECT 1 FROM kids WHERE id = ?')
    const tagInEvent = db.query('SELECT 1 FROM tags WHERE id = ? AND event_id = ?')

    // Numbers the kid by the live count at arrival and flags it late (spec §2). Returns null for a repeat id.
    function addKid(event, { id, tagId, tappedAt, phoneName, teen = false, batchId = null }) {
      if (typeof id !== 'string' || id === '') throw new BadCommand('A tap needs an id')
      if (!Number.isFinite(tappedAt)) throw new BadCommand('A tap needs tappedAt in ms')
      const receivedAt = now()
      const row = insertKid.get({
        $id: id,
        $eventId: event.id,
        $number: liveCount.get(event.id).n + 1,
        $tagId: tagId != null && tagInEvent.get(tagId, event.id) ? tagId : null, // a tag deleted while the tap queued
        $phoneName: typeof phoneName === 'string' ? phoneName.slice(0, MAX_NAME) : null, // cut, never refused: a refused tap would jam the phone's outbox
        $tappedAt: tappedAt,
        $receivedAt: receivedAt,
        $late: batchId != null || receivedAt - tappedAt > LATE_AFTER_MS ? 1 : 0, // backfilled kids are always late
        $teen: teen === true ? 1 : 0,
        $source: batchId == null ? 'tap' : 'backfill',
        $batchId: batchId,
      })
      return row && toKid(row)
    }

    // The top of the golden range: 80% of the Race-against total, or of Expected kids (spec §9).
    function topOfRange(event) {
      const base = ghostOf(event)?.total ?? event.expected_kids
      return base ? Math.floor((base * 8) / 10) : 0
    }

    // A hidden ticket off a teen's number: a fresh random number above the count, never one another
    // hidden ticket holds. With no room left in the range it rolls forward to the next kid who can win.
    function moveTicket(event, ticketId) {
      const taken = new Set(db.query("SELECT number FROM golden_tickets WHERE event_id = ? AND state = 'hidden'").all(event.id).map((r) => r.number))
      const free = []
      for (let n = liveCount.get(event.id).n + 1; n <= topOfRange(event); n++) if (!taken.has(n)) free.push(n)
      if (free.length) db.query('UPDATE golden_tickets SET number = ? WHERE id = ?').run(free[Math.floor(random() * free.length)], ticketId)
      else db.query("UPDATE golden_tickets SET state = 'rolled' WHERE id = ?").run(ticketId)
    }

    const momentState = db.query('SELECT state FROM fired_moments WHERE event_id = ? AND moment = ?')
    const markMoment = db.query('INSERT OR REPLACE INTO fired_moments (event_id, moment, state, kid_id, at) VALUES (?, ?, ?, ?, ?)')

    // The server decides every celebration (modules.md §1). Each milestone and Beat last year fires at
    // most once per event, the first time it's crossed live. A late kid skips its milestone for good and
    // leaves Beat last year pending for the next live tap, which fires it without a kid number (spec §8).
    // Returns the kid.added delta plus any deferred moment.
    function referee(event, kid) {
      const moments = []
      const deferred = []
      if (switches.goldenTickets) {
        const own = db.query("SELECT id FROM golden_tickets WHERE event_id = ? AND state = 'hidden' AND number = ?").get(event.id, kid.number)
        if (kid.teen) {
          // Too old to win (the user's ask, Oct 10): their number's ticket moves on, and they skip waiting ones.
          if (own) moveTicket(event, own.id)
        } else if (kid.late) {
          // Never left hidden below the count: it rolls forward to the next live kid, keeping its number.
          if (own) db.query("UPDATE golden_tickets SET state = 'rolled' WHERE id = ?").run(own.id)
        } else if (own) {
          db.query("UPDATE golden_tickets SET state = 'won', kid_id = ? WHERE id = ?").run(kid.id, own.id)
          moments.push('golden')
        } else {
          // One rolled-forward or released ticket per live kid, oldest first.
          const waiting = db
            .query("SELECT id FROM golden_tickets WHERE event_id = ? AND state IN ('rolled', 'released') AND kid_id IS NULL ORDER BY id LIMIT 1")
            .get(event.id)
          if (waiting) {
            db.query('UPDATE golden_tickets SET kid_id = ? WHERE id = ?').run(kid.id, waiting.id)
            moments.push('golden')
          }
        }
      }
      if (switches.milestones) {
        const fire = (moment, state = 'fired') => markMoment.run(event.id, moment, state, kid.id, now())
        const milestone = kid.number % 50 === 0 ? `milestone:${kid.number}` : null
        const beatAt = (ghostOf(event)?.total ?? Infinity) + 1
        const beat = momentState.get(event.id, 'beat-last-year')?.state
        if (milestone && !momentState.get(event.id, milestone)) {
          fire(milestone, kid.late ? 'skipped' : 'fired')
          if (!kid.late) moments.push(milestone)
        }
        if (kid.late) {
          if (!beat && kid.number >= beatAt) fire('beat-last-year', 'pending')
        } else if (beat === 'pending') {
          fire('beat-last-year')
          deferred.push({ type: 'moment', eventId: event.id, moments: ['beat-last-year'] })
        } else if (!beat && kid.number >= beatAt) {
          fire('beat-last-year')
          moments.push('beat-last-year')
        }
      }
      if (moments.includes('golden')) {
        // Public once won: the TV gives the winner a gold pumpkin (Must #8).
        db.query('UPDATE kids SET golden = 1 WHERE id = ?').run(kid.id)
        kid = { ...kid, golden: true }
      }
      return [{ type: 'kid.added', eventId: event.id, kid, moments, golden: goldenSummary(event) }, ...deferred]
    }

    const commands = {
      // Every night command names its open Event and the go-live stamp it was tapped under (spec v2.1 §4).
      tap(command) {
        const event = openNight(command)
        const kid = addKid(event, command)
        return kid ? referee(event, kid) : []
      },

      // "+ New" costume: creates the tag and counts the kid at the door with it (spec §2 Catch-up).
      // N is capped by the untagged kids there are; timestamps are untouched.
      catchUp({ tag, n = 0, kid, ...night }) {
        const event = openNight(night)
        const name = costumeName(tag?.name)
        if (!Number.isInteger(n) || n < 0) throw new BadCommand('Catch-up needs a whole number of kids')
        if (kidExists.get(kid?.id)) return [] // a retry: the door kid already landed, so all of it did
        const emoji = costumeEmoji(tag.emoji)
        const tagRow = insertTag.get({ $eventId: event.id, $name: name, $emoji: emoji })
        const kidIds = mostRecentUntagged.all(event.id, n).map((r) => r.id)
        for (const id of kidIds) setTag.run(tagRow.id, id)
        const added = addKid(event, { ...kid, tagId: tagRow.id })
        // A costume spotted live gets the TV's banner, "×(N+1)" including the kid at the door (Must #6).
        const newCostume = switches.newTrendAlert ? { name, emoji, count: kidIds.length + 1 } : undefined
        return [
          { type: 'tag.added', eventId: event.id, tag: toTag(tagRow), ...(newCostume && { newCostume }) },
          ...(kidIds.length ? [{ type: 'kid.retagged', eventId: event.id, kidIds, tagId: tagRow.id }] : []),
          ...referee(event, added),
        ]
      },

      // A won ticket stays won, even if its winner is removed (spec §9).
      remove({ kidId, ...night }) {
        const event = openNight(night)
        const row = softDeleteKid.get(now(), kidId, event.id)
        return row ? [{ type: 'kid.removed', eventId: event.id, kidId, golden: goldenSummary(event) }] : []
      },

      // "Add missed kids" (spec §6): each row's count spread evenly across its slot (up to now), as
      // untagged backfill kids in one batch, numbered in tap-time order. Late taps: they never celebrate.
      backfill({ rows, ...night }) {
        const event = openNight(night)
        if (!Array.isArray(rows) || !rows.length) throw new BadCommand('Nothing to add')
        const at = now()
        const times = rows.flatMap(({ startMs, endMs, count }) => {
          if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) throw new BadCommand('A row needs its slot')
          if (!Number.isInteger(count) || count < 1 || count > 1000) throw new BadCommand('A row needs a count from 1 to 1000')
          if (startMs > at) throw new BadCommand("That row hasn't started yet")
          const end = Math.min(endMs, at)
          return Array.from({ length: count }, (_, i) => startMs + ((i + 0.5) * (end - startMs)) / count)
        })
        const batch = db
          .query('INSERT INTO backfill_batches (event_id, rows, created_at) VALUES (?, ?, ?) RETURNING id')
          .get(event.id, JSON.stringify(rows.map(({ startMs, endMs, count }) => ({ startMs, endMs, count }))), at)
        return times
          .sort((a, b) => a - b)
          .flatMap((tappedAt, i) => {
            const kid = addKid(event, { id: crypto.randomUUID(), tappedAt: Math.round(tappedAt), phoneName: 'Add missed kids', batchId: batch.id })
            return referee(event, kid)
          })
      },

      // A batch comes off as a whole (soft delete): the TV dips quietly.
      removeBatch({ batchId, ...night }) {
        const event = openNight(night)
        const kidIds = db
          .query('UPDATE kids SET deleted_at = ? WHERE backfill_batch_id = ? AND event_id = ? AND deleted_at IS NULL RETURNING id')
          .all(now(), batchId, event.id)
          .map((r) => r.id)
        // Kept, marked removed: a deleted row's id could be reused by the next batch.
        db.query('UPDATE backfill_batches SET removed_at = ? WHERE id = ? AND event_id = ?').run(now(), batchId, event.id)
        return kidIds.length ? [{ type: 'kids.removed', eventId: event.id, kidIds, golden: goldenSummary(event) }] : []
      },

      // ☰ soundboard (Must #7): plays on the TV straight away, at most once per 3 s across all phones. A press
      // names the Event on the phone's screen; if the TVs have moved off it since, it's dropped (spec v2.1 §4)
      // and spends no cooldown.
      soundboard({ slot, ...night }) {
        const event = openNight(night)
        if (!switches.soundboard) throw new BadCommand('The soundboard is switched off')
        const entry = soundboard.find((s) => s.slot === slot)
        if (!entry) throw new BadCommand('No such soundboard button')
        if (doorRow()?.id !== event.id) throw new BadCommand(`"${event.name}" isn't on the TV any more`)
        const at = now()
        if (at - lastBoardAt < SOUNDBOARD_COOLDOWN_MS) return []
        lastBoardAt = at
        return [{ type: 'soundboard', eventId: event.id, slot, label: entry.label }]
      },

      // "🌙 End the night" (spec v2.1 §3): Live → Ended. It stays open, so stragglers still count, until it's
      // Past at noon or by Close now. Tickets nobody won expire, remembering what they were for Resume.
      // The 3:00 am safety net ends it `automatically`, which /setup tells the Manager about.
      // `nearby`, the Area's figures at this moment (or null), is kept for the Night summary's nearby slide.
      end({ automatically = false, nearby = null, ...night }) {
        const event = openNight(night)
        if (event.state === 'ended') return []
        db.query("UPDATE events SET state = 'ended', ended_automatically = ?, summary_nearby = ? WHERE id = ?").run(automatically ? 1 : 0, nearby ? JSON.stringify(nearby) : null, event.id)
        db.query(`
          UPDATE golden_tickets SET expired_from = state, state = 'expired'
          WHERE event_id = ? AND kid_id IS NULL AND state IN ('hidden', 'rolled', 'released')
        `).run(event.id)
        return [{ type: 'event.ended', eventId: event.id, ended: true, golden: goldenSummary(event), recap: recapOf(eventById(event.id)) }]
      },

      // "Resume the night": Ended → Live, keeping its go-live stamp. Expired tickets come back exactly as they were.
      resume(night) {
        const event = openNight(night)
        if (event.state === 'live') return []
        db.query("UPDATE events SET state = 'live', ended_automatically = 0 WHERE id = ?").run(event.id)
        db.query("UPDATE golden_tickets SET state = expired_from, expired_from = NULL WHERE event_id = ? AND state = 'expired'").run(event.id)
        return [{ type: 'event.ended', eventId: event.id, ended: false, golden: goldenSummary(event), recap: null }]
      },

      // "Close now" (Setup, spec v2.1 §3): Ended → Past early. The tick does the same at noon.
      close({ eventId }) {
        const event = eventById(eventId)
        if (!event) throw new BadCommand('No such event')
        if (event.state === 'live') throw new BadCommand('End the night first')
        if (event.state !== 'ended') throw new BadCommand('Only an ended night can be closed')
        db.query("UPDATE events SET state = 'past' WHERE id = ?").run(event.id)
        return []
      },

      // ---- The ☰ menu's TV controls (spec §5): any phone with the join key.
      mix({ volume, mutes = {} }) {
        if (!Number.isFinite(volume) || volume < 0 || volume > 1) throw new BadCommand('Volume runs from 0 to 1')
        const mix = { volume, mutes: { ambience: !!mutes.ambience, bloops: !!mutes.bloops, everything: !!mutes.everything } }
        db.query('UPDATE households SET mix = ? WHERE id = ?').run(JSON.stringify(mix), householdId)
        return [{ type: 'mix.changed', eventId: null, mix }]
      },

      // "Add a ticket" (Setup, after Go live): one number between tonight's count + 5 and the top of the
      // range, never one another hidden ticket already holds.
      addTicket(night) {
        const event = openNight(night)
        const base = ghostOf(event)?.total ?? event.expected_kids
        if (!switches.goldenTickets || !base) throw new BadCommand('Golden tickets need Race against or Expected kids')
        const taken = new Set(db.query("SELECT number FROM golden_tickets WHERE event_id = ? AND state = 'hidden'").all(event.id).map((r) => r.number))
        const free = []
        for (let n = liveCount.get(event.id).n + 5; n <= Math.floor((base * 8) / 10); n++) if (!taken.has(n)) free.push(n)
        if (!free.length) throw new BadCommand('No room left in the range for another ticket')
        db.query("INSERT INTO golden_tickets (event_id, number, state) VALUES (?, ?, 'hidden')").run(event.id, free[Math.floor(random() * free.length)])
        return [{ type: 'golden.changed', eventId: event.id, golden: goldenSummary(event) }]
      },

      // "Release remaining" (☰, from 7:45pm event time): the next K live kids win the K tickets left.
      release(night) {
        const event = openNight(night)
        db.query("UPDATE golden_tickets SET state = 'released' WHERE event_id = ? AND state = 'hidden'").run(event.id)
        return [{ type: 'golden.changed', eventId: event.id, golden: goldenSummary(event) }]
      },

      // ---- Setup (spec §6). Creating an event doesn't make it live.
      // "Copy costumes from" brings names, emoji, order, sounds and the Visit window, with zero counts.
      // A new Event races the Household's estimate, if it has one (spec v2.1 §7), while the switch is on.
      createEvent({ name, copyTagsFrom }) {
        const source = copyTagsFrom == null ? null : eventById(copyTagsFrom)
        if (copyTagsFrom != null && !source) throw new BadCommand('No event to copy costumes from')
        const raceAgainst = switches.estimatedGhost ? (estimatedEvent()?.id ?? null) : null
        const row = db
          .query('INSERT INTO events (household_id, name, visit_window_ms, golden_count, race_against_id) VALUES (?, ?, ?, 5, ?) RETURNING *')
          .get(householdId, eventName(name), source?.visit_window_ms ?? 15_000, raceAgainst)
        if (source) {
          db.query(`
            INSERT INTO tags (event_id, name, emoji, sort_order, sound)
            SELECT ?, name, emoji, sort_order, sound FROM tags WHERE event_id = ? ORDER BY sort_order
          `).run(row.id, source.id)
        }
        return [{ type: 'event.created', eventId: row.id, event: toEventSummary(row) }]
      },

      // Upcoming → Live (spec v2.1 §3), stamped with its go-live time. It never changes another Event; at 3
      // open (Live or Ended) it's refused. It becomes the door's Event, so apply() tells screens to switch.
      goLive({ eventId }) {
        const next = eventById(eventId)
        if (!next) throw new BadCommand('No such event')
        if (isOpen(next)) return []
        if (next.counts_only || next.state === 'past') throw new BadCommand("A past event can't go live again")
        const open = db.query(`SELECT COUNT(*) AS n FROM events WHERE household_id = ? AND ${OPEN}`).get(householdId).n
        if (open >= MAX_OPEN) throw new BadCommand('End or close one of your live nights first')
        // Goes live at stays, so a Reset before it goes live by itself then (spec v2.1 §6); only Upcoming is ticked.
        db.query("UPDATE events SET state = 'live', went_live_at = ?, tick_note = NULL, tick_note_at = NULL, tick_note_for = NULL WHERE id = ?").run(nextStamp(), next.id)
        drawGoldenTickets(eventById(next.id))
        return []
      },

      // The tick's Go live at Goes live at (spec v2.1 §5); never a Manager's (it's not in the HTTP layer's
      // Setup commands). At the 3-open cap it closes the oldest Ended Event, by go-live stamp, noting why on
      // it, and goes live in the same breath (one door.changed). With all 3 Live it waits, noted on itself
      // from the first tick that couldn't, and tries again every tick.
      goesLive({ eventId }) {
        const next = eventById(eventId)
        if (!next || next.state !== 'upcoming' || next.counts_only) return []
        if (db.query(`SELECT COUNT(*) AS n FROM events WHERE household_id = ? AND ${OPEN}`).get(householdId).n >= MAX_OPEN) {
          const oldest = db.query("SELECT * FROM events WHERE household_id = ? AND state = 'ended' ORDER BY went_live_at, id LIMIT 1").get(householdId)
          if (!oldest) {
            if (next.tick_note !== 'waiting') db.query("UPDATE events SET tick_note = 'waiting', tick_note_at = ?, tick_note_for = NULL WHERE id = ?").run(now(), next.id)
            return []
          }
          commands.close({ eventId: oldest.id })
          db.query("UPDATE events SET tick_note = 'closed', tick_note_at = ?, tick_note_for = ? WHERE id = ?").run(now(), next.name, oldest.id)
        }
        return commands.goLive({ eventId: next.id })
      },

      // Reset (Setup, spec v2.1 §6): a Live or Ended Event back to Upcoming, as if it never went live. Its
      // night goes (kids, batches, moments, golden tickets, the summary's nearby slide, share links, the go-live
      // stamp, ended and the tick's notes); its setup, costumes and Reports stay, and Goes live at while it's
      // still ahead. Above 20 kids the Event's name is typed to confirm. Resetting the door's Event moves the
      // door (apply() tells screens); otherwise its own screens resync, and the door's if it races it.
      reset({ eventId, confirm }) {
        const event = eventById(eventId)
        if (!event) throw new BadCommand('No such event')
        if (!isOpen(event)) throw new BadCommand('Only a live or ended night can be reset')
        if (liveCount.get(event.id).n > RESET_CONFIRM_ABOVE && confirm !== event.name) throw new BadCommand(`Type "${event.name}" to reset it`)
        for (const table of ['kids', 'backfill_batches', 'fired_moments', 'golden_tickets', 'share_links', 'event_devices']) db.query(`DELETE FROM ${table} WHERE event_id = ?`).run(event.id)
        db.query(`
          UPDATE events SET state = 'upcoming', went_live_at = NULL, ended_automatically = 0, summary_nearby = NULL, devices_counted = 1,
            tick_note = NULL, tick_note_at = NULL, tick_note_for = NULL,
            goes_live_at = CASE WHEN goes_live_at > ? THEN goes_live_at END
          WHERE id = ?
        `).run(now(), event.id)
        const door = doorRow()
        const racedByDoor = door != null && door.race_against_id === event.id
        return [{ type: 'event.updated', eventId: event.id }, ...(racedByDoor ? [{ type: 'event.updated', eventId: door.id }] : [])]
      },

      // Per-event settings (spec §6). Only the fields given change.
      settings({ eventId, ...changes }) {
        const event = writableEvent(eventId)
        const columns = {
          name: ['name', eventName],
          // Only a night there's something to race (Ended, Past, imported or estimated), never itself. The pointer
          // it already has passes unchanged (Setup's form sends it back), so one at a reset Event is kept.
          raceAgainstId: ['race_against_id', (v) => {
            if (v == null) return null
            if (v === event.race_against_id) return v
            const against = eventById(v)
            if (v === event.id || !against) throw new BadCommand('Race against another event, or None')
            if (!canRace(toEventSummary(against))) throw new BadCommand(`"${against.name}" isn’t over yet: race a night that’s ended`)
            return v
          }],
          clockShiftMs: ['clock_shift_ms', (v) => wholeNumber(v, 'Clock shift')],
          expectedKids: ['expected_kids', (v) => (v == null ? null : wholeNumber(v, 'Expected kids', 0))],
          visitWindowMs: ['visit_window_ms', (v) => wholeNumber(v, 'Visit window', 1)],
          goldenCount: ['golden_count', (v) => wholeNumber(v, 'Golden tickets', 0)],
          // Only an Upcoming night can be scheduled, and only for a time still ahead; null clears it. The
          // time it already has passes unchanged (Setup's form sends it back), so a waiting night keeps waiting.
          goesLiveAt: ['goes_live_at', (v) => {
            if (event.state !== 'upcoming') throw new BadCommand('This night is already live')
            if (v === event.goes_live_at) return v
            if (v != null && !Number.isFinite(v)) throw new BadCommand('Goes live at needs a time')
            if (v != null && v <= now()) throw new BadCommand('Pick a time that’s still ahead')
            db.query("UPDATE events SET tick_note = NULL, tick_note_at = NULL WHERE id = ? AND tick_note = 'waiting'").run(event.id)
            return v
          }],
        }
        const sets = Object.entries(changes).filter(([key]) => key in columns && key !== 'type')
        for (const [key, value] of sets) {
          const [column, check] = columns[key]
          db.query(`UPDATE events SET ${column} = ? WHERE id = ?`).run(check(value), event.id)
        }
        return isOpen(event) && sets.length ? [{ type: 'event.updated', eventId: event.id }] : []
      },

      // ---- Costume presets. Deltas only for an open event: nobody is watching the others.
      createTag({ eventId, name, emoji }) {
        const event = writableEvent(eventId)
        const row = insertTag.get({ $eventId: event.id, $name: costumeName(name), $emoji: costumeEmoji(emoji) })
        return isOpen(event) ? [{ type: 'tag.added', eventId: event.id, tag: toTag(row) }] : []
      },

      updateTag({ tagId, name, emoji, order, sound }) {
        const { tag, event } = writableTag(tagId)
        const row = db
          .query('UPDATE tags SET name = ?, emoji = ?, sort_order = ?, sound = ? WHERE id = ? RETURNING *')
          .get(
            name === undefined ? tag.name : costumeName(name),
            emoji === undefined ? tag.emoji : costumeEmoji(emoji),
            order === undefined ? tag.sort_order : wholeNumber(order, 'Order', 1),
            sound === undefined ? tag.sound : costumeSound(sound),
            tag.id,
          )
        return isOpen(event) ? [{ type: 'tag.updated', eventId: event.id, tag: toTag(row) }] : []
      },

      // Its kids become untagged (spec §2); the page asks for confirmation first.
      deleteTag({ tagId }) {
        const { tag, event } = writableTag(tagId)
        const kidIds = db
          .query('UPDATE kids SET tag_id = NULL WHERE tag_id = ? RETURNING id')
          .all(tag.id)
          .map((r) => r.id)
        db.query('DELETE FROM tags WHERE id = ?').run(tag.id)
        if (!isOpen(event)) return []
        return [
          ...(kidIds.length ? [{ type: 'kid.retagged', eventId: event.id, kidIds, tagId: null }] : []),
          { type: 'tag.removed', eventId: event.id, tagId: tag.id },
        ]
      },

      // The Household's display name (Setup, and sign-up's one field): at most 40 characters.
      rename({ displayName }) {
        db.query('UPDATE households SET display_name = ? WHERE id = ?').run(displayNameOf(displayName), householdId)
        return []
      },

      // The ready checklist's marks (sign-in-simplify 06): kid, night (item 3 skipped) or hidden (✕), each set once
      // and never unset. Every Manager and phone sees the same list.
      checklist({ item }) {
        if (!CHECKLIST_MARKS.includes(item)) throw new BadCommand('Not a checklist item')
        db.query("UPDATE households SET checklist = json_set(checklist, '$.' || ?, json('true')) WHERE id = ?").run(item, householdId)
        return []
      },

      // The Location (spec §10): a 5-character geohash cell picked in the browser, or null to remove it.
      // Only the cell is kept; changing it keeps no history.
      setLocation({ cell }) {
        if (cell !== null && !isCell(cell)) throw new BadCommand('A Location is a 5-character geohash cell')
        db.query('UPDATE households SET location_cell = ? WHERE id = ?').run(cell, householdId)
        return []
      },

      // The Operator's Fix time zone (spec §13): every screen redraws the night in the new zone.
      setTimeZone({ timeZone }) {
        if (!isTimeZone(timeZone)) throw new BadCommand('Pick a time zone from the list')
        db.query('UPDATE households SET time_zone = ? WHERE id = ?').run(timeZone, householdId)
        return doorUpdated()
      },

      // "About how many kids came last year?" (spec v2.1 §7): the total spread over 2025's shape as the Estimated
      // past event, the Household's default Race against. Entering it sets it on every Upcoming or open Event
      // racing None (createEvent starts new ones on it); changing it reshapes the same Event; null clears it,
      // and its racers go back to None. Nothing racing another night is touched. Open racers resync.
      setLastYear({ total }) {
        if (!canEstimateLastYear()) throw new BadCommand('Last year’s estimate is switched off')
        const existing = estimatedEvent()
        if (total == null) {
          if (!existing) return []
          const racers = openRacers(existing.id)
          removeEvent(existing.id)
          return racers
        }
        if (!Number.isInteger(total) || total < 1 || total > MAX_LAST_YEAR) throw new BadCommand('Last year needs a whole number of kids')
        const id = existing?.id ?? db
          .query("INSERT INTO events (household_id, name, counts_only, state, estimated) VALUES (?, ?, 1, 'past', 1) RETURNING id")
          .get(householdId, ESTIMATED_NAME).id
        db.query('DELETE FROM ghost_buckets WHERE event_id = ?').run(id)
        const insert = db.query('INSERT INTO ghost_buckets (event_id, slot_start, slot_end, count) VALUES (?, ?, ?, ?)')
        for (const b of lastYearBuckets(total)) insert.run(id, b.start, b.end, b.count)
        if (!existing) {
          db.query(`
            UPDATE events SET race_against_id = ?
            WHERE household_id = ? AND race_against_id IS NULL AND counts_only = 0 AND state IN ('upcoming', 'live', 'ended')
          `).run(id, householdId)
        }
        return openRacers(id)
      },

      // Rotate TV link (spec §9): a new secret; the HTTP layer closes every stream on the old one.
      // The watch code is the TV link's short form: it changes with it.
      rotateTvLink() {
        db.query('UPDATE households SET tv_token = ?, watch_code = ? WHERE id = ?').run(randomToken(), freshCode(db), householdId)
        db.query('DELETE FROM paired_devices WHERE household_id = ?').run(householdId) // they pair again
        return []
      },

      // Cuts off phones that joined with the old key; the HTTP layer hands the new one back.
      changeKey() {
        db.query('UPDATE households SET join_key = ?, join_code = ? WHERE id = ?').run(randomKey(), freshCode(db), householdId)
        return []
      },

      // Any Event but a Live one (spec v2.1 §3): with its name typed to confirm when it has kids (imported counts
      // included), after a plain confirm otherwise. Anything racing against it goes to None. Deleting the door's
      // Event moves the door (apply() tells screens).
      deleteEvent({ eventId, confirm }) {
        const event = eventById(eventId)
        if (!event) return []
        if (event.state === 'live') throw new BadCommand('End the night first')
        const hasKids = event.counts_only === 1 || liveCount.get(event.id).n > 0
        if (hasKids && confirm !== event.name) throw new BadCommand(`Type "${event.name}" to delete it`)
        const door = doorRow()
        const racedByDoor = door != null && door.id !== event.id && door.race_against_id === event.id
        removeEvent(event.id) // all of it: SQLite can reuse a deleted event's id, so nothing may be left pointing at it
        return racedByDoor ? [{ type: 'event.updated', eventId: door.id }] : []
      },
    }

    // ---- the estimated ghost (spec §14)
    function estimatedEvent() {
      return db.query('SELECT * FROM events WHERE household_id = ? AND estimated = 1').get(householdId)
    }

    // Always offered, whatever nights the Household has (spec v2.1 §7), behind the Operator's switch.
    function canEstimateLastYear() {
      return !!switches.estimatedGhost
    }

    // An event.updated for each open Event racing this one, so its screens resync (its ghost appears or goes).
    function openRacers(id) {
      return db
        .query(`SELECT id FROM events WHERE household_id = ? AND race_against_id = ? AND ${OPEN} ORDER BY id`)
        .all(householdId, id)
        .map((r) => ({ type: 'event.updated', eventId: r.id }))
    }

    // Screens showing the door's Event resync (so a ghost appears or goes); none open, nobody to tell.
    function doorUpdated() {
      const door = doorRow()
      return door ? [{ type: 'event.updated', eventId: door.id }] : []
    }

    // An event and everything it holds; anything racing it goes to None.
    function removeEvent(id) {
      db.query('UPDATE events SET race_against_id = NULL WHERE race_against_id = ?').run(id)
      for (const table of ['kids', 'tags', 'ghost_buckets', 'fired_moments', 'golden_tickets', 'backfill_batches', 'share_links', 'reports', 'event_devices']) db.query(`DELETE FROM ${table} WHERE event_id = ?`).run(id)
      db.query('UPDATE households SET test_night_event_id = NULL WHERE test_night_event_id = ?').run(id)
      db.query('DELETE FROM events WHERE id = ?').run(id)
    }

    function writableTag(tagId) {
      const tag = db
        .query('SELECT t.* FROM tags t JOIN events e ON e.id = t.event_id WHERE t.id = ? AND e.household_id = ?')
        .get(tagId, householdId)
      if (!tag) throw new BadCommand('No such costume')
      return { tag, event: writableEvent(tag.event_id) }
    }

    function household() {
      return db.query('SELECT * FROM households WHERE id = ?').get(householdId)
    }

    function currentMix() {
      const { mix } = household()
      return mix ? JSON.parse(mix) : DEFAULT_MIX
    }

    // Past events are read-only (spec §2).
    function writableEvent(eventId) {
      const event = eventById(eventId)
      if (!event) throw new BadCommand('No such event')
      if (event.state === 'past' || event.counts_only) throw new BadCommand('Past events are read-only')
      return event
    }

    return {
      id: householdId,

      // Every delta names its Event (`eventId`), or null for the whole Household (the mix, the door moving, the
      // next night). One stream and one seq per Household carry them all; a screen skips another Event's
      // deltas but still counts their seq, so filtering never makes a gap (spec v2.1 §15).
      // When a command moves the door's Event (Go live, Close now, the noon Past, Delete), screens are told to
      // switch: door.changed names the new door's Event, or null with none open. With none open, a change to
      // the next Upcoming Event (its name or Goes live at) reaches the "No night on right now" screens.
      apply(command) {
        const run = commands[command.type]
        if (!run) throw new BadCommand(`Unknown command: ${command.type}`)
        const deltas = db.transaction(() => {
          const before = doorRow()?.id ?? null
          const nextBefore = before == null ? JSON.stringify(nextUpcoming()) : null
          const out = run(command)
          const after = doorRow()?.id ?? null
          if (after !== before) return [...out.filter((d) => d.type !== 'event.updated'), { type: 'door.changed', eventId: null, door: after }]
          if (after == null && JSON.stringify(nextUpcoming()) !== nextBefore) return [...out, { type: 'next.changed', eventId: null, next: nextUpcoming() }]
          return out
        })()
        return deltas.map((delta) => ({ eventId: null, ...delta, seq: ++seq }))
      },

      doorEvent() {
        const row = doorRow()
        return row && toEventSummary(row)
      },

      joinKey() {
        return household().join_key
      },

      displayName() {
        return household().display_name
      },

      tvToken() {
        return household().tv_token
      },

      watchCode() {
        return household().watch_code
      },

      joinCode() {
        return household().join_code
      },

      // The phone names that counted a kid on any open night: a new phone can't take one (no two phones alike).
      phoneNamesTonight() {
        return db
          .query(`
            SELECT DISTINCT k.phone_name AS name FROM kids k JOIN events e ON e.id = k.event_id
            WHERE e.household_id = ? AND e.${OPEN} AND k.deleted_at IS NULL AND k.phone_name IS NOT NULL
          `)
          .all(householdId)
          .map((r) => r.name)
      },

      canEstimateLastYear,

      // The estimated total last year, or null.
      lastYear() {
        const event = estimatedEvent()
        return event ? db.query('SELECT SUM(count) AS n FROM ghost_buckets WHERE event_id = ?').get(event.id).n : null
      },

      // The Test night sign-up made (spec v2.1 §8), by id, or null: none made, or deleted since.
      testNightId() {
        return household().test_night_event_id ?? null
      },

      // The checklist's marks: { kid, night, hidden }, each true or false.
      checklistMarks() {
        const marks = JSON.parse(household().checklist ?? '{}')
        return Object.fromEntries(CHECKLIST_MARKS.map((m) => [m, marks[m] === true]))
      },

      // Kids counted on any of the Household's Events: the checklist's "Count a test kid".
      anyKids() {
        return db
          .query('SELECT COUNT(*) AS n FROM kids k JOIN events e ON e.id = k.event_id WHERE e.household_id = ? AND k.deleted_at IS NULL')
          .get(householdId).n
      },

      // A TV paired by code: its device token, which marks its streams as the Household's own TV.
      pairDevice() {
        const token = randomToken()
        db.query('INSERT INTO paired_devices (token, household_id, paired_at) VALUES (?, ?, ?)').run(token, householdId, now())
        return token
      },

      // A counts-only past night from half-hour buckets ({ name, buckets: [{ start, end, count }] }),
      // to race against. Returns its event id.
      addPastCounts({ name, buckets }) {
        return db.transaction(() => {
          const { id } = db
            .query("INSERT INTO events (household_id, name, counts_only, state) VALUES (?, ?, 1, 'past') RETURNING id")
            .get(householdId, requireName(name, 'An event'))
          const insert = db.query('INSERT INTO ghost_buckets (event_id, slot_start, slot_end, count) VALUES (?, ?, ?, ?)')
          for (const b of buckets) insert.run(id, b.start, b.end, wholeNumber(b.count, 'A half-hour count', 0))
          return id
        })()
      },

      // Everything the CSV export needs (ticket 24): every kid, removed ones included.
      exportEvent(eventId) {
        const event = eventById(eventId)
        if (!event) return null
        const kids = db
          .query(`
            SELECT k.number, k.tapped_at AS tappedAt, k.received_at AS receivedAt, t.name AS tag, k.source,
              k.deleted_at AS deletedAt, k.phone_name AS phoneName, k.late
            FROM kids k LEFT JOIN tags t ON t.id = k.tag_id
            WHERE k.event_id = ? ORDER BY k.received_at, k.rowid
          `)
          .all(event.id)
          .map((k) => ({ ...k, late: k.late === 1 }))
        return { name: event.name, clockShiftMs: event.clock_shift_ms, timeZone: household().time_zone, kids }
      },

      // An event's backfill batches, for Setup's list ("+38 kids, 6:30–7:00 · Remove"): the named one, or the
      // door's Event's; none with nothing open.
      batches(eventId) {
        const event = eventId == null ? doorRow() : eventById(eventId)
        if (!event) return []
        return db
          .query(`
            SELECT b.id, b.rows, b.created_at AS createdAt,
              (SELECT COUNT(*) FROM kids k WHERE k.backfill_batch_id = b.id AND k.deleted_at IS NULL) AS kids
            FROM backfill_batches b WHERE b.event_id = ? AND b.removed_at IS NULL ORDER BY b.id
          `)
          .all(event.id)
          .map((b) => ({ ...b, rows: JSON.parse(b.rows) }))
      },

      // The secret numbers: for the tests and, after the night, the recap. Never sent to a client live.
      tickets(eventId) {
        return db
          .query('SELECT number, state, kid_id AS kidId FROM golden_tickets WHERE event_id = ? ORDER BY number')
          .all(eventById(eventId)?.id ?? null)
      },

      // Every event for the Setup page, newest first. Never includes the join key.
      // `note` is what the tick did to it, or null (tickNote). `counted` is imported counts' total (null for any
      // other Event). `golden` is { drawn, won, left } (left: not won and not expired), or null with the switch off.
      events() {
        const tagsOf = db.query('SELECT * FROM tags WHERE event_id = ? ORDER BY sort_order')
        const kidCount = db.query('SELECT COUNT(*) AS n FROM kids WHERE event_id = ? AND deleted_at IS NULL')
        const countedOf = db.query('SELECT COALESCE(SUM(count), 0) AS n FROM ghost_buckets WHERE event_id = ?')
        const goldenOf = db.query(`
          SELECT COUNT(*) AS drawn, COUNT(kid_id) AS won,
            SUM(CASE WHEN kid_id IS NULL AND state IN ('hidden', 'rolled', 'released') THEN 1 ELSE 0 END) AS left
          FROM golden_tickets WHERE event_id = ?`)
        const golden = (id) => {
          const { drawn, won, left } = goldenOf.get(id)
          return { drawn, won, left: left ?? 0 }
        }
        const { time_zone: timeZone } = household()
        const at = now()
        return db
          .query('SELECT * FROM events WHERE household_id = ? ORDER BY id DESC')
          .all(householdId)
          .map((row) => ({
            ...toEventSummary(row),
            note: tickNote(row, timeZone, at),
            kids: kidCount.get(row.id).n,
            counted: row.counts_only ? countedOf.get(row.id).n : null,
            golden: switches.goldenTickets ? golden(row.id) : null,
            tags: tagsOf.all(row.id).map(toTag),
          }))
      },

      // The Night summary (spec §12): one Ended or Past night, from stored data, with no phone names. null while
      // the night is still running, for a counts-only night, or for another Household's.
      summary(eventId) {
        const event = eventById(eventId)
        if (!event || event.counts_only || !(event.state === 'ended' || event.state === 'past')) return null
        const { event: e, tags, kids, ghost, recap, settings } = this.snapshot(event.id)
        const h = household()
        return {
          displayName: h.display_name,
          timeZone: h.time_zone,
          event: e,
          tags,
          kids: kids.map(({ phoneName, ...kid }) => kid),
          ghost,
          recap,
          switches: settings.switches,
          nearby: event.summary_nearby ? JSON.parse(event.summary_nearby) : null,
        }
      },

      // The night's share link token, made the first time (spec §12). hideName is the share's toggle. null if
      // the night has no summary yet.
      share(eventId, hideName = false) {
        if (!this.summary(eventId)) return null
        db.query(`
          INSERT INTO share_links (token, household_id, event_id, hide_name, created_at) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(event_id) DO UPDATE SET hide_name = excluded.hide_name
        `).run(randomToken(), householdId, eventId, hideName ? 1 : 0, now())
        return db.query('SELECT token FROM share_links WHERE event_id = ?').get(eventId).token
      },

      // Turning sharing off kills the link; sharing again makes a new one.
      unshare(eventId) {
        db.query('DELETE FROM share_links WHERE event_id = ? AND household_id = ?').run(eventId, householdId)
      },

      shares() {
        return db.query('SELECT event_id AS eventId, token, hide_name AS hideName FROM share_links WHERE household_id = ?').all(householdId)
          .map((s) => ({ ...s, hideName: s.hideName === 1 }))
      },

      // One named event's board. null with no id, or for an event that isn't this Household's.
      snapshot(eventId) {
        const event = eventById(eventId)
        if (!event) return null
        return {
          event: {
            id: event.id,
            name: event.name,
            ...stateFlags(event),
            countsOnly: event.counts_only === 1,
            endedAutomatically: event.ended_automatically === 1,
            clockShiftMs: event.clock_shift_ms,
            visitWindowMs: event.visit_window_ms,
          },
          tags: db.query('SELECT * FROM tags WHERE event_id = ? ORDER BY sort_order').all(event.id).map(toTag),
          kids: db
            .query('SELECT * FROM kids WHERE event_id = ? AND deleted_at IS NULL ORDER BY received_at, rowid')
            .all(event.id)
            .map(toKid),
          ghost: ghostOf(event),
          golden: goldenSummary(event),
          recap: recapOf(event),
          settings: { switches, mix: currentMix(), soundboard: switches.soundboard ? soundboard : [] },
          timeZone: household().time_zone,
          seq,
        }
      },

      // What a screen with no open Event gets (spec v2.1 §4, "No night on right now"): no board, the next Upcoming
      // Event (`next`, for its name and countdown), the Household's settings, and seq, so the stream's deltas
      // still line up.
      idleSnapshot() {
        return { event: null, next: nextUpcoming(), tags: [], kids: [], ghost: null, golden: null, recap: null, settings: { switches, mix: currentMix(), soundboard: switches.soundboard ? soundboard : [] }, timeZone: household().time_zone, seq }
      },
    }
  }
}

function requireName(name, what) {
  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (!trimmed) throw new BadCommand(`${what} needs a name`)
  return trimmed
}

// An event's state for clients: `state` itself, plus flags. `open` is Live or Ended; `wentLiveAt` is the
// go-live stamp every night command sends back.
function stateFlags(row) {
  return {
    state: row.state,
    open: isOpen(row),
    live: row.state === 'live',
    ended: row.state === 'ended',
    past: row.state === 'past',
    wentLiveAt: row.went_live_at,
  }
}

function toEventSummary(row) {
  return {
    id: row.id,
    name: row.name,
    ...stateFlags(row),
    countsOnly: row.counts_only === 1,
    raceAgainstId: row.race_against_id,
    clockShiftMs: row.clock_shift_ms,
    expectedKids: row.expected_kids,
    goldenCount: row.golden_count,
    visitWindowMs: row.visit_window_ms,
    goesLiveAt: row.goes_live_at,
    endedAutomatically: row.ended_automatically === 1,
    estimated: row.estimated === 1,
  }
}

// What the tick did, noted on the Event it touched (spec v2.1 §5), for Setup; shared/night-maths.js's
// tickNoteText words it. One at a time, since each belongs to one state:
//   { kind: 'autoEnded', at }: ended at 3:00 am by itself; while Ended (Resume or Past drops it)
//   { kind: 'closedForRoom', at, for }: closed so `for` could go live; for 24 hours
//   { kind: 'waiting', at }: couldn't go live at the cap; while it's Upcoming and waiting
function tickNote(row, timeZone, at) {
  if (row.state === 'ended' && row.ended_automatically && row.went_live_at != null) {
    return { kind: 'autoEnded', at: nextWallTime(row.went_live_at, AUTO_END_AT, timeZone) }
  }
  if (row.state === 'past' && row.tick_note === 'closed' && at - row.tick_note_at < CLOSED_NOTE_MS) {
    return { kind: 'closedForRoom', at: row.tick_note_at, for: row.tick_note_for }
  }
  if (row.state === 'upcoming' && row.tick_note === 'waiting') return { kind: 'waiting', at: row.tick_note_at }
  return null
}

function wholeNumber(value, what, min = -Infinity) {
  if (!Number.isInteger(value) || value < min) throw new BadCommand(`${what} needs a whole number`)
  return value
}

function toTag(row) {
  return { id: row.id, name: row.name, emoji: row.emoji, order: row.sort_order }
}

function toKid(row) {
  return {
    id: row.id,
    number: row.number,
    tagId: row.tag_id,
    phoneName: row.phone_name,
    tappedAt: row.tapped_at,
    late: row.late === 1,
    golden: row.golden === 1,
    teen: row.teen === 1,
    source: row.source,
  }
}

// The longest name a household, a night, a costume or a phone may have: every one fits the TV and the phone.
const MAX_NAME = 40

export function displayNameOf(displayName) {
  const name = requireName(displayName, 'A household')
  if (name.length > MAX_NAME) throw new BadCommand(`A household name is at most ${MAX_NAME} characters`)
  return decentName(name)
}

// A night's name reaches the TV link's viewers and the share page, like a household's.
function eventName(name) {
  const trimmed = requireName(name, 'An event')
  if (trimmed.length > MAX_NAME) throw new BadCommand(`A night's name is at most ${MAX_NAME} characters`)
  return decentName(trimmed)
}

// Names that reach shared screens pass the blocklist (spec §15): refused outright, never starred out.
function decentName(name) {
  if (isBlocked(name)) throw new BadCommand('Pick another name')
  return name
}

function costumeName(name) {
  const trimmed = requireName(name, 'A costume')
  if (trimmed.length > MAX_NAME) throw new BadCommand(`A costume name is at most ${MAX_NAME} characters`)
  return decentName(trimmed)
}

// A costume's emoji: one or two emoji and nothing else, since a top costume's reaches other houses' screens. Empty
// is none.
const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u
function costumeEmoji(emoji) {
  if (emoji == null || emoji === '') return emoji ?? null
  const marks = typeof emoji === 'string' && emoji.length <= 16 ? [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(emoji)] : []
  if (!marks.length || marks.length > 2 || !marks.every(({ segment }) => EMOJI.test(segment))) throw new BadCommand('A costume emoji is one or two emoji')
  return emoji
}

// A costume's sound: a sound file's name, or none.
function costumeSound(sound) {
  if (sound != null && (typeof sound !== 'string' || sound.length > 100)) throw new BadCommand('A costume sound is a file name')
  return sound
}

// The total spread over 2025's shape; the rounding remainder goes to the biggest bucket, so it adds up exactly.
function lastYearBuckets(total) {
  const buckets = LAST_YEAR_SHAPE.map(({ start, end, share }) => ({ start, end, count: Math.floor(total * share) }))
  const biggest = buckets.reduce((a, b) => (b.count > a.count ? b : a))
  biggest.count += total - buckets.reduce((sum, b) => sum + b.count, 0)
  return buckets
}

export function isTimeZone(zone) {
  if (typeof zone !== 'string' || zone === '') return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

