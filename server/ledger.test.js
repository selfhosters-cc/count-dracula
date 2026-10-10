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
      kids: [{ id: 'kid-a', number: 1, tagId: null, phoneName: 'Mom', tappedAt: 5_000, late: false, golden: false, source: 'tap' }],
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
      golden: { left: 5, nextIsGolden: false },
      settings: { switches: expect.any(Object), mix: expect.any(Object), lanUrl: null, soundboard: [] },
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

describe('milestones and Beat last year (fired moments)', () => {
  // A ledger with a movable clock; tapsUpTo(n) brings the live count to n with on-time taps.
  // Golden tickets off: a randomly drawn ticket landing on #50 would add 'golden' to that kid's moments.
  function race({ switches = {}, ...config } = {}) {
    let clockMs = 1_000_000_000
    const ledger = openLedger(new Database(':memory:'), {
      ghostSeed,
      now: () => clockMs,
      switches: { goldenTickets: false, ...switches },
      ...config,
    })
    let i = 0
    const live = (id = `k${++i}`) => ledger.apply(tap(id, { tappedAt: clockMs }))
    const late = (id = `k${++i}`) => ledger.apply(tap(id, { tappedAt: clockMs - 60_000 }))
    const tapsUpTo = (n) => {
      while (ledger.snapshot().kids.length < n) live()
    }
    return { ledger, live, late, tapsUpTo }
  }
  const moments = (deltas) => deltas.find((d) => d.type === 'kid.added').moments

  test('every 50th kid tapped live fires its milestone; others get a plain pop', () => {
    const { live, tapsUpTo } = race()
    tapsUpTo(48)

    expect(moments(live())).toEqual([]) // #49
    expect(moments(live())).toEqual(['milestone:50'])
    tapsUpTo(99)
    expect(moments(live())).toEqual(['milestone:100'])
  })

  test('fires once per event: after undoing #100, the next #100 is an ordinary pop', () => {
    const { ledger, live, tapsUpTo } = race()
    tapsUpTo(99)
    const [hundred] = live()
    ledger.apply({ type: 'remove', kidId: hundred.kid.id })

    const again = live()

    expect(again[0].kid.number).toBe(100)
    expect(moments(again)).toEqual([])
  })

  test('a milestone crossed by a late tap is skipped for good', () => {
    const { ledger, live, late, tapsUpTo } = race()
    tapsUpTo(149)
    const [lateKid] = late()
    expect(lateKid.kid).toMatchObject({ number: 150, late: true })
    expect(lateKid.moments).toEqual([])

    ledger.apply({ type: 'remove', kidId: lateKid.kid.id })
    expect(moments(live())).toEqual([]) // #150 again, live this time: still skipped
  })

  test('the kid who beats the Race-against total (#347 against 2025) fires Beat last year, once', () => {
    const { ledger, live, tapsUpTo } = race()
    tapsUpTo(346)

    const [beat] = live()
    expect(beat.kid.number).toBe(347)
    expect(beat.moments).toEqual(['beat-last-year'])

    ledger.apply({ type: 'remove', kidId: beat.kid.id })
    expect(moments(live())).toEqual([])
  })

  test('Beat last year crossed by late taps waits for the next live tap, without a kid number', () => {
    const { live, late, tapsUpTo } = race()
    tapsUpTo(345)
    late() // #346
    const lateBeat = late() // #347
    expect(moments(lateBeat)).toEqual([])

    const next = live() // #348

    expect(next.map((d) => d.type)).toEqual(['kid.added', 'moment'])
    expect(next[0].moments).toEqual([])
    expect(next[1]).toMatchObject({ type: 'moment', moments: ['beat-last-year'] })
    expect(next[1].kid).toBeUndefined()
    expect(live().map((d) => d.type)).toEqual(['kid.added']) // and only once
  })

  test('there is no Beat last year when Race against is None', () => {
    const { ledger, live, tapsUpTo } = race()
    ledger.apply({ type: 'settings', eventId: ledger.snapshot().event.id, raceAgainstId: null })
    tapsUpTo(346)

    expect(moments(live())).toEqual([])
  })

  test('with the milestones switch off, every kid gets a plain pop', () => {
    const { live, tapsUpTo } = race({ switches: { milestones: false } })
    tapsUpTo(49)
    expect(moments(live())).toEqual([])
    tapsUpTo(346)
    expect(moments(live())).toEqual([])
  })
})

