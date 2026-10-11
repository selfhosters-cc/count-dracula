import { afterEach, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer } from './app.js'
import { fakeGoogle } from '../test/fake-google.js'
import { cookieOf, signIn } from '../test/sign-in.js'

const DAY = 86_400_000
const running = []
afterEach(() => running.splice(0).forEach((app) => app.stop()))

async function setUp() {
  const dir = mkdtempSync(join(tmpdir(), 'count-dracula-'))
  const dbPath = join(dir, 'db.sqlite')
  const configPath = join(dir, 'config.json')
  writeFileSync(configPath, JSON.stringify({ dbPath }))
  const google = fakeGoogle()
  const clock = { now: Date.parse('2026-10-15T15:00:00Z') }
  const logs = []
  const app = startServer({ configPath, port: 0, google, env: { OPERATOR_EMAILS: 'op@example.com' }, now: () => clock.now, log: (l) => logs.push(l) })
  running.push(app)
  const server = { app, google }
  const alice = cookieOf(await signIn(server, { sub: 'alice', email: 'alice@example.com', name: 'Alice' }, { displayName: 'The Smiths' }))
  return { app, google, server, clock, logs, alice, db: () => new Database(dbPath, { readonly: true }) }
}

const call = (app, cookie, method, path, body) =>
  fetch(`${app.url}${path}`, { method, headers: { Cookie: cookie ?? '' }, body: body && JSON.stringify(body), redirect: 'manual' })
const invite = async (app, cookie) => (await call(app, cookie, 'POST', '/api/invites')).json()
const household = async (app, cookie) => (await call(app, cookie, 'GET', '/api/household')).json()
const managers = async (app, cookie) => (await call(app, cookie, 'GET', '/api/managers')).json()
const keyOf = (url) => new URL(url).searchParams.get('key')

describe('Invite links', () => {
  test('a second Google account opens one and becomes an equal Manager; the same link then fails', async () => {
    const { app, server, alice } = await setUp()
    const { url } = await invite(app, alice)
    expect(url).toMatch(/\/invite\?key=[A-Za-z0-9_-]{32,}$/)
    const page = await fetch(url.replace(/^https?:\/\/[^/]+/, app.url))
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('The Smiths')

    const bob = cookieOf(await signIn(server, { sub: 'bob', email: 'bob@example.com', name: 'Bob' }, { invite: keyOf(url) }))
    const again = await signIn(server, { sub: 'carol', email: 'carol@example.com' }, { invite: keyOf(url) })

    expect((await household(app, bob)).id).toBe((await household(app, alice)).id)
    expect((await call(app, bob, 'POST', '/api/admin', { type: 'rename', displayName: 'Smith Manor' })).status).toBe(200)
    expect((await managers(app, alice)).managers.map((m) => m.email)).toEqual(['alice@example.com', 'bob@example.com'])
    expect(again.status).toBe(410)
    expect(await again.text()).toContain('already been used')
    expect(cookieOf(again)).toBeNull()
  })

  test('an expired or revoked invite fails, and unused ones are listed', async () => {
    const { app, server, clock, alice } = await setUp()
    const old = await invite(app, alice)
    const revoked = await invite(app, alice)
    expect((await managers(app, alice)).invites).toHaveLength(2)

    expect((await call(app, alice, 'POST', '/api/invites/revoke', { key: keyOf(revoked.url) })).status).toBe(200)
    clock.now += 7 * DAY + 1

    expect((await signIn(server, { sub: 'bob', email: 'bob@example.com' }, { invite: keyOf(old.url) })).status).toBe(410)
    expect((await signIn(server, { sub: 'carol', email: 'carol@example.com' }, { invite: keyOf(revoked.url) })).status).toBe(410)
    expect((await managers(app, alice)).invites).toEqual([])
    expect((await (await fetch(`${app.url}/invite?key=${keyOf(old.url)}`)).text())).toContain('expired')
  })

  test('an account that already manages a Household can\'t join another', async () => {
    const { app, server, alice } = await setUp()
    const dave = cookieOf(await signIn(server, { sub: 'dave', email: 'dave@example.com' }, { displayName: 'Casa Dave' }))
    const { url } = await invite(app, alice)

    const res = await signIn(server, { sub: 'dave', email: 'dave@example.com' }, { invite: keyOf(url) })

    expect(res.status).toBe(409)
    expect(await res.text()).toContain('already manage')
    expect((await household(app, dave)).displayName).toBe('Casa Dave')
    expect((await managers(app, alice)).invites).toHaveLength(1) // not used up
  })

  test('the 21st invite in a day is refused', async () => {
    const { app, alice } = await setUp()

    const statuses = []
    for (let i = 0; i < 21; i++) statuses.push((await call(app, alice, 'POST', '/api/invites')).status)

    expect(statuses.filter((s) => s === 200)).toHaveLength(20)
    expect(statuses.at(-1)).toBe(429)
  })
})

