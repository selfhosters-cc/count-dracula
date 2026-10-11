import { afterEach, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer } from './app.js'
import { openLedger } from './ledger.js'
import { fakeGoogle } from '../test/fake-google.js'
import { cookieOf, signIn } from '../test/sign-in.js'
import { readFrames } from '../test/sse.js'
import { doorNamed } from '../test/v1-night.js'

const running = []
const aborts = []
afterEach(() => {
  aborts.splice(0).forEach((c) => c.abort())
  running.splice(0).forEach((app) => app.stop())
})

async function newManager() {
  const dir = mkdtempSync(join(tmpdir(), 'count-dracula-'))
  const configPath = join(dir, 'config.json')
  writeFileSync(configPath, JSON.stringify({ dbPath: join(dir, 'db.sqlite') }))
  const google = fakeGoogle()
  const app = startServer({ configPath, port: 0, google, env: {}, now: () => Date.parse('2026-10-20T20:00:00Z') })
  running.push(app)
  const cookie = cookieOf(await signIn({ app, google }, { sub: 'a', email: 'a@example.com' }, { displayName: 'House A' }))
  const household = async () => (await fetch(`${app.url}/api/household`, { headers: { Cookie: cookie } })).json()
  const admin = (command) => fetch(`${app.url}/api/admin`, { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify(command) })
  return { app, cookie, household, admin, info: await household() }
}

async function open(app, query) {
  const controller = new AbortController()
  aborts.push(controller)
  const frames = readFrames(await fetch(`${app.url}/api/stream?${query}`, { signal: controller.signal }))
  await frames.next()
  return frames
}

const tap = (app, key, id) => fetch(`${app.url}/api/taps`, { method: 'POST', headers: { 'X-Join-Key': key }, body: JSON.stringify({ ...doorNamed(app.ledger, app.ledger.householdByJoinKey(key)), id, tagId: null, tappedAt: Date.now(), phoneName: 'Dad' }) })

describe('first-run', () => {
  test('shows until screen 3 has been passed once', async () => {
    const { admin, household, info } = await newManager()
    expect(info.firstRunPassed).toBe(false)

    expect((await admin({ type: 'passFirstRun' })).status).toBe(200)

    expect((await household()).firstRunPassed).toBe(true)
  })

  test('a migrated Household #1 has nothing to run through', () => {
    const db = new Database(':memory:')
    db.exec("CREATE TABLE events (id INTEGER PRIMARY KEY, name TEXT NOT NULL, live INTEGER NOT NULL DEFAULT 0, frozen INTEGER NOT NULL DEFAULT 0, ended INTEGER NOT NULL DEFAULT 0, join_key TEXT, clock_shift_ms INTEGER NOT NULL DEFAULT 0, race_against_id INTEGER, expected_kids INTEGER, visit_window_ms INTEGER NOT NULL DEFAULT 15000, golden_count INTEGER NOT NULL DEFAULT 0, counts_only INTEGER NOT NULL DEFAULT 0)")
    db.exec("INSERT INTO events (name, live, join_key) VALUES ('Rehearsal', 1, 'abcdefghij')")

    const ledger = openLedger(db, {})

    expect(ledger.households()[0].firstRunPassed).toBe(true)
  })
})

describe('the ready checklist', () => {
  test('"A TV is watching" ticks while a TV-link or paired screen is connected', async () => {
    const { app, household, info } = await newManager()
    expect((await household()).checklist.tvWatching).toBe(false)

    await open(app, `key=${info.joinKey}`) // a phone isn't a TV
    expect((await household()).checklist.tvWatching).toBe(false)
    await open(app, `key=${info.tvToken}`)

    expect((await household()).checklist.tvWatching).toBe(true)
  })

  test('"A phone counted a test kid" ticks with any kid, on any Event', async () => {
    const { app, household, info } = await newManager()
    expect((await household()).checklist.anyKids).toBe(0)

    await tap(app, info.joinKey, 'test-kid')

    expect((await household()).checklist.anyKids).toBe(1)
  })
})

describe('/help/tv', () => {
  test('is reachable signed out', async () => {
    const { app } = await newManager()

    const res = await fetch(`${app.url}/help/tv`)

    expect(res.status).toBe(200)
    const html = await res.text()
    for (const point of ['Chrome or Edge', 'Windows:', 'macOS:', 'Linux:', 'F11', 'sound output', '/tv?border', 'A reload needs a click or a key press for sound', 'Smart TVs and other devices', 'test it on your Test night (or Go live on any night)', 'on your Test night: it\'s the ceiling', 'count-dracula-tv.bat', 'count-dracula-tv.sh', 'email us']) {
      expect({ point, there: html.includes(point) }).toEqual({ point, there: true })
    }
    expect(html).not.toContain('install-cachyos')
  })

  test('the launchers open a bare /tv on the address they came from, and carry no secret', async () => {
    const { app, info } = await newManager()
    const fromPublic = { headers: { Host: 'count-dracula.example.com', 'X-Forwarded-Proto': 'https' } }

    const bat = await (await fetch(`${app.url}/kiosk/count-dracula-tv.bat`, fromPublic)).text()
    const sh = await (await fetch(`${app.url}/kiosk/count-dracula-tv.sh`, fromPublic)).text()

    expect(bat).toContain('set URL=https://count-dracula.example.com/tv')
    expect(sh).toContain('URL=${1:-https://count-dracula.example.com/tv}')
    for (const script of [bat, sh]) {
      expect(script).not.toContain(info.joinKey)
      expect(script).not.toContain(info.tvToken)
      expect(script).not.toMatch(/key=|\/tv\/k\//)
    }
  })
})

describe('/setup', () => {
  test('"Count on this device": a tablet or laptop can count too', async () => {
    const { app } = await newManager()

    const html = await (await fetch(`${app.url}/setup.html`)).text()

    expect(html).toContain('📱 Count on this device')
    expect(html).not.toContain('this phone')
  })

  test("the Household's name heads the page, above the tabs; the checklist tops Tonight (spec v2.1 §8, §9)", async () => {
    const { app } = await newManager()

    const html = await (await fetch(`${app.url}/setup.html`)).text()

    const name = html.indexOf('id="house-name"')
    expect(name).toBeGreaterThan(-1)
    expect(name).toBeLessThan(html.indexOf('role="tablist"'))
    const tonight = html.indexOf('id="screen-tonight"')
    expect(html.indexOf('id="checklist"')).toBeGreaterThan(tonight)
    expect(html.indexOf('id="checklist"')).toBeLessThan(html.indexOf('id="tonight"'))
    expect(html).not.toContain('Live now')
    expect(html.indexOf('id="name-form"')).toBeGreaterThan(html.indexOf('id="screen-household"'))
  })
})
