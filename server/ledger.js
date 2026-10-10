// The Ledger: every write goes through apply(), every read through snapshot().
// See .scratch/count-dracula/modules.md §1.

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    live INTEGER NOT NULL DEFAULT 0,
    frozen INTEGER NOT NULL DEFAULT 0,
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
    deleted_at INTEGER,
    source TEXT NOT NULL DEFAULT 'tap',
    backfill_batch_id INTEGER
  );
`

// A command the Ledger refuses; the HTTP layer answers 400.
export class BadCommand extends Error {}

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
}

export function openLedger(db, config) {
  const switches = { ...DEFAULT_SWITCHES, ...config.switches }
  const now = config.now ?? Date.now

  db.exec('PRAGMA journal_mode = WAL')
  db.exec(SCHEMA)

  const hasEvents = db.query('SELECT 1 FROM events LIMIT 1').get()
  if (!hasEvents) db.transaction(() => firstInstall(db, config))()

  function eventById(id) {
    return id == null
      ? db.query('SELECT * FROM events WHERE live = 1').get()
      : db.query('SELECT * FROM events WHERE id = ?').get(id)
  }

  function ghostOf(event) {
    if (event.race_against_id == null) return null
    const buckets = db
      .query('SELECT slot_start AS start, slot_end AS end, count FROM ghost_buckets WHERE event_id = ? ORDER BY slot_start')
      .all(event.race_against_id)
    return { eventId: event.race_against_id, buckets }
  }

  let seq = 0

  const insertKid = db.query(`
    INSERT INTO kids (id, event_id, number, tag_id, phone_name, tapped_at, received_at, late, source)
    VALUES ($id, $eventId, $number, $tagId, $phoneName, $tappedAt, $receivedAt, $late, 'tap')
    ON CONFLICT(id) DO NOTHING
    RETURNING *
  `)
  const softDeleteKid = db.query(
    'UPDATE kids SET deleted_at = ? WHERE id = ? AND event_id = ? AND deleted_at IS NULL RETURNING id',
  )
  const liveCount = db.query('SELECT COUNT(*) AS n FROM kids WHERE event_id = ? AND deleted_at IS NULL')

  const commands = {
    tap({ id, tagId, tappedAt, phoneName }) {
      if (typeof id !== 'string' || id === '') throw new BadCommand('A tap needs an id')
      if (!Number.isFinite(tappedAt)) throw new BadCommand('A tap needs tappedAt in ms')
      const event = eventById()
      const receivedAt = now()
      const row = insertKid.get({
        $id: id,
        $eventId: event.id,
        $number: liveCount.get(event.id).n + 1,
        $tagId: tagId ?? null,
        $phoneName: phoneName ?? null,
        $tappedAt: tappedAt,
        $receivedAt: receivedAt,
        $late: receivedAt - tappedAt > LATE_AFTER_MS ? 1 : 0,
      })
      return row ? [{ type: 'kid.added', kid: toKid(row) }] : []
    },

    remove({ kidId }) {
      const row = softDeleteKid.get(now(), kidId, eventById().id)
      return row ? [{ type: 'kid.removed', kidId }] : []
    },
  }

  return {
    apply(command) {
      const run = commands[command.type]
      if (!run) throw new BadCommand(`Unknown command: ${command.type}`)
      const deltas = db.transaction(() => run(command))()
      return deltas.map((delta) => ({ ...delta, seq: ++seq }))
    },

    joinKey() {
      return eventById().join_key
    },

    snapshot(eventId) {
      const event = eventById(eventId)
      return {
        event: {
          id: event.id,
          name: event.name,
          live: event.live === 1,
          countsOnly: event.counts_only === 1,
        },
        tags: db
          .query('SELECT id, name, emoji, sort_order AS "order" FROM tags WHERE event_id = ? ORDER BY sort_order')
          .all(event.id),
        kids: db
          .query('SELECT * FROM kids WHERE event_id = ? AND deleted_at IS NULL ORDER BY received_at, rowid')
          .all(event.id)
          .map(toKid),
        ghost: ghostOf(event),
        settings: { switches },
        seq,
      }
    },
  }
}

function toKid(row) {
  return {
    id: row.id,
    number: row.number,
    tagId: row.tag_id,
    phoneName: row.phone_name,
    tappedAt: row.tapped_at,
    late: row.late === 1,
    source: row.source,
  }
}

function firstInstall(db, { ghostSeed }) {
  let raceAgainstId = null
  if (ghostSeed) {
    raceAgainstId = db
      .query('INSERT INTO events (name, counts_only, frozen) VALUES (?, 1, 1) RETURNING id')
      .get(ghostSeed.name).id
    const insertBucket = db.query('INSERT INTO ghost_buckets (event_id, slot_start, slot_end, count) VALUES (?, ?, ?, ?)')
    for (const b of ghostSeed.buckets) insertBucket.run(raceAgainstId, b.start, b.end, b.count)
  }
  db.query("INSERT INTO events (name, live, join_key, race_against_id) VALUES ('Rehearsal', 1, ?, ?)").run(
    randomKey(),
    raceAgainstId,
  )
}

const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

function randomKey(length = 10) {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, (b) => KEY_ALPHABET[b % KEY_ALPHABET.length]).join('')
}
