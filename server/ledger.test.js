import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { BadCommand, openLedger } from './ledger.js'
import ghostSeed from '../config/2025-counts.json'

describe('first install', () => {
  test('creates "Rehearsal" and makes it the live event', () => {
    const ledger = openLedger(new Database(':memory:'), {})

    const { event, kids } = ledger.snapshot()

    expect(event.name).toBe('Rehearsal')
    expect(event.live).toBe(true)
    expect(kids).toEqual([])
  })

  test('seeds the counts-only 2025 event and races Rehearsal against it', () => {
    const ledger = openLedger(new Database(':memory:'), { ghostSeed })

    const { ghost } = ledger.snapshot()

    expect(ghost.buckets).toHaveLength(5)
    expect(ghost.buckets.reduce((sum, b) => sum + b.count, 0)).toBe(346)
    expect(ghost.buckets[0]).toEqual({ start: '17:42', end: '18:00', count: 14 })

    const past = ledger.snapshot(ghost.eventId).event
    expect(past.name).toBe('Halloween 2025 (counts)')
    expect(past.live).toBe(false)
    expect(past.countsOnly).toBe(true)
  })

  test('gives the live event a random join key', () => {
    const a = openLedger(new Database(':memory:'), { ghostSeed })
    const b = openLedger(new Database(':memory:'), { ghostSeed })

    expect(a.joinKey()).toMatch(/^[A-Za-z0-9]{8,}$/)
    expect(a.joinKey()).not.toBe(b.joinKey())
  })

  test('happens once: reopening the database keeps the same live event and key', () => {
    const db = new Database(':memory:')
    const first = openLedger(db, { ghostSeed })

    const again = openLedger(db, { ghostSeed })

    expect(again.snapshot().event.id).toBe(first.snapshot().event.id)
    expect(again.snapshot().ghost.buckets).toHaveLength(5)
    expect(again.joinKey()).toBe(first.joinKey())
  })
})

function tap(id, extra = {}) {
  return { type: 'tap', id, tagId: null, tappedAt: 1_000, phoneName: 'Dad', ...extra }
}

describe('taps', () => {
  test('a tap adds kid #1 and returns a kid.added delta', () => {
    const ledger = openLedger(new Database(':memory:'), { ghostSeed })

    const deltas = ledger.apply(tap('kid-a', { tappedAt: 1_700_000_000_000 }))

    expect(deltas).toHaveLength(1)
    expect(deltas[0]).toMatchObject({
      type: 'kid.added',
      seq: 1,
      kid: { id: 'kid-a', number: 1, tagId: null, phoneName: 'Dad', tappedAt: 1_700_000_000_000, source: 'tap' },
    })
    const snap = ledger.snapshot()
    expect(snap.kids).toEqual([deltas[0].kid])
    expect(snap.seq).toBe(1)
  })

  test('repeating a tap id stores one kid and returns no delta', () => {
    const ledger = openLedger(new Database(':memory:'), { ghostSeed })
    ledger.apply(tap('kid-a'))

    const deltas = ledger.apply(tap('kid-a'))

    expect(deltas).toEqual([])
    expect(ledger.snapshot().kids).toHaveLength(1)
    expect(ledger.snapshot().seq).toBe(1)
  })
})

