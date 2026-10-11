import { afterEach, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer } from './app.js'
import { openLedger } from './ledger.js'
import { setUpV1Night } from '../test/v1-night.js'
import { fakeGoogle } from '../test/fake-google.js'
import { readFrames } from '../test/sse.js'
import { cookieOf, signIn } from '../test/sign-in.js'

const DAY = 86_400_000
const running = []
afterEach(() => running.splice(0).forEach((app) => app.stop()))

// A server whose database already holds Household #1 (a migrated v1 night), with a fake Google and a clock.
function start({ env = {}, canSignUp } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'count-dracula-'))
  const dbPath = join(dir, 'db.sqlite')
  const db = new Database(dbPath, { create: true })
  setUpV1Night(openLedger(db, {}))
  db.close()
  const configPath = join(dir, 'config.json')
  writeFileSync(configPath, JSON.stringify({ dbPath }))
  const clock = { now: Date.parse('2026-10-12T12:00:00Z') }
  const google = fakeGoogle()
  const app = startServer({
    configPath,
    port: 0,
    google,
    now: () => clock.now,
    canSignUp,
    env: { HOUSEHOLD1_MANAGER_EMAIL: 'Us@Example.com', OPERATOR_EMAILS: 'op@example.com', ...env },
  })
  running.push(app)
  return { app, google, clock, db: () => new Database(dbPath) }
}

const ALICE = { sub: 'g-alice', email: 'alice@example.com', name: 'Alice' }
const BOB = { sub: 'g-bob', email: 'bob@example.com', name: 'Bob' }

const as = (cookie, init = {}) => ({ ...init, redirect: 'manual', headers: { ...init.headers, Cookie: cookie } })

async function household(app, cookie) {
  const res = await fetch(`${app.url}/api/household`, as(cookie))
  return res.status === 200 ? res.json() : res.status
}

function admin(app, cookie, command) {
  return fetch(`${app.url}/api/admin`, as(cookie, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command) }))
}

describe('signing up', () => {
  test('a new Google account signs up and lands in /setup of a new Household with a live Rehearsal', async () => {
    const server = start()

    const res = await signIn(server, ALICE, { displayName: '  The Smiths ' })

    expect(res.status).toBe(303)
    expect(res.headers.get('Location')).toBe('/setup')
    const cookie = cookieOf(res)
    expect((await fetch(`${server.app.url}/setup`, as(cookie))).status).toBe(200)
    const house = await household(server.app, cookie)
    expect(house).toMatchObject({ displayName: 'The Smiths', timeZone: 'America/Vancouver', manager: { email: 'alice@example.com' }, operator: false })
    expect(house.id).not.toBe(1)
    const events = await (await fetch(`${server.app.url}/api/events`, as(cookie))).json()
    expect(events.filter((e) => e.live)).toMatchObject([{ name: 'Rehearsal', rehearsal: true }])
  })

  test('the same account signing in again reaches the same Household and never makes a second', async () => {
    const server = start()
    const first = await household(server.app, cookieOf(await signIn(server, ALICE, { displayName: 'The Smiths' })))

    const again = await household(server.app, cookieOf(await signIn(server, ALICE, { displayName: 'Another house' })))
    const plain = await household(server.app, cookieOf(await signIn(server, ALICE)))

    expect(again.id).toBe(first.id)
    expect(plain).toMatchObject({ id: first.id, displayName: 'The Smiths' })
    expect(server.app.ledger.households()).toHaveLength(2) // Household #1 and the Smiths
  })

  test('signing in without a Household and without a name creates nothing', async () => {
    const server = start()

    const res = await signIn(server, ALICE)

    expect(res.status).toBe(404)
    expect(await res.text()).toContain('Sign up')
    expect(cookieOf(res)).toBeNull()
    expect(server.app.ledger.households()).toHaveLength(1)
  })

  test('a display name over 40 characters is refused before Google', async () => {
    const server = start()

    const res = await signIn(server, ALICE, { displayName: 'x'.repeat(41) })

    expect(res.status).toBe(400)
    expect(server.app.ledger.households()).toHaveLength(1)
  })

  test('a refused sign-up shows "Sign-ups are paused" and creates nothing', async () => {
    const server = start({ canSignUp: () => false })

    const res = await signIn(server, ALICE, { displayName: 'The Smiths' })

    expect(res.status).toBe(503)
    expect(await res.text()).toContain('Sign-ups are paused, try again later')
    expect(cookieOf(res)).toBeNull()
    expect(server.app.ledger.households()).toHaveLength(1)
  })

  test('an email Google has not verified is refused', async () => {
    const server = start()

    const res = await signIn(server, { ...ALICE, emailVerified: false }, { displayName: 'The Smiths' })

    expect(res.status).toBe(403)
    expect(server.app.ledger.households()).toHaveLength(1)
  })
})

