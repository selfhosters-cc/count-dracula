// v2.1 ticket 51: every delta names its Event, the door's Event moves every screen with door.changed, and a
// screen with nothing open learns the next Upcoming Event (spec v2.1 §4, §15).
import { afterEach, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BadCommand, openLedger } from './ledger.js'
import { startServer } from './app.js'
import { fakeGoogle } from '../test/fake-google.js'
import { cookieOf, signIn } from '../test/sign-in.js'
import { readFrames } from '../test/sse.js'

const at = (iso) => Date.parse(iso)
const board = [1, 2, 3, 4, 5, 6].map((n) => ({ label: `Sound ${n}`, file: `board-${n}.mp3` }))

function signedUp(iso = '2026-10-12T15:00:00Z') {
  const clock = { now: at(iso) }
  const ledger = openLedger(new Database(':memory:'), { now: () => clock.now, soundboard: board })
  const house = ledger.household(ledger.createHousehold({ displayName: 'House', timeZone: 'America/Toronto' }))
  return { clock, ledger, house }
}

const byName = (house, name) => house.events().find((e) => e.name === name)
const named = (house, id) => ({ eventId: id, stamp: house.events().find((e) => e.id === id).wentLiveAt })
const tap = (house, eventId, id, extra = {}) => house.apply({ type: 'tap', id, tagId: null, tappedAt: 1_000, phoneName: 'Dad', ...named(house, eventId), ...extra })

// Test night Live, then Halloween live on top: Halloween is the door's Event.
function twoLive() {
  const setup = signedUp()
  const { house } = setup
  const testNight = byName(house, 'Test night').id
  const halloween = byName(house, 'Halloween 2026').id
  setup.clock.now += 1_000
  house.apply({ type: 'goLive', eventId: halloween })
  return { ...setup, testNight, halloween }
}

describe('every delta names its Event', () => {
  test("a night write's deltas carry the Event it named, door's or not", () => {
    const { house, testNight, halloween } = twoLive()

    expect(tap(house, halloween, 'a')).toMatchObject([{ type: 'kid.added', eventId: halloween }])
    expect(tap(house, testNight, 'b')).toMatchObject([{ type: 'kid.added', eventId: testNight }])
    expect(house.apply({ type: 'remove', kidId: 'b', ...named(house, testNight) })).toMatchObject([{ type: 'kid.removed', eventId: testNight }])
    expect(house.apply({ type: 'end', ...named(house, testNight) })).toMatchObject([{ type: 'event.ended', eventId: testNight }])
    expect(house.apply({ type: 'resume', ...named(house, testNight) })).toMatchObject([{ type: 'event.ended', eventId: testNight }])
  })

  test("Add missed kids on a non-door Event names it, and doesn't move the door", () => {
    const { house, testNight, halloween } = twoLive()

    const deltas = house.apply({ type: 'backfill', rows: [{ startMs: 0, endMs: 1_000, count: 2 }], ...named(house, testNight) })

    expect(deltas.map((d) => [d.type, d.eventId])).toEqual([['kid.added', testNight], ['kid.added', testNight]])
    expect(house.doorEvent().id).toBe(halloween)
  })

  test('costume deltas carry their Event; the TV mix names none (it is per Household)', () => {
    const { house, testNight } = twoLive()

    expect(house.apply({ type: 'createTag', eventId: testNight, name: 'Robot' })).toMatchObject([{ type: 'tag.added', eventId: testNight }])
    expect(house.apply({ type: 'mix', volume: 0.5 })).toMatchObject([{ type: 'mix.changed', eventId: null }])
  })

  test('seq runs on across Events with no gap', () => {
    const { house, testNight, halloween } = twoLive()

    const seqs = [...tap(house, halloween, 'a'), ...tap(house, testNight, 'b'), ...tap(house, halloween, 'c')].map((d) => d.seq)

    expect(seqs[1]).toBe(seqs[0] + 1)
    expect(seqs[2]).toBe(seqs[1] + 1)
  })
})