describe('kid numbers', () => {
  function numberOf(deltas) {
    return deltas[0].kid.number
  }

  test('count up with each arrival', () => {
    const ledger = openLedger(new Database(':memory:'), { ghostSeed })

    expect(numberOf(ledger.apply(tap('a')))).toBe(1)
    expect(numberOf(ledger.apply(tap('b')))).toBe(2)
    expect(numberOf(ledger.apply(tap('c')))).toBe(3)
  })

  test('an undone kid frees its number for the next arrival', () => {
    const ledger = openLedger(new Database(':memory:'), { ghostSeed })
    ledger.apply(tap('a'))
    ledger.apply(tap('b'))

    const removed = ledger.apply({ type: 'remove', kidId: 'b' })

    expect(removed).toMatchObject([{ type: 'kid.removed', kidId: 'b' }])
    expect(numberOf(ledger.apply(tap('c')))).toBe(2)
  })

  test('are never rewritten: removing an earlier kid leaves two kids sharing a number', () => {
    const ledger = openLedger(new Database(':memory:'), { ghostSeed })
    ledger.apply(tap('a'))
    ledger.apply(tap('b'))
    ledger.apply(tap('c'))
    ledger.apply({ type: 'remove', kidId: 'a' })

    ledger.apply(tap('d'))

    expect(ledger.snapshot().kids.map((k) => [k.id, k.number])).toEqual([
      ['b', 2],
      ['c', 3],
      ['d', 3],
    ])
  })

  test('removing is idempotent', () => {
    const ledger = openLedger(new Database(':memory:'), { ghostSeed })
    ledger.apply(tap('a'))
    ledger.apply({ type: 'remove', kidId: 'a' })

    expect(ledger.apply({ type: 'remove', kidId: 'a' })).toEqual([])
    expect(ledger.apply({ type: 'remove', kidId: 'never-arrived' })).toEqual([])
  })
})

describe('feature switches', () => {
  test('are all on unless the config turns one off, and clients see them in the snapshot', () => {
    const ledger = openLedger(new Database(':memory:'), { ghostSeed, switches: { goldenTickets: false } })

    expect(ledger.snapshot().settings.switches).toEqual({
      milestones: true,
      goldenTickets: false,
      costumeLeaderboard: true,
      newTrendAlert: true,
      soundboard: true,
      pumpkinPatch: true,
      recap: true,
    })
  })
})

describe('snapshot', () => {
  test('carries the live event, tags, kids, ghost, settings and seq, and never the join key', () => {
    const ledger = openLedger(new Database(':memory:'), { ghostSeed, now: () => 6_000 })
    ledger.apply(tap('kid-a', { tappedAt: 5_000, phoneName: 'Mom' }))

    const snap = ledger.snapshot()

    expect(snap).toEqual({
      event: {
        id: expect.any(Number),
        name: 'Rehearsal',
        live: true,
        countsOnly: false,
        clockShiftMs: 0,
      },
      tags: [],
      kids: [{ id: 'kid-a', number: 1, tagId: null, phoneName: 'Mom', tappedAt: 5_000, late: false, source: 'tap' }],
      ghost: {
        eventId: expect.any(Number),
        label: '2025',
        total: 346,
        buckets: [
          { start: '17:42', end: '18:00', count: 14 },
          { start: '18:00', end: '18:30', count: 72 },
          { start: '18:30', end: '19:00', count: 107 },
          { start: '19:00', end: '19:30', count: 119 },
          { start: '19:30', end: '20:00', count: 34 },
        ],
      },
      settings: { switches: expect.any(Object) },
      seq: 1,
    })
    expect(JSON.stringify(snap)).not.toContain(ledger.joinKey())
  })
})

describe('late taps', () => {
  function ledgerAt(nowMs) {
    return openLedger(new Database(':memory:'), { ghostSeed, now: () => nowMs })
  }

  test.each([
    ['on time', 0, false],
    ['exactly 10 s', 10_000, false],
    ['10.001 s', 10_001, true],
    ['after a long outage', 45 * 60_000, true],
  ])('a kid that lands %s after its tap (%i ms) is late: %p', (_, lagMs, late) => {
    const ledger = ledgerAt(1_000_000 + lagMs)

    const [delta] = ledger.apply(tap('a', { tappedAt: 1_000_000 }))

    expect(delta.kid.late).toBe(late)
    expect(ledger.snapshot().kids[0].late).toBe(late)
  })

  test('are still numbered when they land', () => {
    const ledger = ledgerAt(100_000)
    ledger.apply(tap('fresh', { tappedAt: 99_000 }))

    const [delta] = ledger.apply(tap('queued', { tappedAt: 1_000 }))

    expect(delta.kid).toMatchObject({ number: 2, late: true })
  })
})

function catchUp(kidId, n, extra = {}) {
  return {
    type: 'catchUp',
    tag: { name: 'Bluey', emoji: '🐶' },
    n,
    kid: { id: kidId, tappedAt: 50_000, phoneName: 'Mom' },
    ...extra,
  }
}

