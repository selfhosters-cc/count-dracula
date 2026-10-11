import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Database } from 'bun:sqlite'
import { startServer } from './app.js'
import { openLedger } from './ledger.js'
import { setUpV1Night } from '../test/v1-night.js'
import { readFrames } from '../test/sse.js'
import { fakeGoogle } from '../test/fake-google.js'
import { cookieOf, signIn } from '../test/sign-in.js'

const running = []
afterEach(() => running.splice(0).forEach((app) => app.stop()))

// Household #1, set up as a v1 first install was: racing a counts-only 2025 night.
function start(configOverrides = {}, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'count-dracula-'))
  const db = new Database(join(dir, 'db.sqlite'), { create: true })
  setUpV1Night(openLedger(db, {}), {
    ghostSeed: { name: 'Halloween 2025 (counts)', buckets: [{ start: '18:00', end: '18:30', count: 40 }] },
  })
  db.close()
  const configPath = join(dir, 'config.json')
  writeFileSync(configPath, JSON.stringify({
    dbPath: 'db.sqlite',
    ...configOverrides,
  }))
  const google = fakeGoogle()
  const app = startServer({ configPath, port: 0, google, env: { HOUSEHOLD1_MANAGER_EMAIL: 'us@example.com' }, ...options })
  running.push(app)
  app.house = app.ledger.household(1)
  app.google = google
  return app
}

// A Manager of Household #1, signed in.
async function managerCookie(app) {
  return cookieOf(await signIn({ app, google: app.google }, { sub: 'g-us', email: 'us@example.com' }))
}

describe('startup', () => {
  test("reads the config file: switches reach a phone's snapshot", async () => {
    const app = start({ switches: { pumpkinPatch: false } })

    const res = await fetch(`${app.url}/api/snapshot`, { headers: { 'X-Join-Key': app.house.joinKey() } })

    expect(res.status).toBe(200)
    const snap = await res.json()
    expect(snap.event.name).toBe('Rehearsal')
    expect(snap.ghost.buckets).toEqual([{ start: '18:00', end: '18:30', count: 40 }])
    expect(snap.settings.switches.pumpkinPatch).toBe(false)
    expect(snap.settings.switches.milestones).toBe(true)
  })
})

function postTap(app, tap, { key = app.house.joinKey(), withKey = true } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (withKey) headers['X-Join-Key'] = key
  return fetch(`${app.url}/api/taps`, { method: 'POST', headers, body: JSON.stringify(tap) })
}

function aTap(id) {
  return { id, tagId: null, tappedAt: Date.now(), phoneName: 'Grandma' }
}

async function liveCount(app) {
  const snap = await (await fetch(`${app.url}/api/snapshot`, { headers: { 'X-Join-Key': app.house.joinKey() } })).json()
  return snap.kids.length
}

describe('join key', () => {
  test('a tap without the key is rejected', async () => {
    const app = start()

    const res = await postTap(app, aTap('a'), { withKey: false })

    expect(res.status).toBe(403)
    expect(await liveCount(app)).toBe(0)
  })

  test('a tap with the wrong key is rejected', async () => {
    const app = start()

    const res = await postTap(app, aTap('a'), { key: 'not-the-key' })

    expect(res.status).toBe(403)
    expect(await liveCount(app)).toBe(0)
  })

  test('a tap with the live event key is counted', async () => {
    const app = start()

    const res = await postTap(app, aTap('a'))

    expect(res.status).toBe(200)
    expect(await liveCount(app)).toBe(1)
  })
})

async function openStream(app) {
  const controller = new AbortController()
  const res = await fetch(`${app.url}/api/stream?key=${app.house.joinKey()}`, { signal: controller.signal })
  const { next } = readFrames(res)
  return { res, next, close: () => controller.abort() }
}

