// v2.2 ticket 67: the night-card read, one batched Ledger read for a page that shows many nights at once
// (spec v2.2 §7). Its kids, top costume and peak agree with the share page's.
import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { openLedger } from './ledger.js'
import { nightFacts } from '../shared/summary.js'

const at = (iso) => Date.parse(iso)
const MINUTE = 60_000

function signedUp(iso = '2026-10-12T15:00:00Z', timeZone = 'America/Vancouver') {
  const clock = { now: at(iso) }
  const db = new Database(':memory:')
  const ledger = openLedger(db, { now: () => clock.now })
  const house = ledger.household(ledger.createHousehold({ displayName: 'The Smiths', timeZone }))
  return { clock, db, ledger, house }
}

const byName = (house, name) => house.events().find((e) => e.name === name)
const named = (house, id) => ({ eventId: id, stamp: house.events().find((e) => e.id === id).wentLiveAt })
const tagNamed = (house, id, name) => house.snapshot(id).tags.find((t) => t.name === name)

// "Halloween 2026" live at `iso`, with kids tapped at each of `taps` ([iso, costume name or null]), then ended.
function endedNight({ clock, house }, iso, taps) {
  const id = byName(house, 'Halloween 2026').id
  clock.now = at(iso)
  house.apply({ type: 'goLive', eventId: id })
  taps.forEach(([when, costume], i) => {
    clock.now = at(when)
    const tagId = costume ? tagNamed(house, id, costume).id : null
    house.apply({ type: 'tap', id: `k${i}`, tagId, tappedAt: clock.now, phoneName: 'Grandma', ...named(house, id) })
  })
  house.apply({ type: 'end', ...named(house, id) })
  return id
}

describe('an Ended night', () => {
  test("its kids, top costume and peak are the share page's, on a night past midnight", () => {
    const town = signedUp()
    const id = endedNight(town, '2026-11-01T06:30:00Z', [
      ['2026-11-01T06:40:00Z', 'Witch'], // 11:40 pm Oct 31, Vancouver
      ['2026-11-01T07:05:00Z', 'Vampire'], // 12:05 am
      ['2026-11-01T07:10:00Z', 'Vampire'],
      ['2026-11-01T07:20:00Z', null],
    ])

    const [card] = town.ledger.nightCards([id])
    const f = nightFacts(town.house.summary(id))

    expect(card).toMatchObject({ eventId: id, householdId: town.house.id, state: 'ended', countsOnly: false, kids: 4 })
    expect(card.kids).toBe(f.total)
    expect(card.topCostume).toEqual({ name: 'Vampire', emoji: '🧛', count: 2 })
    expect(card.peak).toBe('12:00–12:30')
    expect(card.peak).toBe(f.peakText)
  })

  test("in another time zone, still the share page's, with a Clock shift", () => {
    const town = signedUp('2026-10-12T03:00:00Z', 'Asia/Tokyo')
    const id = byName(town.house, 'Halloween 2026').id
    town.house.apply({ type: 'settings', eventId: id, clockShiftMs: 60 * MINUTE })
    const night = endedNight(town, '2026-10-31T09:00:00Z', [
      ['2026-10-31T09:10:00Z', 'Ghost'], // 6:10 pm Tokyo, 7:10 pm event time
      ['2026-10-31T09:50:00Z', 'Ghost'],
      ['2026-10-31T09:55:00Z', 'Ghost'],
      ['2026-10-31T10:20:00Z', 'Witch'],
    ])

    const [card] = town.ledger.nightCards([night])
    const f = nightFacts(town.house.summary(night))

    expect(card.peak).toBe('7:30–8:00')
    expect(card.peak).toBe(f.peakText)
    expect(card.topCostume).toEqual({ name: 'Ghost', emoji: '👻', count: 3 })
    expect([card.kids, card.topCostume.name]).toEqual([f.total, f.top.name])
    expect(card.date).toBe('2026-10-31')
  })
})

describe('the date', () => {
  test("is the go-live date in the Household's zone: 11:30 pm Oct 31 in Vancouver is Oct 31", () => {
    const town = signedUp()
    const id = endedNight(town, '2026-11-01T06:30:00Z', [['2026-11-01T06:40:00Z', 'Witch']])

    expect(town.ledger.nightCards([id])[0].date).toBe('2026-10-31')
  })

  test('is null on a night that never went live', () => {
    const { ledger, house } = signedUp()

    expect(ledger.nightCards([byName(house, 'Halloween 2026').id])[0]).toMatchObject({ state: 'upcoming', date: null })
  })
})

