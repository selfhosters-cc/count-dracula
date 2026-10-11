import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer } from './app.js'
import { fakeGoogle } from '../test/fake-google.js'
import { cookieOf, signIn } from '../test/sign-in.js'
import { readFrames } from '../test/sse.js'

const running = []
afterEach(() => running.splice(0).forEach((app) => app.stop()))

// Two Households, A and B, each with a Manager signed in. A has a past night, a live one with a kid, and a
// costume, so every route has something of A's to name.
async function twoHouseholds() {
  const dir = mkdtempSync(join(tmpdir(), 'count-dracula-'))
  const configPath = join(dir, 'config.json')
  writeFileSync(configPath, JSON.stringify({ dbPath: join(dir, 'db.sqlite'), soundboard: [{ label: 'Boo', shout: 'BOO!' }] }))
  const google = fakeGoogle()
  const app = startServer({ configPath, port: 0, google, env: {} })
  running.push(app)
  const a = { cookie: cookieOf(await signIn({ app, google }, { sub: 'a', email: 'a@example.com' }, { displayName: 'House A' })) }
  const b = { cookie: cookieOf(await signIn({ app, google }, { sub: 'b', email: 'b@example.com' }, { displayName: 'House B' })) }
  for (const h of [a, b]) {
    const info = await (await fetch(`${app.url}/api/household`, { headers: { Cookie: h.cookie } })).json()
    h.id = info.id
    h.house = app.ledger.household(info.id)
  }
  const past = a.house.snapshot().event.id
  const [{ event }] = a.house.apply({ type: 'createEvent', name: 'A night' })
  a.house.apply({ type: 'goLive', eventId: event.id })
  a.house.apply({ type: 'tap', id: 'a-kid', tagId: null, tappedAt: Date.now(), phoneName: 'A phone' })
  a.past = past
  a.live = event.id
  a.tag = a.house.apply({ type: 'createTag', eventId: event.id, name: 'Witch' })[0].tag.id
  return { app, a, b }
}

const tap = (id) => ({ id, tagId: null, tappedAt: Date.now(), phoneName: 'Phone' })

// Every route that reaches a Household, and the credentials it takes: a phone's join key, a Manager's session.
const ROUTES = [
  ['GET', '/api/snapshot', null, ['key', 'session']],
  ['GET', '/api/snapshot?event=PAST', null, ['session']],
  ['GET', '/api/stream', null, ['key', 'session']],
  ['POST', '/api/taps', () => tap(`t-${Math.random()}`), ['key']],
  ['POST', '/api/remove', () => ({ kidId: 'a-kid' }), ['key']],
  ['POST', '/api/catch-up', () => ({ tag: { name: 'Pirate' }, n: 0, kid: tap(`c-${Math.random()}`) }), ['key']],
  ['POST', '/api/end', () => ({}), ['key']],
  ['POST', '/api/resume', () => ({}), ['key']],
  ['POST', '/api/release', () => ({}), ['key']],
  ['POST', '/api/soundboard', () => ({ slot: 1 }), ['key']],
  ['POST', '/api/mix', () => ({ volume: 0.5, mutes: {} }), ['key']],
  ['GET', '/api/household', null, ['session']],
  ['GET', '/api/events', null, ['session']],
  ['GET', '/api/batches', null, ['session']],
  ['GET', '/api/export?event=LIVE', null, ['session']],
  ['POST', '/api/admin', () => ({ type: 'updateTag', tagId: 'TAG', name: 'Witchy' }), ['session']],
  ['GET', '/tally', null, ['session']],
  ['GET', '/setup', null, ['session']],
]

function request(app, a, [method, path, body], credential) {
  const url = `${app.url}${path.replace('PAST', a.past).replace('LIVE', a.live)}`
  const headers = { 'Content-Type': 'application/json' }
  let target = url
  if (credential?.key) {
    if (path === '/api/stream') target += `?key=${encodeURIComponent(credential.key)}`
    else headers['X-Join-Key'] = credential.key
  }
  if (credential?.cookie) headers.Cookie = credential.cookie
  const payload = body?.()
  if (payload?.tagId === 'TAG') payload.tagId = a.tag
  const controller = new AbortController()
  return fetch(target, { method, headers, body: payload && JSON.stringify(payload), redirect: 'manual', signal: controller.signal }).then((res) => {
    if (path === '/api/stream') setTimeout(() => controller.abort(), 50)
    return res
  })
}

