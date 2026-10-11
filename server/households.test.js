import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BadCommand, openLedger } from './ledger.js'

const V1_DUMP = readFileSync(new URL('../test/fixtures/v1.sql', import.meta.url), 'utf8')

function v1Database() {
  const db = new Database(':memory:')
  db.exec(V1_DUMP)
  return db
}

describe('the Household #1 migration', () => {
  test("a v1 database becomes Household #1 with every night, tap and the TV mix", () => {
    const ledger = openLedger(v1Database(), {})

    const one = ledger.household(1)
    const snap = one.snapshot()
    expect(snap.event.name).toBe('Rehearsal')
    expect(snap.event.ended).toBe(true)
    expect(snap.kids.map((k) => k.id)).toContain('r4')
    expect(snap.kids).toHaveLength(56) // 57 rows, one removed
    expect(snap.ghost.total).toBe(346)
    expect(snap.settings.mix).toEqual({ volume: 0.4, mutes: { ambience: true, bloops: false, everything: false } })
    expect(snap.timeZone).toBe('America/Toronto')
    expect(one.joinKey()).toBe('NhLuiKG9MD')
    expect(one.events().map((e) => e.name)).toEqual(['Spare night', 'Rehearsal', 'Halloween 2025 (counts)'])
    expect(one.tickets(snap.event.id)).toHaveLength(5)
    expect(one.batches()).toHaveLength(1)
    expect(ledger.households().map((h) => ({ id: h.id, displayName: h.displayName }))).toEqual([{ id: 1, displayName: '' }])
  })

  test('runs once: opening the database again changes nothing', () => {
    const db = v1Database()
    const first = openLedger(db, {}).household(1)
    const before = { snap: first.snapshot(), events: first.events(), key: first.joinKey() }

    const again = openLedger(db, {})

    expect(again.households()).toHaveLength(1)
    const one = again.household(1)
    expect({ snap: one.snapshot(), events: one.events(), key: one.joinKey() }).toEqual(before)
    expect(db.query('PRAGMA user_version').get().user_version).toBeGreaterThanOrEqual(1)
  })

  test('a fresh database gets the v2 schema and no Household, no events', () => {
    const db = new Database(':memory:')

    const ledger = openLedger(db, {})

    expect(ledger.households()).toEqual([])
    expect(ledger.household(1)).toBeNull()
    expect(db.query('SELECT COUNT(*) AS n FROM events').get().n).toBe(0)
    expect(db.query('PRAGMA table_info(events)').all().map((c) => c.name)).toContain('household_id')
  })

  test('writes stay fast: synchronous is NORMAL beside WAL', () => {
    const db = new Database(join(mkdtempSync(join(tmpdir(), 'count-dracula-')), 'db.sqlite'), { create: true })

    openLedger(db, {})

    expect(db.query('PRAGMA journal_mode').get().journal_mode).toBe('wal')
    expect(db.query('PRAGMA synchronous').get().synchronous).toBe(1) // 1 = NORMAL
  })
})

function twoHouseholds() {
  const ledger = openLedger(new Database(':memory:'), {})
  const a = ledger.household(ledger.createHousehold({ displayName: 'The Smiths', timeZone: 'America/Toronto' }))
  const b = ledger.household(ledger.createHousehold({ displayName: 'Casa Ortiz', timeZone: 'America/Vancouver' }))
  return { ledger, a, b }
}

const tap = (id) => ({ type: 'tap', id, tagId: null, tappedAt: 1_000, phoneName: 'Dad' })

describe('create Household (sign-up)', () => {
  test('gives a live Rehearsal with the starter costumes, its own join key and no golden tickets', () => {
    const ledger = openLedger(new Database(':memory:'), { random: () => 0.5 })

    const id = ledger.createHousehold({ displayName: '  The Smiths ', timeZone: 'America/Vancouver' })

    const house = ledger.household(id)
    const snap = house.snapshot()
    expect(snap.event).toMatchObject({ name: 'Rehearsal', live: true, rehearsal: true, ended: false })
    expect(snap.tags.map((t) => `${t.emoji} ${t.name}`)).toContain('🎃 Other')
    expect(snap.tags.length).toBeGreaterThanOrEqual(6)
    expect(snap.timeZone).toBe('America/Vancouver')
    expect(house.tickets(snap.event.id)).toEqual([])
    expect(snap.golden).toEqual({ left: 0, nextIsGolden: false })
    expect(house.joinKey()).toMatch(/^[A-Za-z0-9]{8,}$/)
    expect(ledger.householdByJoinKey(house.joinKey())).toBe(id)
    expect(ledger.households()).toEqual([{ id, displayName: 'The Smiths', timeZone: 'America/Vancouver' }])
  })

  test('needs a name of at most 40 characters and a real time zone', () => {
    const ledger = openLedger(new Database(':memory:'), {})

    expect(() => ledger.createHousehold({ displayName: ' ', timeZone: 'America/Toronto' })).toThrow(BadCommand)
    expect(() => ledger.createHousehold({ displayName: 'x'.repeat(41), timeZone: 'America/Toronto' })).toThrow(BadCommand)
    expect(() => ledger.createHousehold({ displayName: 'Ok', timeZone: 'Mars/Olympus' })).toThrow(BadCommand)
    expect(ledger.households()).toEqual([])
  })
})

