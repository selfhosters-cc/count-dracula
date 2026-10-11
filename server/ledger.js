// The Ledger: every write goes through apply(), every read through snapshot(), each on one Household.
// See .scratch/count-dracula/modules.md §1 and .scratch/multi-household/spec.md §4.
import { toBuckets } from '../shared/night-maths.js'

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    live INTEGER NOT NULL DEFAULT 0, -- exactly one per Household
    frozen INTEGER NOT NULL DEFAULT 0,
    ended INTEGER NOT NULL DEFAULT 0,
    join_key TEXT, -- v1's; the key lives on households since v2
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

// Versioned steps, run in order from PRAGMA user_version, each in one transaction. Once sign-up has
// opened, a step only ever adds (spec §4).
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
]

// What a new Household's Rehearsal and nights start with (spec §6): site-wide, in code.
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

// A command the Ledger refuses; the HTTP layer answers 400.
export class BadCommand extends Error {}

// The TV's volume and mutes from the ☰ menu. Per Household, not per event: a level tuned at the
// rehearsal should survive Go live (builder's latitude, v1 spec §16).
// The soundboard's shared cooldown: one sound per 3 s across every button and phone of a Household (spec §10).
const SOUNDBOARD_COOLDOWN_MS = 3_000

const DEFAULT_MIX = { volume: 1, mutes: { ambience: false, bloops: false, everything: false } }

// A tap that reaches the server more than this long after it was tapped is late (spec §2).
const LATE_AFTER_MS = 10_000

// Must 3–9 (spec §12). Each later feature honours its own switch.
const DEFAULT_SWITCHES = {
  milestones: true,
  goldenTickets: true,
  costumeLeaderboard: true,
  newTrendAlert: true,
  soundboard: true,
  pumpkinPatch: true,
  recap: true,
  rushMeter: true, // a nice-to-have (ticket 39), switchable like the Musts
}