describe('live stream', () => {
  test('opens with a snapshot, then sends each new kid as a seq-numbered delta', async () => {
    const app = start()
    const stream = await openStream(app)

    expect(stream.res.headers.get('Content-Type')).toStartWith('text/event-stream')
    const first = await stream.next()
    expect(first.event).toBe('snapshot')
    expect(first.data).toMatchObject({ event: { name: 'Rehearsal' }, kids: [], seq: 0 })

    await postTap(app, aTap('a'))

    const delta = await stream.next()
    expect(delta.event).toBe('delta')
    expect(delta.id).toBe('1')
    expect(delta.data).toMatchObject({ type: 'kid.added', seq: 1, kid: { id: 'a', number: 1 } })
    stream.close()
  })

  test('a retried tap returns 200 again but is broadcast only once', async () => {
    const app = start()
    const stream = await openStream(app)
    await stream.next() // snapshot

    const first = await postTap(app, aTap('a'))
    const retry = await postTap(app, aTap('a'))
    await postTap(app, aTap('b'))

    expect([first.status, retry.status]).toEqual([200, 200])
    expect((await stream.next()).data.kid.id).toBe('a')
    const following = await stream.next()
    expect(following.data.kid).toMatchObject({ id: 'b', number: 2 })
    expect(following.id).toBe('2')
    expect(await liveCount(app)).toBe(2)
    stream.close()
  })

  test('a reconnecting device gets a fresh snapshot with the current count', async () => {
    const app = start()
    const tv = await openStream(app)
    await tv.next()
    await postTap(app, aTap('a'))
    await tv.next()
    tv.close()
    await postTap(app, aTap('b')) // lands while the TV is away

    const again = await openStream(app)

    const snap = await again.next()
    expect(snap.event).toBe('snapshot')
    expect(snap.data.kids.map((k) => k.number)).toEqual([1, 2])
    expect(snap.data.seq).toBe(2)
    again.close()
  })

  test('an idle stream gets heartbeat pings the page can see, so a silently dead link is noticed', async () => {
    const app = start({}, { heartbeatMs: 20 })
    const stream = await openStream(app)
    await stream.next()

    expect(await stream.next()).toMatchObject({ event: 'ping' })
    expect(await stream.next()).toMatchObject({ event: 'ping' })
    stream.close()
  })
})

describe('per-Household streams', () => {
  test("a stream opened with one Household's key never hears another Household's taps", async () => {
    const app = start()
    const other = app.ledger.household(app.ledger.createHousehold({ displayName: 'Next door', timeZone: 'America/Toronto' }))
    const controller = new AbortController()
    const res = await fetch(`${app.url}/api/stream?key=${other.joinKey()}`, { signal: controller.signal })
    const stream = readFrames(res)
    expect((await stream.next()).data.event.rehearsal).toBe(true)

    await postTap(app, aTap('ours'))
    await postTap(app, aTap('theirs'), { key: other.joinKey() })

    const delta = await stream.next()
    expect(delta.data).toMatchObject({ seq: 1, kid: { id: 'theirs', number: 1 } })
    controller.abort()
  })
})

describe('bad taps', () => {
  test.each([
    ['no id', { tappedAt: 1 }],
    ['empty id', { id: '', tappedAt: 1 }],
    ['no tap time', { id: 'a' }],
    ['a tap time that is not a number', { id: 'a', tappedAt: 'soon' }],
  ])('%s → 400', async (_, body) => {
    const app = start()

    const res = await postTap(app, body)

    expect(res.status).toBe(400)
    expect(await liveCount(app)).toBe(0)
  })

  test('a body that is not JSON → 400', async () => {
    const app = start()

    const res = await fetch(`${app.url}/api/taps`, {
      method: 'POST',
      headers: { 'X-Join-Key': app.house.joinKey() },
      body: 'kid please',
    })

    expect(res.status).toBe(400)
  })
})

describe('pages', () => {
  test.each([
    ['/', 'text/html'],
    ['/tv', 'text/html'],
    ['/live.js', 'text/javascript'],
    ['/shared/night-maths.js', 'text/javascript'],
    ['/kiosk/count-dracula-tv.sh', ''],
    ['/kiosk/install-cachyos.sh', ''],
  ])('serves %s', async (path, type) => {
    const app = start()

    const res = await fetch(`${app.url}${path}`)

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toStartWith(type)
  })

  test('serves nothing outside public/, and no test files', async () => {
    const app = start()

    for (const path of ['/..%2fserver%2fapp.js', '/%2e%2e/server/app.js', '/nope.html', '/outbox.test.js', '/shared/night-maths.test.js', '/shared/../server/app.js']) {
      expect((await fetch(`${app.url}${path}`)).status).toBe(404)
    }
  })
})

