// A new phone's name, typed on its first screen: no two phones alike (no presets), so the server refuses a name
// another phone has, by a kid it counted on an open night or a name it chose in the last day.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer } from './app.js'
import { fakeGoogle } from '../test/fake-google.js'
import { cookieOf, signIn } from '../test/sign-in.js'

const running = []
afterEach(() => running.splice(0).forEach((app) => app.stop()))

async function household() {
  const dir = mkdtempSync(join(tmpdir(), 'count-dracula-'))
  const configPath = join(dir, 'config.json')
  writeFileSync(configPath, JSON.stringify({ dbPath: join(dir, 'db.sqlite') }))
  const google = fakeGoogle()
  const app = startServer({ configPath, port: 0, google, env: {}, log: () => {} })
  running.push(app)
  const cookie = cookieOf(await signIn({ app, google }, { sub: 'a', email: 'a@example.com' }, { displayName: 'House A' }))
  const info = await (await fetch(`${app.url}/api/household`, { headers: { Cookie: cookie } })).json()
  return { app, info }
}

const PHONE_A = 'a'.repeat(32)
const PHONE_B = 'b'.repeat(32)
const claim = (app, key, name, deviceId) =>
  fetch(`${app.url}/api/phone-name`, { method: 'POST', headers: { 'X-Join-Key': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ name, deviceId }) })

describe('a phone name', () => {
  test('is the name typed, tidied; a blank one is refused', async () => {
    const { app, info } = await household()
    expect(await (await claim(app, info.joinKey, '  Aunt   May ', PHONE_A)).json()).toEqual({ name: 'Aunt May' })
    expect((await claim(app, info.joinKey, '   ', PHONE_A)).status).toBe(400)
  })

  test("another phone can't take it, whatever its capitals; the same phone can choose it again", async () => {
    const { app, info } = await household()
    await claim(app, info.joinKey, 'Grandma', PHONE_A)

    const taken = await claim(app, info.joinKey, 'grandma', PHONE_B)
    expect(taken.status).toBe(409)
    expect(await taken.text()).toBe("Someone's already counting as grandma. Add something to tell you apart, like grandma B.")
    expect((await claim(app, info.joinKey, 'Grandma', PHONE_A)).status).toBe(200)
    expect((await claim(app, info.joinKey, 'Grandma B', PHONE_B)).status).toBe(200)
  })

  test('a name that counted a kid tonight is taken, even after a restart forgot the claims', async () => {
    const { app, info } = await household()
    const door = app.ledger.doorEvent(info.id)
    await fetch(`${app.url}/api/taps`, { method: 'POST', headers: { 'X-Join-Key': info.joinKey }, body: JSON.stringify({ id: 'k1', tagId: null, tappedAt: Date.now(), phoneName: 'Uncle Bob', eventId: door.id, stamp: door.wentLiveAt }) })

    expect((await claim(app, info.joinKey, 'uncle bob', PHONE_B)).status).toBe(409)
    expect((await claim(app, info.joinKey, 'Add missed kids', PHONE_B)).status).toBe(409) // Setup's own name for kids it adds
  })

  test('needs the join key', async () => {
    const { app, info } = await household()
    expect((await claim(app, info.tvToken, 'Grandma', PHONE_A)).status).toBe(403)
  })
})
