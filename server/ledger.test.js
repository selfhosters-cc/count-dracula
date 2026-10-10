import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { openLedger } from './ledger.js'
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
    const ledger = openLedger(new Database(':memory:'), { ghostSeed })
    ledger.apply(tap('kid-a', { tappedAt: 5_000, phoneName: 'Mom' }))

    const snap = ledger.snapshot()

    expect(snap).toEqual({
      event: {
        id: expect.any(Number),
        name: 'Rehearsal',
        live: true,
        countsOnly: false,
      },
      tags: [],
      kids: [{ id: 'kid-a', number: 1, tagId: null, phoneName: 'Mom', tappedAt: 5_000, source: 'tap' }],
      ghost: {
        eventId: expect.any(Number),
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
