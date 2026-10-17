// Writes from another site are refused (app.js crossSite): a sibling subdomain is the same site to SameSite=Lax, so
// a Manager's cookie would go along with its form. Sec-Fetch-Site decides; without it, Origin against this host.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer } from './app.js'
import { fakeGoogle } from '../test/fake-google.js'
import { cookieOf, signIn } from '../test/sign-in.js'

const running = []
afterEach(() => running.splice(0).forEach((app) => app.stop()))

async function served(env = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'count-dracula-'))
  const configPath = join(dir, 'config.json')
  writeFileSync(configPath, JSON.stringify({ dbPath: join(dir, 'db.sqlite') }))
  const google = fakeGoogle()
  const app = startServer({ configPath, port: 0, google, env })
  running.push(app)
  const cookie = cookieOf(await signIn({ app, google }, { sub: 'a', email: 'a@example.com' }, { displayName: 'The Smiths' }))
  const info = await (await fetch(`${app.url}/api/household`, { headers: { Cookie: cookie } })).json()
  // Change join key: a Manager's write that leaves a mark.
  const changeKey = (headers) =>
    fetch(`${app.url}/api/admin`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'text/plain', ...headers }, body: JSON.stringify({ type: 'changeKey' }) })
  const joinKey = () => app.ledger.household(info.id).joinKey()
  return { app, changeKey, joinKey }
}

describe('a write from another site', () => {
  test('is refused when the browser says cross-site or same-site, and changes nothing', async () => {
    const { changeKey, joinKey } = await served()
    const before = joinKey()

    for (const site of ['cross-site', 'same-site']) {
      const res = await changeKey({ 'Sec-Fetch-Site': site, Origin: 'https://other.example.com' })
      expect({ site, status: res.status, text: await res.text() }).toEqual({ site, status: 403, text: 'Refused: this came from another site' })
    }
    expect(joinKey()).toBe(before)
  })

  test('from an older browser with no Sec-Fetch-Site, is refused by its Origin', async () => {
    const { changeKey, joinKey } = await served()
    const before = joinKey()

    expect((await changeKey({ Origin: 'https://other.example.com' })).status).toBe(403)
    expect((await changeKey({ Origin: 'null' })).status).toBe(403)
    expect(joinKey()).toBe(before)
  })

  test('refuses sign-in and sign-out forms too', async () => {
    const { app } = await served()

    const start = await fetch(`${app.url}/auth/google/start`, { method: 'POST', body: new URLSearchParams({ timeZone: 'UTC' }), headers: { 'Sec-Fetch-Site': 'cross-site' }, redirect: 'manual' })
    const out = await fetch(`${app.url}/auth/signout`, { method: 'POST', headers: { 'Sec-Fetch-Site': 'same-site' }, redirect: 'manual' })

    expect([start.status, out.status]).toEqual([403, 403])
  })
})

describe('a write from this site', () => {
  test('goes through: same-origin, typed in the address bar, or with no browser headers at all', async () => {
    const { changeKey, joinKey } = await served()

    for (const headers of [{ 'Sec-Fetch-Site': 'same-origin' }, { 'Sec-Fetch-Site': 'none' }, {}]) {
      const before = joinKey()
      expect((await changeKey(headers)).status).toBe(200)
      expect(joinKey()).not.toBe(before)
    }
  })

  test('from an older browser, an Origin of this host or PUBLIC_HOST goes through', async () => {
    const { app, changeKey } = await served({ PUBLIC_HOST: 'count-dracula.example.com' })

    expect((await changeKey({ Origin: app.url })).status).toBe(200)
    expect((await changeKey({ Origin: 'https://count-dracula.example.com' })).status).toBe(200)
  })

  test('reads are never refused, so a link from another site still opens a page', async () => {
    const { app } = await served()

    expect((await fetch(`${app.url}/`, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(200)
  })
})