describe('Household #1 and Operators', () => {
  test('HOUSEHOLD1_MANAGER_EMAIL becomes Household #1\'s Manager; later sign-ins match on sub, even with a new email', async () => {
    const server = start()
    const us = { sub: 'g-us', email: 'us@example.com', name: 'Us' }

    const first = await household(server.app, cookieOf(await signIn(server, us)))
    const renamed = await household(server.app, cookieOf(await signIn(server, { ...us, email: 'new-address@example.com' })))

    expect(first).toMatchObject({ id: 1, manager: { email: 'us@example.com' } })
    expect(renamed).toMatchObject({ id: 1, manager: { email: 'new-address@example.com' } })
    expect(server.app.ledger.households()).toHaveLength(1)
  })

  test("another account with Household #1's email, once it has a Manager, doesn't take it over", async () => {
    const server = start()
    await signIn(server, { sub: 'g-us', email: 'us@example.com' })

    const res = await signIn(server, { sub: 'g-impostor', email: 'us@example.com' }, { displayName: 'Mine' })

    expect((await household(server.app, cookieOf(res))).id).not.toBe(1)
  })

  test('a Manager whose email is on OPERATOR_EMAILS is an Operator', async () => {
    const server = start()

    const op = await household(server.app, cookieOf(await signIn(server, { sub: 'g-op', email: 'OP@example.com' }, { displayName: 'Ops' })))

    expect(op.operator).toBe(true)
  })
})

describe('state', () => {
  test('a forged state is refused', async () => {
    const server = start()

    const res = await signIn(server, ALICE, { displayName: 'The Smiths', state: 'made-up' })

    expect(res.status).toBe(400)
    expect(cookieOf(res)).toBeNull()
    expect(server.app.ledger.households()).toHaveLength(1)
  })

  test('a replayed state is refused', async () => {
    const server = start()
    const started = await fetch(`${server.app.url}/auth/google/start`, { method: 'POST', body: new URLSearchParams({ displayName: 'The Smiths', timeZone: 'UTC' }), redirect: 'manual' })
    const authUrl = started.headers.get('Location')
    const state = new URL(authUrl).searchParams.get('state')
    const callback = (code) => fetch(`${server.app.url}/auth/google/callback?code=${code}&state=${state}`, { redirect: 'manual' })

    expect((await callback(server.google.authorize(authUrl, ALICE))).status).toBe(303)
    expect((await callback(server.google.authorize(authUrl, BOB))).status).toBe(400)
  })

  test('a nonce that does not match the one sent is refused', async () => {
    const server = start()

    const res = await signIn({ ...server, google: { authorize: (url, who) => server.google.authorize(url, { ...who, nonce: 'other' }) } }, ALICE, { displayName: 'The Smiths' })

    expect(res.status).toBe(400)
    expect(server.app.ledger.households()).toHaveLength(1)
  })
})

describe('sessions', () => {
  test('the cookie is HttpOnly, Secure and SameSite=Lax, and lasts 90 days', async () => {
    const server = start()

    const res = await signIn(server, ALICE, { displayName: 'The Smiths' })

    const attributes = res.headers.get('Set-Cookie').split(';').map((a) => a.trim().toLowerCase())
    expect(attributes).toContain('httponly')
    expect(attributes).toContain('secure')
    expect(attributes).toContain('samesite=lax')
    expect(attributes).toContain('path=/')
    expect(attributes).toContain(`max-age=${90 * 86_400}`)
  })

  test('is renewed with use, and expires after 90 days unused', async () => {
    const server = start()
    const cookie = cookieOf(await signIn(server, ALICE, { displayName: 'The Smiths' }))

    server.clock.now += 60 * DAY
    const used = await fetch(`${server.app.url}/api/household`, as(cookie))
    expect(used.status).toBe(200)
    expect(used.headers.get('Set-Cookie')).toContain(`Max-Age=${90 * 86_400}`)
    server.clock.now += 89 * DAY
    expect(await household(server.app, cookie)).toMatchObject({ displayName: 'The Smiths' })
    server.clock.now += 91 * DAY
    expect(await household(server.app, cookie)).toBe(401)
  })

  test('Sign out ends it', async () => {
    const server = start()
    const cookie = cookieOf(await signIn(server, ALICE, { displayName: 'The Smiths' }))

    const res = await fetch(`${server.app.url}/auth/signout`, as(cookie, { method: 'POST' }))

    expect(res.status).toBe(303)
    expect(res.headers.get('Set-Cookie')).toContain('Max-Age=0')
    expect(await household(server.app, cookie)).toBe(401)
  })
})

