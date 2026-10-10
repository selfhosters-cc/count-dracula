import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer } from './app.js'

const running = []
afterEach(() => running.splice(0).forEach((app) => app.stop()))

function start(configOverrides = {}, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'count-dracula-'))
  writeFileSync(join(dir, '2025.json'), JSON.stringify({
    name: 'Halloween 2025 (counts)',
    buckets: [{ start: '18:00', end: '18:30', count: 40 }],
  }))
  const configPath = join(dir, 'config.json')
  writeFileSync(configPath, JSON.stringify({
    adminPin: '4321',
    dbPath: ':memory:',
    ghostSeed: '2025.json',
    ...configOverrides,
  }))
  const app = startServer({ configPath, port: 0, ...options })
  running.push(app)
  return app
}

describe('startup', () => {
  test('reads the config file: switches reach the snapshot, which needs no key', async () => {
    const app = start({ switches: { pumpkinPatch: false } })

    const res = await fetch(`${app.url}/api/snapshot`)

    expect(res.status).toBe(200)
    const snap = await res.json()
    expect(snap.event.name).toBe('Rehearsal')
    expect(snap.ghost.buckets).toEqual([{ start: '18:00', end: '18:30', count: 40 }])
    expect(snap.settings.switches.pumpkinPatch).toBe(false)
    expect(snap.settings.switches.milestones).toBe(true)
  })
})

function postTap(app, tap, { key = app.ledger.joinKey(), withKey = true } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (withKey) headers['X-Join-Key'] = key
  return fetch(`${app.url}/api/taps`, { method: 'POST', headers, body: JSON.stringify(tap) })
}

function aTap(id) {
  return { id, tagId: null, tappedAt: Date.now(), phoneName: 'Grandma' }
}

async function liveCount(app) {
  const snap = await (await fetch(`${app.url}/api/snapshot`)).json()
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

// Reads an SSE response frame by frame: { id, event, data } or { comment }.
async function openStream(app) {
  const controller = new AbortController()
  const res = await fetch(`${app.url}/api/stream`, { signal: controller.signal })
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''

  async function next() {
    while (!buffer.includes('\n\n')) {
      const { value, done } = await reader.read()
      if (done) throw new Error('stream closed')
      buffer += value
    }
    const end = buffer.indexOf('\n\n')
    const frame = buffer.slice(0, end)
    buffer = buffer.slice(end + 2)
    if (frame.startsWith(':')) return { comment: frame.slice(1) }
    const fields = Object.fromEntries(
      frame.split('\n').map((line) => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1).trimStart()]),
    )
    return { id: fields.id, event: fields.event, data: JSON.parse(fields.data) }
  }

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
      headers: { 'X-Join-Key': app.ledger.joinKey() },
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
  function admin(app, command, { pin = '4321', key = app.ledger.joinKey() } = {}) {
    return fetch(`${app.url}/api/admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Join-Key': key, 'X-Admin-Pin': pin },
      body: JSON.stringify(command),
    })
  }

  test('needs the admin PIN from the config file as well as the join key', async () => {
    const app = start()
    const create = { type: 'createEvent', name: 'Halloween 2026' }

    expect((await admin(app, create, { pin: '0000' })).status).toBe(403)
    expect((await admin(app, create, { key: 'old-key' })).status).toBe(403)
    expect((await admin(app, { type: 'tap', id: 'x', tappedAt: 1 })).status).toBe(400) // not an admin command
    expect((await admin(app, create)).status).toBe(200)
    expect(app.ledger.events().map((e) => e.name)).toContain('Halloween 2026')
  })

  test('lists events for Setup only with the PIN', async () => {
    const app = start()

    expect((await fetch(`${app.url}/api/events`, { headers: { 'X-Admin-Pin': 'nope' } })).status).toBe(403)
    const res = await fetch(`${app.url}/api/events`, { headers: { 'X-Admin-Pin': '4321' } })
    expect(res.status).toBe(200)
    const events = await res.json()
    expect(events.map((e) => e.name)).toEqual(['Rehearsal', 'Halloween 2025 (counts)'])
    expect(JSON.stringify(events)).not.toContain(app.ledger.joinKey())
  })

  test('Change key hands back the new key, and the old one stops writing', async () => {
    const app = start()
    const old = app.ledger.joinKey()

    const res = await admin(app, { type: 'changeKey' })

    const { joinKey } = await res.json()
    expect(joinKey).toBe(app.ledger.joinKey())
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
    expect((await post(app.ledger.joinKey())).status).toBe(200)
    expect((await stream.next()).data).toMatchObject({ type: 'mix.changed', mix: { volume: 0.5, mutes: { everything: true } } })
    stream.close()
  })

  test('"Add a helper" uses the LAN URL from the config file', async () => {
    const app = start({ lanUrl: 'http://192.168.1.50:3131' })

    const snap = await (await fetch(`${app.url}/api/snapshot`)).json()

    expect(snap.settings.lanUrl).toBe('http://192.168.1.50:3131')
  })

  test("without one, it falls back to this machine's LAN address and port", async () => {
    const app = start()

    const snap = await (await fetch(`${app.url}/api/snapshot`)).json()

    expect(snap.settings.lanUrl).toMatch(/^http:\/\/(\d{1,3}\.){3}\d{1,3}:\d+$/)
    expect(snap.settings.lanUrl).not.toContain('127.0.0.1')
    expect(snap.settings.lanUrl.endsWith(`:${new URL(app.url).port}`)).toBe(true)
  })
})

describe('export', () => {
  const exportCsv = (app, eventId, pin = '4321') => fetch(`${app.url}/api/export?event=${eventId}`, { headers: { 'X-Admin-Pin': pin } })

  test('downloads the event as a CSV with the PIN; its non-deleted rows equal the TV count', async () => {
    const app = start()
    for (const id of ['a', 'b', 'c']) await postTap(app, aTap(id))
    app.ledger.apply({ type: 'remove', kidId: 'b' })
    const live = app.ledger.snapshot()

    expect((await exportCsv(app, live.event.id, 'nope')).status).toBe(403)
    const res = await exportCsv(app, live.event.id)

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toStartWith('text/csv')
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="rehearsal.csv"')
    const kidRows = (await res.text()).split('\n\n')[0].split('\n').slice(2)
    expect(kidRows).toHaveLength(3)
    expect(kidRows.filter((r) => r.split(',')[5] === '')).toHaveLength(live.kids.length)
  })

  test("round trip: an export seeds next year's counts-only ghost with the same total", async () => {
    const app = start()
    for (const id of ['a', 'b', 'c', 'd']) await postTap(app, aTap(id))
    app.ledger.apply({ type: 'remove', kidId: 'c' })
    app.ledger.apply({ type: 'settings', eventId: app.ledger.snapshot().event.id, name: 'Halloween 2026' })
    const csv = await (await exportCsv(app, app.ledger.snapshot().event.id)).text()
    const dir = mkdtempSync(join(tmpdir(), 'count-dracula-seed-'))
    writeFileSync(join(dir, 'halloween-2026.csv'), csv)

    const nextYear = start({ ghostSeed: join(dir, 'halloween-2026.csv') })

    const ghost = (await (await fetch(`${nextYear.url}/api/snapshot`)).json()).ghost
    expect(ghost.total).toBe(3)
    expect(ghost.label).toBe('2026')
  })
})
