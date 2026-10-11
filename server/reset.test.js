// v2.1 ticket 54: Reset puts a Live or Ended Event back to Upcoming, as if it never went live (spec v2.1 §6).
// It clears the night (kids, tickets, summary, share links, the go-live stamp) and keeps its setup, Goes live
// at only while it's still ahead. Devices treat it as the Event leaving open: a tap under the old stamp is
// refused, even after a fresh Go live.
import { afterEach, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openLedger } from './ledger.js'
import { startServer } from './app.js'
import { zonedTime } from '../shared/night-maths.js'
import { fakeGoogle } from '../test/fake-google.js'
import { cookieOf, signIn } from '../test/sign-in.js'

const ZONE = 'America/Toronto'
const local = (date, hhmm) => zonedTime(date, hhmm, ZONE)

// Signed up on Oct 20 at noon: the Test night is Live, Halloween 2026 goes live Oct 31 at 4:00 pm.
// `randoms` feeds the golden-ticket draw, one value per ticket, in turn.
function signedUp({ date = '2026-10-20', hhmm = '12:00', randoms = null } = {}) {
  const clock = { now: local(date, hhmm) }
  const db = new Database(':memory:')
  let i = 0
  const ledger = openLedger(db, { now: () => clock.now, random: randoms ? () => randoms[i++ % randoms.length] : undefined })
  const house = ledger.household(ledger.createHousehold({ displayName: 'House', timeZone: ZONE }))
  return { clock, db, ledger, house }
}

const byName = (house, name) => house.events().find((e) => e.name === name)
const named = (house, id) => ({ eventId: id, stamp: house.events().find((e) => e.id === id).wentLiveAt })
let kidId = 0
const tap = (house, id, clock) => house.apply({ type: 'tap', ...named(house, id), id: `k${++kidId}`, tagId: null, tappedAt: clock.now })
const taps = (house, id, clock, n) => { for (let k = 0; k < n; k++) tap(house, id, clock) }
const reset = (house, id, extra = {}) => house.apply({ type: 'reset', eventId: id, ...extra })

// Halloween gone live early with Expected kids (so tickets are drawn), 3 kids, a backfill batch, Ended with a
// nearby slide, shared, reported, and resumed: Live, with everything a night can hold.
function busyHalloween(env) {
  const { clock, ledger, house } = env
  const halloween = byName(house, 'Halloween 2026').id
  house.apply({ type: 'settings', eventId: halloween, expectedKids: 100, clockShiftMs: 3_600_000 })
  house.apply({ type: 'goLive', eventId: halloween })
  taps(house, halloween, clock, 3)
  house.apply({ type: 'backfill', ...named(house, halloween), rows: [{ startMs: clock.now - 1_800_000, endMs: clock.now, count: 2 }] })
  house.apply({ type: 'end', ...named(house, halloween), nearby: { houses: 6, kids30: 5, topCostume: null } })
  const token = house.share(halloween)
  ledger.addReport({ householdId: house.id, eventId: halloween, reason: 'rude name' })
  house.apply({ type: 'resume', ...named(house, halloween) })
  return { halloween, token }
}

