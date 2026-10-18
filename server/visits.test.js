import { afterEach, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openLedger } from './ledger.js'
import { createVisits, dayOf, sourceOf } from './visits.js'
import { startServer } from './app.js'
import { fakeGoogle } from '../test/fake-google.js'
import { cookieOf, signIn } from '../test/sign-in.js'

const NOW = Date.parse('2026-10-31T23:00:00Z') // 7 pm in Toronto
const PHONE = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36'
const LAPTOP = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36'
const site = 'https://countdracula.cc'

describe('where a visitor came from', () => {
  test('a ?ref= or ?utm_source= label first, then the site that linked here, else direct', () => {
    expect(sourceOf({ url: `${site}/?ref=Reddit`, referer: 'https://www.google.com/', host: 'countdracula.cc' })).toBe('reddit')
    expect(sourceOf({ url: `${site}/?utm_source=newsletter`, referer: null, host: 'countdracula.cc' })).toBe('newsletter')
    expect(sourceOf({ url: `${site}/`, referer: 'https://www.reddit.com/r/halloween/comments/abc', host: 'countdracula.cc' })).toBe('reddit.com')
    expect(sourceOf({ url: `${site}/`, referer: 'android-app://com.whatsapp/', host: 'countdracula.cc' })).toBe('WhatsApp')
    expect(sourceOf({ url: `${site}/`, referer: 'android-app://com.example.reader/', host: 'countdracula.cc' })).toBe('com.example.reader')
    expect(sourceOf({ url: `${site}/`, referer: null, host: 'countdracula.cc' })).toBe('direct')
    expect(sourceOf({ url: `${site}/privacy`, referer: `${site}/`, host: 'countdracula.cc' })).toBeNull() // one of our own pages
  })
})

describe('counting visits', () => {
  function visits(clock = { now: NOW }) {
    const db = new Database(':memory:')
    openLedger(db, { now: () => clock.now }) // its migrations make the tables
    return { counter: createVisits({ db, now: () => clock.now }), db, clock }
  }
  const visit = (counter, overrides = {}) => counter.record({ page: '/', ip: '203.0.113.5', userAgent: PHONE, referer: null, url: `${site}/`, host: 'countdracula.cc', ...overrides })

  test('views, distinct visitors and their sources, per day in Toronto', () => {
    const { counter } = visits()
    visit(counter, { url: `${site}/?ref=reddit` })
    visit(counter) // the same person again: a view, not a visitor
    visit(counter, { page: '/privacy', referer: `${site}/`, url: `${site}/privacy` })
    visit(counter, { ip: '198.51.100.9', userAgent: LAPTOP })

    const { days, sources } = counter.summary(30)
    expect(days).toEqual([
      { day: '2026-10-31', page: '/', views: 3, visitors: 2 },
      { day: '2026-10-31', page: '/privacy', views: 1, visitors: 1 },
    ])
    expect(sources).toEqual([{ source: 'direct', visitors: 1 }, { source: 'reddit', visitors: 1 }])
    expect(dayOf(Date.parse('2026-11-01T03:59:00Z'))).toBe('2026-10-31') // 11:59 pm in Toronto
  })

  test('machines and other pages are never counted, and nothing kept names anyone', () => {
    const { counter, db } = visits()
    for (const userAgent of ['WhatsApp/2.23.20.0 A', 'facebookexternalhit/1.1', 'Googlebot/2.1', 'curl/8.5.0', 'Mozilla/5.0 HeadlessChrome/130', '']) {
      expect(visit(counter, { userAgent })).toBe(false)
    }
    expect(visit(counter, { page: '/door' })).toBe(false)
    expect(counter.summary(30).days).toEqual([])

    visit(counter)
    const kept = JSON.stringify([db.query('SELECT * FROM site_visits').all(), db.query('SELECT * FROM site_sources').all()])
    expect(kept).not.toContain('203.0.113.5')
    expect(kept).not.toContain('Android')
  })

  test('a new day is a new count, and the summary keeps to the last 30 days', () => {
    const { counter, clock } = visits()
    visit(counter)
    clock.now += 40 * 86_400_000
    visit(counter)
    expect(counter.summary(30).days.map((d) => [d.day, d.visitors])).toEqual([['2026-12-10', 1]])
  })
})

describe('the server counts its public pages', () => {
  const running = []
  afterEach(() => running.splice(0).forEach((app) => app.stop()))

  test("a homepage visit counts; a signed-in Manager's doesn't; /operator's Stats has them", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'count-dracula-'))
    const configPath = join(dir, 'config.json')
    writeFileSync(configPath, JSON.stringify({ dbPath: join(dir, 'db.sqlite') }))
    const google = fakeGoogle()
    const app = startServer({ configPath, port: 0, google, env: { OPERATOR_EMAILS: 'op@example.com' }, log: () => {} })
    running.push(app)
    const op = cookieOf(await signIn({ app, google }, { sub: 'op', email: 'op@example.com' }, { displayName: 'Ops' }))

    await fetch(`${app.url}/?ref=whatsapp`, { headers: { 'User-Agent': PHONE } })
    await fetch(`${app.url}/`, { headers: { 'User-Agent': LAPTOP, Cookie: op } })
    await fetch(`${app.url}/`, { headers: { 'User-Agent': 'WhatsApp/2.23.20.0 A' } })

    const { visits } = await (await fetch(`${app.url}/api/operator/stats`, { headers: { Cookie: op } })).json()
    expect(visits.days.map(({ page, views, visitors }) => ({ page, views, visitors }))).toEqual([{ page: '/', views: 1, visitors: 1 }])
    expect(visits.sources).toEqual([{ source: 'whatsapp', visitors: 1 }])
  })
})