describe('golden tickets: the draw', () => {
  // A deterministic `random`: hands out the given values in turn.
  const sequence = (...values) => {
    let i = 0
    return () => values[i++ % values.length]
  }
  const goLiveWith = (config, settings = {}) => {
    const ledger = openLedger(new Database(':memory:'), { ghostSeed, ...config })
    const [{ event }] = ledger.apply({ type: 'createEvent', name: 'Halloween 2026' })
    ledger.apply({ type: 'settings', eventId: event.id, raceAgainstId: ledger.snapshot().ghost.eventId, ...settings })
    ledger.apply({ type: 'goLive', eventId: event.id })
    return { ledger, eventId: event.id }
  }

  test('Go live draws one number per band across 10–80% of the Race-against total (#35–#276 against 346)', () => {
    const { ledger, eventId } = goLiveWith({ random: sequence(0, 0.999, 0.5, 0.25, 0.75) })

    const numbers = ledger.tickets(eventId).map((t) => t.number)

    // #35–#276 is 242 numbers; band i starts at 35 + ⌊i × 242 / 5⌋: [35–82] [83–130] [131–179] [180–227] [228–276]
    expect(numbers).toEqual([35, 130, 155, 192, 264])
    expect(ledger.tickets(eventId).every((t) => t.state === 'hidden')).toBe(true)
  })

  test('uses Expected kids when there is no ghost, and the event\'s own ticket count', () => {
    const { ledger, eventId } = goLiveWith({ random: sequence(0.5) }, { raceAgainstId: null, expectedKids: 200, goldenCount: 3 })

    expect(ledger.tickets(eventId).map((t) => t.number)).toEqual([43, 90, 137]) // 3 bands over #20–#160
  })

  test('draws nothing with no ghost and no Expected kids, or with the switch off', () => {
    expect(goLiveWith({}, { raceAgainstId: null }).ledger.snapshot().golden).toEqual({ left: 0, nextIsGolden: false })
    const off = goLiveWith({ switches: { goldenTickets: false } })
    expect(off.ledger.tickets(off.eventId)).toEqual([])
    expect(off.ledger.snapshot().golden).toBeNull()
  })

  test('the first install draws for the live Rehearsal too (the rehearsal draws for real)', () => {
    const ledger = openLedger(new Database(':memory:'), { ghostSeed })

    expect(ledger.tickets(ledger.snapshot().event.id)).toHaveLength(5)
    expect(ledger.snapshot().golden).toEqual({ left: 5, nextIsGolden: false })
  })
})

