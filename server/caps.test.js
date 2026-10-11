import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer } from './app.js'
import { LIMITS } from './guard.js'
import { fakeGoogle } from '../test/fake-google.js'
import { cookieOf, signIn } from '../test/sign-in.js'
import { readFrames } from '../test/sse.js'

const running = []
const aborts = []
afterEach(() => {
  aborts.splice(0).forEach((c) => c.abort())
  running.splice(0).forEach((app) => app.stop())
})

// A server with small caps, so a test can fill them.
async function server(limits = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'count-dracula-'))
  const configPath = join(dir, 'config.json')
  writeFileSync(configPath, JSON.stringify({ dbPath: join(dir, 'db.sqlite') }))
  const google = fakeGoogle()
  const logs = []
  const app = startServer({ configPath, port: 0, google, env: {}, limits: { ...LIMITS, ...limits }, log: (line) => logs.push(line) })
  running.push(app)
  const cookie = cookieOf(await signIn({ app, google }, { sub: 'a', email: 'a@example.com' }, { displayName: 'House A' }))
  const info = await (await fetch(`${app.url}/api/household`, { headers: { Cookie: cookie } })).json()
  return { app, google, cookie, info, logs }
}

let nextIp = 1
const anotherIp = () => `203.0.113.${nextIp++ % 250}`

// Opens a stream; resolves to its status (200 once the snapshot arrives).
async function stream(app, query, ip = anotherIp()) {
  const controller = new AbortController()
  aborts.push(controller)
  const res = await fetch(`${app.url}/api/stream?${query}`, { signal: controller.signal, headers: { 'CF-Connecting-IP': ip } })
  if (res.ok) await readFrames(res).next()
  return res.status
}

async function pairedDevice(app, cookie) {
  const { code, waitToken } = await (await fetch(`${app.url}/api/pair/code`, { method: 'POST', headers: { 'CF-Connecting-IP': anotherIp() } })).json()
  await fetch(`${app.url}/api/pair/redeem`, { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ code }) })
  return (await (await fetch(`${app.url}/api/pair/wait`, { method: 'POST', body: JSON.stringify({ waitToken }) })).json()).deviceToken
}

describe('stream caps', () => {
  test("past a Household's TV-link viewers, the next is refused while its phones and paired TV still connect", async () => {
    const { app, cookie, info } = await server({ householdViewers: 2 })
    const device = await pairedDevice(app, cookie)

    expect(await stream(app, `key=${info.tvToken}`)).toBe(200)
    expect(await stream(app, `key=${info.tvToken}`)).toBe(200)
    expect(await stream(app, `key=${info.tvToken}`)).toBe(503)
    expect(await stream(app, `key=${info.joinKey}`)).toBe(200)
    expect(await stream(app, `key=${info.tvToken}&device=${device}`)).toBe(200)
  })

  test('past the site-wide number a TV-link viewer is refused but a phone gets in; past the ceiling nothing does', async () => {
    const { app, info } = await server({ siteStreams: 2, siteCeiling: 3 })

    expect(await stream(app, `key=${info.tvToken}`)).toBe(200)
    expect(await stream(app, `key=${info.joinKey}`)).toBe(200)
    expect(await stream(app, `key=${info.tvToken}`)).toBe(503)
    expect(await stream(app, `key=${info.joinKey}`)).toBe(200)
    expect(await stream(app, `key=${info.joinKey}`)).toBe(429)
  })

  test('one IP can hold only so many streams, by CF-Connecting-IP', async () => {
    const { app, info } = await server({ streamsPerIp: 2 })

    expect(await stream(app, `key=${info.joinKey}`, '198.51.100.1')).toBe(200)
    expect(await stream(app, `key=${info.joinKey}`, '198.51.100.1')).toBe(200)
    expect(await stream(app, `key=${info.joinKey}`, '198.51.100.1')).toBe(429)
    expect(await stream(app, `key=${info.joinKey}`, '198.51.100.2')).toBe(200)
  })
})

describe('rate limits on the routes', () => {
  test('taps, per Household: refused past the burst, kept by the phone to send again', async () => {
    const { app, info } = await server({ taps: { count: 3, perMs: 60_000 } })
    const tap = (id) => fetch(`${app.url}/api/taps`, { method: 'POST', headers: { 'X-Join-Key': info.joinKey }, body: JSON.stringify({ id, tagId: null, tappedAt: Date.now(), phoneName: 'Dad' }) })

    const statuses = []
    for (const id of ['a', 'b', 'c', 'd']) statuses.push((await tap(id)).status)

    expect(statuses).toEqual([200, 200, 200, 429])
  })

  test('pairing codes, per IP', async () => {
    const { app } = await server({ pairCode: { count: 2, perMs: 60_000 } })
    const ask = () => fetch(`${app.url}/api/pair/code`, { method: 'POST', headers: { 'CF-Connecting-IP': '198.51.100.9' } })

    expect([(await ask()).status, (await ask()).status, (await ask()).status]).toEqual([200, 200, 429])
  })

  test('redeeming pairing codes, per Manager', async () => {
    const { app, cookie } = await server({ redeem: { count: 2, perMs: 60_000 } })
    const redeem = () => fetch(`${app.url}/api/pair/redeem`, { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ code: 'AAAAAA' }) })

    expect([(await redeem()).status, (await redeem()).status, (await redeem()).status]).toEqual([404, 404, 429])
  })

  test('Google sign-in attempts, per IP', async () => {
    const { app } = await server({ signIn: { count: 1, perMs: 60_000 } })
    const start = () => fetch(`${app.url}/auth/google/start`, { method: 'POST', body: new URLSearchParams({ timeZone: 'UTC' }), headers: { 'CF-Connecting-IP': '198.51.100.3' }, redirect: 'manual' })

    expect([(await start()).status, (await start()).status]).toEqual([303, 429])
  })

  test('new Households, per IP: the next sign-up lands on "Sign-ups are paused" and creates nothing', async () => {
    const { app, google } = await server({ householdsPerIp: { count: 1, perMs: 60_000 } })
    const households = app.ledger.households().length

    // The first sign-up (House A) came from the test runner's own address, as these do.
    const res = await signIn({ app, google }, { sub: 'b', email: 'b@example.com' }, { displayName: 'House B' })

    expect(res.status).toBe(503)
    expect(await res.text()).toContain('Sign-ups are paused, try again later')
    expect(app.ledger.households()).toHaveLength(households)
  })
})

describe('refusals', () => {
  test('are counted for /operator and logged, one line each', async () => {
    const { app, info, logs } = await server({ householdViewers: 1 })
    await stream(app, `key=${info.tvToken}`)

    await stream(app, `key=${info.tvToken}`)
    await stream(app, `key=${info.tvToken}`)

    expect(app.guard.refusals()).toMatchObject({ total: 2, byReason: { tvFull: 2 } })
    expect(logs.filter((l) => l.startsWith('refused'))).toEqual(['refused reason=tvFull', 'refused reason=tvFull'])
  })
})
