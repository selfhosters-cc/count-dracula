import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer } from './app.js'
import { fakeGoogle } from '../test/fake-google.js'
import { cookieOf, signIn } from '../test/sign-in.js'
import { Database } from 'bun:sqlite'
import { doorNamed, namingTheDoor } from '../test/v1-night.js'

const running = []
afterEach(() => running.splice(0).forEach((app) => app.stop()))

async function setUp(switches = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'count-dracula-'))
  const dbPath = join(dir, 'db.sqlite')
  const configPath = join(dir, 'config.json')
  writeFileSync(configPath, JSON.stringify({ dbPath, switches }))
  const google = fakeGoogle()
  const app = startServer({ configPath, port: 0, google, env: { OPERATOR_EMAILS: 'op@example.com' }, now: () => Date.parse('2026-10-31T23:00:00Z'), log: () => {} })
  running.push(app)
  const cookie = cookieOf(await signIn({ app, google }, { sub: 'a', email: 'a@example.com' }, { displayName: 'The Smiths' }))
  const op = cookieOf(await signIn({ app, google }, { sub: 'op', email: 'op@example.com' }, { displayName: 'Ops' }))
  const info = await (await fetch(`${app.url}/api/household`, { headers: { Cookie: cookie } })).json()
  const house = namingTheDoor(app.ledger.household(info.id))
  house.apply({ type: 'tap', id: 'k1', tagId: null, tappedAt: Date.now(), phoneName: 'Grandma' })
  await fetch(`${app.url}/api/end`, { method: 'POST', headers: { 'X-Join-Key': info.joinKey }, body: JSON.stringify(doorNamed(app.ledger, info.id)) })
  const eventId = house.snapshot().event.id
  const post = (path, body, cookieFor = cookie, headers = {}) => fetch(`${app.url}${path}`, { method: 'POST', headers: { Cookie: cookieFor ?? '', ...headers }, body: JSON.stringify(body) })
  const share = async (hideName = false) => (await (await post('/api/share', { eventId, hideName })).json()).url
  const open = (url) => fetch(`${app.url}/api/share?key=${new URL(url).searchParams.get('key')}`)
  return { app, cookie, op, info, house, eventId, post, share, open, db: () => new Database(dbPath, { readonly: true }) }
}

describe('share links', () => {
  test('open the slides without signing in, under a link shape the log masks', async () => {
    const { app, share, open } = await setUp()

    const url = await share()

    expect(url).toMatch(/\/share\?key=[A-Za-z0-9_-]{32,}$/)
    const page = await fetch(url.replace(/^https?:\/\/[^/]+/, app.url))
    expect(page.status).toBe(200)
    const res = await open(url)
    expect(res.status).toBe(200)
    const s = await res.json()
    expect(s).toMatchObject({ displayName: 'The Smiths', event: { name: 'Halloween 2026' } })
    expect(s.kids).toHaveLength(1)
    expect(JSON.stringify(s)).not.toContain('Grandma')
  })

  test('the same night reuses its link; with the toggle on, the display name is nowhere in the data', async () => {
    const { share, open } = await setUp()
    const first = await share()

    const hidden = await share(true)

    expect(hidden).toBe(first)
    const body = await (await open(hidden)).text()
    expect(body).not.toContain('The Smiths')
  })

  test("there's no link for a night still running", async () => {
    const { post, info, house } = await setUp()
    await post('/api/admin', { type: 'createEvent', name: 'Later' })
    const later = house.events().find((e) => e.name === 'Later')

    expect((await post('/api/share', { eventId: later.id })).status).toBe(404)
    void info
  })

  test('turning sharing off, deleting the night or Suspending the Household makes it "Not available"', async () => {
    const off = await setUp()
    const url = await off.share()
    expect((await off.post('/api/share/off', { eventId: off.eventId })).status).toBe(200)
    expect((await off.open(url)).status).toBe(404)
    expect(await (await off.open(url)).text()).toBe('Not available')

    const deleted = await setUp()
    const url2 = await deleted.share()
    await deleted.post('/api/admin', { type: 'createEvent', name: 'Next' })
    const next = deleted.house.events().find((e) => e.name === 'Next')
    await deleted.post('/api/admin', { type: 'goLive', eventId: next.id })
    await deleted.post('/api/admin', { type: 'deleteEvent', eventId: deleted.eventId, confirm: 'Halloween 2026' })
    expect((await deleted.open(url2)).status).toBe(404)
    expect(deleted.db().query('SELECT COUNT(*) AS n FROM share_links').get().n).toBe(0)

    const suspended = await setUp()
    const url3 = await suspended.share()
    await suspended.post('/api/operator/action', { householdId: suspended.info.id, action: 'suspend' }, suspended.op)
    expect((await suspended.open(url3)).status).toBe(404)
  })

  test('the switch turns every share page off', async () => {
    const { share, open, post, eventId } = await setUp({ shareLinks: false })

    expect((await post('/api/share', { eventId })).status).toBe(404)
    void share
    void open
  })

  test('the page carries the one fixed preview image', async () => {
    const { app, share } = await setUp()
    const url = await share()

    const html = await (await fetch(url.replace(/^https?:\/\/[^/]+/, app.url))).text()

    expect(html).toMatch(/<meta property="og:image" content="https?:\/\/[^"]+\/og-image\.png">/)
    expect((await fetch(`${app.url}/og-image.png`)).headers.get('Content-Type')).toBe('image/png')
  })
})

describe('Reports', () => {
  test('show on /operator, flagged; Dismiss removes the Report and its reason', async () => {
    const { app, op, info, share, post, db } = await setUp()
    const url = await share()
    const key = new URL(url).searchParams.get('key')

    expect((await post('/api/report', { key, reason: '<img src=x onerror=alert(1)>' }, null)).status).toBe(200)

    const row = (await (await fetch(`${app.url}/api/operator`, { headers: { Cookie: op } })).json()).households.find((h) => h.id === info.id)
    expect(row.reports).toBe(1)
    const detail = await (await fetch(`${app.url}/api/operator/household?id=${info.id}`, { headers: { Cookie: op } })).json()
    expect(detail.reports).toMatchObject([{ reason: '<img src=x onerror=alert(1)>' }])

    await post('/api/operator/action', { householdId: info.id, action: 'dismissReport', value: detail.reports[0].id }, op)

    expect(db().query('SELECT COUNT(*) AS n FROM reports').get().n).toBe(0)
  })

  test('the 6th Report from one IP in a day is refused', async () => {
    const { share, post } = await setUp()
    const key = new URL(await share()).searchParams.get('key')

    const statuses = []
    for (let i = 0; i < 6; i++) statuses.push((await post('/api/report', { key }, null, { 'CF-Connecting-IP': '198.51.100.4' })).status)

    expect(statuses).toEqual([200, 200, 200, 200, 200, 429])
  })

  test('Delete my Household takes its share links and Reports too', async () => {
    const { share, post, cookie, info, db } = await setUp()
    const key = new URL(await share()).searchParams.get('key')
    await post('/api/report', { key }, null)

    await post('/api/household/delete', { confirm: 'The Smiths' }, cookie)

    expect(db().query('SELECT COUNT(*) AS n FROM share_links WHERE household_id = ?').get(info.id).n).toBe(0)
    expect(db().query('SELECT COUNT(*) AS n FROM reports WHERE household_id = ?').get(info.id).n).toBe(0)
  })
})