describe('/setup on a session', () => {
  test('/setup and every Setup read and command refuse without a session', async () => {
    const { app } = start()

    const page = await fetch(`${app.url}/setup`, { redirect: 'manual' })
    expect(page.status).toBe(303)
    expect(page.headers.get('Location')).toBe('/signup')
    for (const path of ['/api/household', '/api/events', '/api/batches', '/api/export?event=1']) {
      expect((await fetch(`${app.url}${path}`, as('cd_session=forged'))).status).toBe(401)
    }
    expect((await admin(app, '', { type: 'createEvent', name: 'Sneaky' })).status).toBe(401)
    expect((await fetch(`${app.url}/api/household/delete`, { method: 'POST' })).status).toBe(401)
  })

  test("a Manager only ever reaches their own Household", async () => {
    const server = start()
    const alice = cookieOf(await signIn(server, ALICE, { displayName: 'The Smiths' }))
    const bob = cookieOf(await signIn(server, BOB, { displayName: 'Casa Bob' }))
    const aliceEvent = (await (await fetch(`${server.app.url}/api/events`, as(alice))).json())[0]

    expect((await admin(server.app, bob, { type: 'settings', eventId: aliceEvent.id, name: 'Hijacked' })).status).toBe(400)
    expect((await admin(server.app, bob, { type: 'createEvent', name: 'Bob 2026' })).status).toBe(200)
    expect((await fetch(`${server.app.url}/api/export?event=${aliceEvent.id}`, as(bob))).status).toBe(404)

    const aliceEvents = await (await fetch(`${server.app.url}/api/events`, as(alice))).json()
    expect(aliceEvents.map((e) => e.name)).toEqual(['Halloween 2026', 'Rehearsal'])
  })

  test('a Manager can set the display name, at most 40 characters', async () => {
    const server = start()
    const cookie = cookieOf(await signIn(server, ALICE, { displayName: 'The Smiths' }))

    expect((await admin(server.app, cookie, { type: 'rename', displayName: 'Smith Manor' })).status).toBe(200)
    expect((await admin(server.app, cookie, { type: 'rename', displayName: 'x'.repeat(41) })).status).toBe(400)
    expect((await household(server.app, cookie)).displayName).toBe('Smith Manor')
  })
})

describe('Delete my Household', () => {
  test('needs the typed name', async () => {
    const server = start()
    const cookie = cookieOf(await signIn(server, ALICE, { displayName: 'The Smiths' }))
    const del = (confirm) => fetch(`${server.app.url}/api/household/delete`, as(cookie, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm }) }))

    expect((await del('the smiths')).status).toBe(400)
    expect((await household(server.app, cookie)).displayName).toBe('The Smiths')
  })

  test('hard-deletes every row it owns, writes one deletions row, and closes its streams', async () => {
    const server = start()
    const cookie = cookieOf(await signIn(server, ALICE, { displayName: 'The Smiths' }))
    const { id, joinKey } = await household(server.app, cookie)
    const tap = (kid) => fetch(`${server.app.url}/api/taps`, { method: 'POST', headers: { 'X-Join-Key': joinKey }, body: JSON.stringify({ id: kid, tagId: null, tappedAt: server.clock.now, phoneName: 'Dad' }) })
    await tap('k1')
    await tap('k2')
    await admin(server.app, cookie, { type: 'createEvent', name: 'Halloween 2026', copyTagsFrom: (await (await fetch(`${server.app.url}/api/events`, as(cookie))).json())[0].id })
    const stream = readFrames(await fetch(`${server.app.url}/api/stream?key=${joinKey}`))
    await stream.next()
    await signIn(server, BOB, { displayName: 'Casa Bob' })
    const owned = ownedBy(server.db(), id)
    expect(owned.events.length).toBe(3) // the Rehearsal, "Halloween 2026" and the new one

    const res = await fetch(`${server.app.url}/api/household/delete`, as(cookie, { method: 'POST', body: JSON.stringify({ confirm: 'The Smiths' }) }))

    expect(res.status).toBe(200)
    expect(res.headers.get('Set-Cookie')).toContain('Max-Age=0')
    expect(await stream.closed()).toBe(true)
    expect(await household(server.app, cookie)).toBe(401)
    const db = server.db()
    expect(rowsOf(db, id, owned)).toEqual([])
    expect(db.query('SELECT household_id AS householdId FROM deletions').all()).toEqual([{ householdId: id }])
    expect(server.app.ledger.households().map((h) => h.displayName)).toEqual(['Test house', 'Casa Bob'])
  })
})

function ownedBy(db, householdId) {
  return {
    events: db.query('SELECT id FROM events WHERE household_id = ?').all(householdId).map((r) => r.id),
    managers: db.query('SELECT id FROM managers WHERE household_id = ?').all(householdId).map((r) => r.id),
  }
}

// Every row in any table that points at the Household: directly, through its events, or through its Managers.
function rowsOf(db, householdId, { events, managers }) {
  const found = []
  for (const { name } of db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name != 'deletions'").all()) {
    const columns = db.query(`PRAGMA table_info(${name})`).all().map((c) => c.name)
    const where = [
      columns.includes('household_id') && `household_id = ${householdId}`,
      name === 'households' && `id = ${householdId}`,
      columns.includes('event_id') && events.length && `event_id IN (${events.join(',')})`,
      columns.includes('manager_id') && managers.length && `manager_id IN (${managers.join(',')})`,
    ].filter(Boolean)
    if (!where.length) continue
    const n = db.query(`SELECT COUNT(*) AS n FROM ${name} WHERE ${where.join(' OR ')}`).get().n
    if (n) found.push(`${name}: ${n}`)
  }
  return found
}
