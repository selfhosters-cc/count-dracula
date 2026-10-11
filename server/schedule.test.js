import { afterEach, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openLedger } from './ledger.js'
import { startServer } from './app.js'
import { readFrames } from '../test/sse.js'

const at = (iso) => Date.parse(iso)
const MINUTE = 60_000

function ledgerAt(iso, config = {}) {
  const clock = { now: at(iso) }
  const ledger = openLedger(new Database(':memory:'), { now: () => clock.now, ...config })
  return { clock, ledger }
}

const signUp = (ledger, timeZone, name = 'House') => ledger.household(ledger.createHousehold({ displayName: name, timeZone }))
// The door's Event: what the Household's TV and phones show.
const live = (house) => house.doorEvent()
const byName = (house, name) => house.events().find((e) => e.name === name)
// The Households a tick took live (it may also end and close other nights).
const wentLive = (done) => done.filter((t) => t.deltas.some((d) => d.type === 'door.changed' && d.door != null)).map((t) => t.householdId)

describe('sign-up makes "Halloween 2026"', () => {
  test('not live, with the starter costumes, 5 golden tickets, no ghost, going live Oct 31 at 4:00 pm in its zone', () => {
    const { ledger } = ledgerAt('2026-10-12T15:00:00Z')

    const house = signUp(ledger, 'America/Toronto')

    const night = byName(house, 'Halloween 2026')
    expect(night).toMatchObject({ state: 'upcoming', goldenCount: 5, raceAgainstId: null, goesLiveAt: at('2026-10-31T16:00:00-04:00') })
    expect(night.tags.map((t) => t.name)).toEqual(byName(house, 'Test night').tags.map((t) => t.name))
    expect(live(house)).toMatchObject({ name: 'Test night', state: 'live' })
  })

  test('after that moment, "Halloween 2026" is live at once and the Test night is made but Upcoming', () => {
    const { ledger } = ledgerAt('2026-10-31T21:30:00Z') // 5:30 pm in Toronto

    const house = signUp(ledger, 'America/Toronto')

    expect(live(house).name).toBe('Halloween 2026')
    expect(byName(house, 'Test night')).toMatchObject({ state: 'upcoming' })
    expect(byName(house, 'Halloween 2026').goesLiveAt).toBeNull()
    expect(house.tickets(live(house).id)).toEqual([]) // no ghost and no Expected kids: nothing to draw from
  })
})

describe('the minute tick: going live', () => {
  test('each Household goes live at its own 4:00 pm', () => {
    const { clock, ledger } = ledgerAt('2026-10-31T01:00:00Z') // 9 pm Oct 30 in Toronto, 2 pm Oct 31 in Auckland
    const toronto = signUp(ledger, 'America/Toronto', 'Toronto')
    const auckland = signUp(ledger, 'Pacific/Auckland', 'Auckland')

    clock.now = at('2026-10-31T02:59:00Z') // 3:59 pm in Auckland (NZDT, UTC+13)
    expect(ledger.tick()).toEqual([])
    clock.now = at('2026-10-31T03:00:00Z')
    const first = ledger.tick()
    expect(first.map((t) => t.householdId)).toEqual([auckland.id])
    expect(first[0].deltas.map((d) => d.type)).toContain('door.changed')
    expect(live(auckland).name).toBe('Halloween 2026')
    expect(byName(auckland, 'Test night').state).toBe('live') // Go live never changes another Event
    expect(live(toronto).name).toBe('Test night')

    clock.now = at('2026-10-31T20:00:00Z') // 4:00 pm in Toronto (EDT, UTC-4); 9:00 am Nov 1 in Auckland
    expect(wentLive(ledger.tick())).toEqual([toronto.id])
    expect(live(toronto).name).toBe('Halloween 2026')
    expect(byName(toronto, 'Test night').state).toBe('past') // ended at 3 am, Past at noon
    expect(wentLive(ledger.tick())).toEqual([]) // once
  })

  test('a changed Goes live at is honoured, and a cleared one never fires', () => {
    const { clock, ledger } = ledgerAt('2026-10-20T12:00:00Z')
    const early = signUp(ledger, 'America/Toronto', 'Early')
    const never = signUp(ledger, 'America/Toronto', 'Never')
    early.apply({ type: 'settings', eventId: byName(early, 'Halloween 2026').id, goesLiveAt: at('2026-10-30T22:00:00Z') }) // Friday the 30th
    never.apply({ type: 'settings', eventId: byName(never, 'Halloween 2026').id, goesLiveAt: null })

    clock.now = at('2026-10-30T22:00:00Z')
    ledger.tick()
    expect(live(early).name).toBe('Halloween 2026')
    clock.now = at('2026-11-02T12:00:00Z')
    ledger.tick()
    expect(byName(never, 'Halloween 2026').state).toBe('upcoming')
  })

  test("Goes live at can't be set on a live or past Event, and must be a time", () => {
    const { ledger } = ledgerAt('2026-10-20T12:00:00Z')
    const house = signUp(ledger, 'America/Toronto')

    expect(() => house.apply({ type: 'settings', eventId: live(house).id, goesLiveAt: at('2026-10-31T20:00:00Z') })).toThrow()
    expect(() => house.apply({ type: 'settings', eventId: byName(house, 'Halloween 2026').id, goesLiveAt: 'soon' })).toThrow()
  })

  test('going live early clears the time, so the tick does nothing later', () => {
    const { clock, ledger } = ledgerAt('2026-10-20T12:00:00Z')
    const house = signUp(ledger, 'America/Toronto')
    const night = byName(house, 'Halloween 2026')
    house.apply({ type: 'goLive', eventId: night.id })
    const [{ event: other }] = house.apply({ type: 'createEvent', name: 'Party' })

    clock.now = at('2026-10-31T20:00:00Z')

    expect(wentLive(ledger.tick())).toEqual([])
    expect(byName(house, 'Halloween 2026')).toMatchObject({ goesLiveAt: null, state: 'past' }) // its own 3 am and noon, long ago
    expect(other).toBeTruthy()
  })
})

