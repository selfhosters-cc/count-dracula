// v2.1 ticket 50: Upcoming → Live → Ended → Past, the 3-open cap, the door's Event, and commands that name
// their Event and its go-live stamp (spec v2.1 §3, §15).
import { afterEach, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BadCommand, openLedger } from './ledger.js'
import { startServer } from './app.js'
import { zonedTime } from '../shared/night-maths.js'
import { fakeGoogle } from '../test/fake-google.js'
import { cookieOf, signIn } from '../test/sign-in.js'

const at = (iso) => Date.parse(iso)
const MINUTE = 60_000
const CAP = 'End or close one of your live nights first'

function signedUp(iso = '2026-10-12T15:00:00Z', timeZone = 'America/Toronto', extra = {}) {
  const clock = { now: at(iso) }
  const db = new Database(':memory:')
  const config = { now: () => clock.now, ...extra }
  const ledger = openLedger(db, config)
  const house = ledger.household(ledger.createHousehold({ displayName: 'House', timeZone }))
  return { clock, db, config, ledger, house }
}

const byName = (house, name) => house.events().find((e) => e.name === name)
const stateOf = (house, name) => byName(house, name).state
const make = (house, name) => house.apply({ type: 'createEvent', name })[0].event.id
// What a door phone sends: the Event it shows and the go-live stamp it saw.
const named = (house, id) => ({ eventId: id, stamp: house.events().find((e) => e.id === id).wentLiveAt })
const goLive = (house, id) => house.apply({ type: 'goLive', eventId: id })
const tap = (id, extra = {}) => ({ type: 'tap', id, tagId: null, tappedAt: 1_000, phoneName: 'Dad', ...extra })

describe('sign-up', () => {
  test("its live starter is an ordinary Event named \"Test night\", with Halloween 2026 Upcoming", () => {
    const { ledger, house } = signedUp()

    expect(house.events().map((e) => [e.name, e.state])).toEqual([
      ['Halloween 2026', 'upcoming'],
      ['Test night', 'live'],
    ])
    expect(byName(house, 'Test night')).not.toHaveProperty('rehearsal')
    expect(ledger.doorEvent(house.id)).toMatchObject({ name: 'Test night', state: 'live' })
  })
})

describe('the 3-open cap', () => {
  test('two Events are Live at once, a third goes live, and a fourth is refused', () => {
    const { house } = signedUp()
    const a = make(house, 'A')
    const b = make(house, 'B')

    goLive(house, a)
    expect([stateOf(house, 'Test night'), stateOf(house, 'A')]).toEqual(['live', 'live'])
    goLive(house, b)
    expect(stateOf(house, 'B')).toBe('live')

    expect(() => goLive(house, byName(house, 'Halloween 2026').id)).toThrow(CAP)
    expect(stateOf(house, 'Halloween 2026')).toBe('upcoming')
  })

  test('an Ended Event still counts as open; closing it makes room', () => {
    const { house } = signedUp()
    const a = make(house, 'A')
    const b = make(house, 'B')
    goLive(house, a)
    goLive(house, b)
    house.apply({ type: 'end', ...named(house, a) })

    expect(() => goLive(house, byName(house, 'Halloween 2026').id)).toThrow(CAP)
    house.apply({ type: 'close', eventId: a })
    goLive(house, byName(house, 'Halloween 2026').id)

    expect(stateOf(house, 'Halloween 2026')).toBe('live')
    expect(stateOf(house, 'A')).toBe('past')
  })

  test('Upcoming and Past Events are uncapped', () => {
    const { house } = signedUp()
    for (let i = 0; i < 5; i++) make(house, `Night ${i}`)
    house.addPastCounts({ name: 'Old', buckets: [{ start: '18:00', end: '18:30', count: 3 }] })

    expect(house.events().filter((e) => e.state === 'upcoming')).toHaveLength(6)
  })
})

