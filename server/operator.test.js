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

const ENV = { OPERATOR_EMAILS: 'op@example.com', OPERATOR_CONTACT: 'help@count-dracula.example.com' }

function boot(dir) {
  const configPath = join(dir, 'config.json')
  writeFileSync(configPath, JSON.stringify({ dbPath: join(dir, 'db.sqlite') }))
  const google = fakeGoogle()
  const logs = []
  const app = startServer({ configPath, port: 0, google, env: ENV, log: (line) => logs.push(line) })
  running.push(app)
  return { app, google, logs }
}

async function setUp() {
  const dir = mkdtempSync(join(tmpdir(), 'count-dracula-'))
  const { app, google, logs } = boot(dir)
  const op = cookieOf(await signIn({ app, google }, { sub: 'op', email: 'op@example.com' }, { displayName: 'Ops House' }))
  const manager = cookieOf(await signIn({ app, google }, { sub: 'm', email: 'm@example.com' }, { displayName: 'The Smiths' }))
  const info = await (await fetch(`${app.url}/api/household`, { headers: { Cookie: manager } })).json()
  return { dir, app, google, logs, op, manager, info }
}

const get = (app, path, cookie) => fetch(`${app.url}${path}`, { headers: cookie ? { Cookie: cookie } : {}, redirect: 'manual' })
const act = (app, cookie, body) => fetch(`${app.url}/api/operator/action`, { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify(body) })

async function stream(app, key) {
  const controller = new AbortController()
  aborts.push(controller)
  const res = await fetch(`${app.url}/api/stream?key=${key}`, { signal: controller.signal })
  if (!res.ok) return { status: res.status }
  const frames = readFrames(res)
  return { status: res.status, frames, first: await frames.next() }
}

describe('who gets in', () => {
  test('only a Manager on OPERATOR_EMAILS; anyone else gets 403, or sign-in', async () => {
    const { app, op, manager, info } = await setUp()

    expect((await get(app, '/operator', op)).status).toBe(200)
    expect((await get(app, '/operator', manager)).status).toBe(403)
    expect((await get(app, '/operator')).headers.get('Location')).toBe('/signup')
    for (const cookie of [manager, null]) {
      expect((await get(app, '/api/operator/households', cookie)).status).toBeGreaterThanOrEqual(401)
      expect((await act(app, cookie ?? '', { householdId: info.id, action: 'suspend' })).status).toBeGreaterThanOrEqual(401)
    }
  })
})

describe('finding a Household', () => {
  test('lists every Household, searchable by name', async () => {
    const { app, op } = await setUp()

    const all = await (await get(app, '/api/operator/households', op)).json()
    const found = await (await get(app, '/api/operator/households?q=smi', op)).json()

    expect(all.households.map((h) => h.displayName).sort()).toEqual(['Ops House', 'The Smiths'])
    expect(found.households).toMatchObject([{ displayName: 'The Smiths', timeZone: 'America/Vancouver', suspendedSince: null, managers: ['m@example.com'] }])
    expect(found.pauseSignUps).toBe(false)
  })
})

describe('Rename and Fix time zone', () => {
  test("change what the Household's screens show, live, and log one line each", async () => {
    const { app, op, info, logs } = await setUp()
    const tv = await stream(app, info.tvToken)

    expect((await act(app, op, { householdId: info.id, action: 'rename', value: 'Smith Manor' })).status).toBe(200)
    expect((await act(app, op, { householdId: info.id, action: 'timeZone', value: 'America/Toronto' })).status).toBe(200)

    expect((await tv.frames.next()).data.type).toBe('event.updated') // screens take a fresh snapshot
    const snap = await (await fetch(`${app.url}/api/snapshot?key=${info.tvToken}`)).json()
    expect(snap.timeZone).toBe('America/Toronto')
    expect(app.ledger.households().find((h) => h.id === info.id).displayName).toBe('Smith Manor')
    expect(logs.filter((l) => l.startsWith('operator'))).toEqual([
      `operator action=rename household=${info.id} by=op@example.com`,
      `operator action=timeZone household=${info.id} by=op@example.com`,
    ])
  })

  test('a made-up time zone is refused', async () => {
    const { app, op, info } = await setUp()

    expect((await act(app, op, { householdId: info.id, action: 'timeZone', value: 'Mars/Olympus' })).status).toBe(400)
  })
})

describe('Suspend', () => {
  test("closes the Household's streams and refuses its key, TV link and Setup, showing the contact", async () => {
    const { app, op, manager, info } = await setUp()
    const tv = await stream(app, info.tvToken)
    const phone = await stream(app, info.joinKey)

    expect((await act(app, op, { householdId: info.id, action: 'suspend' })).status).toBe(200)

    expect(await tv.frames.closed()).toBe(true)
    expect(await phone.frames.closed()).toBe(true)
    expect((await stream(app, info.tvToken)).status).toBe(403)
    expect((await fetch(`${app.url}/api/taps`, { method: 'POST', headers: { 'X-Join-Key': info.joinKey }, body: JSON.stringify({ id: 'x', tappedAt: 1 }) })).status).toBe(403)
    const page = await get(app, '/setup', manager)
    expect(page.status).toBe(403)
    const text = await page.text()
    expect(text).toContain('This Household is suspended by the Operator')
    expect(text).toContain('help@count-dracula.example.com')
    expect((await get(app, '/api/events', manager)).status).toBe(403)
    const [listed] = (await (await get(app, '/api/operator/households?q=smi', op)).json()).households
    expect(listed.suspendedSince).toBeGreaterThan(0)
  })

  test('Unsuspend restores everything, with nothing lost', async () => {
    const { app, op, manager, info } = await setUp()
    await fetch(`${app.url}/api/taps`, { method: 'POST', headers: { 'X-Join-Key': info.joinKey }, body: JSON.stringify({ id: 'kept', tagId: null, tappedAt: Date.now(), phoneName: 'Dad' }) })
    await act(app, op, { householdId: info.id, action: 'suspend' })

    await act(app, op, { householdId: info.id, action: 'unsuspend' })

    expect((await stream(app, info.tvToken)).first.data.kids.map((k) => k.id)).toEqual(['kept'])
    expect((await get(app, '/setup', manager)).status).toBe(200)
  })
})

describe('Pause sign-ups', () => {
  test('stops new Households, survives a restart, and existing Managers still sign in', async () => {
    const { dir, app, google, op } = await setUp()
    const res = await fetch(`${app.url}/api/operator/pause`, { method: 'POST', headers: { Cookie: op }, body: JSON.stringify({ on: true }) })
    expect(res.status).toBe(200)
    app.stop()
    running.length = 0

    const again = boot(dir)
    const refused = await signIn({ app: again.app, google: again.google }, { sub: 'new', email: 'new@example.com' }, { displayName: 'Late House' })
    const existing = await signIn({ app: again.app, google: again.google }, { sub: 'm', email: 'm@example.com' })

    expect(refused.status).toBe(503)
    expect(await refused.text()).toContain('Sign-ups are paused, try again later')
    expect(existing.status).toBe(303)
    expect(again.app.ledger.households()).toHaveLength(2)
    expect(again.logs).toEqual([])
    void google
  })
})