const ok = (res) => res.status >= 200 && res.status < 300

describe('every route carries a credential', () => {
  test('no credential, or a made-up one, is refused everywhere', async () => {
    const { app, a } = await twoHouseholds()

    for (const route of ROUTES) {
      for (const credential of [null, { key: 'not-a-key' }, { cookie: 'cd_session=not-a-session' }]) {
        const res = await request(app, a, route, credential)
        expect({ route: route.slice(0, 2).join(' '), credential, ok: ok(res) }).toEqual({ route: route.slice(0, 2).join(' '), credential, ok: false })
      }
    }
  })

  test("the right credential works, and only the kinds each route takes", async () => {
    const { app, a } = await twoHouseholds()

    for (const route of ROUTES) {
      for (const kind of ['key', 'session']) {
        const credential = kind === 'key' ? { key: a.house.joinKey() } : { cookie: a.cookie }
        const res = await request(app, a, route, credential)
        expect({ route: route.slice(0, 2).join(' '), kind, ok: ok(res) }).toEqual({ route: route.slice(0, 2).join(' '), kind, ok: route[3].includes(kind) })
      }
    }
  })

  test("another Household's key or session never reaches A", async () => {
    const { app, a, b } = await twoHouseholds()
    const before = { snap: a.house.snapshot(), events: a.house.events(), key: a.house.joinKey() }

    for (const route of ROUTES) {
      for (const credential of [{ key: b.house.joinKey() }, { cookie: b.cookie }]) {
        const res = await request(app, a, route, credential)
        if (ok(res) && route[1] !== '/api/stream') expect(await res.text()).not.toContain('A night')
      }
    }

    expect({ snap: a.house.snapshot(), events: a.house.events(), key: a.house.joinKey() }).toEqual(before)
  })
})

describe('the join key', () => {
  test('after Change join key, old-key streams close and old-key writes get 403', async () => {
    const { app, a } = await twoHouseholds()
    const old = a.house.joinKey()
    const controller = new AbortController()
    const stream = readFrames(await fetch(`${app.url}/api/stream?key=${old}`, { signal: controller.signal }))
    await stream.next()

    const res = await fetch(`${app.url}/api/admin`, { method: 'POST', headers: { Cookie: a.cookie }, body: JSON.stringify({ type: 'changeKey' }) })
    const { joinKey } = await res.json()

    expect(await stream.closed()).toBe(true)
    const write = (key) => fetch(`${app.url}/api/taps`, { method: 'POST', headers: { 'X-Join-Key': key }, body: JSON.stringify(tap('after')) })
    expect((await write(old)).status).toBe(403)
    expect((await write(joinKey)).status).toBe(200)
  })

  test('a phone joined on the Rehearsal keeps working after Go live', async () => {
    const { app, b } = await twoHouseholds()
    const key = b.house.joinKey()
    const [{ event }] = b.house.apply({ type: 'createEvent', name: 'Halloween 2026' })
    b.house.apply({ type: 'goLive', eventId: event.id })

    const res = await fetch(`${app.url}/api/taps`, { method: 'POST', headers: { 'X-Join-Key': key }, body: JSON.stringify(tap('night-kid')) })

    expect(res.status).toBe(200)
    expect(b.house.snapshot().event.name).toBe('Halloween 2026')
    expect(b.house.snapshot().kids.map((k) => k.id)).toEqual(['night-kid'])
  })

  test('the snapshot names no LAN address any more', async () => {
    const { app, a } = await twoHouseholds()

    const snap = await (await fetch(`${app.url}/api/snapshot`, { headers: { 'X-Join-Key': a.house.joinKey() } })).json()

    expect(snap.settings).not.toHaveProperty('lanUrl')
    expect((await fetch(`${app.url}/api/join`)).status).toBe(404)
  })
})