describe('Go live', () => {
  test('leaves every other Event exactly as it was: nothing is frozen', () => {
    const { clock, house } = signedUp()
    const a = make(house, 'A')
    goLive(house, a)
    house.apply({ type: 'end', ...named(house, a) })
    const b = make(house, 'B')
    const others = house.events().filter((e) => e.id !== b)

    clock.now += MINUTE
    const deltas = goLive(house, b)

    expect(house.events().filter((e) => e.id !== b)).toEqual(others)
    expect(stateOf(house, 'B')).toBe('live')
    expect(byName(house, 'B').wentLiveAt).toBe(clock.now)
    expect(deltas.map((d) => d.type)).toContain('door.changed')
  })

  test('stamps strictly later than any earlier go-live, even within one millisecond', () => {
    const { house } = signedUp()
    const a = make(house, 'A')
    const b = make(house, 'B')

    goLive(house, a)
    goLive(house, b)

    expect(byName(house, 'B').wentLiveAt).toBeGreaterThan(byName(house, 'A').wentLiveAt)
    expect(byName(house, 'A').wentLiveAt).toBeGreaterThan(byName(house, 'Test night').wentLiveAt)
  })

  test('is idempotent on an open Event, and refused on a Past one', () => {
    const { house } = signedUp()
    const test = byName(house, 'Test night').id

    expect(goLive(house, test)).toEqual([])
    house.apply({ type: 'end', ...named(house, test) })
    house.apply({ type: 'close', eventId: test })

    expect(() => goLive(house, test)).toThrow(BadCommand)
  })
})

describe('End, Resume and Close now', () => {
  test('End → Ended; Resume → Live with the same stamp; Close now → Past', () => {
    const { clock, house } = signedUp()
    const test = byName(house, 'Test night').id
    const stamp = byName(house, 'Test night').wentLiveAt

    house.apply({ type: 'end', eventId: test, stamp })
    expect(stateOf(house, 'Test night')).toBe('ended')
    clock.now += 10 * MINUTE
    house.apply({ type: 'resume', eventId: test, stamp })
    expect(byName(house, 'Test night')).toMatchObject({ state: 'live', wentLiveAt: stamp })

    expect(() => house.apply({ type: 'close', eventId: test })).toThrow(BadCommand) // Live: end it first
    house.apply({ type: 'end', eventId: test, stamp })
    house.apply({ type: 'close', eventId: test })
    expect(stateOf(house, 'Test night')).toBe('past')
  })

  test('Close now is refused for Upcoming and Past Events', () => {
    const { house } = signedUp()
    const halloween = byName(house, 'Halloween 2026').id
    const old = house.addPastCounts({ name: 'Old', buckets: [] })

    expect(() => house.apply({ type: 'close', eventId: halloween })).toThrow(BadCommand)
    expect(() => house.apply({ type: 'close', eventId: old })).toThrow(BadCommand)
    expect(() => house.apply({ type: 'close' })).toThrow(BadCommand)
  })

  test('a Past Event has a summary and is read-only', () => {
    const { house } = signedUp()
    const test = byName(house, 'Test night').id
    house.apply(tap('k1', named(house, test)))
    house.apply({ type: 'end', ...named(house, test) })
    house.apply({ type: 'close', eventId: test })

    expect(house.summary(test).kids).toHaveLength(1)
    expect(() => house.apply({ type: 'settings', eventId: test, name: 'Again' })).toThrow('Past events are read-only')
  })
})

describe('Ended → Past at noon the next day, local time', () => {
  for (const zone of ['America/Toronto', 'Pacific/Auckland']) {
    test(`in ${zone}`, () => {
      const { clock, house, ledger } = signedUp('2026-10-12T00:00:00Z', zone)
      const night = make(house, 'Practice')
      clock.now = zonedTime('2026-10-15', '19:00', zone)
      goLive(house, night)
      clock.now = zonedTime('2026-10-15', '21:00', zone)
      house.apply({ type: 'end', ...named(house, night) })

      clock.now = zonedTime('2026-10-16', '11:59', zone)
      ledger.tick()
      expect(stateOf(house, 'Practice')).toBe('ended')

      clock.now = zonedTime('2026-10-16', '12:00', zone)
      ledger.tick()
      expect(stateOf(house, 'Practice')).toBe('past')
    })
  }

  test('a night ended after midnight still goes Past at that day’s noon', () => {
    const { clock, house, ledger } = signedUp('2026-10-12T00:00:00Z')
    const night = make(house, 'Late one')
    clock.now = zonedTime('2026-10-15', '19:00', 'America/Toronto')
    goLive(house, night)
    clock.now = zonedTime('2026-10-16', '01:30', 'America/Toronto')
    house.apply({ type: 'end', ...named(house, night) })

    clock.now = zonedTime('2026-10-16', '12:00', 'America/Toronto')
    ledger.tick()

    expect(stateOf(house, 'Late one')).toBe('past')
  })

  test('after a restart, the first tick ends a night left Live and closes it, both missed', () => {
    const { clock, db, config, house } = signedUp('2026-10-12T00:00:00Z')
    const night = make(house, 'Forgotten')
    clock.now = zonedTime('2026-10-15', '19:00', 'America/Toronto')
    goLive(house, night)

    clock.now = zonedTime('2026-10-16', '14:00', 'America/Toronto')
    const again = openLedger(db, config)
    again.tick()

    expect(again.household(house.id).events().find((e) => e.id === night)).toMatchObject({ state: 'past', endedAutomatically: true })
  })

  test('an Ended night left over a restart goes Past on the first tick', () => {
    const { clock, db, config, house } = signedUp('2026-10-12T00:00:00Z', 'Pacific/Auckland')
    const night = make(house, 'Sleepy')
    clock.now = zonedTime('2026-10-15', '19:00', 'Pacific/Auckland')
    goLive(house, night)
    house.apply({ type: 'end', ...named(house, night) })

    clock.now = zonedTime('2026-10-17', '09:00', 'Pacific/Auckland')
    openLedger(db, config).tick()

    expect(stateOf(house, 'Sleepy')).toBe('past')
  })
})