describe('leaving and removing', () => {
  async function twoManagers() {
    const env = await setUp()
    const { url } = await invite(env.app, env.alice)
    const bob = cookieOf(await signIn(env.server, { sub: 'bob', email: 'bob@example.com', name: 'Bob' }, { invite: keyOf(url) }))
    const bobId = (await managers(env.app, env.alice)).managers.find((m) => m.email === 'bob@example.com').id
    return { ...env, bob, bobId }
  }

  function traces(db, managerId, email) {
    return {
      managers: db.query('SELECT COUNT(*) AS n FROM managers WHERE id = ? OR email = ? OR google_sub = ?').get(managerId, email, 'bob').n,
      sessions: db.query('SELECT COUNT(*) AS n FROM sessions WHERE manager_id = ?').get(managerId).n,
      invites: db.query('SELECT COUNT(*) AS n FROM invites WHERE made_by = ?').get(managerId).n,
    }
  }

  test('a Manager removed by another leaves no row with their id, email or sessions; the nights stay', async () => {
    const { app, alice, bob, bobId, db } = await twoManagers()
    await invite(app, bob) // an invite Bob made stays, without him
    const before = (await call(app, alice, 'GET', '/api/events')).status

    expect((await call(app, alice, 'POST', '/api/managers/remove', { managerId: bobId })).status).toBe(200)

    expect(traces(db(), bobId, 'bob@example.com')).toEqual({ managers: 0, sessions: 0, invites: 0 })
    expect((await managers(app, alice)).invites).toHaveLength(1)
    expect((await call(app, bob, 'GET', '/api/household')).status).toBe(401)
    expect(before).toBe(200)
    expect((await call(app, alice, 'GET', '/api/events')).status).toBe(200)
  })

  test('Leave does the same for yourself; the last Manager can\'t leave', async () => {
    const { app, alice, bob, bobId, db } = await twoManagers()

    const left = await call(app, bob, 'POST', '/api/managers/leave')
    expect(left.status).toBe(200)
    expect(left.headers.get('Set-Cookie')).toContain('Max-Age=0')
    expect(traces(db(), bobId, 'bob@example.com')).toMatchObject({ managers: 0, sessions: 0 })

    const last = await call(app, alice, 'POST', '/api/managers/leave')
    expect(last.status).toBe(400)
    expect(await last.text()).toContain('Delete my household')
  })

  test("a Manager of another Household can't be removed", async () => {
    const { app, server, alice } = await setUp()
    const eve = cookieOf(await signIn(server, { sub: 'eve', email: 'eve@example.com' }, { displayName: 'Casa Eve' }))
    const eveId = (await managers(app, eve)).managers[0].id

    expect((await call(app, alice, 'POST', '/api/managers/remove', { managerId: eveId })).status).toBe(400)
    expect((await household(app, eve)).displayName).toBe('Casa Eve')
  })
})

describe("the Operator's recovery invite", () => {
  test('works like any invite and is logged', async () => {
    const { app, server, logs, alice } = await setUp()
    const op = cookieOf(await signIn(server, { sub: 'op', email: 'op@example.com' }, { displayName: 'Ops' }))
    const { id } = await household(app, alice)

    const res = await call(app, op, 'POST', '/api/operator/action', { householdId: id, action: 'invite' })
    const { url } = await res.json()
    const back = cookieOf(await signIn(server, { sub: 'alice-new', email: 'alice.new@example.com' }, { invite: keyOf(url) }))

    expect((await household(app, back)).id).toBe(id)
    expect(logs).toContain(`operator action=invite household=${id} by=op@example.com`)
  })
})

describe('Delete my Household', () => {
  test('also deletes its invites', async () => {
    const { app, alice, db } = await setUp()
    const { id } = await household(app, alice)
    await invite(app, alice)

    await call(app, alice, 'POST', '/api/household/delete', { confirm: 'The Smiths' })

    expect(db().query('SELECT COUNT(*) AS n FROM invites WHERE household_id = ?').get(id).n).toBe(0)
  })
})