describe('catch-up (+ New costume)', () => {
  test('with nobody to catch up, creates the costume and counts the kid at the door with it', () => {
    const ledger = openLedger(new Database(':memory:'), { ghostSeed })
    ledger.apply(tap('a'))

    const deltas = ledger.apply(catchUp('door', 0))

    expect(deltas.map((d) => d.type)).toEqual(['tag.added', 'kid.added'])
    const tag = deltas[0].tag
    expect(tag).toEqual({ id: expect.any(Number), name: 'Bluey', emoji: '🐶', order: 1 })
    expect(deltas[1].kid).toMatchObject({ id: 'door', number: 2, tagId: tag.id, phoneName: 'Mom', tappedAt: 50_000 })
    expect(ledger.snapshot().tags).toEqual([tag])
  })

  test('re-tags the N most recent untagged kids by tap time and adds exactly one kid', () => {
    const ledger = openLedger(new Database(':memory:'), { ghostSeed, now: () => 10_000 })
    ledger.apply(tap('a', { tappedAt: 1_000 }))
    ledger.apply(tap('b', { tappedAt: 4_000 }))
    ledger.apply(tap('c', { tappedAt: 2_000 })) // arrived after b, but tapped before it
    ledger.apply(tap('d', { tappedAt: 3_000 }))

    const deltas = ledger.apply(catchUp('door', 2))

    expect(deltas.map((d) => d.type)).toEqual(['tag.added', 'kid.retagged', 'kid.added'])
    const tagId = deltas[0].tag.id
    expect(deltas[1]).toMatchObject({ kidIds: ['b', 'd'], tagId })
    expect(ledger.snapshot().kids.map((k) => [k.id, k.number, k.tagId, k.tappedAt])).toEqual([
      ['a', 1, null, 1_000],
      ['b', 2, tagId, 4_000],
      ['c', 3, null, 2_000],
      ['d', 4, tagId, 3_000],
      ['door', 5, tagId, 50_000],
    ])
  })

  test('caps N at the untagged kids there are, skipping tagged and removed kids', () => {
    const ledger = openLedger(new Database(':memory:'), { ghostSeed })
    ledger.apply(tap('a', { tappedAt: 1_000 }))
    ledger.apply(catchUp('witch', 0, { tag: { name: 'Witch', emoji: '🧙' }, kid: { id: 'witch', tappedAt: 2_000 } }))
    ledger.apply(tap('b', { tappedAt: 3_000 }))
    ledger.apply({ type: 'remove', kidId: 'b' })
    ledger.apply(tap('c', { tappedAt: 4_000 }))

    const deltas = ledger.apply(catchUp('door', 10))

    expect(deltas[1]).toMatchObject({ type: 'kid.retagged', kidIds: ['c', 'a'] })
    expect(ledger.snapshot().kids).toHaveLength(4)
  })

  test('a retry with the same door kid id does nothing: no second costume, no re-tagging', () => {
    const ledger = openLedger(new Database(':memory:'), { ghostSeed })
    ledger.apply(tap('a'))
    ledger.apply(catchUp('door', 0))
    ledger.apply(tap('b'))

    expect(ledger.apply(catchUp('door', 1))).toEqual([])

    const snap = ledger.snapshot()
    expect(snap.tags).toHaveLength(1)
    expect(snap.kids.find((k) => k.id === 'b').tagId).toBeNull()
  })

  test.each([
    ['no name', { tag: { name: '  ', emoji: '🐶' } }],
    ['a negative N', { n: -1 }],
    ['a fractional N', { n: 1.5 }],
    ['no door kid', { kid: undefined }],
  ])('refuses %s, changing nothing', (_, override) => {
    const ledger = openLedger(new Database(':memory:'), { ghostSeed })
    ledger.apply(tap('a'))

    expect(() => ledger.apply({ ...catchUp('door', 1), ...override })).toThrow(BadCommand)
    expect(ledger.snapshot().tags).toEqual([])
    expect(ledger.snapshot().kids.map((k) => k.tagId)).toEqual([null])
  })
})

