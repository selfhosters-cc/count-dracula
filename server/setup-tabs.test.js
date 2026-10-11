// v2.1 ticket 57: what /setup's tabs and night screens need from the Ledger. Delete's confirm is a typed name
// only when the Event has kids (spec v2.1 §3), and every Event row carries its golden tickets and, for imported
// counts, how many kids they counted.
import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { openLedger } from './ledger.js'
import { zonedTime } from '../shared/night-maths.js'

const ZONE = 'America/Toronto'
const local = (date, hhmm) => zonedTime(date, hhmm, ZONE)

function signedUp() {
  const clock = { now: local('2026-10-20', '12:00') }
  const ledger = openLedger(new Database(':memory:'), { now: () => clock.now, random: () => 0.5 })
  const house = ledger.household(ledger.createHousehold({ displayName: 'House', timeZone: ZONE }))
  return { clock, ledger, house }
}

const byName = (house, name) => house.events().find((e) => e.name === name)
const named = (house, id) => ({ eventId: id, stamp: house.events().find((e) => e.id === id).wentLiveAt })
let kidId = 0
const tap = (house, id, clock) => house.apply({ type: 'tap', ...named(house, id), id: `k${++kidId}`, tagId: null, tappedAt: clock.now })
const make = (house, name) => house.apply({ type: 'createEvent', name })[0].event.id

describe('Delete', () => {
  test('an Event with no kids is deleted with a plain confirm: no typed name', () => {
    const { house } = signedUp()
    const party = make(house, 'Party')

    house.apply({ type: 'deleteEvent', eventId: party })

    expect(byName(house, 'Party')).toBeUndefined()
  })

  test('an Ended Event that never counted a kid needs no typed name either', () => {
    const { house } = signedUp()
    const test_ = byName(house, 'Test night').id
    house.apply({ type: 'end', ...named(house, test_) })

    house.apply({ type: 'deleteEvent', eventId: test_ })

    expect(byName(house, 'Test night')).toBeUndefined()
  })

  test('an Event with kids needs its name typed', () => {
    const { clock, house } = signedUp()
    const test_ = byName(house, 'Test night').id
    tap(house, test_, clock)
    house.apply({ type: 'end', ...named(house, test_) })

    expect(() => house.apply({ type: 'deleteEvent', eventId: test_ })).toThrow('Type "Test night" to delete it')
    expect(() => house.apply({ type: 'deleteEvent', eventId: test_, confirm: 'test night' })).toThrow('Type "Test night" to delete it')
    house.apply({ type: 'deleteEvent', eventId: test_, confirm: 'Test night' })
    expect(byName(house, 'Test night')).toBeUndefined()
  })

  test("imported counts are kids too: their name is typed", () => {
    const { house } = signedUp()
    const id = house.addPastCounts({ name: 'Halloween 2025', buckets: [{ start: '18:00', end: '18:30', count: 40 }] })

    expect(() => house.apply({ type: 'deleteEvent', eventId: id })).toThrow('Type "Halloween 2025" to delete it')
    house.apply({ type: 'deleteEvent', eventId: id, confirm: 'Halloween 2025' })
    expect(byName(house, 'Halloween 2025')).toBeUndefined()
  })

  test('still refused while Live, typed name or not', () => {
    const { house } = signedUp()

    expect(() => house.apply({ type: 'deleteEvent', eventId: byName(house, 'Test night').id, confirm: 'Test night' })).toThrow('End the night first')
  })
})

describe("an Event's row", () => {
  test('imported counts carry the kids they counted; every other Event has counted: null', () => {
    const { house } = signedUp()
    house.addPastCounts({ name: 'Halloween 2025', buckets: [{ start: '18:00', end: '18:30', count: 40 }, { start: '18:30', end: '19:00', count: 2 }] })

    expect(byName(house, 'Halloween 2025')).toMatchObject({ countsOnly: true, kids: 0, counted: 42 })
    expect(byName(house, 'Test night').counted).toBeNull()
  })

  test('golden tickets: how many were drawn, won and are still to find', () => {
    const { clock, house } = signedUp()
    const halloween = byName(house, 'Halloween 2026').id
    house.apply({ type: 'settings', eventId: halloween, expectedKids: 100 })
    house.apply({ type: 'end', ...named(house, byName(house, 'Test night').id) })
    house.apply({ type: 'goLive', eventId: halloween })

    expect(byName(house, 'Halloween 2026').golden).toEqual({ drawn: 5, won: 0, left: 5 })
    expect(byName(house, 'Test night').golden).toEqual({ drawn: 0, won: 0, left: 0 })

    for (let k = 0; k < 80; k++) tap(house, halloween, clock)
    const { golden } = byName(house, 'Halloween 2026')
    expect(golden.won).toBeGreaterThan(0)
    expect(golden.won + golden.left).toBe(golden.drawn)
  })

  test('golden is null with the golden-tickets switch off', () => {
    const ledger = openLedger(new Database(':memory:'), { switches: { goldenTickets: false } })
    const house = ledger.household(ledger.createHousehold({ displayName: 'House', timeZone: ZONE }))

    expect(house.events().every((e) => e.golden === null)).toBe(true)
  })
})