describe('the minute tick: the 3:00 am safety net', () => {
  test('ends a live night at 3:00 am local the next morning, across the Nov 1 DST change, and expires its tickets', () => {
    const { clock, ledger } = ledgerAt('2026-10-20T12:00:00Z')
    const house = signUp(ledger, 'America/Toronto')
    house.apply({ type: 'settings', eventId: byName(house, 'Halloween 2026').id, expectedKids: 100 })
    clock.now = at('2026-10-31T20:00:00Z')
    ledger.tick()
    expect(house.tickets(live(house).id).every((t) => t.state === 'hidden')).toBe(true)

    clock.now = at('2026-11-01T07:59:00Z') // 2:59 am EST: the clocks went back at 2:00 am EDT
    expect(ledger.tick()).toEqual([])
    clock.now = at('2026-11-01T08:00:00Z') // 3:00 am EST
    const [{ deltas }] = ledger.tick()

    expect(deltas.map((d) => d.type)).toEqual(['event.ended'])
    expect(live(house)).toMatchObject({ name: 'Halloween 2026', ended: true, endedAutomatically: true })
    expect(house.tickets(live(house).id).every((t) => t.state === 'expired')).toBe(true)
    expect(ledger.tick()).toEqual([])
  })

  test('ends a Test night too, by name, but never a night already ended by hand', () => {
    const { clock, ledger } = ledgerAt('2026-10-20T20:00:00Z')
    const testing = signUp(ledger, 'America/Toronto', 'Testing')
    const done = signUp(ledger, 'America/Toronto', 'Done')
    const [{ event }] = done.apply({ type: 'createEvent', name: 'Practice' })
    done.apply({ type: 'goLive', eventId: event.id })
    done.apply({ type: 'end', eventId: event.id, stamp: byName(done, 'Practice').wentLiveAt })

    clock.now = at('2026-10-21T12:00:00Z') // 8 am: past 3 am, before noon

    expect(ledger.tick().map((t) => t.householdId)).toEqual([testing.id, done.id])
    expect(byName(testing, 'Test night')).toMatchObject({ state: 'ended', endedAutomatically: true })
    expect(byName(done, 'Test night')).toMatchObject({ state: 'ended', endedAutomatically: true })
    expect(byName(done, 'Practice')).toMatchObject({ state: 'ended', endedAutomatically: false })
  })
})

describe('the server runs the tick', () => {
  const running = []
  afterEach(() => running.splice(0).forEach((app) => app.stop()))

  function serverAt(dir, iso, tickMs) {
    const configPath = join(dir, 'config.json')
    writeFileSync(configPath, JSON.stringify({ dbPath: join(dir, 'db.sqlite') }))
    const clock = { now: at(iso) }
    const app = startServer({ configPath, port: 0, env: {}, now: () => clock.now, tickMs })
    running.push(app)
    return { app, clock }
  }

  test('a go-live missed while the server was down fires as it starts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'count-dracula-'))
    const db = new Database(join(dir, 'db.sqlite'), { create: true })
    const ledger = openLedger(db, { now: () => at('2026-10-20T12:00:00Z') })
    const id = ledger.createHousehold({ displayName: 'Asleep', timeZone: 'America/Toronto' })
    db.close()

    const { app } = serverAt(dir, '2026-10-31T23:00:00Z')

    expect(app.ledger.doorEvent(id).name).toBe('Halloween 2026')
  })

  test('a 3 am end missed while the server was down happens as it starts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'count-dracula-'))
    const db = new Database(join(dir, 'db.sqlite'), { create: true })
    const id = openLedger(db, { now: () => at('2026-10-31T21:00:00Z') }).createHousehold({ displayName: 'Late', timeZone: 'America/Toronto' }) // live at once
    db.close()

    const { app } = serverAt(dir, '2026-11-01T12:00:00Z')

    expect(app.ledger.doorEvent(id)).toMatchObject({ name: 'Halloween 2026', state: 'ended', endedAutomatically: true })
  })

  test('TVs and phones follow a go-live without a reload', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'count-dracula-'))
    const { app, clock } = serverAt(dir, '2026-10-31T19:59:00Z', 20)
    const house = app.ledger.household(app.ledger.createHousehold({ displayName: 'Ours', timeZone: 'America/Toronto' }))
    const controller = new AbortController()
    const tv = readFrames(await fetch(`${app.url}/api/stream?key=${house.tvToken()}`, { signal: controller.signal }))
    await tv.next()

    clock.now = at('2026-10-31T20:00:30Z')

    expect((await tv.next()).data.type).toBe('door.changed')
    controller.abort()
  })
})