describe('vsLast', () => {
  const four = [
    ['2026-11-01T01:00:00Z', 'Witch'],
    ['2026-11-01T01:05:00Z', null],
    ['2026-11-01T01:10:00Z', null],
    ['2026-11-01T01:15:00Z', null],
  ]
  const race = (house, raceAgainstId) => house.apply({ type: 'settings', eventId: byName(house, 'Halloween 2026').id, raceAgainstId })

  test('is the signed gap to imported counts, never naming them', () => {
    const town = signedUp()
    race(town.house, town.house.addPastCounts({ name: 'Spooky 2024', buckets: [{ start: '18:00', end: '18:30', count: 3 }] }))
    const id = endedNight(town, '2026-11-01T00:00:00Z', four)

    const cards = town.ledger.nightCards([id])
    expect(cards[0].vsLast).toBe(1)
    expect(JSON.stringify(cards)).not.toContain('Spooky')
  })

  test('is the signed gap to an estimated past event', () => {
    const town = signedUp()
    town.house.apply({ type: 'setLastYear', total: 10 })
    const id = endedNight(town, '2026-11-01T00:00:00Z', four)

    expect(town.ledger.nightCards([id])[0].vsLast).toBe(-6)
  })

  test('is the signed gap to a real night, its removed kids left out', () => {
    const town = signedUp()
    const test = byName(town.house, 'Test night').id
    for (const kid of ['t1', 't2', 't3']) town.house.apply({ type: 'tap', id: kid, tagId: null, tappedAt: town.clock.now, phoneName: 'Dad', ...named(town.house, test) })
    town.house.apply({ type: 'remove', kidId: 't3', ...named(town.house, test) })
    town.house.apply({ type: 'end', ...named(town.house, test) })
    race(town.house, test)
    const id = endedNight(town, '2026-11-01T00:00:00Z', four)

    expect(town.ledger.nightCards([id])[0].vsLast).toBe(2)
  })

  test('is null racing None', () => {
    const town = signedUp()
    const id = endedNight(town, '2026-11-01T00:00:00Z', four)

    expect(town.ledger.nightCards([id])[0].vsLast).toBeNull()
  })
})

describe('eligible', () => {
  const oneKid = [['2026-11-01T01:00:00Z', 'Witch']]

  test('an Ended or Past night with a kid and a Location is, with no why', () => {
    const town = signedUp()
    town.house.apply({ type: 'setLocation', cell: 'c2b2q' })
    const id = endedNight(town, '2026-11-01T00:00:00Z', oneKid)

    expect(town.ledger.nightCards([id])[0]).toMatchObject({ eligible: true, why: null })
    town.house.apply({ type: 'close', eventId: id })
    expect(town.ledger.nightCards([id])[0]).toMatchObject({ state: 'past', eligible: true, why: null })
  })

  test('Upcoming and Live nights are not over', () => {
    const { ledger, house } = signedUp()
    house.apply({ type: 'setLocation', cell: 'c2b2q' })
    const live = byName(house, 'Test night').id
    house.apply({ type: 'tap', id: 'k', tagId: null, tappedAt: 1_000, phoneName: 'Dad', ...named(house, live) })

    expect(ledger.nightCards([byName(house, 'Halloween 2026').id, live]).map((c) => [c.state, c.eligible, c.why])).toEqual([
      ['upcoming', false, 'not-over'],
      ['live', false, 'not-over'],
    ])
  })

  test('imported and estimated counts are counts-only', () => {
    const { ledger, house } = signedUp()
    house.apply({ type: 'setLocation', cell: 'c2b2q' })
    const imported = house.addPastCounts({ name: 'Halloween 2024', buckets: [{ start: '18:00', end: '18:30', count: 3 }] })
    house.apply({ type: 'setLastYear', total: 10 })
    const estimated = house.events().find((e) => e.estimated).id

    expect(ledger.nightCards([imported, estimated]).map((c) => [c.countsOnly, c.eligible, c.why])).toEqual([
      [true, false, 'counts-only'],
      [true, false, 'counts-only'],
    ])
  })

  test('a night with no kids has none to show', () => {
    const town = signedUp()
    town.house.apply({ type: 'setLocation', cell: 'c2b2q' })
    const id = endedNight(town, '2026-11-01T00:00:00Z', [])

    expect(town.ledger.nightCards([id])[0]).toMatchObject({ kids: 0, topCostume: null, peak: null, eligible: false, why: 'no-kids' })
  })

  test('a Household with no Location has no place to show it', () => {
    const town = signedUp()
    const id = endedNight(town, '2026-11-01T00:00:00Z', oneKid)

    expect(town.ledger.nightCards([id])[0]).toMatchObject({ area: null, eligible: false, why: 'no-location' })
  })
})