describe('tag taps', () => {
  test("add a kid with that costume", () => {
    const ledger = openLedger(new Database(':memory:'), { ghostSeed })
    const [tagAdded] = ledger.apply(catchUp('door', 0))

    const [delta] = ledger.apply(tap('a', { tagId: tagAdded.tag.id }))

    expect(delta.kid).toMatchObject({ number: 2, tagId: tagAdded.tag.id })
  })

  test("naming a costume that isn't in the live event (deleted while queued) still counts the kid, untagged", () => {
    const ledger = openLedger(new Database(':memory:'), { ghostSeed })

    const [delta] = ledger.apply(tap('a', { tagId: 999 }))

    expect(delta.kid).toMatchObject({ number: 1, tagId: null })
  })
})

describe('ghost from a past event with taps', () => {
  test("races against a 2026-style event's own non-deleted taps, in its event time", () => {
    const db = new Database(':memory:')
    const ledger = openLedger(db, { ghostSeed })
    // Arranged with SQL until Setup (ticket 22) can create events: a past +3h rehearsal with 3 kids, one deleted.
    const local = (hh, mm) => new Date(2026, 9, 24, hh, mm).getTime()
    const past = db
      .query("INSERT INTO events (name, frozen, clock_shift_ms) VALUES ('Dress rehearsal 2026', 1, ?) RETURNING id")
      .get(3 * 3_600_000).id
    const addKid = db.query('INSERT INTO kids (id, event_id, number, tapped_at, received_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?)')
    addKid.run('r1', past, 1, local(14, 50), local(14, 50), null)
    addKid.run('r2', past, 2, local(15, 10), local(15, 10), null)
    addKid.run('r3', past, 3, local(15, 20), local(15, 20), local(15, 21))
    db.query('UPDATE events SET race_against_id = ? WHERE live = 1').run(past)

    expect(ledger.snapshot().ghost).toEqual({
      eventId: past,
      label: '2026',
      total: 2,
      buckets: [
        { start: '17:50', end: '18:00', count: 1 },
        { start: '18:00', end: '18:30', count: 1 },
      ],
    })
  })
})

