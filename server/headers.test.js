import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer } from './app.js'
import { openLedger } from './ledger.js'
import { Database } from 'bun:sqlite'

const running = []
afterEach(() => running.splice(0).forEach((app) => app.stop()))

const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://tile.openstreetmap.org; " +
  "connect-src 'self'; form-action 'self' https://accounts.google.com; frame-ancestors 'none'"

describe('browser security headers', () => {
  test('are the same on a page, an API route, a static file, the stream, a redirect and a 404', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'count-dracula-'))
    const db = new Database(join(dir, 'db.sqlite'), { create: true })
    const key = openLedger(db, {}).household(openLedger(db, {}).createHousehold({ displayName: 'A', timeZone: 'UTC' })).joinKey()
    db.close()
    const configPath = join(dir, 'config.json')
    writeFileSync(configPath, JSON.stringify({ dbPath: join(dir, 'db.sqlite') }))
    const app = startServer({ configPath, port: 0, env: {} })
    running.push(app)
    const controller = new AbortController()

    const responses = {
      page: await fetch(`${app.url}/`),
      api: await fetch(`${app.url}/api/snapshot?key=${key}`),
      refusedApi: await fetch(`${app.url}/api/snapshot`),
      static: await fetch(`${app.url}/live.js`),
      stream: await fetch(`${app.url}/api/stream?key=${key}`, { signal: controller.signal }),
      redirect: await fetch(`${app.url}/setup`, { redirect: 'manual' }),
      missing: await fetch(`${app.url}/nope`),
    }
    controller.abort()

    for (const [what, res] of Object.entries(responses)) {
      expect({ what, csp: res.headers.get('Content-Security-Policy') }).toEqual({ what, csp: CSP })
      expect({ what, referrer: res.headers.get('Referrer-Policy') }).toEqual({ what, referrer: 'strict-origin-when-cross-origin' })
      expect({ what, sniff: res.headers.get('X-Content-Type-Options') }).toEqual({ what, sniff: 'nosniff' })
    }
  })

  test('no page carries an inline script or handler', async () => {
    const pages = new Bun.Glob('*.html').scanSync(new URL('../public', import.meta.url).pathname)
    for (const name of pages) {
      const html = await Bun.file(new URL(`../public/${name}`, import.meta.url)).text()
      const inline = [...html.matchAll(/<script\b([^>]*)>/g)].filter(([, attrs]) => !/\bsrc=/.test(attrs))
      expect({ name, inline: inline.length, handlers: /\son[a-z]+=["']/.test(html) }).toEqual({ name, inline: 0, handlers: false })
    }
  })
})

describe('markup built in the browser', () => {
  // Each of these was read and builds only static markup, esc()'d text, numbers or the QR library's SVG. Names
  // people type (households, nights, costumes, phones) go in as text. A new one needs the same check before it
  // joins the list: the CSP stops scripts, not a <meta> redirect or a <style> over the TV.
  const CHECKED = { 'door.js': 3, 'setup.js': 1, 'summary.js': 2, 'tv.js': 5, 'tally.js': 1, 'setup-household.js': 1 }

  test('sets HTML only where it was checked', async () => {
    const found = {}
    for (const name of new Bun.Glob('*.js').scanSync(new URL('../public', import.meta.url).pathname)) {
      if (name.endsWith('.test.js')) continue
      const js = await Bun.file(new URL(`../public/${name}`, import.meta.url)).text()
      const sinks = js.match(/\.(?:innerHTML|outerHTML)\s*=|insertAdjacentHTML\(|document\.write/g)?.length ?? 0
      if (sinks) found[name] = sinks
    }

    expect(found).toEqual(CHECKED)
  })
})

describe('/healthz', () => {
  test('answers without a credential, for the deploy check', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'count-dracula-'))
    const configPath = join(dir, 'config.json')
    writeFileSync(configPath, JSON.stringify({ dbPath: join(dir, 'db.sqlite') }))
    const app = startServer({ configPath, port: 0, env: {} })
    running.push(app)

    const res = await fetch(`${app.url}/healthz`)

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
  })
})
