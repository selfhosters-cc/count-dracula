// v2.1 ticket 53: the minute tick across several open Events. Every Live Event auto-ends at its own first
// 3:00 am, by name; Goes live at makes room at the 3-open cap by closing the oldest Ended Event, or waits
// while all 3 are Live; and what the tick did is noted on the Event it touched (spec v2.1 §5).
import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { openLedger } from './ledger.js'
import { zonedTime } from '../shared/night-maths.js'

const at = (iso) => Date.parse(iso)
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const ZONE = 'America/Toronto'
const CAP = 'End or close one of your live nights first'
const local = (date, hhmm) => zonedTime(date, hhmm, ZONE)

// Signed up on Oct 31 at 10:00 am: the Test night is Live, Halloween 2026 goes live at 4:00 pm.
function signedUp(iso = '2026-10-31T14:00:00Z') {
  const clock = { now: at(iso) }
  const db = new Database(':memory:')
  const config = { now: () => clock.now }
  const ledger = openLedger(db, config)
  const house = ledger.household(ledger.createHousehold({ displayName: 'House', timeZone: ZONE }))
  return { clock, db, config, ledger, house }
}

const byName = (house, name) => house.events().find((e) => e.name === name)
const stateOf = (house, name) => byName(house, name).state
const noteOf = (house, name) => byName(house, name).note
const make = (house, name) => house.apply({ type: 'createEvent', name })[0].event.id
const goLive = (house, id) => house.apply({ type: 'goLive', eventId: id })
const named = (house, id) => ({ eventId: id, stamp: house.events().find((e) => e.id === id).wentLiveAt })
const end = (house, name) => house.apply({ type: 'end', ...named(house, byName(house, name).id) })

// The Test night plus A and B, all Live: the cap.
function threeLive(clock, house) {
  clock.now = local('2026-10-31', '11:00')
  goLive(house, make(house, 'A'))
  clock.now = local('2026-10-31', '12:00')
  goLive(house, make(house, 'B'))
}

describe('the 3:00 am auto-end: every Live Event', () => {
  test('Live Events with different go-live times each end at their own first 3:00 am, by name, across the Nov 1 DST change', () => {
    const { clock, ledger, house } = signedUp('2026-10-31T22:00:00Z') // 6 pm EDT: Halloween is Live at once
    const halloween = byName(house, 'Halloween 2026').id
    const late = make(house, 'Late')
    const morning = make(house, 'Morning')
    clock.now = at('2026-11-01T05:30:00Z') // 1:30 am EDT, before the clocks go back
    goLive(house, late)

    clock.now = at('2026-11-01T07:59:00Z') // 2:59 am EST
    expect(ledger.tick()).toEqual([])
    clock.now = at('2026-11-01T08:00:00Z') // 3:00 am EST
    expect(ledger.tick().flatMap((t) => t.deltas).map((d) => [d.type, d.eventId])).toEqual([
      ['event.ended', halloween],
      ['event.ended', late],
    ])

    clock.now = local('2026-11-01', '03:30')
    goLive(house, morning)
    clock.now = local('2026-11-01', '12:00')
    ledger.tick() // the two ended ones go Past
    clock.now = local('2026-11-02', '02:59')
    expect(ledger.tick()).toEqual([])
    expect(stateOf(house, 'Morning')).toBe('live')
    clock.now = local('2026-11-02', '03:00')
    expect(ledger.tick().flatMap((t) => t.deltas).map((d) => [d.type, d.eventId])).toEqual([['event.ended', morning]])
    expect(byName(house, 'Morning')).toMatchObject({ state: 'ended', endedAutomatically: true })
  })

  test('notes the auto-end until Resume', () => {
    const { clock, ledger, house } = signedUp()
    expect(noteOf(house, 'Test night')).toBeNull()
    clock.now = local('2026-11-01', '03:00')
    ledger.tick()

    expect(noteOf(house, 'Test night')).toEqual({ kind: 'autoEnded', at: local('2026-11-01', '03:00') })
    expect(noteOf(house, 'Halloween 2026')).toBeNull() // went live at 4 pm by itself: nothing to say

    house.apply({ type: 'resume', ...named(house, byName(house, 'Test night').id) })
    expect(noteOf(house, 'Test night')).toBeNull()
  })

  test('drops the auto-end note at Past', () => {
    const { clock, ledger, house } = signedUp()
    clock.now = local('2026-11-01', '03:00')
    ledger.tick()
    clock.now = local('2026-11-01', '12:00')
    ledger.tick()

    expect(byName(house, 'Test night')).toMatchObject({ state: 'past', endedAutomatically: true, note: null })
  })
})

