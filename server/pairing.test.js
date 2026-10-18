import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer } from './app.js'
import { fakeGoogle } from '../test/fake-google.js'
import { cookieOf, signIn } from '../test/sign-in.js'
import { readFrames } from '../test/sse.js'

const MINUTE = 60_000
const running = []
const aborts = []
afterEach(() => {
  aborts.splice(0).forEach((c) => c.abort())
  running.splice(0).forEach((app) => app.stop())
})

async function setUp() {
  const dir = mkdtempSync(join(tmpdir(), 'count-dracula-'))
  const configPath = join(dir, 'config.json')
  writeFileSync(configPath, JSON.stringify({ dbPath: join(dir, 'db.sqlite') }))
  const google = fakeGoogle()
  const clock = { now: Date.parse('2026-10-20T20:00:00Z') }
  const app = startServer({ configPath, port: 0, google, env: {}, now: () => clock.now })
  running.push(app)
  const cookie = cookieOf(await signIn({ app, google }, { sub: 'a', email: 'a@example.com' }, { displayName: 'House A' }))
  const info = await (await fetch(`${app.url}/api/household`, { headers: { Cookie: cookie } })).json()
  return { app, clock, cookie, info }
}

const post = (app, path, body, headers = {}) =>
  fetch(`${app.url}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
const newCode = async (app) => (await post(app, '/api/pair/code', {})).json()
const wait = (app, waitToken) => post(app, '/api/pair/wait', { waitToken })
const redeem = (app, cookie, code) => post(app, '/api/pair/redeem', { code }, cookie ? { Cookie: cookie } : {})

describe('a bare /tv asks for a pairing code', () => {
  test('six characters with no lookalikes, valid 10 minutes, and a secret to wait with', async () => {
    const { app, clock } = await setUp()

    const codes = await Promise.all(Array.from({ length: 20 }, () => newCode(app)))

    for (const { code, waitToken, expiresAt } of codes) {
      expect(code).toMatch(/^[ACDEFHJKMNPQRTUVWXY34679]{6}$/)
      expect(waitToken.length).toBeGreaterThanOrEqual(32)
      expect(expiresAt).toBe(clock.now + 10 * MINUTE)
    }
    expect(new Set(codes.map((c) => c.code)).size).toBe(20)
  })

  test('waits unpaired until a Manager redeems the code, then gets the TV link and a device token', async () => {
    const { app, cookie, info } = await setUp()
    const { code, waitToken } = await newCode(app)
    expect(await (await wait(app, waitToken)).json()).toEqual({ paired: false })

    const res = await redeem(app, cookie, `${code.slice(0, 3).toLowerCase()}-${code.slice(3)}`) // typed as shown, any case

    expect(res.status).toBe(200)
    const paired = await (await wait(app, waitToken)).json()
    expect(paired).toMatchObject({ paired: true, tvToken: info.tvToken })
    expect(paired.deviceToken.length).toBeGreaterThanOrEqual(32)
  })

  test('a paired device is told apart from a TV-link viewer on the server', async () => {
    const { app, cookie, info } = await setUp()
    const { code, waitToken } = await newCode(app)
    await redeem(app, cookie, code)
    const { deviceToken } = await (await wait(app, waitToken)).json()
    const open = async (query) => {
      const controller = new AbortController()
      aborts.push(controller)
      const frames = readFrames(await fetch(`${app.url}/api/stream?${query}`, { signal: controller.signal }))
      await frames.next()
    }

    await open(`key=${info.tvToken}&device=${deviceToken}`)
    await open(`key=${info.tvToken}`)
    await open(`key=${info.tvToken}&device=made-up`)

    expect(app.hub.counts().households[info.id]).toEqual({ phone: 0, paired: 1, tvLink: 2 })
  })
})

describe('redeeming', () => {
  test('needs a Manager session', async () => {
    const { app } = await setUp()
    const { code, waitToken } = await newCode(app)

    expect((await redeem(app, null, code)).status).toBe(401)
    expect(await (await wait(app, waitToken)).json()).toEqual({ paired: false })
  })

  test('an unknown code pairs nothing', async () => {
    const { app, cookie } = await setUp()

    const res = await redeem(app, cookie, 'AAAAAA')

    expect(res.status).toBe(404)
    // Most often the code expired while the Manager signed in: the TV already shows a new one.
    expect(await res.text()).toBe('That code has expired: your TV shows a new one now. Scan it again, or type the new one.')
  })

  test("the TV's pairing screen gives all three ways: scan, type it in on the site, or send it to whoever runs Setup", async () => {
    const { app } = await setUp()

    const html = await (await fetch(`${app.url}/tv`)).text()

    expect(html).toContain("<li><b>Scan the QR</b> with your phone's camera</li>")
    expect(html).toContain('<li>Or on your phone, go to <b id="pair-where"></b> and enter the code under <b>Got a code?</b></li>')
    expect(html).toContain('<li>Or send the code to whoever runs your Setup: they enter it under <b>📺 Your TV</b></li>')
  })

  test('a code works once', async () => {
    const { app, cookie } = await setUp()
    const { code } = await newCode(app)

    expect((await redeem(app, cookie, code)).status).toBe(200)
    expect((await redeem(app, cookie, code)).status).toBe(404)
  })

  test('after 10 minutes the code pairs nothing, and the TV is told to get a new one', async () => {
    const { app, clock, cookie } = await setUp()
    const { code, waitToken } = await newCode(app)

    clock.now += 10 * MINUTE + 1

    expect((await redeem(app, cookie, code)).status).toBe(404)
    expect((await wait(app, waitToken)).status).toBe(410)
  })
})

describe('Rotate TV link', () => {
  test('cuts off paired devices too: their stored link is refused', async () => {
    const { app, cookie } = await setUp()
    const { code, waitToken } = await newCode(app)
    await redeem(app, cookie, code)
    const { tvToken, deviceToken } = await (await wait(app, waitToken)).json()

    await post(app, '/api/admin', { type: 'rotateTvLink' }, { Cookie: cookie })

    expect((await fetch(`${app.url}/api/snapshot?key=${tvToken}&device=${deviceToken}`)).status).toBe(403)
  })
})