describe('events and Go live', () => {
  const liveEvents = (ledger) => ledger.events().filter((e) => e.live)

  test("creating an event doesn't make it live", () => {
    const ledger = openLedger(new Database(':memory:'), { ghostSeed })

    const [created] = ledger.apply({ type: 'createEvent', name: 'Halloween 2026' })

    expect(created).toMatchObject({ type: 'event.created', event: { name: 'Halloween 2026', live: false, frozen: false } })
    expect(ledger.snapshot().event.name).toBe('Rehearsal')
    expect(liveEvents(ledger).map((e) => e.name)).toEqual(['Rehearsal'])
  })

  test('Go live switches the live event, freezes the old one and keeps the join key', () => {
    const ledger = openLedger(new Database(':memory:'), { ghostSeed })
    const key = ledger.joinKey()
    const [{ event }] = ledger.apply({ type: 'createEvent', name: 'Halloween 2026' })

    const deltas = ledger.apply({ type: 'goLive', eventId: event.id })

    expect(deltas).toMatchObject([{ type: 'event.switched', eventId: event.id }])
    expect(ledger.snapshot().event).toMatchObject({ name: 'Halloween 2026', live: true })
    expect(liveEvents(ledger).map((e) => e.name)).toEqual(['Halloween 2026'])
    expect(ledger.events().find((e) => e.name === 'Rehearsal')).toMatchObject({ live: false, frozen: true })
    expect(ledger.joinKey()).toBe(key)
  })

  test('taps after Go live count in the new event, numbered from 1', () => {
    const ledger = openLedger(new Database(':memory:'), { ghostSeed })
    ledger.apply(tap('rehearsal-kid'))
    const [{ event }] = ledger.apply({ type: 'createEvent', name: 'Halloween 2026' })
    ledger.apply({ type: 'goLive', eventId: event.id })

    const [delta] = ledger.apply(tap('first-real-kid'))

    expect(delta.kid.number).toBe(1)
    expect(ledger.snapshot().kids.map((k) => k.id)).toEqual(['first-real-kid'])
  })

  test.each([
    ['the counts-only 2025 event', (ledger) => ledger.snapshot().ghost.eventId],
    ['a frozen past event', (ledger) => {
      const rehearsal = ledger.snapshot().event.id
      const [{ event }] = ledger.apply({ type: 'createEvent', name: 'Next' })
      ledger.apply({ type: 'goLive', eventId: event.id })
      return rehearsal
    }],
  ])("can't go live with %s", (_, pick) => {
    const ledger = openLedger(new Database(':memory:'), { ghostSeed })
    const eventId = pick(ledger)
    const before = ledger.snapshot().event.id

    expect(() => ledger.apply({ type: 'goLive', eventId })).toThrow(BadCommand)
    expect(ledger.snapshot().event.id).toBe(before)
    expect(liveEvents(ledger)).toHaveLength(1)
  })

  test('"Copy costumes from" copies names, emoji, order, sounds and the Visit window, with zero counts', () => {
    const ledger = openLedger(new Database(':memory:'), { ghostSeed })
    const rehearsal = ledger.snapshot().event.id
    ledger.apply(catchUp('door', 0, { tag: { name: 'Witch', emoji: '🧙' } }))
    ledger.apply(catchUp('door-2', 0, { tag: { name: 'Bluey', emoji: '🐶' } }))
    ledger.apply({ type: 'settings', eventId: rehearsal, visitWindowMs: 20_000 })

    const [{ event }] = ledger.apply({ type: 'createEvent', name: 'Halloween 2026', copyTagsFrom: rehearsal })
    ledger.apply({ type: 'goLive', eventId: event.id })

    const snap = ledger.snapshot()
    expect(snap.tags.map((t) => [t.name, t.emoji, t.order])).toEqual([['Witch', '🧙', 1], ['Bluey', '🐶', 2]])
    expect(snap.kids).toEqual([])
    expect(ledger.events().find((e) => e.id === event.id).visitWindowMs).toBe(20_000)
  })
})

describe('event settings', () => {
  test('Race against and Clock shift change what the live snapshot carries, and tell clients to resync', () => {
    const ledger = openLedger(new Database(':memory:'), { ghostSeed })
    const live = ledger.snapshot().event.id

    const deltas = ledger.apply({ type: 'settings', eventId: live, raceAgainstId: null, clockShiftMs: 3 * 3_600_000 })

    expect(deltas).toMatchObject([{ type: 'event.updated', eventId: live }])
    expect(ledger.snapshot().ghost).toBeNull()
    expect(ledger.snapshot().event.clockShiftMs).toBe(3 * 3_600_000)
  })

  test("an event can't race against itself", () => {
    const ledger = openLedger(new Database(':memory:'), { ghostSeed })
    const live = ledger.snapshot().event.id

    expect(() => ledger.apply({ type: 'settings', eventId: live, raceAgainstId: live })).toThrow(BadCommand)
  })

  test("an upcoming event's settings change quietly: no delta for the live clients", () => {
    const ledger = openLedger(new Database(':memory:'), { ghostSeed })
    const [{ event }] = ledger.apply({ type: 'createEvent', name: 'Halloween 2026' })

    expect(ledger.apply({ type: 'settings', eventId: event.id, expectedKids: 350 })).toEqual([])
    expect(ledger.events().find((e) => e.id === event.id).expectedKids).toBe(350)
  })

  test('past events are read-only: settings and costume changes are rejected', () => {
    const ledger = openLedger(new Database(':memory:'), { ghostSeed })
    const rehearsal = ledger.snapshot().event.id
    const [{ event }] = ledger.apply({ type: 'createEvent', name: 'Halloween 2026' })
    ledger.apply({ type: 'goLive', eventId: event.id })

    expect(() => ledger.apply({ type: 'settings', eventId: rehearsal, name: 'Renamed' })).toThrow(BadCommand)
    expect(() => ledger.apply({ type: 'createTag', eventId: rehearsal, name: 'Ghost', emoji: '👻' })).toThrow(BadCommand)
    expect(ledger.events().find((e) => e.id === rehearsal).name).toBe('Rehearsal')
  })
})