describe('golden tickets: winning', () => {
  // Rehearsal with one golden ticket at #3 (random 0 → the band's first number; 10% of a 30-kid ghost is #3).
  function golden(config = {}) {
    let clockMs = 1_000_000_000
    const db = new Database(':memory:')
    const ledger = openLedger(db, { ghostSeed: { name: 'Tiny 2025', buckets: [{ start: '18:00', end: '18:30', count: 30 }] }, random: () => 0, now: () => clockMs, ...config })
    const [{ event }] = ledger.apply({ type: 'createEvent', name: 'Night' })
    ledger.apply({ type: 'settings', eventId: event.id, raceAgainstId: ledger.snapshot().ghost.eventId, goldenCount: 1 })
    ledger.apply({ type: 'goLive', eventId: event.id })
    let i = 0
    const live = () => ledger.apply(tap(`k${++i}`, { tappedAt: clockMs }))
    const late = () => ledger.apply(tap(`k${++i}`, { tappedAt: clockMs - 60_000 }))
    return { ledger, live, late, eventId: event.id }
  }

  test('the kid who reaches the golden number live wins it; clients learn only how many are left', () => {
    const { ledger, live, eventId } = golden()
    live()
    const second = live()
    expect(second[0].golden).toEqual({ left: 1, nextIsGolden: true })
    expect(ledger.snapshot().golden).toEqual({ left: 1, nextIsGolden: true })

    const [win] = live()

    expect(win.kid.number).toBe(3)
    expect(win.moments).toEqual(['golden'])
    expect(win.golden).toEqual({ left: 0, nextIsGolden: false })
    expect(ledger.tickets(eventId)).toMatchObject([{ number: 3, state: 'won', kidId: win.kid.id }])
  })

  test('a win is final: undoing the winner keeps it won, and the next #3 is ordinary', () => {
    const { ledger, live } = golden()
    live()
    live()
    const [win] = live()

    const [removed] = ledger.apply({ type: 'remove', kidId: win.kid.id })
    expect(removed.golden).toEqual({ left: 0, nextIsGolden: false })

    const [again] = live()
    expect(again.kid.number).toBe(3)
    expect(again.moments).toEqual([])
  })

  test('a golden number that lands on a late tap is not left hidden below the count', () => {
    const { ledger, live, late, eventId } = golden()
    live()
    live()

    const [lateWinner] = late()

    expect(lateWinner.moments).toEqual([])
    expect(ledger.tickets(eventId)[0].state).not.toBe('hidden')
  })

  test('the secret numbers never reach a client: the snapshot carries only the count and the banner flag', () => {
    const { ledger, live } = golden()
    live()

    expect(Object.keys(ledger.snapshot().golden).sort()).toEqual(['left', 'nextIsGolden'])
    expect(ledger.events().some((e) => 'tickets' in e)).toBe(false)
  })
})

describe('TV mix (☰ volume and mutes)', () => {
  const quiet = { volume: 0.4, mutes: { ambience: true, bloops: false, everything: false } }

  test('starts at full volume with nothing muted', () => {
    const ledger = openLedger(new Database(':memory:'), { ghostSeed })

    expect(ledger.snapshot().settings.mix).toEqual({ volume: 1, mutes: { ambience: false, bloops: false, everything: false } })
  })

  test('any change goes to the TV as a delta and into the snapshot', () => {
    const ledger = openLedger(new Database(':memory:'), { ghostSeed })

    expect(ledger.apply({ type: 'mix', ...quiet })).toMatchObject([{ type: 'mix.changed', mix: quiet }])
    expect(ledger.snapshot().settings.mix).toEqual(quiet)
  })

  test('is global: it survives a restart and Go live', () => {
    const db = new Database(':memory:')
    const ledger = openLedger(db, { ghostSeed })
    ledger.apply({ type: 'mix', ...quiet })
    const [{ event }] = ledger.apply({ type: 'createEvent', name: 'Halloween 2026' })
    ledger.apply({ type: 'goLive', eventId: event.id })

    expect(openLedger(db, { ghostSeed }).snapshot().settings.mix).toEqual(quiet)
  })

  test.each([
    ['a volume above 1', { volume: 1.5, mutes: {} }],
    ['a negative volume', { volume: -0.1, mutes: {} }],
    ['no volume', { mutes: {} }],
  ])('refuses %s', (_, mix) => {
    const ledger = openLedger(new Database(':memory:'), { ghostSeed })

    expect(() => ledger.apply({ type: 'mix', ...mix })).toThrow(BadCommand)
  })
})