describe('Goes live at, at the 3-open cap', () => {
  test('with 2 Live and 1 Ended, Halloween\'s 4 pm closes the Ended one (with its note) and goes live', () => {
    const { clock, ledger, house } = signedUp()
    threeLive(clock, house)
    clock.now = local('2026-10-31', '15:00')
    end(house, 'A')

    clock.now = local('2026-10-31', '16:00')
    const done = ledger.tick()

    expect(done).toHaveLength(1)
    expect(done[0].deltas.map((d) => d.type)).toEqual(['door.changed']) // one switch, not two
    expect(done[0].deltas[0].door).toBe(byName(house, 'Halloween 2026').id)
    expect(['Test night', 'A', 'B', 'Halloween 2026'].map((n) => stateOf(house, n))).toEqual(['live', 'past', 'live', 'live'])
    expect(noteOf(house, 'A')).toEqual({ kind: 'closedForRoom', at: local('2026-10-31', '16:00'), for: 'Halloween 2026' })
    expect(noteOf(house, 'Halloween 2026')).toBeNull()
  })

  test('closes the oldest Ended Event, by when it went live', () => {
    const { clock, ledger, house } = signedUp()
    threeLive(clock, house)
    clock.now = local('2026-10-31', '15:00')
    end(house, 'B') // ended first, but went live after the Test night
    end(house, 'Test night')

    clock.now = local('2026-10-31', '16:00')
    ledger.tick()

    expect(['Test night', 'A', 'B'].map((n) => stateOf(house, n))).toEqual(['past', 'live', 'ended'])
    expect(noteOf(house, 'Test night').kind).toBe('closedForRoom')
  })

  test('the closed-to-make-room note stays 24 hours', () => {
    const { clock, ledger, house } = signedUp()
    threeLive(clock, house)
    end(house, 'A')
    clock.now = local('2026-10-31', '16:00')
    ledger.tick()

    clock.now = local('2026-10-31', '16:00') + 24 * HOUR - 1
    expect(noteOf(house, 'A').kind).toBe('closedForRoom')
    clock.now = local('2026-10-31', '16:00') + 24 * HOUR
    expect(noteOf(house, 'A')).toBeNull()
  })

  test('with 3 Live, Halloween waits (with its note) and goes live on the tick after one is ended', () => {
    const { clock, ledger, house } = signedUp()
    threeLive(clock, house)

    clock.now = local('2026-10-31', '16:00')
    expect(ledger.tick()).toEqual([])
    expect(stateOf(house, 'Halloween 2026')).toBe('upcoming')
    const waiting = { kind: 'waiting', at: local('2026-10-31', '16:00') }
    expect(noteOf(house, 'Halloween 2026')).toEqual(waiting)
    clock.now = local('2026-10-31', '16:10')
    expect(ledger.tick()).toEqual([])
    expect(noteOf(house, 'Halloween 2026')).toEqual(waiting) // still from 4:00 pm

    // A Manager's Go live at the cap is still refused: the make-room rule is only the tick's.
    expect(() => goLive(house, byName(house, 'Halloween 2026').id)).toThrow(CAP)

    clock.now = local('2026-10-31', '17:00')
    end(house, 'B')
    clock.now = local('2026-10-31', '17:01')
    const [{ deltas }] = ledger.tick()

    expect(deltas.map((d) => d.type)).toEqual(['door.changed'])
    expect(['Test night', 'A', 'B', 'Halloween 2026'].map((n) => stateOf(house, n))).toEqual(['live', 'live', 'past', 'live'])
    expect(noteOf(house, 'Halloween 2026')).toBeNull()
    expect(noteOf(house, 'B')).toEqual({ kind: 'closedForRoom', at: local('2026-10-31', '17:01'), for: 'Halloween 2026' })
  })

  test('a waiting Event goes live on the tick after one is closed, with nothing more closed', () => {
    const { clock, ledger, house } = signedUp()
    threeLive(clock, house)
    clock.now = local('2026-10-31', '16:00')
    ledger.tick()

    end(house, 'A')
    house.apply({ type: 'close', eventId: byName(house, 'A').id })
    clock.now = local('2026-10-31', '16:01')
    ledger.tick()

    expect(stateOf(house, 'Halloween 2026')).toBe('live')
    expect(noteOf(house, 'A')).toBeNull() // closed by hand
  })

  test('a Manager going live on the waiting Event, once there\'s room, clears its note', () => {
    const { clock, ledger, house } = signedUp()
    threeLive(clock, house)
    clock.now = local('2026-10-31', '16:00')
    ledger.tick()
    end(house, 'A')
    house.apply({ type: 'close', eventId: byName(house, 'A').id })

    goLive(house, byName(house, 'Halloween 2026').id)

    expect(noteOf(house, 'Halloween 2026')).toBeNull()
  })

  test('a missed tick catches up after a restart: the auto-ends first, then the go-live makes room', () => {
    const { clock, db, config, house } = signedUp()
    threeLive(clock, house)

    clock.now = local('2026-11-01', '08:00') // down from before 4 pm until morning: past 3 am, before noon
    const again = openLedger(db, config)
    again.tick()
    const back = again.household(house.id)

    expect(['Test night', 'A', 'B', 'Halloween 2026'].map((n) => stateOf(back, n))).toEqual(['past', 'ended', 'ended', 'live'])
    expect(noteOf(back, 'Test night')).toMatchObject({ kind: 'closedForRoom', for: 'Halloween 2026' })
    expect(noteOf(back, 'A').kind).toBe('autoEnded')
    expect(noteOf(back, 'Halloween 2026')).toBeNull() // it never had to wait
    expect(again.doorEvent(house.id).name).toBe('Halloween 2026')
  })

  test('after a restart past noon, every missed night is Past and the go-live needs no room', () => {
    const { clock, db, config, house } = signedUp()
    threeLive(clock, house)

    clock.now = local('2026-11-01', '17:00')
    const again = openLedger(db, config)
    again.tick()
    const back = again.household(house.id)

    expect(['Test night', 'A', 'B', 'Halloween 2026'].map((n) => stateOf(back, n))).toEqual(['past', 'past', 'past', 'live'])
    expect(['Test night', 'A', 'B', 'Halloween 2026'].map((n) => noteOf(back, n))).toEqual([null, null, null, null])
  })
})

