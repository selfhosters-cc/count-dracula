// The Extension seam (v2.2 §3–4, ADR 0001), through the fixture Extension under test/.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { VERSION, startServer } from './app.js'
import * as fixture from '../test/fixture-extension/index.js'
import { fakeGoogle } from '../test/fake-google.js'
import { cookieOf, signIn } from '../test/sign-in.js'

const running = []
afterEach(() => running.splice(0).forEach((app) => app.stop()))

function start({ extensions = [fixture], env = {}, ...options } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'count-dracula-'))
  const configPath = join(dir, 'config.json')
  writeFileSync(configPath, JSON.stringify({ dbPath: join(dir, 'db.sqlite') }))
  const app = startServer({ configPath, port: 0, env, extensions, log: () => {}, ...options })
  running.push(app)
  return app
}

// The fixture, wrapped to show what reaches it: the core it started with, each request, and each stop.
function watched(ext = fixture) {
  const seen = { core: null, requests: [], stops: 0 }
  const watching = {
    ...ext,
    start(core) {
      seen.core = core
      const started = ext.start(core)
      return {
        handle(req, url) {
          seen.requests.push(`${req.method} ${url.pathname}`)
          return started.handle(req, url)
        },
        stop() {
          seen.stops++
          started.stop()
        },
      }
    },
  }
  return { ext: watching, seen }
}

const wontStart = () => {
  throw new Error('the fixture would not start')
}

describe("an Extension's addresses", () => {
  test('its handle gets GET /<name>/… and POST /api/<name>/…', async () => {
    const app = start()

    const get = await fetch(`${app.url}/fixture/x`)
    const post = await fetch(`${app.url}/api/fixture/y`, { method: 'POST', body: '{}' })

    expect(await get.json()).toEqual({ method: 'GET', path: '/fixture/x' })
    expect(await post.json()).toEqual({ method: 'POST', path: '/api/fixture/y' })
  })

  test("a cross-site write is refused before handle runs, and every answer carries the core's CSP", async () => {
    const { ext, seen } = watched()
    const app = start({ extensions: [ext] })

    const refused = await fetch(`${app.url}/api/fixture/y`, { method: 'POST', body: '{}', headers: { 'Sec-Fetch-Site': 'cross-site' } })
    const page = await fetch(`${app.url}/fixture`)
    const api = await fetch(`${app.url}/api/fixture/y`, { method: 'POST', body: '{}' })

    expect(refused.status).toBe(403)
    expect(seen.requests).toEqual(['GET /fixture', 'POST /api/fixture/y'])
    for (const res of [refused, page, api]) expect(res.headers.get('Content-Security-Policy')).toStartWith("default-src 'self'; script-src 'self';")
  })

  test('its public/ folder: /<name> is index.html, templated and stamped like a core page', async () => {
    const app = start()

    const res = await fetch(`${app.url}/fixture`)
    const html = await res.text()

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toStartWith('text/html')
    expect(html).toContain(`release ${VERSION}.`)
    expect(html).toMatch(/src="\/fixture\/page\.js\?v=\w+"/)
    expect(await (await fetch(`${app.url}/fixture/page.js`)).text()).toMatch(/from '\/shared\/codes\.js\?v=\w+'/)
  })

  test('serves nothing outside its folder, no test file, and nothing at /api/<name> that handle leaves', async () => {
    const app = start()

    for (const path of ['/fixture/a.test.js', '/fixture/../server/app.js', '/fixture/..%2fserver%2fapp.js', '/fixture/%2e%2e/index.js', '/fixture/..%2findex.js', '/fixture/nope.html', '/api/fixture/page.js']) {
      expect({ path, status: (await fetch(`${app.url}${path}`)).status }).toEqual({ path, status: 404 })
    }
  })

  test("core.serve gives an address that isn't the file's own the same templated page", async () => {
    const app = start()

    const own = await (await fetch(`${app.url}/fixture`)).text()
    const res = await fetch(`${app.url}/fixture/abc123`)

    expect(res.status).toBe(200)
    expect(await res.text()).toBe(own)
  })

  test("handle's own Cache-Control reaches the client unchanged", async () => {
    const app = start()

    const res = await fetch(`${app.url}/fixture/kept-a-minute`)

    expect(res.headers.get('Cache-Control')).toBe('public, max-age=60')
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })

  test('a throw in handle is a 500 counted on the health strip, and the server keeps serving', async () => {
    const google = fakeGoogle()
    const app = start({ google, env: { OPERATOR_EMAILS: 'op@example.com' } })
    const op = cookieOf(await signIn({ app, google }, { sub: 'op', email: 'op@example.com' }, { displayName: 'Ops' }))

    const res = await fetch(`${app.url}/api/fixture/boom`)
    const errors = (await (await fetch(`${app.url}/api/operator`, { headers: { Cookie: op } })).json()).health.find((t) => t.key === 'errors')

    expect(res.status).toBe(500)
    expect(errors.level).toBe('red')
    expect(errors.detail).toContain('Error in GET /api/fixture/boom')
    expect((await fetch(`${app.url}/fixture/x`)).status).toBe(200)
  })

  test("with no Extension, its addresses are the core's own 404s", async () => {
    const app = start({ extensions: [] })

    expect((await fetch(`${app.url}/fixture/x`)).status).toBe(404)
    expect((await fetch(`${app.url}/api/fixture/y`, { method: 'POST', body: '{}' })).status).toBe(404)
  })
})

