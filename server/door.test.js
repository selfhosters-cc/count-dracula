// v2.1 ticket 52: the door phone on /door. `/` with a key goes there; a phone's reads name its Household for
// Add a helper; a refused key says whether it's dead or only Suspended (spec v2.1 §4, §11).
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer } from './app.js'
import { fakeGoogle } from '../test/fake-google.js'
import { cookieOf, signIn } from '../test/sign-in.js'
import { readFrames } from '../test/sse.js'

const running = []
const aborts = []
afterEach(() => {
  aborts.splice(0).forEach((c) => c.abort())
  running.splice(0).forEach((app) => app.stop())
})

const byName = (house, name) => house.events().find((e) => e.name === name)
const named = (house, id) => ({ eventId: id, stamp: house.events().find((e) => e.id === id).wentLiveAt })

async function served() {
  const dir = mkdtempSync(join(tmpdir(), 'count-dracula-'))
  const configPath = join(dir, 'config.json')
  writeFileSync(configPath, JSON.stringify({ dbPath: join(dir, 'db.sqlite') }))
  const google = fakeGoogle()
  const app = startServer({ configPath, port: 0, google, env: {} })
  running.push(app)
  const cookie = cookieOf(await signIn({ app, google }, { sub: 'a', email: 'a@example.com' }, { displayName: 'The Smiths' }))
  const info = await (await fetch(`${app.url}/api/household`, { headers: { Cookie: cookie } })).json()
  const house = app.ledger.household(info.id)
  const admin = (command) => fetch(`${app.url}/api/admin`, { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify(command) })
  const phone = (path, body) => fetch(`${app.url}${path}`, { method: 'POST', headers: { 'X-Join-Key': info.joinKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { app, info, house, admin, phone }
}

describe('/door', () => {
  test('serves the door phone', async () => {
    const { app } = await served()

    const res = await fetch(`${app.url}/door`)

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toStartWith('text/html')
    expect(await res.text()).toContain('<script type="module" src="/door.js"></script>')
  })

  test('/?key= goes to /door?key=, keeping the whole query', async () => {
    const { app } = await served()

    const res = await fetch(`${app.url}/?key=abc&x=1`, { redirect: 'manual' })

    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('/door?key=abc&x=1')
  })
})

describe('the outbox across a switch, over HTTP', () => {
  test('a tap queued under the test night lands on the test night after Halloween goes live', async () => {
    const { house, admin, phone } = await served()
    const testNight = byName(house, 'Test night').id
    const halloween = byName(house, 'Halloween 2026').id
    const queued = { id: 'offline', tagId: null, tappedAt: Date.now(), phoneName: 'Dad', ...named(house, testNight) }

    expect((await admin({ type: 'goLive', eventId: halloween })).status).toBe(200)
    const res = await phone('/api/taps', queued)

    expect(res.status).toBe(200)
    expect(house.snapshot(testNight).kids.map((k) => k.id)).toEqual(['offline'])
    expect(house.snapshot(halloween).kids).toEqual([])
  })

  test('a tap queued under an earlier go-live of its Event (before a reset) is a 400, which the outbox drops', async () => {
    const { house, phone } = await served()
    const testNight = named(house, byName(house, 'Test night').id)

    const res = await phone('/api/taps', { id: 'stale', tagId: null, tappedAt: Date.now(), phoneName: 'Dad', ...testNight, stamp: testNight.stamp - 1 })

    expect(res.status).toBe(400)
    expect(house.snapshot(testNight.eventId).kids).toEqual([])
  })
})

describe("a phone's reads name its Household (for Add a helper), and a TV's don't", () => {
  test('the snapshot and the stream', async () => {
    const { app, info } = await served()

    const phoneSnap = await (await fetch(`${app.url}/api/snapshot`, { headers: { 'X-Join-Key': info.joinKey } })).json()
    const tvSnap = await (await fetch(`${app.url}/api/snapshot?key=${info.tvToken}`)).json()
    const controller = new AbortController()
    aborts.push(controller)
    const streamed = (await readFrames(await fetch(`${app.url}/api/stream?key=${info.joinKey}`, { signal: controller.signal })).next()).data

    expect(phoneSnap.household).toBe('The Smiths')
    expect(streamed.household).toBe('The Smiths')
    expect(tvSnap).not.toHaveProperty('household')
  })
})

describe('a refused key', () => {
  test("a dead key is refused plainly; a Suspended Household's says so, so its phones keep the key", async () => {
    const { app, info } = await served()

    const dead = await fetch(`${app.url}/api/snapshot?key=nope`)
    expect(dead.status).toBe(403)
    expect(dead.headers.get('X-Refused')).toBeNull()

    app.ledger.setSuspended(info.id, true)
    const suspended = await fetch(`${app.url}/api/snapshot?key=${info.joinKey}`)
    expect(suspended.status).toBe(403)
    expect(suspended.headers.get('X-Refused')).toBe('suspended')
  })
})

describe('Go live now at the cap', () => {
  test("is refused like any Manager's Go live, with the reason", async () => {
    const { house, admin } = await served()
    for (const name of ['B', 'C']) {
      const res = await admin({ type: 'createEvent', name })
      expect(res.status).toBe(200)
      expect((await admin({ type: 'goLive', eventId: byName(house, name).id })).status).toBe(200)
    }

    const res = await admin({ type: 'goLive', eventId: byName(house, 'Halloween 2026').id })

    expect(res.status).toBe(400)
    expect(await res.text()).toBe('End or close one of your live nights first')
  })
})