describe('setting Goes live at', () => {
  test("can't be set on an open Event", () => {
    const { clock, house } = signedUp()
    threeLive(clock, house)
    end(house, 'A')

    for (const name of ['Test night', 'A']) {
      expect(() => house.apply({ type: 'settings', eventId: byName(house, name).id, goesLiveAt: local('2026-11-05', '16:00') })).toThrow()
    }
  })

  test("can't be set to a time in the past", () => {
    const { house } = signedUp()
    const halloween = byName(house, 'Halloween 2026').id

    expect(() => house.apply({ type: 'settings', eventId: halloween, goesLiveAt: local('2026-10-31', '09:00') })).toThrow('still ahead')
    expect(byName(house, 'Halloween 2026').goesLiveAt).toBe(local('2026-10-31', '16:00'))
    house.apply({ type: 'settings', eventId: halloween, goesLiveAt: local('2026-10-31', '18:00') })
    expect(byName(house, 'Halloween 2026').goesLiveAt).toBe(local('2026-10-31', '18:00'))
  })

  test("saving a waiting Event's other settings keeps its time and its note; a new time ends the wait", () => {
    const { clock, ledger, house } = signedUp()
    threeLive(clock, house)
    clock.now = local('2026-10-31', '16:00')
    ledger.tick()
    const halloween = byName(house, 'Halloween 2026')

    // /setup's form sends the unchanged (now past) time along with everything else.
    house.apply({ type: 'settings', eventId: halloween.id, name: 'Halloween!', goesLiveAt: halloween.goesLiveAt })
    expect(noteOf(house, 'Halloween!').kind).toBe('waiting')

    house.apply({ type: 'settings', eventId: halloween.id, goesLiveAt: local('2026-11-01', '16:00') })
    expect(noteOf(house, 'Halloween!')).toBeNull()
  })
})
