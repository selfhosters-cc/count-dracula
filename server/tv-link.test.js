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
  const app = startServer({ configPath, port: 0, google, env: {} })
  running.push(app)
  const cookie = cookieOf(await signIn({ app, google }, { sub: 'a', email: 'a@example.com' }, { displayName: 'House A' }))
  const info = await (await fetch(`${app.url}/api/household`, { headers: { Cookie: cookie } })).json()
  return { app, cookie, info, house: app.ledger.household(info.id) }
}

async function stream(app, key) {
  const controller = new AbortController()
  aborts.push(controller)
  return readFrames(await fetch(`${app.url}/api/stream?key=${encodeURIComponent(key)}`, { signal: controller.signal }))
}

const snapshot = (app, key, query = '') => fetch(`${app.url}/api/snapshot?key=${encodeURIComponent(key)}${query}`)
// A phone's tap names its Household's door's Event and that Event's go-live stamp.
const tap = (app, key, id) => {
  const door = app.ledger.doorEvent(app.ledger.householdByJoinKey(key))
  return fetch(`${app.url}/api/taps`, { method: 'POST', headers: { 'X-Join-Key': key }, body: JSON.stringify({ id, tagId: null, tappedAt: Date.now(), phoneName: 'Grandma', eventId: door?.id, stamp: door?.wentLiveAt }) })
}
const admin = (app, cookie, command) => fetch(`${app.url}/api/admin`, { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify(command) })

describe('the TV link', () => {
  test('every Household has one, which /setup gets and the TV page lives under', async () => {
    const { app, info } = await household()

    expect(info.tvToken).toMatch(/^[A-Za-z0-9_-]{32,}$/)
    expect(info.tvToken).not.toBe(info.joinKey)
    const page = await fetch(`${app.url}/tv/k/${info.tvToken}`)
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('<title>Count Dracula — TV</title>')
  })

  test("a TV-link snapshot and its deltas leave out phone names; a join-key phone's keep them", async () => {
    const { app, info } = await household()
    await tap(app, info.joinKey, 'k1')
    const tv = await stream(app, info.tvToken)
    const phone = await stream(app, info.joinKey)
    const tvSnap = (await tv.next()).data
    const phoneSnap = (await phone.next()).data

    await tap(app, info.joinKey, 'k2')

    expect(tvSnap.kids).toHaveLength(1)
    expect(tvSnap.kids[0]).not.toHaveProperty('phoneName')
    expect(phoneSnap.kids[0].phoneName).toBe('Grandma')
    const tvDelta = (await tv.next()).data
    expect(tvDelta).toMatchObject({ type: 'kid.added', kid: { id: 'k2', number: 2 } })
    expect(tvDelta.kid).not.toHaveProperty('phoneName')
    expect((await phone.next()).data.kid.phoneName).toBe('Grandma')
    const plain = await (await snapshot(app, info.tvToken)).json()
    expect(JSON.stringify(plain)).not.toContain('Grandma')
    expect(JSON.stringify(plain)).not.toContain(info.joinKey)
    expect(JSON.stringify(plain)).not.toContain('House A')
  })

  test("reads only the door's Event, follows Go live, and never writes", async () => {
    const { app, cookie, info, house } = await household()
    const testNight = house.doorEvent().id
    const tv = await stream(app, info.tvToken)
    await tv.next()
    const created = await (await admin(app, cookie, { type: 'createEvent', name: 'Halloween 2026' })).json()

    await admin(app, cookie, { type: 'goLive', eventId: created.deltas[0].event.id })

    expect((await tv.next()).data.type).toBe('event.created')
    expect((await tv.next()).data.type).toBe('door.changed')
    expect((await (await snapshot(app, info.tvToken)).json()).event.name).toBe('Halloween 2026')
    expect((await snapshot(app, info.tvToken, `&event=${testNight}`)).status).toBe(401)
    expect((await tap(app, info.tvToken, 'sneaky')).status).toBe(403)
  })

  test('Rotate closes every old-link stream at once; the old link is refused and the new one works', async () => {
    const { app, cookie, info } = await household()
    const porch = await stream(app, info.tvToken)
    const remote = await stream(app, info.tvToken)
    const phone = await stream(app, info.joinKey)
    await porch.next()
    await remote.next()
    await phone.next()

    const res = await admin(app, cookie, { type: 'rotateTvLink' })

    expect(res.status).toBe(200)
    expect(await porch.closed()).toBe(true)
    expect(await remote.closed()).toBe(true)
    const { tvToken } = await (await fetch(`${app.url}/api/household`, { headers: { Cookie: cookie } })).json()
    expect(tvToken).not.toBe(info.tvToken)
    expect((await snapshot(app, info.tvToken)).status).toBe(403)
    expect((await snapshot(app, tvToken)).status).toBe(200)
    await tap(app, info.joinKey, 'still-counting')
    expect((await phone.next()).data.kid.id).toBe('still-counting')
  })

  test('a deleted Household’s TV link is refused', async () => {
    const { app, cookie, info } = await household()

    await fetch(`${app.url}/api/household/delete`, { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ confirm: 'House A' }) })

    expect((await snapshot(app, info.tvToken)).status).toBe(403)
  })
})