describe("the door's Event", () => {
  test('is the open Event with the latest go-live stamp, and null with none open', () => {
    const { ledger, house } = signedUp()
    const test = byName(house, 'Test night').id
    const a = make(house, 'A')
    const b = make(house, 'B')

    goLive(house, a)
    expect(ledger.doorEvent(house.id).name).toBe('A')
    goLive(house, b)
    expect(ledger.doorEvent(house.id).name).toBe('B')
    house.apply({ type: 'end', ...named(house, b) })
    expect(ledger.doorEvent(house.id)).toMatchObject({ name: 'B', state: 'ended' }) // Ended is still open
    house.apply({ type: 'close', eventId: b })
    expect(ledger.doorEvent(house.id).name).toBe('A')

    for (const id of [a, test]) {
      house.apply({ type: 'end', ...named(house, id) })
      house.apply({ type: 'close', eventId: id })
    }
    expect(ledger.doorEvent(house.id)).toBeNull()
    expect(house.doorEvent()).toBeNull()
  })

  test("Resume doesn't move it: the stamp stays", () => {
    const { ledger, house } = signedUp()
    const test = byName(house, 'Test night').id
    const a = make(house, 'A')
    goLive(house, a)

    house.apply({ type: 'end', ...named(house, test) })
    house.apply({ type: 'resume', ...named(house, test) })

    expect(ledger.doorEvent(house.id).name).toBe('A')
  })

  test('null for a Household that does not exist', () => {
    const { ledger } = signedUp()
    expect(ledger.doorEvent(999)).toBeNull()
  })
})

describe('commands name their Event', () => {
  const NIGHT_COMMANDS = {
    tap: (night) => tap(`t-${Math.random()}`, night),
    remove: (night) => ({ type: 'remove', kidId: 'nobody', ...night }),
    catchUp: (night) => ({ type: 'catchUp', tag: { name: 'Pirate' }, n: 0, kid: { id: `c-${Math.random()}`, tappedAt: 1_000 }, ...night }),
    backfill: (night) => ({ type: 'backfill', rows: [{ startMs: 0, endMs: 1_000, count: 1 }], ...night }),
    removeBatch: (night) => ({ type: 'removeBatch', batchId: 1, ...night }),
    release: (night) => ({ type: 'release', ...night }),
    end: (night) => ({ type: 'end', ...night }),
    resume: (night) => ({ type: 'resume', ...night }),
  }

  for (const [type, command] of Object.entries(NIGHT_COMMANDS)) {
    test(`${type}: no event id, an Upcoming or Past id, or a stale stamp is refused`, () => {
      const { house } = signedUp()
      const test = named(house, byName(house, 'Test night').id)
      const halloween = byName(house, 'Halloween 2026').id
      const past = house.addPastCounts({ name: 'Old', buckets: [] })

      expect(() => house.apply(command({}))).toThrow(BadCommand)
      expect(() => house.apply(command({ stamp: test.stamp }))).toThrow(BadCommand)
      expect(() => house.apply(command({ eventId: halloween, stamp: null }))).toThrow(BadCommand)
      expect(() => house.apply(command({ eventId: past, stamp: null }))).toThrow(BadCommand)
      expect(() => house.apply(command({ eventId: test.eventId, stamp: test.stamp - 1 }))).toThrow(BadCommand)
      expect(() => house.apply(command({ eventId: test.eventId }))).toThrow(BadCommand)
      expect(() => house.apply(command(test))).not.toThrow()
    })
  }

  test('a tap lands on the Event it names, even when another went live since', () => {
    const { house } = signedUp()
    const test = named(house, byName(house, 'Test night').id)
    const a = make(house, 'A')
    goLive(house, a)

    house.apply(tap('queued', test))
    house.apply(tap('fresh', named(house, a)))

    expect(house.snapshot(test.eventId).kids.map((k) => k.id)).toEqual(['queued'])
    expect(house.snapshot(a).kids.map((k) => k.id)).toEqual(['fresh'])
  })

  test('the soundboard and Add a ticket need an open Event too', () => {
    const { house } = signedUp('2026-10-12T15:00:00Z', 'America/Toronto', { soundboard: [{ label: 'Boo', shout: 'BOO!' }] })
    const test = named(house, byName(house, 'Test night').id)
    house.apply({ type: 'settings', eventId: test.eventId, expectedKids: 100 })

    expect(() => house.apply({ type: 'soundboard', slot: 1 })).toThrow(BadCommand)
    expect(() => house.apply({ type: 'soundboard', slot: 1, ...test, stamp: 5 })).toThrow(BadCommand)
    expect(house.apply({ type: 'soundboard', slot: 1, ...test })).toHaveLength(1)
    expect(() => house.apply({ type: 'addTicket' })).toThrow(BadCommand)
    expect(house.apply({ type: 'addTicket', ...test })).toHaveLength(1)
  })

  test('a snapshot names its Event: none means none', () => {
    const { house } = signedUp()
    expect(house.snapshot()).toBeNull()
    expect(house.snapshot(byName(house, 'Test night').id).event).toMatchObject({ name: 'Test night', state: 'live', wentLiveAt: expect.any(Number) })
  })
})