describe('golden tickets: roll forward, add and release', () => {
  // A night racing a 30-kid ghost (range #3–#24), with tickets drawn at the start of each band.
  function night({ tickets = 1 } = {}) {
    let clockMs = 1_000_000_000
    const ledger = openLedger(new Database(':memory:'), {
      ghostSeed: { name: 'Tiny 2025', buckets: [{ start: '18:00', end: '18:30', count: 30 }] },
      random: () => 0,
      now: () => clockMs,
      switches: { milestones: false },
    })
    const [{ event }] = ledger.apply({ type: 'createEvent', name: 'Night' })
    ledger.apply({ type: 'settings', eventId: event.id, raceAgainstId: ledger.snapshot().ghost.eventId, goldenCount: tickets })
    ledger.apply({ type: 'goLive', eventId: event.id })
    let i = 0
    const live = () => ledger.apply(tap(`k${++i}`, { tappedAt: clockMs }))
    const late = () => ledger.apply(tap(`k${++i}`, { tappedAt: clockMs - 60_000 }))
    const won = (deltas) => deltas[0].moments.includes('golden')
    return { ledger, live, late, won, tickets: () => ledger.tickets(event.id) }
  }

  test('a golden number that lands on a late tap goes to the next live kid, keeping its original number', () => {
    const { ledger, live, late, won, tickets } = night() // ticket at #3
    live()
    live()
    expect(won(late())).toBe(false) // #3 arrives late
    expect(ledger.snapshot().golden).toEqual({ left: 1, nextIsGolden: true })

    const next = live() // #4

    expect(won(next)).toBe(true)
    expect(next[0].golden).toEqual({ left: 0, nextIsGolden: false })
    expect(tickets()).toEqual([{ number: 3, state: 'rolled', kidId: next[0].kid.id }])
  })

  test('several rolled tickets go to the next live kids, one each; late kids never take them', () => {
    const { live, late, won, tickets } = night({ tickets: 3 }) // #3, #10, #17
    for (let n = 1; n <= 20; n++) late() // a backlog flushes past all three

    expect(won(late())).toBe(false)
    expect([won(live()), won(live()), won(live()), won(live())]).toEqual([true, true, true, false])
    expect(tickets().map((t) => t.state)).toEqual(['rolled', 'rolled', 'rolled'])
  })

  test("a live kid on its own hidden number wins that one; the rolled ticket waits for the next", () => {
    const { live, late, tickets } = night({ tickets: 2 }) // #3 and #14
    for (let n = 1; n <= 3; n++) late() // #3 rolls
    for (let n = 4; n <= 13; n++) live() // #4 takes the rolled #3
    const fourteen = live()

    expect(fourteen[0].kid.number).toBe(14)
    expect(tickets()).toMatchObject([{ number: 3, state: 'rolled' }, { number: 14, state: 'won', kidId: fourteen[0].kid.id }])
  })

  test('removing the late kids afterwards never brings a ticket back', () => {
    const { ledger, live, late, tickets } = night()
    live()
    live()
    const [lateThree] = late()
    live() // wins the rolled #3

    ledger.apply({ type: 'remove', kidId: lateThree.kid.id })

    expect(ledger.snapshot().golden).toEqual({ left: 0, nextIsGolden: false })
    expect(tickets().some((t) => t.state === 'hidden')).toBe(false)
  })

  test('Add a ticket draws one number between the count + 5 and the top of the range', () => {
    const { ledger, live, tickets } = night()
    for (let n = 1; n <= 4; n++) live() // #3 won; count 4

    const deltas = ledger.apply({ type: 'addTicket' })

    expect(deltas).toMatchObject([{ type: 'golden.changed', golden: { left: 1, nextIsGolden: false } }])
    expect(tickets().find((t) => t.state === 'hidden').number).toBe(9) // random 0 → the bottom: 4 + 5
  })

  test("Add a ticket refuses when there's no room left in the range", () => {
    const { ledger, live } = night()
    for (let n = 1; n <= 20; n++) live() // 20 + 5 is past the top (#24)

    expect(() => ledger.apply({ type: 'addTicket' })).toThrow(BadCommand)
  })

  test('Release remaining makes the next K live kids winners', () => {
    const { ledger, live, late, won, tickets } = night({ tickets: 3 }) // #3, #10, #17, none reached
    live()

    const deltas = ledger.apply({ type: 'release' })

    expect(deltas).toMatchObject([{ type: 'golden.changed', golden: { left: 3, nextIsGolden: true } }])
    expect(won(late())).toBe(false)
    expect([won(live()), won(live()), won(live()), won(live())]).toEqual([true, true, true, false])
    expect(tickets().map((t) => t.state)).toEqual(['released', 'released', 'released'])
  })
})

