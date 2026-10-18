// Watchers: the watch code (the TV link's short form, typed under "Got a code?") and the watch QR, which a door
// phone or /setup puts on every screen watching for 2 minutes, so someone at the porch can watch along.
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

async function household() {
  const dir = mkdtempSync(join(tmpdir(), 'count-dracula-'))
  const configPath = join(dir, 'config.json')
  writeFileSync(configPath, JSON.stringify({ dbPath: join(dir, 'db.sqlite') }))
  const google = fakeGoogle()
  const app = startServer({ configPath, port: 0, google, env: {}, log: () => {} })
  running.push(app)
  const cookie = cookieOf(await signIn({ app, google }, { sub: 'a', email: 'a@example.com' }, { displayName: 'House A' }))
  const info = await (await fetch(`${app.url}/api/household`, { headers: { Cookie: cookie } })).json()
  return { app, cookie, info }
}

let nextIp = 1
const anotherIp = () => `203.0.113.${nextIp++ % 250}`

async function stream(app, query) {
  const controller = new AbortController()
  aborts.push(controller)
  return readFrames(await fetch(`${app.url}/api/stream?${query}`, { signal: controller.signal, headers: { 'CF-Connecting-IP': anotherIp() } }))
}

const show = (app, key, which, on = true) =>
  fetch(`${app.url}/api/tv/${which}-qr`, { method: 'POST', headers: { 'X-Join-Key': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ show: on }) })

async function nextFrame(s) {
  for (;;) {
    const f = await s.next()
    if (f.event !== 'ping') return f
  }
}

const code = (app, text, ip = anotherIp()) => fetch(`${app.url}/api/code?code=${encodeURIComponent(text)}`, { headers: { 'CF-Connecting-IP': ip } })

describe('the watch code', () => {
  test('Got a code? tells a join code from a watch code, which opens the TV link', async () => {
    const { app, info } = await household()

    for (const short of [info.joinCode, info.watchCode]) expect(short).toMatch(/^[ACDEFHJKMNPQRTUVWXY34679]{6}$/)
    expect(info.watchCode).not.toBe(info.joinCode)
    const typed = (c) => `${c.slice(0, 3).toLowerCase()}-${c.slice(3)}` // as a person types it
    expect(await (await code(app, typed(info.joinCode))).json()).toEqual({ join: info.joinKey })
    expect(await (await code(app, typed(info.watchCode))).json()).toEqual({ watch: `/tv/k/${info.tvToken}` })
    expect(await (await code(app, info.joinKey)).json()).toEqual({ join: info.joinKey }) // an old 10-character one
    expect((await code(app, 'XXX-XXX')).status).toBe(404)
  })

  test('Rotate TV link changes the watch code too: the old one opens nothing', async () => {
    const { app, cookie, info } = await household()

    await fetch(`${app.url}/api/admin`, { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ type: 'rotateTvLink' }) })
    const after = await (await fetch(`${app.url}/api/household`, { headers: { Cookie: cookie } })).json()

    expect(after.watchCode).not.toBe(info.watchCode)
    expect((await code(app, info.watchCode)).status).toBe(404)
    expect(await (await code(app, after.watchCode)).json()).toEqual({ watch: `/tv/k/${after.tvToken}` })
  })

  test('a door phone reads both codes and the TV link with its join key, and nothing else does', async () => {
    const { app, info } = await household()

    expect(await (await fetch(`${app.url}/api/codes`, { headers: { 'X-Join-Key': info.joinKey } })).json()).toEqual({ joinCode: info.joinCode, watchCode: info.watchCode, tvToken: info.tvToken })
    expect((await fetch(`${app.url}/api/codes`, { headers: { 'X-Join-Key': info.tvToken } })).status).toBe(403)
  })

  test('Change join key changes the join code too', async () => {
    const { app, cookie, info } = await household()

    await fetch(`${app.url}/api/admin`, { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ type: 'changeKey' }) })
    const after = await (await fetch(`${app.url}/api/household`, { headers: { Cookie: cookie } })).json()

    expect(after.joinCode).not.toBe(info.joinCode)
    expect((await code(app, info.joinCode)).status).toBe(404)
    expect(await (await code(app, after.joinCode)).json()).toEqual({ join: after.joinKey })
  })

  test("a TV's pairing code typed in the same box says so", async () => {
    const { app } = await household()
    const { code: tv } = await (await fetch(`${app.url}/api/pair/code`, { method: 'POST', headers: { 'CF-Connecting-IP': anotherIp() } })).json()
    expect(await (await code(app, tv)).json()).toEqual({ pair: tv })
  })

  test('codes are tried at most 30 times an hour from one address', async () => {
    const { app } = await household()
    for (let i = 0; i < 30; i++) await code(app, 'NoSuchCode', '198.51.100.7')
    expect((await code(app, 'NoSuchCode', '198.51.100.7')).status).toBe(429)
  })
})

describe('the watch QR on the TV', () => {
  test('every screen watching gets the link and code; a door phone only the time left', async () => {
    const { app, info } = await household()
    const viewer = await stream(app, `key=${info.tvToken}`)
    const phone = await stream(app, `key=${info.joinKey}`)
    for (const s of [viewer, phone]) expect((await s.next()).event).toBe('snapshot')

    const res = await show(app, info.joinKey, 'watch')
    expect(await res.json()).toMatchObject({ shown: true, tvs: 1 })

    expect(await nextFrame(viewer)).toMatchObject({ event: 'watchQr', data: { token: info.tvToken, code: info.watchCode, msLeft: 120_000 } })
    expect(await nextFrame(phone)).toMatchObject({ event: 'watchQr', data: { msLeft: 120_000 } })
    const reconnected = (await (await stream(app, `key=${info.joinKey}`)).next()).data.watchQr
    expect(Object.keys(reconnected)).toEqual(['msLeft']) // a phone that reconnects gets the time left, still no link
  })

  test('the TV shows one card at a time: the watch QR takes the helper QR down, and back', async () => {
    const { app, info } = await household()
    const viewer = await stream(app, `key=${info.tvToken}`)
    await viewer.next()

    const noPairedTv = await (await show(app, info.joinKey, 'join')).json()
    expect(noPairedTv).toMatchObject({ shown: false, tvs: 0 }) // the helper QR needs a paired TV
    await show(app, info.joinKey, 'watch')
    expect((await nextFrame(viewer)).event).toBe('watchQr')

    await show(app, info.joinKey, 'watch', false)
    expect(await nextFrame(viewer)).toMatchObject({ event: 'watchQr', data: null })
  })

  test('with no screen watching it says so, and holds nothing', async () => {
    const { app, info } = await household()
    expect(await (await show(app, info.joinKey, 'watch')).json()).toEqual({ shown: false, msLeft: 0, tvs: 0 })
  })
})