describe('the Household on the card', () => {
  test('is read as it is now: its name, Area, time zone and Suspended', () => {
    const town = signedUp()
    town.house.apply({ type: 'setLocation', cell: 'c2b2q' })
    const id = endedNight(town, '2026-11-01T06:30:00Z', [['2026-11-01T06:40:00Z', 'Witch']])
    const card = () => town.ledger.nightCards([id])[0]

    expect(card()).toMatchObject({ name: 'The Smiths', area: 'c2b2', date: '2026-10-31', suspended: false })
    town.house.apply({ type: 'rename', displayName: 'The Joneses' })
    town.house.apply({ type: 'setLocation', cell: 'dpz83' })
    town.house.apply({ type: 'setTimeZone', timeZone: 'America/Toronto' })
    town.ledger.setSuspended(town.house.id, true)
    expect(card()).toMatchObject({ name: 'The Joneses', area: 'dpz8', date: '2026-11-01', suspended: true })
  })

  test('never carries the cell, an email or a phone name', () => {
    const town = signedUp()
    town.house.apply({ type: 'setLocation', cell: 'c2b2q' })
    const id = endedNight(town, '2026-11-01T00:00:00Z', [['2026-11-01T01:00:00Z', 'Witch']])

    const text = JSON.stringify(town.ledger.nightCards([id]))
    expect(text).not.toContain('c2b2q')
    expect(text).not.toContain('Grandma')
    expect(text).not.toContain('@')
  })
})

describe('the ids asked for', () => {
  test('give one card per Event that exists, in the order asked, across Households', () => {
    const a = signedUp()
    const b = a.ledger.household(a.ledger.createHousehold({ displayName: 'Next door', timeZone: 'America/Vancouver' }))
    const ours = byName(a.house, 'Test night').id
    const theirs = byName(b, 'Test night').id

    expect(a.ledger.nightCards([theirs, 9_999, ours, theirs]).map((c) => [c.eventId, c.householdId, c.name])).toEqual([
      [theirs, b.id, 'Next door'],
      [ours, a.house.id, 'The Smiths'],
    ])
    expect(a.ledger.nightCards([])).toEqual([])
  })

  test('500 Ended nights of 40 kids each read in one call well under 100 ms', () => {
    const { clock, db, ledger } = signedUp()
    // Only to set 20,000 kids up quickly: the kids table has no index on its Event, so each write scans it.
    // It's dropped before the read is timed, so the read is timed as a real database runs it.
    db.exec('CREATE INDEX fixture_kids ON kids (event_id)')
    const zones = ['America/Vancouver', 'America/Toronto', 'Europe/Berlin', 'Asia/Tokyo']
    const ids = []
    // 250 Households, each with its Test night and "Halloween 2026" counted and ended.
    for (let h = 0; h < 250; h++) {
      const house = ledger.household(ledger.createHousehold({ displayName: `House ${h}`, timeZone: zones[h % 4] }))
      house.apply({ type: 'setLocation', cell: 'c2b2q' })
      house.apply({ type: 'goLive', eventId: byName(house, 'Halloween 2026').id })
      for (const { id } of house.events()) {
        const night = named(house, id)
        const tags = house.snapshot(id).tags
        for (let k = 0; k < 4; k++) house.apply({ type: 'tap', id: `${id}-${k}`, tagId: tags[k].id, tappedAt: clock.now, phoneName: 'Dad', ...night })
        house.apply({ type: 'backfill', rows: [{ startMs: clock.now - 90 * MINUTE, endMs: clock.now, count: 36 }], ...night })
        house.apply({ type: 'end', ...night })
        ids.push(id)
      }
    }

    db.exec('DROP INDEX fixture_kids')
    ledger.nightCards(ids.slice(0, 5)) // warm the zones' offsets
    const started = performance.now()
    const cards = ledger.nightCards(ids)
    const took = performance.now() - started

    expect(cards).toHaveLength(500)
    expect(cards.every((c) => c.eligible && c.kids === 40)).toBe(true)
    expect(took).toBeLessThan(100)
  })
})