describe('Reset', () => {
  test('a Live Event with kids, tickets, a summary and a share link goes back to Upcoming with none of them', () => {
    const env = signedUp()
    const { db, ledger, house } = env
    const { halloween, token } = busyHalloween(env)
    const tagsBefore = byName(house, 'Halloween 2026').tags
    expect(house.tickets(halloween)).toHaveLength(5)
    expect(ledger.byShareToken(token)).not.toBeNull()

    reset(house, halloween)

    const after = byName(house, 'Halloween 2026')
    expect(after).toMatchObject({ state: 'upcoming', open: false, wentLiveAt: null, kids: 0, endedAutomatically: false, note: null })
    expect(after).toMatchObject({ expectedKids: 100, clockShiftMs: 3_600_000, goldenCount: 5, goesLiveAt: local('2026-10-31', '16:00') })
    expect(after.tags).toEqual(tagsBefore) // at 0: counts come from kids
    expect(house.tickets(halloween)).toEqual([])
    expect(house.summary(halloween)).toBeNull()
    expect(house.batches(halloween)).toEqual([])
    expect(ledger.byShareToken(token)).toBeNull()
    expect(house.shares()).toEqual([])
    expect(ledger.reports(house.id)).toMatchObject([{ eventId: halloween, reason: 'rude name' }])
    const row = db.query('SELECT summary_nearby, ended_automatically, tick_note FROM events WHERE id = ?').get(halloween)
    expect(row).toEqual({ summary_nearby: null, ended_automatically: 0, tick_note: null })
    for (const table of ['kids', 'backfill_batches', 'fired_moments', 'golden_tickets']) {
      expect(db.query(`SELECT COUNT(*) AS n FROM ${table} WHERE event_id = ?`).get(halloween).n).toBe(0)
    }
  })

  test('an auto-ended Event loses its note, and an Ended one with a summary resets too', () => {
    const { clock, ledger, house } = signedUp()
    const test = byName(house, 'Test night').id
    taps(house, test, clock, 2)
    clock.now = local('2026-10-21', '03:00')
    ledger.tick()
    expect(byName(house, 'Test night')).toMatchObject({ state: 'ended', endedAutomatically: true, note: { kind: 'autoEnded' } })

    reset(house, test)

    expect(byName(house, 'Test night')).toMatchObject({ state: 'upcoming', endedAutomatically: false, note: null, kids: 0 })
    expect(house.summary(test)).toBeNull()
  })

  test('Go live after a reset draws new golden numbers', () => {
    const env = signedUp({ randoms: [0, 0, 0, 0, 0, 0.999, 0.999, 0.999, 0.999, 0.999] })
    const { house } = env
    const halloween = byName(house, 'Halloween 2026').id
    house.apply({ type: 'settings', eventId: halloween, expectedKids: 100 })
    house.apply({ type: 'goLive', eventId: halloween })
    const first = house.tickets(halloween).map((t) => t.number)
    expect(first).toHaveLength(5)

    reset(house, halloween)
    house.apply({ type: 'goLive', eventId: halloween })

    const second = house.tickets(halloween)
    expect(second).toHaveLength(5)
    expect(second.every((t) => t.state === 'hidden' && t.kidId === null)).toBe(true)
    expect(second.map((t) => t.number)).not.toEqual(first)
  })

  test('a future Goes live at stays, and the reset Event goes live by itself then', () => {
    const env = signedUp()
    const { clock, ledger, house } = env
    const { halloween } = busyHalloween(env)

    reset(house, halloween)
    expect(byName(house, 'Halloween 2026').goesLiveAt).toBe(local('2026-10-31', '16:00'))

    clock.now = local('2026-10-31', '15:59')
    ledger.tick()
    expect(byName(house, 'Halloween 2026').state).toBe('upcoming')
    clock.now = local('2026-10-31', '16:00')
    ledger.tick()
    expect(byName(house, 'Halloween 2026')).toMatchObject({ state: 'live', kids: 0 })
  })

  test('a Goes live at that has passed is cleared, so the tick leaves it Upcoming', () => {
    const { clock, ledger, house } = signedUp({ date: '2026-10-31', hhmm: '10:00' })
    clock.now = local('2026-10-31', '16:00')
    ledger.tick()
    const halloween = byName(house, 'Halloween 2026')
    expect(halloween).toMatchObject({ state: 'live', goesLiveAt: local('2026-10-31', '16:00') }) // Go live keeps it
    clock.now = local('2026-10-31', '17:00')

    reset(house, halloween.id)

    expect(byName(house, 'Halloween 2026')).toMatchObject({ state: 'upcoming', goesLiveAt: null })
    clock.now = local('2026-10-31', '17:01')
    expect(ledger.tick()).toEqual([])
    expect(byName(house, 'Halloween 2026').state).toBe('upcoming')
  })

  test('a tap queued before the reset is refused even if Go live was pressed again before it arrives', () => {
    const { clock, house } = signedUp()
    const test = byName(house, 'Test night').id
    taps(house, test, clock, 2)
    const queued = named(house, test) // the phone's stamp, under the clock that doesn't move

    reset(house, test)
    house.apply({ type: 'goLive', eventId: test })

    expect(named(house, test).stamp).toBeGreaterThan(queued.stamp)
    expect(() => house.apply({ type: 'tap', ...queued, id: 'late', tagId: null, tappedAt: clock.now })).toThrow('gone live again')
    expect(byName(house, 'Test night').kids).toBe(0)
  })

  test('is refused on Upcoming and Past Events', () => {
    const { clock, house } = signedUp()
    const test = byName(house, 'Test night').id
    expect(() => reset(house, byName(house, 'Halloween 2026').id)).toThrow('Only a live or ended night can be reset')
    house.apply({ type: 'end', ...named(house, test) })
    house.apply({ type: 'close', eventId: test })
    expect(() => reset(house, test)).toThrow('Only a live or ended night can be reset')
    expect(() => reset(house, 9999)).toThrow('No such event')
    expect(clock).toBeTruthy()
  })

  test('above 20 kids it needs the Event’s name typed', () => {
    const { clock, house } = signedUp()
    const test = byName(house, 'Test night').id
    taps(house, test, clock, 21)

    expect(() => reset(house, test)).toThrow('Type "Test night" to reset it')
    expect(() => reset(house, test, { confirm: 'test night' })).toThrow('Type "Test night"')
    reset(house, test, { confirm: 'Test night' })
    expect(byName(house, 'Test night').kids).toBe(0)
  })

  test('20 kids need no typed name', () => {
    const { clock, house } = signedUp()
    const test = byName(house, 'Test night').id
    taps(house, test, clock, 20)
    reset(house, test)
    expect(byName(house, 'Test night').state).toBe('upcoming')
  })
})