describe('zero open Events', () => {
  function closedHousehold() {
    const setup = signedUp()
    const test = byName(setup.house, 'Test night').id
    setup.house.apply({ type: 'end', ...named(setup.house, test) })
    setup.house.apply({ type: 'deleteEvent', eventId: test, confirm: 'Test night' }) // no past night of its own
    return setup
  }

  test('is a normal state: reads and Setup commands work', () => {
    const { ledger, house } = closedHousehold()
    const halloween = byName(house, 'Halloween 2026').id

    expect(ledger.doorEvent(house.id)).toBeNull()
    expect(house.events()).toHaveLength(1)
    expect(house.batches()).toEqual([])
    expect(house.apply({ type: 'setTimeZone', timeZone: 'America/Vancouver' })).toEqual([])
    expect(house.apply({ type: 'settings', eventId: halloween, expectedKids: 50 })).toEqual([])
    expect(house.apply({ type: 'createTag', eventId: halloween, name: 'Pirate' })).toEqual([])
    house.apply({ type: 'setLastYear', total: 120 })
    expect(byName(house, 'Halloween 2026').raceAgainstId).toBe(byName(house, 'Halloween 2025 (estimated)').id)
    expect(house.apply({ type: 'mix', volume: 0.5, mutes: {} })).toHaveLength(1)
    expect(ledger.liveNights()).toEqual([])
    expect(ledger.nearbyNights(Date.now())).toEqual([])
  })

  test('a night command is a BadCommand, never a TypeError', () => {
    const { house } = closedHousehold()

    for (const type of ['tap', 'end', 'resume', 'release', 'addTicket', 'remove', 'backfill', 'removeBatch', 'catchUp', 'soundboard']) {
      expect(() => house.apply({ type })).toThrow(BadCommand)
    }
  })
})

describe('Delete', () => {
  test('is refused while Live', () => {
    const { house } = signedUp()
    expect(() => house.apply({ type: 'deleteEvent', eventId: byName(house, 'Test night').id, confirm: 'Test night' })).toThrow('End the night first')
  })

  test('works on Ended, Past and Upcoming Events, and a racer falls back to None', () => {
    const { house } = signedUp()
    const test = byName(house, 'Test night').id
    const halloween = byName(house, 'Halloween 2026').id
    house.apply({ type: 'end', ...named(house, test) })
    house.apply({ type: 'settings', eventId: halloween, raceAgainstId: test })

    house.apply({ type: 'deleteEvent', eventId: test, confirm: 'Test night' })

    expect(byName(house, 'Test night')).toBeUndefined()
    expect(byName(house, 'Halloween 2026').raceAgainstId).toBeNull()

    const past = house.addPastCounts({ name: 'Old', buckets: [] })
    house.apply({ type: 'deleteEvent', eventId: past, confirm: 'Old' })
    house.apply({ type: 'deleteEvent', eventId: halloween, confirm: 'Halloween 2026' })
    expect(house.events()).toEqual([])
  })

  test("deleting the door's Ended Event moves the door, and screens are told", () => {
    const { ledger, house } = signedUp()
    const a = make(house, 'A')
    goLive(house, a)
    house.apply({ type: 'end', ...named(house, a) })

    const deltas = house.apply({ type: 'deleteEvent', eventId: a, confirm: 'A' })

    expect(ledger.doorEvent(house.id).name).toBe('Test night')
    expect(deltas.map((d) => d.type)).toContain('door.changed')
  })
})

