// The helper join QR on the porch TV (spec v2.1 §4): a door phone or /setup shows it for 2 minutes. The join
// key travels only to the Household's paired TVs, never to a TV-link viewer or a door phone.
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
  const clock = { at: Date.now() }
  const app = startServer({ configPath, port: 0, google, env: {}, now: () => clock.at })
  running.push(app)
  const cookie = cookieOf(await signIn({ app, google }, { sub: 'a', email: 'a@example.com' }, { displayName: 'House A' }))
  const info = await (await fetch(`${app.url}/api/household`, { headers: { Cookie: cookie } })).json()
  return { app, clock, cookie, info }
}

let nextIp = 1
const anotherIp = () => `203.0.113.${nextIp++ % 250}`

async function pairedDevice(app, cookie) {
  const { code, waitToken } = await (await fetch(`${app.url}/api/pair/code`, { method: 'POST', headers: { 'CF-Connecting-IP': anotherIp() } })).json()
  await fetch(`${app.url}/api/pair/redeem`, { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ code }) })
  return (await (await fetch(`${app.url}/api/pair/wait`, { method: 'POST', body: JSON.stringify({ waitToken }) })).json()).deviceToken
}

async function stream(app, query) {
  const controller = new AbortController()
  aborts.push(controller)
  return readFrames(await fetch(`${app.url}/api/stream?${query}`, { signal: controller.signal, headers: { 'CF-Connecting-IP': anotherIp() } }))
}

const showQr = (app, key, show = true) =>
  fetch(`${app.url}/api/tv/join-qr`, { method: 'POST', headers: { 'X-Join-Key': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ show }) })

// The next frame that isn't a ping.
async function nextFrame(s) {
  for (;;) {
    const f = await s.next()
    if (f.event !== 'ping') return f
  }
}