describe('Add missed kids (backfill)', () => {
  const MIN = 60_000
  const NOW = 1_800_000_000_000
  function setup() {
    const ledger = openLedger(new Database(':memory:'), { ghostSeed, now: () => NOW, switches: { goldenTickets: false } })
    return ledger
  }
  const row = (startMs, count, minutes = 15) => ({ startMs, endMs: startMs + minutes * MIN, count })
  const added = (deltas) => deltas.filter((d) => d.type === 'kid.added').map((d) => d.kid)

  test('spreads a row evenly across its slot as untagged, late backfill kids in one batch', () => {
    const ledger = setup()
    const start = NOW - 60 * MIN

    const kids = added(ledger.apply({ type: 'backfill', rows: [row(start, 10)] }))

    expect(kids).toHaveLength(10)
    expect(kids.map((k) => k.tappedAt)).toEqual(Array.from({ length: 10 }, (_, i) => start + (i + 0.5) * 90_000))
    expect(kids.every((k) => k.source === 'backfill' && k.tagId === null && k.late)).toBe(true)
    expect(new Set(ledger.batches().map((b) => b.id)).size).toBe(1)
    expect(ledger.batches()[0]).toMatchObject({ kids: 10, rows: [{ startMs: start, endMs: start + 15 * MIN, count: 10 }] })
  })

  test('numbers the whole batch in tap-time order, whatever order the rows come in', () => {
    const ledger = setup()
    ledger.apply(tap('earlier', { tappedAt: NOW - 200 * MIN }))

    const kids = added(ledger.apply({ type: 'backfill', rows: [row(NOW - 30 * MIN, 2), row(NOW - 90 * MIN, 3)] }))

    expect(kids.map((k) => k.number)).toEqual([2, 3, 4, 5, 6])
    expect(kids.map((k) => k.tappedAt)).toEqual([...kids.map((k) => k.tappedAt)].sort((a, b) => a - b))
  })

  test('never celebrates: no moments, even crossing a milestone', () => {
    const ledger = setup()

    const deltas = ledger.apply({ type: 'backfill', rows: [row(NOW - 60 * MIN, 60)] })

    expect(deltas.filter((d) => d.type === 'kid.added').every((d) => d.moments.length === 0)).toBe(true)
  })

  test("refuses a row that hasn't started yet, and spreads a row in progress only up to now", () => {
    const ledger = setup()

    expect(() => ledger.apply({ type: 'backfill', rows: [row(NOW + MIN, 5)] })).toThrow(BadCommand)
    const kids = added(ledger.apply({ type: 'backfill', rows: [row(NOW - 5 * MIN, 5)] }))
    expect(kids.at(-1).tappedAt).toBeLessThan(NOW)
    expect(kids[0].tappedAt).toBe(NOW - 5 * MIN + 30_000) // 5 kids across the 5 minutes so far
  })

  test('removing a batch drops exactly its kids, and adding again works', () => {
    const ledger = setup()
    ledger.apply(tap('live-kid', { tappedAt: NOW - 1_000 }))
    ledger.apply({ type: 'backfill', rows: [row(NOW - 60 * MIN, 4)] })
    const [batch] = ledger.batches()

    const deltas = ledger.apply({ type: 'removeBatch', batchId: batch.id })

    expect(deltas.map((d) => d.type)).toEqual(['kids.removed'])
    expect(deltas[0].kidIds).toHaveLength(4)
    expect(ledger.snapshot().kids.map((k) => k.id)).toEqual(['live-kid'])
    expect(ledger.batches()).toEqual([])
    expect(added(ledger.apply({ type: 'backfill', rows: [row(NOW - 60 * MIN, 2)] }))).toHaveLength(2)
    expect(ledger.snapshot().kids).toHaveLength(3)
  })

  test('refuses an empty or nonsense batch', () => {
    const ledger = setup()

    expect(() => ledger.apply({ type: 'backfill', rows: [] })).toThrow(BadCommand)
    expect(() => ledger.apply({ type: 'backfill', rows: [row(NOW - 60 * MIN, -2)] })).toThrow(BadCommand)
    expect(() => ledger.apply({ type: 'backfill', rows: [row(NOW - 60 * MIN, 0)] })).toThrow(BadCommand)
  })
})