describe('the schema', () => {
  test('one state column; no live, frozen, rehearsal or v1 join_key on events', () => {
    const { db } = signedUp()
    const columns = db.query('PRAGMA table_info(events)').all().map((c) => c.name)

    expect(columns).toContain('state')
    for (const gone of ['live', 'frozen', 'rehearsal', 'join_key']) expect(columns).not.toContain(gone)
  })

  test('no Rehearsal flag remains in the server', () => {
    const dir = new URL('.', import.meta.url).pathname
    const sources = readdirSync(dir).filter((f) => f.endsWith('.js') && !f.endsWith('.test.js') && f !== 'migrations.js')
    for (const file of sources) expect(readFileSync(join(dir, file), 'utf8')).not.toMatch(/rehearsal/i)
  })
})

describe('over HTTP', () => {
  const running = []
  afterEach(() => running.splice(0).forEach((app) => app.stop()))

  async function household() {
    const dir = mkdtempSync(join(tmpdir(), 'count-dracula-'))
    const configPath = join(dir, 'config.json')
    writeFileSync(configPath, JSON.stringify({ dbPath: join(dir, 'db.sqlite'), soundboard: [{ label: 'Boo', shout: 'BOO!' }] }))
    const google = fakeGoogle()
    const app = startServer({ configPath, port: 0, google, env: {}, now: () => at('2026-10-12T15:00:00Z') })
    running.push(app)
    const cookie = cookieOf(await signIn({ app, google }, { sub: 'm', email: 'm@example.com' }, { displayName: 'Ours' }))
    const { id } = await (await fetch(`${app.url}/api/household`, { headers: { Cookie: cookie } })).json()
    const house = app.ledger.household(id)
    return { app, cookie, house, key: house.joinKey() }
  }

  const post = (app, path, key, body) =>
    fetch(`${app.url}${path}`, { method: 'POST', headers: { 'X-Join-Key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

  test("a phone's tap names its Event and stamp; without them, or stale, it's a 400", async () => {
    const { app, house, key } = await household()
    const night = named(house, byName(house, 'Test night').id)
    const kid = (id) => ({ id, tagId: null, tappedAt: at('2026-10-12T15:00:00Z'), phoneName: 'P' })

    expect((await post(app, '/api/taps', key, { ...kid('a'), ...night })).status).toBe(200)
    expect((await post(app, '/api/taps', key, kid('b'))).status).toBe(400)
    expect((await post(app, '/api/taps', key, { ...kid('c'), ...night, stamp: night.stamp + 1 })).status).toBe(400)
    expect((await post(app, '/api/end', key, {})).status).toBe(400)
    expect((await post(app, '/api/end', key, night)).status).toBe(200)

    expect(house.snapshot(night.eventId).kids.map((k) => k.id)).toEqual(['a'])
  })

  test("reads show the door's Event", async () => {
    const { app, house, key } = await household()
    const a = make(house, 'A')
    goLive(house, a)

    const snap = await (await fetch(`${app.url}/api/snapshot?key=${key}`)).json()

    expect(snap.event).toMatchObject({ id: a, name: 'A', state: 'live' })
  })

  test('with zero open Events, every read answers and every write is a 400, never a 500', async () => {
    const { app, cookie, house, key } = await household()
    const test = named(house, byName(house, 'Test night').id)
    house.apply({ type: 'end', ...test })
    house.apply({ type: 'close', eventId: test.eventId })
    const asManager = { headers: { Cookie: cookie } }

    const phone = await fetch(`${app.url}/api/snapshot?key=${key}`)
    expect(phone.status).toBe(200)
    expect((await phone.json()).event).toBeNull()
    expect((await fetch(`${app.url}/api/snapshot?key=${house.tvToken()}`)).status).toBe(200)
    for (const path of ['/api/snapshot', '/api/events', '/api/batches', '/api/household', '/setup', '/tally']) {
      expect((await fetch(`${app.url}${path}`, asManager)).status).toBe(200)
    }
    for (const path of ['/api/taps', '/api/remove', '/api/end', '/api/resume', '/api/release', '/api/soundboard', '/api/catch-up']) {
      expect((await post(app, path, key, { ...test, slot: 1, kidId: 'x', id: 'x', tappedAt: 1, tag: { name: 'Pirate' }, kid: { id: 'y', tappedAt: 1 } })).status).toBe(400)
    }
    const stream = await fetch(`${app.url}/api/stream?key=${key}`)
    expect(stream.status).toBe(200)
    await stream.body.cancel()
  })
})
