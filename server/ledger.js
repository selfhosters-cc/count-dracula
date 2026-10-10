// The Ledger: every write goes through apply(), every read through snapshot().
// See .scratch/count-dracula/modules.md §1.
import { toBuckets } from '../shared/night-maths.js'

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
    INSERT INTO kids (id, event_id, number, tag_id, phone_name, tapped_at, received_at, late, source)
    VALUES ($id, $eventId, $number, $tagId, $phoneName, $tappedAt, $receivedAt, $late, 'tap')
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
  function addKid(event, { id, tagId, tappedAt, phoneName }) {
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
      $late: receivedAt - tappedAt > LATE_AFTER_MS ? 1 : 0,
    })
    return row && toKid(row)
  }

  const commands = {
    tap(command) {
      const kid = addKid(eventById(), command)
      return kid ? [{ type: 'kid.added', kid }] : []
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
      return [
        { type: 'tag.added', tag: toTag(tagRow) },
        ...(kidIds.length ? [{ type: 'kid.retagged', kidIds, tagId: tagRow.id }] : []),
        { type: 'kid.added', kid: added },
      ]
    },

    remove({ kidId }) {
      const row = softDeleteKid.get(now(), kidId, eventById().id)
      return row ? [{ type: 'kid.removed', kidId }] : []
    },

    // ---- Setup (spec §6). Creating an event doesn't make it live.
    // "Copy costumes from" brings names, emoji, order, sounds and the Visit window, with zero counts.
    createEvent({ name, copyTagsFrom }) {
      const source = copyTagsFrom == null ? null : eventById(copyTagsFrom)
      if (copyTagsFrom != null && !source) throw new BadCommand('No event to copy costumes from')
      const row = db
        .query('INSERT INTO events (name, visit_window_ms) VALUES (?, ?) RETURNING *')
        .get(requireName(name, 'An event'), source?.visit_window_ms ?? 15_000)
      if (source) {
        db.query(`
          INSERT INTO tags (event_id, name, emoji, sort_order, sound)
          SELECT ?, name, emoji, sort_order, sound FROM tags WHERE event_id = ? ORDER BY sort_order
        `).run(row.id, source.id)
      }
      return [{ type: 'event.created', event: toEventSummary(row) }]
    },

    // Exactly one event is live, never zero: Go live freezes the old one and keeps the join key.
    goLive({ eventId }) {
      const next = eventById(eventId)
      if (!next) throw new BadCommand('No such event')
      if (next.live) return []
      if (next.counts_only || next.frozen) throw new BadCommand("A past event can't go live again")
      const old = eventById()
      db.query('UPDATE events SET live = 0, frozen = 1 WHERE id = ?').run(old.id)
      db.query('UPDATE events SET live = 1, join_key = ? WHERE id = ?').run(old.join_key, next.id)
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
      db.query('UPDATE events SET join_key = ? WHERE live = 1').run(randomKey())
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
      for (const table of ['kids', 'tags', 'ghost_buckets']) db.query(`DELETE FROM ${table} WHERE event_id = ?`).run(event.id)
      db.query('DELETE FROM events WHERE id = ?').run(event.id)
      return racedByLive ? [{ type: 'event.updated', eventId: live.id }] : []
    },
  }

  function writableTag(tagId) {
    const tag = db.query('SELECT * FROM tags WHERE id = ?').get(tagId)
    if (!tag) throw new BadCommand('No such costume')
    return { tag, event: writableEvent(tag.event_id) }
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
      return eventById().join_key
    },

    // Every event for the Setup page, newest first. Never includes the join key.
    events() {
      const tagsOf = db.query('SELECT * FROM tags WHERE event_id = ? ORDER BY sort_order')
      const kidCount = db.query('SELECT COUNT(*) AS n FROM kids WHERE event_id = ? AND deleted_at IS NULL')
      return db
        .query('SELECT * FROM events ORDER BY id DESC')
        .all()
        .map((row) => ({ ...toEventSummary(row), kids: kidCount.get(row.id).n, tags: tagsOf.all(row.id).map(toTag) }))
    },

    snapshot(eventId) {
      const event = eventById(eventId)
      return {
        event: {
          id: event.id,
          name: event.name,
          live: event.live === 1,
          countsOnly: event.counts_only === 1,
          clockShiftMs: event.clock_shift_ms,
        },
        tags: db.query('SELECT * FROM tags WHERE event_id = ? ORDER BY sort_order').all(event.id).map(toTag),
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