describe('the join QR on the TV', () => {
  test('a paired TV gets the key; a TV-link viewer gets nothing and a door phone never gets the key', async () => {
    const { app, cookie, info } = await household()
    const device = await pairedDevice(app, cookie)
    const paired = await stream(app, `key=${info.tvToken}&device=${device}`)
    const viewer = await stream(app, `key=${info.tvToken}`)
    const phone = await stream(app, `key=${info.joinKey}`)
    for (const s of [paired, viewer, phone]) expect((await s.next()).event).toBe('snapshot')

    const res = await showQr(app, info.joinKey)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ shown: true, tvs: 1 })

    const onTv = await nextFrame(paired)
    expect(onTv.event).toBe('joinQr')
    expect(onTv.data).toMatchObject({ key: info.joinKey, household: 'House A', msLeft: 120_000 })

    const onPhone = await nextFrame(phone)
    expect(onPhone.event).toBe('joinQr')
    expect(onPhone.data).toEqual({ msLeft: 120_000 })

    // The viewer's next frame is the tap that follows, not the QR.
    await fetch(`${app.url}/api/mix`, { method: 'POST', headers: { 'X-Join-Key': info.joinKey }, body: JSON.stringify({ volume: 0.5, mutes: {} }) })
    const onViewer = await nextFrame(viewer)
    expect(onViewer.event).toBe('delta')
    expect(JSON.stringify(onViewer.data)).not.toContain(info.joinKey)
  })

  test("the paired TV's snapshot carries it while it's showing, with the time left, and not after 2 minutes", async () => {
    const { app, clock, cookie, info } = await household()
    const device = await pairedDevice(app, cookie)
    await (await stream(app, `key=${info.tvToken}&device=${device}`)).next() // the porch TV, on
    await showQr(app, info.joinKey)

    clock.at += 30_000
    const midway = (await (await stream(app, `key=${info.tvToken}&device=${device}`)).next()).data
    expect(midway.joinQr).toMatchObject({ key: info.joinKey, household: 'House A', msLeft: 90_000 })
    const viewer = (await (await stream(app, `key=${info.tvToken}`)).next()).data
    expect(viewer).not.toHaveProperty('joinQr')
    expect(JSON.stringify(viewer)).not.toContain(info.joinKey)
    const phone = (await (await stream(app, `key=${info.joinKey}`)).next()).data
    expect(phone.joinQr).toEqual({ msLeft: 90_000 })

    clock.at += 90_000
    const after = (await (await stream(app, `key=${info.tvToken}&device=${device}`)).next()).data
    expect(after.joinQr).toBeNull()
  })

  test('showing again restarts the 2 minutes', async () => {
    const { app, clock, cookie, info } = await household()
    const device = await pairedDevice(app, cookie)
    await (await stream(app, `key=${info.tvToken}&device=${device}`)).next() // the porch TV, on
    await showQr(app, info.joinKey)
    clock.at += 100_000
    await showQr(app, info.joinKey)
    clock.at += 100_000

    const snap = (await (await stream(app, `key=${info.tvToken}&device=${device}`)).next()).data
    expect(snap.joinQr.msLeft).toBe(20_000)
  })

  test('hide takes it off the TV at once', async () => {
    const { app, cookie, info } = await household()
    const device = await pairedDevice(app, cookie)
    const paired = await stream(app, `key=${info.tvToken}&device=${device}`)
    await paired.next()
    await showQr(app, info.joinKey)
    await nextFrame(paired)

    const res = await showQr(app, info.joinKey, false)
    expect(await res.json()).toMatchObject({ shown: false, tvs: 1 })
    expect(await nextFrame(paired)).toMatchObject({ event: 'joinQr', data: null })
    const snap = (await (await stream(app, `key=${info.tvToken}&device=${device}`)).next()).data
    expect(snap.joinQr).toBeNull()
  })

  test('the answer counts the paired TVs on now: 0 without one, and TV-link viewers never count', async () => {
    const { app, cookie, info } = await household()
    await (await stream(app, `key=${info.tvToken}`)).next()
    // With none on, nothing is held: the phone says so instead of showing a Hide button for no TV.
    expect(await (await showQr(app, info.joinKey)).json()).toEqual({ shown: false, msLeft: 0, tvs: 0 })

    const device = await pairedDevice(app, cookie)
    await (await stream(app, `key=${info.tvToken}&device=${device}`)).next()
    await (await stream(app, `key=${info.tvToken}&device=${device}`)).next()
    expect(await (await showQr(app, info.joinKey)).json()).toMatchObject({ shown: true, tvs: 2 })
  })

  test('Change join key takes it down: the QR on screen would show a dead key', async () => {
    const { app, cookie, info } = await household()
    const device = await pairedDevice(app, cookie)
    await (await stream(app, `key=${info.tvToken}&device=${device}`)).next() // the porch TV, on
    await showQr(app, info.joinKey)
    const paired = await stream(app, `key=${info.tvToken}&device=${device}`)
    expect((await paired.next()).data.joinQr.key).toBe(info.joinKey)

    await fetch(`${app.url}/api/admin`, { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ type: 'changeKey' }) })

    let frame = await nextFrame(paired)
    while (frame.event === 'delta') frame = await nextFrame(paired)
    expect(frame).toMatchObject({ event: 'joinQr', data: null })
  })

  test('a wrong key, or the TV link, is refused', async () => {
    const { app, info } = await household()
    expect((await showQr(app, 'not-a-key')).status).toBe(403)
    expect((await showQr(app, info.tvToken)).status).toBe(403)
  })

  test('/setup reads the time left with the Household', async () => {
    const { app, clock, cookie, info } = await household()
    const device = await pairedDevice(app, cookie)
    await (await stream(app, `key=${info.tvToken}&device=${device}`)).next()
    const read = async () => (await (await fetch(`${app.url}/api/household`, { headers: { Cookie: cookie } })).json()).joinQrMsLeft
    expect(await read()).toBe(0)
    await showQr(app, info.joinKey)
    clock.at += 15_000
    expect(await read()).toBe(105_000)
  })

  test('a Household can show it 10 times a minute', async () => {
    const { app, info } = await household()
    for (let i = 0; i < 10; i++) expect((await showQr(app, info.joinKey)).status).toBe(200)
    expect((await showQr(app, info.joinKey)).status).toBe(429)
    expect((await showQr(app, info.joinKey, false)).status).toBe(200) // hiding is never refused
  })
})