describe('new costume alert', () => {
  test('a costume created live with Catch-up N announces itself ×(N+1)', () => {
    const ledger = openLedger(new Database(':memory:'), { ghostSeed })
    for (const id of ['a', 'b', 'c']) ledger.apply(tap(id))

    const [added] = ledger.apply(catchUp('door', 3, { tag: { name: 'Wednesday', emoji: '🖤' } }))

    expect(added).toMatchObject({ type: 'tag.added', newCostume: { name: 'Wednesday', emoji: '🖤', count: 4 } })
  })

  test("a costume preset created in Setup doesn't", () => {
    const ledger = openLedger(new Database(':memory:'), { ghostSeed })

    const [added] = ledger.apply({ type: 'createTag', eventId: ledger.snapshot().event.id, name: 'Witch', emoji: '🧙' })

    expect(added.newCostume).toBeUndefined()
  })

  test('with the new-trend switch off, there is no alert', () => {
    const ledger = openLedger(new Database(':memory:'), { ghostSeed, switches: { newTrendAlert: false } })

    const [added] = ledger.apply(catchUp('door', 0))

    expect(added.newCostume).toBeUndefined()
  })
})

describe('soundboard', () => {
  const board = [1, 2, 3, 4, 5, 6].map((n) => ({ label: `Sound ${n}`, file: `board-${n}.mp3` }))
  function setup(config = {}) {
    let clockMs = 1_000_000
    const ledger = openLedger(new Database(':memory:'), { ghostSeed, soundboard: board, now: () => clockMs, ...config })
    return { ledger, wait: (ms) => (clockMs += ms) }
  }

  test('a press plays its slot on the TV; the labels come from the config file', () => {
    const { ledger } = setup()

    expect(ledger.snapshot().settings.soundboard.map((s) => s.label)).toEqual(['Sound 1', 'Sound 2', 'Sound 3', 'Sound 4', 'Sound 5', 'Sound 6'])
    expect(ledger.apply({ type: 'soundboard', slot: 3 })).toMatchObject([{ type: 'soundboard', slot: 3, label: 'Sound 3' }])
  })

  test('one 3 s cooldown across every button and every phone', () => {
    const { ledger, wait } = setup()
    ledger.apply({ type: 'soundboard', slot: 1 })

    wait(1_000)
    expect(ledger.apply({ type: 'soundboard', slot: 4 })).toEqual([])
    wait(1_999)
    expect(ledger.apply({ type: 'soundboard', slot: 2 })).toEqual([])
    wait(1)
    expect(ledger.apply({ type: 'soundboard', slot: 2 })).toHaveLength(1)
  })

  test('refuses slots outside 1–6, and everything with the switch off', () => {
    expect(() => setup().ledger.apply({ type: 'soundboard', slot: 7 })).toThrow(BadCommand)
    const off = setup({ switches: { soundboard: false } })
    expect(() => off.ledger.apply({ type: 'soundboard', slot: 1 })).toThrow(BadCommand)
  })
})

describe('golden winners for the pumpkin patch', () => {
  test('a winner is marked golden on its delta and in the snapshot; nobody else is', () => {
    let clockMs = 1_000_000_000
    const ledger = openLedger(new Database(':memory:'), {
      ghostSeed: { name: 'Tiny 2025', buckets: [{ start: '18:00', end: '18:30', count: 30 }] },
      random: () => 0, // the single ticket lands on #3
      now: () => clockMs,
    })
    const [{ event }] = ledger.apply({ type: 'createEvent', name: 'Night' })
    ledger.apply({ type: 'settings', eventId: event.id, raceAgainstId: ledger.snapshot().ghost.eventId, goldenCount: 1 })
    ledger.apply({ type: 'goLive', eventId: event.id })

    const deltas = ['a', 'b', 'c', 'd'].map((id) => ledger.apply(tap(id, { tappedAt: clockMs }))[0])

    expect(deltas.map((d) => d.kid.golden)).toEqual([false, false, true, false])
    expect(ledger.snapshot().kids.map((k) => k.golden)).toEqual([false, false, true, false])
  })
})