describe('two Households', () => {
  test('each has exactly one live Event, and Go live in one never touches the other', () => {
    const { a, b } = twoHouseholds()
    const [{ event }] = a.apply({ type: 'createEvent', name: 'Halloween 2026' })

    a.apply({ type: 'goLive', eventId: event.id })

    expect(a.events().filter((e) => e.live).map((e) => e.name)).toEqual(['Halloween 2026'])
    expect(b.events().filter((e) => e.live).map((e) => e.name)).toEqual(['Rehearsal'])
    expect(b.events().map((e) => e.name)).toEqual(['Rehearsal'])
  })

  test("keep their own taps, seq, join key and TV mix", () => {
    const { ledger, a, b } = twoHouseholds()

    a.apply(tap('a1'))
    a.apply(tap('a2'))
    const [delta] = b.apply(tap('b1'))
    b.apply({ type: 'mix', volume: 0.2, mutes: {} })

    expect(delta).toMatchObject({ seq: 1, kid: { number: 1 } })
    expect(a.snapshot().kids.map((k) => k.id)).toEqual(['a1', 'a2'])
    expect(b.snapshot().kids.map((k) => k.id)).toEqual(['b1'])
    expect(a.snapshot().settings.mix.volume).toBe(1)
    expect(a.joinKey()).not.toBe(b.joinKey())
    b.apply({ type: 'changeKey' })
    expect(ledger.householdByJoinKey(a.joinKey())).not.toBe(ledger.householdByJoinKey(b.joinKey()))
  })

  test("a command naming another Household's event, tag or kid is refused", () => {
    const { a, b } = twoHouseholds()
    const bEvent = b.snapshot().event
    const bTag = b.snapshot().tags[0]
    b.apply(tap('b1'))

    expect(() => a.apply({ type: 'goLive', eventId: bEvent.id })).toThrow(BadCommand)
    expect(() => a.apply({ type: 'settings', eventId: bEvent.id, name: 'Mine now' })).toThrow(BadCommand)
    expect(() => a.apply({ type: 'createTag', eventId: bEvent.id, name: 'Pirate' })).toThrow(BadCommand)
    expect(() => a.apply({ type: 'createEvent', name: 'Copy', copyTagsFrom: bEvent.id })).toThrow(BadCommand)
    expect(() => a.apply({ type: 'updateTag', tagId: bTag.id, name: 'Pirate' })).toThrow(BadCommand)
    expect(() => a.apply({ type: 'deleteTag', tagId: bTag.id })).toThrow(BadCommand)
    expect(a.apply({ type: 'remove', kidId: 'b1' })).toEqual([])
    expect(a.apply(tap('b1'))).toEqual([])
    expect(a.snapshot(bEvent.id)).toBeNull()
    expect(a.tickets(bEvent.id)).toEqual([])

    expect(b.snapshot().event.name).toBe('Rehearsal')
    expect(b.snapshot().tags[0]).toEqual(bTag)
    expect(b.snapshot().kids.map((k) => k.id)).toEqual(['b1'])
    expect(a.snapshot().kids).toEqual([])
  })
})

describe("the Household's time zone", () => {
  test("a ghost from a past night with taps, and its export, read in the Household's zone", () => {
    let nowMs = Date.parse('2025-10-31T17:50:00-07:00')
    const ledger = openLedger(new Database(':memory:'), { now: () => nowMs })
    const house = ledger.household(ledger.createHousehold({ displayName: 'Casa Ortiz', timeZone: 'America/Vancouver' }))
    const [{ event: last }] = house.apply({ type: 'createEvent', name: 'Halloween 2025' })
    house.apply({ type: 'goLive', eventId: last.id })
    house.apply({ ...tap('v1'), tappedAt: Date.parse('2025-10-31T17:50:00-07:00') })
    house.apply({ ...tap('v2'), tappedAt: Date.parse('2025-10-31T18:10:00-07:00') })
    const [{ event: tonight }] = house.apply({ type: 'createEvent', name: 'Halloween 2026' })
    house.apply({ type: 'settings', eventId: tonight.id, raceAgainstId: last.id })
    house.apply({ type: 'goLive', eventId: tonight.id })

    expect(house.snapshot().ghost.buckets).toEqual([
      { start: '17:50', end: '18:00', count: 1 },
      { start: '18:00', end: '18:30', count: 1 },
    ])
    expect(house.exportEvent(last.id)).toMatchObject({ name: 'Halloween 2025', timeZone: 'America/Vancouver' })
  })
})