describe("the door's Event moving", () => {
  test('Halloween going live over a Live test night says door.changed, naming Halloween', () => {
    const { clock, house } = signedUp()
    const halloween = byName(house, 'Halloween 2026').id
    clock.now += 1_000

    expect(house.apply({ type: 'goLive', eventId: halloween })).toMatchObject([{ type: 'door.changed', eventId: null, door: halloween }])
  })

  test("End on the door's Event keeps it the door's (its recap stays up) though the test night is still Live", () => {
    const { house, halloween } = twoLive()

    const deltas = house.apply({ type: 'end', ...named(house, halloween) })

    expect(deltas.map((d) => d.type)).toEqual(['event.ended'])
    expect(house.doorEvent()).toMatchObject({ id: halloween, state: 'ended' })
  })

  test("deleting the door's Ended Event drops screens to the next open one, then to none", () => {
    const { house, testNight, halloween } = twoLive()
    house.apply({ type: 'end', ...named(house, halloween) })

    expect(house.apply({ type: 'deleteEvent', eventId: halloween, confirm: 'Halloween 2026' })).toMatchObject([{ type: 'door.changed', door: testNight }])

    house.apply({ type: 'end', ...named(house, testNight) })
    expect(house.apply({ type: 'close', eventId: testNight })).toMatchObject([{ type: 'door.changed', door: null }])
  })

  test('a non-door Event ending, or its settings changing, moves no screen', () => {
    const { house, testNight } = twoLive()

    expect(house.apply({ type: 'end', ...named(house, testNight) }).map((d) => d.type)).toEqual(['event.ended'])
    expect(house.apply({ type: 'settings', eventId: testNight, name: 'Practice' })).toMatchObject([{ type: 'event.updated', eventId: testNight }])
  })
})

describe('sound on the off-screen Event', () => {
  test('a milestone reached off screen is recorded on its own Event, on a delta naming it', () => {
    const { clock, house, testNight } = twoLive()
    let last
    for (let i = 1; i <= 50; i++) last = tap(house, testNight, `k${i}`, { tappedAt: clock.now })

    expect(last).toMatchObject([{ type: 'kid.added', eventId: testNight, moments: ['milestone:50'] }])
  })

  test("a soundboard press naming an Event that's no longer the door's is dropped, and spends no cooldown", () => {
    const { house, testNight, halloween } = twoLive()

    expect(() => house.apply({ type: 'soundboard', slot: 1, ...named(house, testNight) })).toThrow(BadCommand)
    expect(house.apply({ type: 'soundboard', slot: 1, ...named(house, halloween) })).toMatchObject([{ type: 'soundboard', eventId: halloween }])
  })
})

describe('nothing open', () => {
  function noneOpen() {
    const setup = signedUp()
    const { house } = setup
    const testNight = byName(house, 'Test night').id
    house.apply({ type: 'end', ...named(house, testNight) })
    house.apply({ type: 'close', eventId: testNight })
    return setup
  }

  test("the idle snapshot names the next Upcoming Event and when it goes live", () => {
    const { house } = noneOpen()

    expect(house.idleSnapshot().next).toEqual({ id: byName(house, 'Halloween 2026').id, name: 'Halloween 2026', goesLiveAt: at('2026-10-31T20:00:00Z') })
  })

  test('the soonest scheduled one wins; with none scheduled, an Upcoming one with no countdown; else none', () => {
    const { house } = noneOpen()
    const halloween = byName(house, 'Halloween 2026').id
    const party = house.apply({ type: 'createEvent', name: 'Party' })[0].event.id
    house.apply({ type: 'settings', eventId: party, goesLiveAt: at('2026-10-20T22:00:00Z') })
    expect(house.idleSnapshot().next).toMatchObject({ name: 'Party' })

    house.apply({ type: 'settings', eventId: party, goesLiveAt: null })
    house.apply({ type: 'settings', eventId: halloween, goesLiveAt: null })
    expect(house.idleSnapshot().next).toEqual({ id: halloween, name: 'Halloween 2026', goesLiveAt: null })

    house.apply({ type: 'deleteEvent', eventId: halloween, confirm: 'Halloween 2026' })
    house.apply({ type: 'deleteEvent', eventId: party, confirm: 'Party' })
    expect(house.idleSnapshot().next).toBeNull()
  })

  test('a change to the next Upcoming Event reaches idle screens as next.changed', () => {
    const { house } = noneOpen()
    const halloween = byName(house, 'Halloween 2026').id

    expect(house.apply({ type: 'settings', eventId: halloween, goesLiveAt: at('2026-10-31T21:00:00Z') })).toMatchObject([
      { type: 'next.changed', eventId: null, next: { id: halloween, goesLiveAt: at('2026-10-31T21:00:00Z') } },
    ])
  })

  test("with a door's Event, no next.changed is sent: nobody shows it", () => {
    const { house } = signedUp()

    expect(house.apply({ type: 'settings', eventId: byName(house, 'Halloween 2026').id, goesLiveAt: at('2026-10-31T21:00:00Z') })).toEqual([])
  })
})