describe('join key and deleting events', () => {
  test('Change key replaces the live event\'s key', () => {
    const ledger = openLedger(new Database(':memory:'), { ghostSeed })
    const old = ledger.joinKey()

    ledger.apply({ type: 'changeKey' })

    expect(ledger.joinKey()).not.toBe(old)
    expect(ledger.joinKey()).toMatch(/^[A-Za-z0-9]{8,}$/)
  })

  test("the live event can't be deleted", () => {
    const ledger = openLedger(new Database(':memory:'), { ghostSeed })
    const live = ledger.snapshot().event

    expect(() => ledger.apply({ type: 'deleteEvent', eventId: live.id, confirm: live.name })).toThrow(BadCommand)
  })

  test('a past event is deleted with its kids and costumes, only with its name typed to confirm', () => {
    const ledger = openLedger(new Database(':memory:'), { ghostSeed })
    const rehearsal = ledger.snapshot().event.id
    ledger.apply(tap('a'))
    const [{ event }] = ledger.apply({ type: 'createEvent', name: 'Halloween 2026' })
    ledger.apply({ type: 'goLive', eventId: event.id })
    ledger.apply({ type: 'settings', eventId: event.id, raceAgainstId: rehearsal })

    expect(() => ledger.apply({ type: 'deleteEvent', eventId: rehearsal, confirm: 'rehearsal?' })).toThrow(BadCommand)
    const deltas = ledger.apply({ type: 'deleteEvent', eventId: rehearsal, confirm: 'Rehearsal' })

    expect(ledger.events().map((e) => e.name)).toEqual(['Halloween 2026', 'Halloween 2025 (counts)'])
    expect(ledger.snapshot().ghost).toBeNull() // it was being raced against: now None
    expect(deltas).toMatchObject([{ type: 'event.updated', eventId: event.id }])
  })
})

describe('costume presets', () => {
  test('creating, renaming and re-emojiing a costume on the live event updates clients', () => {
    const ledger = openLedger(new Database(':memory:'), { ghostSeed })
    const live = ledger.snapshot().event.id

    const [added] = ledger.apply({ type: 'createTag', eventId: live, name: 'Wednesday', emoji: '🖤' })
    const [updated] = ledger.apply({ type: 'updateTag', tagId: added.tag.id, name: 'Wednesday Addams', emoji: '🕷️' })

    expect(added).toMatchObject({ type: 'tag.added', tag: { name: 'Wednesday', emoji: '🖤', order: 1 } })
    expect(updated).toMatchObject({ type: 'tag.updated', tag: { id: added.tag.id, name: 'Wednesday Addams', emoji: '🕷️' } })
    expect(ledger.snapshot().tags).toEqual([updated.tag])
  })

  test('deleting a costume makes its kids untagged', () => {
    const ledger = openLedger(new Database(':memory:'), { ghostSeed })
    const [{ tag }] = ledger.apply(catchUp('door', 0))
    ledger.apply(tap('a', { tagId: tag.id }))
    ledger.apply(tap('b'))

    const deltas = ledger.apply({ type: 'deleteTag', tagId: tag.id })

    expect(deltas).toMatchObject([
      { type: 'kid.retagged', kidIds: ['door', 'a'], tagId: null },
      { type: 'tag.removed', tagId: tag.id },
    ])
    expect(ledger.snapshot().tags).toEqual([])
    expect(ledger.snapshot().kids.map((k) => k.tagId)).toEqual([null, null, null])
  })

  test("an upcoming event's costumes change without telling the live clients", () => {
    const ledger = openLedger(new Database(':memory:'), { ghostSeed })
    const [{ event }] = ledger.apply({ type: 'createEvent', name: 'Halloween 2026' })

    expect(ledger.apply({ type: 'createTag', eventId: event.id, name: 'Witch', emoji: '🧙' })).toEqual([])
    expect(ledger.snapshot().tags).toEqual([])
  })
})