export function openLedger(db, config) {
  const switches = { ...DEFAULT_SWITCHES, ...config.switches }
  const now = config.now ?? Date.now
  const random = config.random ?? Math.random
  const lanUrl = typeof config.lanUrl === 'function' ? config.lanUrl : () => config.lanUrl ?? null
  const soundboard = (config.soundboard ?? []).slice(0, 6).map((s, i) => ({ slot: i + 1, ...s }))

  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = NORMAL') // a power cut can lose the last commits; no multi-second stalls (spec §4)
  db.exec(SCHEMA)
  // Databases from before teens (Oct 10) get the column; everyone already in them was a kid.
  if (!db.query('PRAGMA table_info(kids)').all().some((c) => c.name === 'teen')) {
    db.exec('ALTER TABLE kids ADD COLUMN teen INTEGER NOT NULL DEFAULT 0')
  }
  for (let version = db.query('PRAGMA user_version').get().user_version; version < MIGRATIONS.length; version++) {
    db.transaction(() => {
      MIGRATIONS[version](db, { now })
      db.exec(`PRAGMA user_version = ${version + 1}`)
    })()
  }

  const opened = new Map() // household id → its Ledger, so seq and the soundboard cooldown live on

  return {
    // Sign-up (spec §6): the Household with its join key, and its live Rehearsal with the starter
    // costumes and no golden tickets. Returns the new Household's id.
    createHousehold({ displayName, timeZone }) {
      const name = requireName(displayName, 'A household')
      if (name.length > 40) throw new BadCommand('A household name is at most 40 characters')
      if (!isTimeZone(timeZone)) throw new BadCommand('A household needs its time zone')
      return db.transaction(() => {
        const { id } = db
          .query('INSERT INTO households (display_name, time_zone, join_key, signed_up_at) VALUES (?, ?, ?, ?) RETURNING id')
          .get(name, timeZone, randomKey(), now())
        const rehearsal = db
          .query("INSERT INTO events (household_id, name, live, rehearsal, golden_count) VALUES (?, 'Rehearsal', 1, 1, 0) RETURNING id")
          .get(id)
        const insert = db.query('INSERT INTO tags (event_id, name, emoji, sort_order) VALUES (?, ?, ?, ?)')
        STARTER_COSTUMES.forEach(([costume, emoji], i) => insert.run(rehearsal.id, costume, emoji, i + 1))
        return id
      })()
    },

    // One Household's Ledger, or null if there's no such Household.
    household(id) {
      if (!opened.has(id)) {
        if (!db.query('SELECT 1 FROM households WHERE id = ?').get(id)) return null
        opened.set(id, householdLedger(id))
      }
      return opened.get(id)
    },

    // The Household a phone's join key belongs to, or null.
    householdByJoinKey(key) {
      if (typeof key !== 'string' || key === '') return null
      return db.query('SELECT id FROM households WHERE join_key = ?').get(key)?.id ?? null
    },

    households() {
      return db
        .query('SELECT id, display_name AS displayName, time_zone AS timeZone FROM households ORDER BY id')
        .all()
    },
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
    // ended, or a frozen past event. While the night is on, the numbers never leave the Ledger.
    function recapOf(event) {
      if (!(event.ended || event.frozen) || event.counts_only) return null
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

    function eventById(id) {
      return id == null
        ? db.query('SELECT * FROM events WHERE household_id = ? AND live = 1').get(householdId)
        : db.query('SELECT * FROM events WHERE id = ? AND household_id = ?').get(id, householdId)
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
        label: against.name.match(/\b(?:19|20)\d\d\b/)?.[0] ?? against.name, // "2025: 346" on the chart
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
        $phoneName: phoneName ?? null,
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
          deferred.push({ type: 'moment', moments: ['beat-last-year'] })
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
      return [{ type: 'kid.added', kid, moments, golden: goldenSummary(event) }, ...deferred]
    }

    const commands = {
      tap(command) {
        const event = eventById()
        const kid = addKid(event, command)
        return kid ? referee(event, kid) : []
      },

      // "+ New" costume: creates the tag and counts the kid at the door with it (spec §2 Catch-up).
      // N is capped by the untagged kids there are; timestamps are untouched.
      catchUp({ tag, n = 0, kid }) {
        const name = typeof tag?.name === 'string' ? tag.name.trim() : ''
        if (!name) throw new BadCommand('A costume needs a name')
        if (!Number.isInteger(n) || n < 0) throw new BadCommand('Catch-up needs a whole number of kids')
        if (kidExists.get(kid?.id)) return [] // a retry: the door kid already landed, so all of it did
        const event = eventById()
        const tagRow = insertTag.get({ $eventId: event.id, $name: name, $emoji: tag.emoji ?? null })
        const kidIds = mostRecentUntagged.all(event.id, n).map((r) => r.id)
        for (const id of kidIds) setTag.run(tagRow.id, id)
        const added = addKid(event, { ...kid, tagId: tagRow.id })
        // A costume spotted live gets the TV's banner, "×(N+1)" including the kid at the door (Must #6).
        const newCostume = switches.newTrendAlert ? { name, emoji: tag.emoji ?? null, count: kidIds.length + 1 } : undefined
        return [
          { type: 'tag.added', tag: toTag(tagRow), ...(newCostume && { newCostume }) },
          ...(kidIds.length ? [{ type: 'kid.retagged', kidIds, tagId: tagRow.id }] : []),
          ...referee(event, added),
        ]
      },

      // A won ticket stays won, even if its winner is removed (spec §9).
      remove({ kidId }) {
        const event = eventById()
        const row = softDeleteKid.get(now(), kidId, event.id)
        return row ? [{ type: 'kid.removed', kidId, golden: goldenSummary(event) }] : []
      },

      // "Add missed kids" (spec §6): each row's count spread evenly across its slot (up to now), as
      // untagged backfill kids in one batch, numbered in tap-time order. Late taps: they never celebrate.
      backfill({ rows }) {
        if (!Array.isArray(rows) || !rows.length) throw new BadCommand('Nothing to add')
        const at = now()
        const times = rows.flatMap(({ startMs, endMs, count }) => {
          if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) throw new BadCommand('A row needs its slot')
          if (!Number.isInteger(count) || count < 1 || count > 1000) throw new BadCommand('A row needs a count from 1 to 1000')
          if (startMs > at) throw new BadCommand("That row hasn't started yet")
          const end = Math.min(endMs, at)
          return Array.from({ length: count }, (_, i) => startMs + ((i + 0.5) * (end - startMs)) / count)
        })
        const event = eventById()
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
      removeBatch({ batchId }) {
        const event = eventById()
        const kidIds = db
          .query('UPDATE kids SET deleted_at = ? WHERE backfill_batch_id = ? AND event_id = ? AND deleted_at IS NULL RETURNING id')
          .all(now(), batchId, event.id)
          .map((r) => r.id)
        // Kept, marked removed: a deleted row's id could be reused by the next batch.
        db.query('UPDATE backfill_batches SET removed_at = ? WHERE id = ? AND event_id = ?').run(now(), batchId, event.id)
        return kidIds.length ? [{ type: 'kids.removed', kidIds, golden: goldenSummary(event) }] : []
      },

      // ☰ soundboard (Must #7): plays on the TV straight away, at most once per 3 s across all phones.
      soundboard({ slot }) {
        if (!switches.soundboard) throw new BadCommand('The soundboard is switched off')
        const entry = soundboard.find((s) => s.slot === slot)
        if (!entry) throw new BadCommand('No such soundboard button')
        const at = now()
        if (at - lastBoardAt < SOUNDBOARD_COOLDOWN_MS) return []
        lastBoardAt = at
        return [{ type: 'soundboard', slot, label: entry.label }]
      },

      // "🌙 End the night" (spec §2 Ended): the event stays live, so stragglers still count; only the next
      // Go live freezes it. Tickets nobody won expire, remembering what they were for Resume.
      end() {
        const event = eventById()
        if (event.ended) return []
        db.query('UPDATE events SET ended = 1 WHERE id = ?').run(event.id)
        db.query(`
          UPDATE golden_tickets SET expired_from = state, state = 'expired'
          WHERE event_id = ? AND kid_id IS NULL AND state IN ('hidden', 'rolled', 'released')
        `).run(event.id)
        return [{ type: 'event.ended', ended: true, golden: goldenSummary(event), recap: recapOf(eventById(event.id)) }]
      },

      // "Resume the night": expired tickets come back exactly as they were.
      resume() {
        const event = eventById()
        if (!event.ended) return []
        db.query('UPDATE events SET ended = 0 WHERE id = ?').run(event.id)
        db.query("UPDATE golden_tickets SET state = expired_from, expired_from = NULL WHERE event_id = ? AND state = 'expired'").run(event.id)
        return [{ type: 'event.ended', ended: false, golden: goldenSummary(event), recap: null }]
      },

      // ---- The ☰ menu's TV controls (spec §5): any phone with the join key.
      mix({ volume, mutes = {} }) {
        if (!Number.isFinite(volume) || volume < 0 || volume > 1) throw new BadCommand('Volume runs from 0 to 1')
        const mix = { volume, mutes: { ambience: !!mutes.ambience, bloops: !!mutes.bloops, everything: !!mutes.everything } }
        db.query('UPDATE households SET mix = ? WHERE id = ?').run(JSON.stringify(mix), householdId)
        return [{ type: 'mix.changed', mix }]
      },

      // "Add a ticket" (Setup, after Go live): one number between tonight's count + 5 and the top of the
      // range, never one another hidden ticket already holds.
      addTicket() {
        const event = eventById()
        const base = ghostOf(event)?.total ?? event.expected_kids
        if (!switches.goldenTickets || !base) throw new BadCommand('Golden tickets need Race against or Expected kids')
        const taken = new Set(db.query("SELECT number FROM golden_tickets WHERE event_id = ? AND state = 'hidden'").all(event.id).map((r) => r.number))
        const free = []
        for (let n = liveCount.get(event.id).n + 5; n <= Math.floor((base * 8) / 10); n++) if (!taken.has(n)) free.push(n)
        if (!free.length) throw new BadCommand('No room left in the range for another ticket')
        db.query("INSERT INTO golden_tickets (event_id, number, state) VALUES (?, ?, 'hidden')").run(event.id, free[Math.floor(random() * free.length)])
        return [{ type: 'golden.changed', golden: goldenSummary(event) }]
      },

      // "Release remaining" (☰, from 7:45pm event time): the next K live kids win the K tickets left.
      release() {
        const event = eventById()
        db.query("UPDATE golden_tickets SET state = 'released' WHERE event_id = ? AND state = 'hidden'").run(event.id)
        return [{ type: 'golden.changed', golden: goldenSummary(event) }]
      },

      // ---- Setup (spec §6). Creating an event doesn't make it live.
      // "Copy costumes from" brings names, emoji, order, sounds and the Visit window, with zero counts.
      createEvent({ name, copyTagsFrom }) {
        const source = copyTagsFrom == null ? null : eventById(copyTagsFrom)
        if (copyTagsFrom != null && !source) throw new BadCommand('No event to copy costumes from')
        const row = db
          .query('INSERT INTO events (household_id, name, visit_window_ms, golden_count) VALUES (?, ?, ?, 5) RETURNING *')
          .get(householdId, requireName(name, 'An event'), source?.visit_window_ms ?? 15_000)
        if (source) {
          db.query(`
            INSERT INTO tags (event_id, name, emoji, sort_order, sound)
            SELECT ?, name, emoji, sort_order, sound FROM tags WHERE event_id = ? ORDER BY sort_order
          `).run(row.id, source.id)
        }
        return [{ type: 'event.created', event: toEventSummary(row) }]
      },

      // Exactly one event is live per Household, never zero: Go live freezes the old one. The join key is
      // the Household's, so phones keep working.
      goLive({ eventId }) {
        const next = eventById(eventId)
        if (!next) throw new BadCommand('No such event')
        if (next.live) return []
        if (next.counts_only || next.frozen) throw new BadCommand("A past event can't go live again")
        const old = eventById()
        db.query('UPDATE events SET live = 0, frozen = 1 WHERE id = ?').run(old.id)
        db.query('UPDATE events SET live = 1 WHERE id = ?').run(next.id)
        drawGoldenTickets(eventById(next.id))
        return [{ type: 'event.switched', eventId: next.id }]
      },

      // Per-event settings (spec §6). Only the fields given change.
      settings({ eventId, ...changes }) {
        const event = writableEvent(eventId)
        const columns = {
          name: ['name', (v) => requireName(v, 'An event')],
          raceAgainstId: ['race_against_id', (v) => {
            if (v == null) return null
            if (v === event.id || !eventById(v)) throw new BadCommand('Race against another event, or None')
            return v
          }],
          clockShiftMs: ['clock_shift_ms', (v) => wholeNumber(v, 'Clock shift')],
          expectedKids: ['expected_kids', (v) => (v == null ? null : wholeNumber(v, 'Expected kids', 0))],
          visitWindowMs: ['visit_window_ms', (v) => wholeNumber(v, 'Visit window', 1)],
          goldenCount: ['golden_count', (v) => wholeNumber(v, 'Golden tickets', 0)],
        }
        const sets = Object.entries(changes).filter(([key]) => key in columns && key !== 'type')
        for (const [key, value] of sets) {
          const [column, check] = columns[key]
          db.query(`UPDATE events SET ${column} = ? WHERE id = ?`).run(check(value), event.id)
        }
        return event.live && sets.length ? [{ type: 'event.updated', eventId: event.id }] : []
      },

      // ---- Costume presets. Deltas only for the live event: nobody is watching the others.
      createTag({ eventId, name, emoji }) {
        const event = writableEvent(eventId)
        const row = insertTag.get({ $eventId: event.id, $name: requireName(name, 'A costume'), $emoji: emoji ?? null })
        return event.live ? [{ type: 'tag.added', tag: toTag(row) }] : []
      },

      updateTag({ tagId, name, emoji, order, sound }) {
        const { tag, event } = writableTag(tagId)
        const row = db
          .query('UPDATE tags SET name = ?, emoji = ?, sort_order = ?, sound = ? WHERE id = ? RETURNING *')
          .get(
            name === undefined ? tag.name : requireName(name, 'A costume'),
            emoji === undefined ? tag.emoji : emoji,
            order === undefined ? tag.sort_order : wholeNumber(order, 'Order', 1),
            sound === undefined ? tag.sound : sound,
            tag.id,
          )
        return event.live ? [{ type: 'tag.updated', tag: toTag(row) }] : []
      },

      // Its kids become untagged (spec §2); the page asks for confirmation first.
      deleteTag({ tagId }) {
        const { tag, event } = writableTag(tagId)
        const kidIds = db
          .query('UPDATE kids SET tag_id = NULL WHERE tag_id = ? RETURNING id')
          .all(tag.id)
          .map((r) => r.id)
        db.query('DELETE FROM tags WHERE id = ?').run(tag.id)
        if (!event.live) return []
        return [
          ...(kidIds.length ? [{ type: 'kid.retagged', kidIds, tagId: null }] : []),
          { type: 'tag.removed', tagId: tag.id },
        ]
      },

      // Cuts off phones that joined with the old key; the HTTP layer hands the new one back.
      changeKey() {
        db.query('UPDATE households SET join_key = ? WHERE id = ?').run(randomKey(), householdId)
        return []
      },

      // Past events only, after typing the name to confirm. Anything racing against it goes to None.
      deleteEvent({ eventId, confirm }) {
        const event = eventById(eventId)
        if (!event) return []
        if (event.live) throw new BadCommand("The live event can't be deleted")
        if (confirm !== event.name) throw new BadCommand(`Type "${event.name}" to delete it`)
        const live = eventById()
        const racedByLive = live.race_against_id === event.id
        db.query('UPDATE events SET race_against_id = NULL WHERE race_against_id = ?').run(event.id)
        // All of it: SQLite can reuse a deleted event's id, so nothing may be left pointing at it.
        for (const table of ['kids', 'tags', 'ghost_buckets', 'fired_moments', 'golden_tickets', 'backfill_batches']) db.query(`DELETE FROM ${table} WHERE event_id = ?`).run(event.id)
        db.query('DELETE FROM events WHERE id = ?').run(event.id)
        return racedByLive ? [{ type: 'event.updated', eventId: live.id }] : []
      },
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
      if (event.frozen || event.counts_only) throw new BadCommand('Past events are read-only')
      return event
    }

    return {
      apply(command) {
        const run = commands[command.type]
        if (!run) throw new BadCommand(`Unknown command: ${command.type}`)
        const deltas = db.transaction(() => run(command))()
        return deltas.map((delta) => ({ ...delta, seq: ++seq }))
      },

      joinKey() {
        return household().join_key
      },

      // A counts-only past night from half-hour buckets ({ name, buckets: [{ start, end, count }] }),
      // to race against. Returns its event id.
      addPastCounts({ name, buckets }) {
        return db.transaction(() => {
          const { id } = db
            .query('INSERT INTO events (household_id, name, counts_only, frozen) VALUES (?, ?, 1, 1) RETURNING id')
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

      // The live event's backfill batches, for Setup's list ("+38 kids, 6:30–7:00 · Remove").
      batches() {
        const event = eventById()
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
      events() {
        const tagsOf = db.query('SELECT * FROM tags WHERE event_id = ? ORDER BY sort_order')
        const kidCount = db.query('SELECT COUNT(*) AS n FROM kids WHERE event_id = ? AND deleted_at IS NULL')
        return db
          .query('SELECT * FROM events WHERE household_id = ? ORDER BY id DESC')
          .all(householdId)
          .map((row) => ({ ...toEventSummary(row), kids: kidCount.get(row.id).n, tags: tagsOf.all(row.id).map(toTag) }))
      },

      // null for an event that isn't this Household's.
      snapshot(eventId) {
        const event = eventById(eventId)
        if (!event) return null
        return {
          event: {
            id: event.id,
            name: event.name,
            live: event.live === 1,
            countsOnly: event.counts_only === 1,
            ended: event.ended === 1,
            frozen: event.frozen === 1,
            rehearsal: event.rehearsal === 1,
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
          settings: { switches, mix: currentMix(), lanUrl: lanUrl(), soundboard: switches.soundboard ? soundboard : [] },
          timeZone: household().time_zone,
          seq,
        }
      },
    }
  }
}

function requireName(name, what) {
  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (!trimmed) throw new BadCommand(`${what} needs a name`)
  return trimmed
}

function toEventSummary(row) {
  return {
    id: row.id,
    name: row.name,
    live: row.live === 1,
    frozen: row.frozen === 1,
    countsOnly: row.counts_only === 1,
    raceAgainstId: row.race_against_id,
    clockShiftMs: row.clock_shift_ms,
    expectedKids: row.expected_kids,
    goldenCount: row.golden_count,
    visitWindowMs: row.visit_window_ms,
  }
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

function isTimeZone(zone) {
  if (typeof zone !== 'string' || zone === '') return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

function randomKey(length = 10) {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, (b) => KEY_ALPHABET[b % KEY_ALPHABET.length]).join('')
}