describe('migration step 14', () => {
  test('a Household remembers its latest go-live stamp, so a reset Event never gets an old one back', () => {
    const db = new Database(':memory:')
    db.exec(readFileSync(new URL('../test/fixtures/v1.sql', import.meta.url), 'utf8'))
    const clock = { now: 1 } // a clock far behind every stamp
    const ledger = openLedger(db, { now: () => clock.now })
    const house = ledger.household(1)
    const rehearsal = byName(house, 'Rehearsal')
    expect(db.query('SELECT last_stamp FROM households WHERE id = 1').get().last_stamp).toBe(rehearsal.wentLiveAt)

    reset(house, rehearsal.id, { confirm: 'Rehearsal' })
    house.apply({ type: 'goLive', eventId: rehearsal.id })

    expect(byName(house, 'Rehearsal').wentLiveAt).toBe(rehearsal.wentLiveAt + 1)
  })
})

describe('what screens are told', () => {
  test('resetting the door’s Event moves the door: one door.changed, to the next open Event or to none', () => {
    const { clock, house } = signedUp()
    const test = byName(house, 'Test night').id
    const [{ event: party }] = house.apply({ type: 'createEvent', name: 'Party' })
    house.apply({ type: 'goLive', eventId: party.id })
    clock.now += 1000
    expect(house.doorEvent().id).toBe(party.id)

    expect(reset(house, party.id).map(({ seq, ...d }) => d)).toEqual([{ type: 'door.changed', eventId: null, door: test }])
    expect(reset(house, test).map(({ seq, ...d }) => d)).toEqual([{ type: 'door.changed', eventId: null, door: null }])
    expect(house.idleSnapshot().next).toMatchObject({ name: 'Halloween 2026' })
  })

  test('resetting another open Event tells its own screens, and the door’s if it races against it', () => {
    const { clock, house } = signedUp()
    const test = byName(house, 'Test night').id
    const [{ event: party }] = house.apply({ type: 'createEvent', name: 'Party' })
    taps(house, test, clock, 2)
    house.apply({ type: 'end', ...named(house, test) }) // only a night that's over is raced (spec v2.1 §7)
    house.apply({ type: 'settings', eventId: party.id, raceAgainstId: test })
    house.apply({ type: 'goLive', eventId: party.id })

    expect(reset(house, test).map(({ seq, ...d }) => d)).toEqual([
      { type: 'event.updated', eventId: test },
      { type: 'event.updated', eventId: party.id },
    ])
    expect(house.snapshot(party.id).ghost?.total ?? 0).toBe(0) // still racing it; its ghost is empty
    expect(byName(house, 'Party').raceAgainstId).toBe(test)
  })
})

describe('over HTTP', () => {
  const running = []
  afterEach(() => running.splice(0).forEach((app) => app.stop()))

  async function served() {
    const dir = mkdtempSync(join(tmpdir(), 'count-dracula-'))
    const configPath = join(dir, 'config.json')
    writeFileSync(configPath, JSON.stringify({ dbPath: join(dir, 'db.sqlite') }))
    const google = fakeGoogle()
    const app = startServer({ configPath, port: 0, google, env: {}, log: () => {} })
    running.push(app)
    const cookie = cookieOf(await signIn({ app, google }, { sub: 'a', email: 'a@example.com' }, { displayName: 'The Smiths' }))
    const info = await (await fetch(`${app.url}/api/household`, { headers: { Cookie: cookie } })).json()
    const house = app.ledger.household(info.id)
    const admin = (command, headers = { Cookie: cookie }) => fetch(`${app.url}/api/admin`, { method: 'POST', headers, body: JSON.stringify(command) })
    const phone = (path, body) => fetch(`${app.url}${path}`, { method: 'POST', headers: { 'X-Join-Key': info.joinKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return { app, info, house, admin, phone }
  }

  test('a Manager resets from Setup; a join key is refused; the phone’s old stamp then gets a 400', async () => {
    const { info, house, admin, phone } = await served()
    const live = house.doorEvent()
    const stale = { eventId: live.id, stamp: live.wentLiveAt }
    expect((await phone('/api/taps', { ...stale, id: 'k1', tagId: null, tappedAt: Date.now() })).status).toBe(200)

    expect((await admin({ type: 'reset', eventId: live.id }, { 'X-Join-Key': info.joinKey })).status).toBeGreaterThanOrEqual(400)
    expect(house.events().find((e) => e.id === live.id).state).toBe('live')

    const res = await admin({ type: 'reset', eventId: live.id })
    expect(res.status).toBe(200)
    expect((await res.json()).deltas).toMatchObject([{ type: 'door.changed', door: null }])
    expect((await admin({ type: 'goLive', eventId: live.id })).status).toBe(200)

    expect((await phone('/api/taps', { ...stale, id: 'k2', tagId: null, tappedAt: Date.now() })).status).toBe(400)
    expect(house.events().find((e) => e.id === live.id).kids).toBe(0)
  })
})