// ---- over HTTP: what a TV-link stream actually gets
const running = []
const aborts = []
afterEach(() => {
  aborts.splice(0).forEach((c) => c.abort())
  running.splice(0).forEach((app) => app.stop())
})

async function served() {
  const dir = mkdtempSync(join(tmpdir(), 'count-dracula-'))
  const configPath = join(dir, 'config.json')
  writeFileSync(configPath, JSON.stringify({ dbPath: join(dir, 'db.sqlite') }))
  const google = fakeGoogle()
  const app = startServer({ configPath, port: 0, google, env: {} })
  running.push(app)
  const cookie = cookieOf(await signIn({ app, google }, { sub: 'a', email: 'a@example.com' }, { displayName: 'House A' }))
  const info = await (await fetch(`${app.url}/api/household`, { headers: { Cookie: cookie } })).json()
  const house = app.ledger.household(info.id)
  const admin = async (command) => (await fetch(`${app.url}/api/admin`, { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify(command) })).json()
  const stream = async (key) => {
    const controller = new AbortController()
    aborts.push(controller)
    return readFrames(await fetch(`${app.url}/api/stream?key=${encodeURIComponent(key)}`, { signal: controller.signal }))
  }
  return { app, info, house, admin, stream }
}

describe('a TV-link stream', () => {
  test("gets every Event's deltas, each named, with seq unbroken, and door.changed when Halloween goes live", async () => {
    const { info, house, admin, stream } = await served()
    const testNight = byName(house, 'Test night').id
    const halloween = byName(house, 'Halloween 2026').id
    const tv = await stream(info.tvToken)
    const first = (await tv.next()).data
    expect(first.event.id).toBe(testNight)

    await admin({ type: 'goLive', eventId: halloween })
    await admin({ type: 'backfill', rows: [{ startMs: Date.now() - 60_000, endMs: Date.now(), count: 1 }], ...named(house, testNight) })

    const switched = await tv.next()
    const backfilled = await tv.next()
    expect(switched.data).toMatchObject({ type: 'door.changed', door: halloween })
    expect(backfilled.data).toMatchObject({ type: 'kid.added', eventId: testNight })
    expect(Number(switched.id)).toBe(first.seq + 1)
    expect(Number(backfilled.id)).toBe(first.seq + 2)
  })

  test('a remote viewer and the porch get the same frames', async () => {
    const { info, house, admin, stream } = await served()
    const porch = await stream(info.tvToken)
    const remote = await stream(info.tvToken)
    const snaps = [(await porch.next()).data, (await remote.next()).data]
    expect(snaps[0]).toEqual(snaps[1])

    await admin({ type: 'goLive', eventId: byName(house, 'Halloween 2026').id })

    expect((await porch.next()).data).toEqual((await remote.next()).data)
  })

  test('with nothing open, its snapshot is "no night" with the next Upcoming Event', async () => {
    const { app, info, house, admin } = await served()
    const testNight = byName(house, 'Test night').id
    await fetch(`${app.url}/api/end`, { method: 'POST', headers: { 'X-Join-Key': info.joinKey }, body: JSON.stringify(named(house, testNight)) })
    await admin({ type: 'close', eventId: testNight })

    const snap = await (await fetch(`${app.url}/api/snapshot?key=${info.tvToken}`)).json()

    expect(snap.event).toBeNull()
    expect(snap.next).toMatchObject({ name: 'Halloween 2026', goesLiveAt: expect.any(Number) })
  })
})