describe('admin (Setup)', () => {
  async function admin(app, command, cookie) {
    return fetch(`${app.url}/api/admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie ?? (await managerCookie(app)) },
      body: JSON.stringify(command),
    })
  }

  test("takes a Manager's session, and only Setup commands", async () => {
    const app = start()
    const create = { type: 'createEvent', name: 'Halloween 2026' }

    expect((await admin(app, create, 'cd_session=nope')).status).toBe(401)
    expect((await admin(app, { type: 'tap', id: 'x', tappedAt: 1 })).status).toBe(400) // not an admin command
    expect((await admin(app, create)).status).toBe(200)
    expect(app.house.events().map((e) => e.name)).toContain('Halloween 2026')
  })

  test("lists the Household's events for Setup, never with the join key", async () => {
    const app = start()

    const res = await fetch(`${app.url}/api/events`, { headers: { Cookie: await managerCookie(app) } })
    expect(res.status).toBe(200)
    const events = await res.json()
    expect(events.map((e) => e.name)).toEqual(['Rehearsal', 'Halloween 2025 (counts)'])
    expect(JSON.stringify(events)).not.toContain(app.house.joinKey())
  })

  test('Change key hands back the new key, and the old one stops writing', async () => {
    const app = start()
    const old = app.house.joinKey()

    const res = await admin(app, { type: 'changeKey' })

    const { joinKey } = await res.json()
    expect(joinKey).toBe(app.house.joinKey())
    expect(joinKey).not.toBe(old)
    expect((await postTap(app, aTap('a'), { key: old })).status).toBe(403)
    expect((await postTap(app, aTap('b'), { key: joinKey })).status).toBe(200)
  })

  test('Go live tells every stream to switch', async () => {
    const app = start()
    const stream = await openStream(app)
    await stream.next()
    const created = await (await admin(app, { type: 'createEvent', name: 'Halloween 2026' })).json()

    await admin(app, { type: 'goLive', eventId: created.deltas[0].event.id })

    expect((await stream.next()).data).toMatchObject({ type: 'event.created' }) // every seq is published, so no gaps
    expect((await stream.next()).data).toMatchObject({ type: 'event.switched' })
    stream.close()
  })
})

describe('☰ menu', () => {
  test('changing the TV mix needs the join key, and reaches the TV as a delta', async () => {
    const app = start()
    const stream = await openStream(app)
    await stream.next()
    const post = (key) =>
      fetch(`${app.url}/api/mix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Join-Key': key },
        body: JSON.stringify({ volume: 0.5, mutes: { everything: true } }),
      })

    expect((await post('wrong')).status).toBe(403)
    expect((await post(app.house.joinKey())).status).toBe(200)
    expect((await stream.next()).data).toMatchObject({ type: 'mix.changed', mix: { volume: 0.5, mutes: { everything: true } } })
    stream.close()
  })
})

describe('export', () => {
  const exportCsv = async (app, eventId, cookie) => fetch(`${app.url}/api/export?event=${eventId}`, { headers: { Cookie: cookie ?? (await managerCookie(app)) } })

  test("downloads the event as a CSV for a Manager; its non-deleted rows equal the TV count", async () => {
    const app = start()
    for (const id of ['a', 'b', 'c']) await postTap(app, aTap(id))
    app.house.apply({ type: 'remove', kidId: 'b' })
    const live = app.house.snapshot()

    expect((await exportCsv(app, live.event.id, 'cd_session=nope')).status).toBe(401)
    const res = await exportCsv(app, live.event.id)

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toStartWith('text/csv')
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="rehearsal.csv"')
    const kidRows = (await res.text()).split('\n\n')[0].split('\n').slice(2)
    expect(kidRows).toHaveLength(3)
    expect(kidRows.filter((r) => r.split(',')[5] === '')).toHaveLength(live.kids.length)
  })
})

describe('past events for /tv?event=<id>', () => {
  test("the snapshot of a past event, for a Manager; an unknown event is 404", async () => {
    const app = start()
    await postTap(app, aTap('a'))
    const rehearsal = app.house.snapshot().event.id
    const [{ event }] = app.house.apply({ type: 'createEvent', name: 'Halloween 2026' })
    app.house.apply({ type: 'goLive', eventId: event.id })

    const headers = { Cookie: await managerCookie(app) }
    const past = await (await fetch(`${app.url}/api/snapshot?event=${rehearsal}`, { headers })).json()

    expect(past.event).toMatchObject({ name: 'Rehearsal', frozen: true })
    expect(past.kids).toHaveLength(1)
    expect(past.recap).not.toBeNull()
    expect((await fetch(`${app.url}/api/snapshot?event=99999`, { headers })).status).toBe(404)
  })
})

describe('teens', () => {
  test("a phone's teen tap arrives as a teen", async () => {
    const app = start()

    await postTap(app, { ...aTap('a'), teen: true })

    const snap = await (await fetch(`${app.url}/api/snapshot`, { headers: { 'X-Join-Key': app.house.joinKey() } })).json()
    expect(snap.kids[0].teen).toBe(true)
  })
})

describe('kiosk launchers', () => {
  test('carry the address they were downloaded from, so the repo never names the host', async () => {
    const app = start()

    const viaCaddy = await fetch(`${app.url}/kiosk/install-cachyos.sh`, { headers: { Host: 'tv.example.com', 'X-Forwarded-Proto': 'https' } })
    const bat = await (await fetch(`${app.url}/kiosk/count-dracula-tv.bat`, { headers: { Host: '192.168.1.9:3131' } })).text()

    const script = await viaCaddy.text()
    expect(script).toContain('BASE=${BASE:-https://tv.example.com}')
    expect(script).not.toContain('__ORIGIN__')
    expect(bat).toContain('set URL=http://192.168.1.9:3131/tv')
  })
})
