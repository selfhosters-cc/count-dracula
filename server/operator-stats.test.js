import { afterEach, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { siteStats } from './operator.js'
import { startServer } from './app.js'
import { fakeGoogle } from '../test/fake-google.js'
import { cookieOf, signIn } from '../test/sign-in.js'
import { readFrames } from '../test/sse.js'

const DAY = 24 * 60 * 60_000
const NOW = Date.parse('2026-10-17T18:00:00Z') // 2 pm in Toronto: sign-up makes a live Test night

describe("siteStats (/operator's Stats)", () => {
  const house = (id, overrides = {}) => ({ id, signedUpAt: NOW - DAY, location: null, suspendedSince: null, ...overrides })
  const night = (householdId, overrides = {}) => ({ householdId, state: 'past', testNight: false, kids: 0, phones: 0, tvScreens: 0, ...overrides })

  test('Test nights are never nights: only "tried the Test night"', () => {
    const stats = siteStats({ households: [house(1), house(2)], nights: [night(1, { testNight: true, state: 'live', kids: 40, phones: 3, tvScreens: 2 }), night(2, { testNight: true, state: 'live' })], pairedTvs: 0 }, NOW)

    expect(stats.households).toMatchObject({ total: 2, triedTestNight: 1, noNightYet: 2 })
    expect(stats.nights).toEqual({ upcoming: 0, live: 0, ended: 0, past: 0, counted: 0, kids: 0 })
    expect(stats.devices).toEqual({ phones: 0, tvScreens: 0, nights: 0, pairedTvs: 0 })
  })

  test('devices add up night by night, over the nights that counted them', () => {
    const nights = [
      night(1, { kids: 346, phones: null, tvScreens: null }), // went live before devices were counted
      night(1, { state: 'ended', kids: 120, phones: 3, tvScreens: 4 }),
      night(2, { state: 'live', kids: 8, phones: 1, tvScreens: 1 }),
      night(2, { state: 'upcoming' }),
    ]
    const stats = siteStats({ households: [house(1), house(2), house(3)], nights, pairedTvs: 2 }, NOW)

    expect(stats.nights).toEqual({ upcoming: 1, live: 1, ended: 1, past: 1, counted: 3, kids: 474 })
    expect(stats.devices).toEqual({ phones: 4, tvScreens: 5, nights: 2, pairedTvs: 2 })
    expect(stats.households.noNightYet).toBe(1)
  })

  test('households: the last 7 days, with a Location, Suspended', () => {
    const households = [house(1, { signedUpAt: NOW - 8 * DAY, location: 'dpz83' }), house(2, { signedUpAt: NOW - 6 * DAY, suspendedSince: NOW }), house(3, { signedUpAt: NOW })]
    expect(siteStats({ households, nights: [], pairedTvs: 0 }, NOW).households).toMatchObject({ total: 3, lastWeek: 2, withLocation: 1, suspended: 1 })
  })
})

describe('devices that joined a night', () => {
  const running = []
  afterEach(() => running.splice(0).forEach((app) => app.stop()))

  async function setUp() {
    const dir = mkdtempSync(join(tmpdir(), 'count-dracula-'))
    const dbPath = join(dir, 'db.sqlite')
    const configPath = join(dir, 'config.json')
    writeFileSync(configPath, JSON.stringify({ dbPath }))
    const google = fakeGoogle()
    const clock = { now: NOW }
    const app = startServer({ configPath, port: 0, google, env: { OPERATOR_EMAILS: 'op@example.com' }, log: () => {}, now: () => clock.now })
    running.push(app)
    const op = cookieOf(await signIn({ app, google }, { sub: 'op', email: 'op@example.com' }, { displayName: 'Ops' }))
    const smith = cookieOf(await signIn({ app, google }, { sub: 's', email: 'smith@example.com' }, { displayName: 'The Smiths' }))
    const info = await (await fetch(`${app.url}/api/household`, { headers: { Cookie: smith } })).json()
    // A stream opened and dropped once its snapshot arrives, as a phone or TV would open one.
    const connect = async (key, deviceId) => {
      const res = await fetch(`${app.url}/api/stream?key=${encodeURIComponent(key)}${deviceId ? `&deviceId=${deviceId}` : ''}`)
      const frames = readFrames(res)
      await frames.next()
      await frames.cancel()
    }
    const get = async (path) => (await fetch(`${app.url}${path}`, { headers: { Cookie: op } })).json()
    const nights = async () => (await get(`/api/operator/household?id=${info.id}`)).nights
    return { app, smith, info, connect, get, nights, dbPath }
  }

  const PHONE_A = 'a'.repeat(32)
  const PHONE_B = 'b'.repeat(32)
  const TV = 'c'.repeat(32)

  test("each device counts once on the door's Event, phones and TV screens apart", async () => {
    const { info, connect, nights } = await setUp()

    await connect(info.joinKey, PHONE_A)
    await connect(info.joinKey, PHONE_A) // a reload
    await connect(info.joinKey, PHONE_B)
    await connect(info.tvToken, TV)
    await connect(info.joinKey) // no id (an old page): not counted
    await connect(info.joinKey, 'not-an-id')

    const test = (await nights()).find((n) => n.testNight)
    expect(test).toMatchObject({ state: 'live', phones: 2, tvScreens: 1 })
    expect((await nights()).find((n) => !n.testNight)).toMatchObject({ name: 'Halloween 2026', state: 'upcoming', phones: 0, tvScreens: 0 })
  })

  test("a device counts again on a new door's Event, and Stats leaves the Test night out", async () => {
    const { app, smith, info, connect, get, nights } = await setUp()
    await connect(info.tvToken, TV)
    const halloween = (await nights()).find((n) => !n.testNight)
    await fetch(`${app.url}/api/admin`, { method: 'POST', headers: { Cookie: smith }, body: JSON.stringify({ type: 'goLive', eventId: halloween.id }) })

    await connect(info.tvToken, TV)
    await connect(info.joinKey, PHONE_A)

    expect((await nights()).map((n) => [n.testNight, n.phones, n.tvScreens])).toEqual([[true, 0, 1], [false, 1, 1]])
    const stats = await get('/api/operator/stats')
    expect(stats.devices).toEqual({ phones: 1, tvScreens: 1, nights: 1, pairedTvs: 0 })
    expect(stats.nights).toMatchObject({ live: 1, upcoming: 1 }) // the Smiths' Halloween, and the Operator's own; no Test night
    expect(JSON.stringify(stats)).not.toContain('@example.com')
  })

  test('only a hash per Event is kept, and Reset clears it', async () => {
    const { app, smith, info, connect, nights, dbPath } = await setUp()
    await connect(info.joinKey, PHONE_A)
    const test = (await nights()).find((n) => n.testNight)

    const db = new Database(dbPath, { readonly: true })
    const rows = db.query('SELECT * FROM event_devices').all()
    db.close()
    expect(rows).toHaveLength(1)
    expect(JSON.stringify(rows)).not.toContain(PHONE_A)

    await fetch(`${app.url}/api/admin`, { method: 'POST', headers: { Cookie: smith }, body: JSON.stringify({ type: 'reset', eventId: test.id }) })
    expect((await nights()).find((n) => n.id === test.id)).toMatchObject({ state: 'upcoming', phones: 0 })
  })
})