describe('what core holds', () => {
  test('nothing more than v2.2 §3 lists', () => {
    const { ext, seen } = watched()
    start({ extensions: [ext] })

    expect(Object.keys(seen.core).sort()).toEqual(['clientIp', 'db', 'env', 'guard', 'ledger', 'log', 'now', 'serve', 'setSiteSwitch', 'siteSwitch', 'switches'])
    expect(Object.keys(seen.core.guard).sort()).toEqual(['manager', 'operator', 'read', 'take'])
  })

  test('env holds only its own <NAME>_* keys', () => {
    const { ext, seen } = watched()
    start({ extensions: [ext], env: { FIXTURE_DATA: '/srv/fixture', FIXTURES: 'no', OPERATOR_EMAILS: 'op@example.com', SMTP_PASS: 'secret' } })

    expect(seen.core.env).toEqual({ FIXTURE_DATA: '/srv/fixture' })
  })

  // Its env is every key named <NAME>_…, so no key the core reads may be: GOOGLE_CLIENT_SECRET, SMTP_PASS, ….
  test.each(['google', 'smtp', 'public', 'trusted', 'count'])('%s, the first part of a core env key, fails the boot', (name) => {
    expect(() => start({ extensions: [{ ...fixture, name, owns: {}, migrations: [] }] })).toThrow(`${name.toUpperCase()}_`)
  })

  test('site switches only under <name>., and the config switches read-only', () => {
    const { ext, seen } = watched()
    const app = start({ extensions: [ext] })
    const { core } = seen

    core.setSiteSwitch('fixture.off', true)

    expect(core.siteSwitch('fixture.off')).toBe(true)
    expect(app.ledger.siteSwitch('fixture.off')).toBe(true)
    expect(() => core.setSiteSwitch('other.x', true)).toThrow()
    expect(() => core.setSiteSwitch('pauseSignUps', true)).toThrow()
    expect(() => core.siteSwitch('pauseSignUps')).toThrow()
    expect(app.ledger.siteSwitch('pauseSignUps')).toBe(false)
    expect(core.switches.shareLinks).toBe(true)
    expect(() => {
      core.switches.shareLinks = false
    }).toThrow()
  })

  test("guard.manager in an Extension's route: 401 signed out, 403 Suspended, as in a core route", async () => {
    const google = fakeGoogle()
    const app = start({ google, env: { OPERATOR_EMAILS: 'op@example.com' } })
    const op = cookieOf(await signIn({ app, google }, { sub: 'op', email: 'op@example.com' }, { displayName: 'Ops' }))
    const smith = cookieOf(await signIn({ app, google }, { sub: 's', email: 'smith@example.com' }, { displayName: 'The Smiths' }))
    const { id } = await (await fetch(`${app.url}/api/household`, { headers: { Cookie: smith } })).json()

    const signedOut = await fetch(`${app.url}/api/fixture/me`)
    const signedIn = await fetch(`${app.url}/api/fixture/me`, { headers: { Cookie: smith } })
    await fetch(`${app.url}/api/operator/action`, { method: 'POST', headers: { Cookie: op }, body: JSON.stringify({ householdId: id, action: 'suspend' }) })
    const suspended = await fetch(`${app.url}/api/fixture/me`, { headers: { Cookie: smith } })

    expect(signedOut.status).toBe(401)
    expect(await signedIn.json()).toEqual({ household: id })
    expect(suspended.status).toBe(403)
  })
})

describe('starting and stopping', () => {
  test.each([
    ['a bad name', [{ ...fixture, name: 'Fix-ture' }]],
    ['no name', [{ ...fixture, name: undefined }]],
    ['api', [{ ...fixture, name: 'api' }]],
    ['setup', [{ ...fixture, name: 'setup' }]],
    ['door', [{ ...fixture, name: 'door' }]],
    ['a core /api/ name', [{ ...fixture, name: 'operator' }]],
    ['a public/ folder', [{ ...fixture, name: 'vendor' }]],
    ['two Extensions with one name', [fixture, fixture]],
    ['a throw in start', [{ ...fixture, start: wontStart }]],
  ])('%s stops startServer', (_, extensions) => {
    expect(() => start({ extensions })).toThrow()
  })

  test('one failing to start stops those already started', () => {
    const { ext, seen } = watched()

    expect(() => start({ extensions: [ext, { ...fixture, name: 'other', start: wontStart }] })).toThrow()
    expect(seen.stops).toBe(1)
  })

  test("app.stop() calls each Extension's stop()", () => {
    const { ext, seen } = watched()
    const app = start({ extensions: [ext] })

    running.splice(running.indexOf(app), 1)
    app.stop()

    expect(seen.stops).toBe(1)
  })
})
