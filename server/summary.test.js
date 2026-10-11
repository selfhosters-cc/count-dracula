import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer } from './app.js'
import { fakeGoogle } from '../test/fake-google.js'
import { cookieOf, signIn } from '../test/sign-in.js'
import { doorNamed, named, namingTheDoor } from '../test/v1-night.js'

const MINUTE = 60_000
const running = []
afterEach(() => running.splice(0).forEach((app) => app.stop()))

// Our Household and 5 neighbours in Area dpz8, all live on "Halloween 2026" at 7 pm Toronto.
async function town() {
  const dir = mkdtempSync(join(tmpdir(), 'count-dracula-'))
  const configPath = join(dir, 'config.json')
  writeFileSync(configPath, JSON.stringify({ dbPath: join(dir, 'db.sqlite') }))
  const clock = { now: Date.parse('2026-10-31T23:00:00Z') }
  const google = fakeGoogle()
  const app = startServer({ configPath, port: 0, env: {}, google, now: () => clock.now, tickMs: 3_600_000 })
  running.push(app)
  const cookie = cookieOf(await signIn({ app, google }, { sub: 'a', email: 'a@example.com' }, { displayName: 'The Smiths', timeZone: 'America/Toronto' }))
  const info = await (await fetch(`${app.url}/api/household`, { headers: { Cookie: cookie } })).json()
  const ours = namingTheDoor(app.ledger.household(info.id))
  const neighbours = Array.from({ length: 5 }, (_, i) => namingTheDoor(app.ledger.household(app.ledger.createHousehold({ displayName: `N${i}`, timeZone: 'America/Toronto' }))))
  for (const h of [ours, ...neighbours]) h.apply({ type: 'setLocation', cell: 'dpz83' })
  const tap = (h, id, extra = {}) => h.apply({ type: 'tap', id, tagId: null, tappedAt: clock.now, phoneName: 'Grandma', ...extra })
  const summary = (eventId) => fetch(`${app.url}/api/summary?event=${eventId}`, { headers: { Cookie: cookie } })
  // The door phone's ☰ End and Resume name the door's Event and its go-live stamp.
  const phone = (path) => fetch(`${app.url}${path}`, { method: 'POST', headers: { 'X-Join-Key': info.joinKey }, body: JSON.stringify(doorNamed(app.ledger, info.id)) })
  return { app, clock, cookie, info, ours, neighbours, tap, summary, phone }
}

describe('the night summary', () => {
  test("a live, unended night has none; once it's ended, its stored figures, without phone names", async () => {
    const { app, ours, tap, summary, phone } = await town()
    const witch = ours.snapshot().tags.find((t) => t.name === 'Witch')
    tap(ours, 'k1', { tagId: witch.id })
    tap(ours, 'k2', { teen: true })
    const night = ours.snapshot().event

    expect((await summary(night.id)).status).toBe(404)
    await phone('/api/end')

    const res = await summary(night.id)
    expect(res.status).toBe(200)
    const s = await res.json()
    expect(s).toMatchObject({ displayName: 'The Smiths', timeZone: 'America/Toronto', event: { name: 'Halloween 2026', ended: true } })
    expect(s.kids.map((k) => k.number)).toEqual([1, 2])
    expect(s.kids[1].teen).toBe(true)
    expect(JSON.stringify(s)).not.toContain('Grandma')
    expect(s.tags.find((t) => t.id === witch.id).name).toBe('Witch')
    void app
  })

  test('Resume then End updates it', async () => {
    const { ours, tap, summary, phone } = await town()
    tap(ours, 'k1')
    await phone('/api/end')
    await phone('/api/resume')
    tap(ours, 'k2')

    expect((await summary(ours.snapshot().event.id)).status).toBe(404) // back on: no summary while it's running
    await phone('/api/end')
    expect((await (await summary(ours.snapshot().event.id)).json()).kids).toHaveLength(2)
  })

  test("past nights have one too, but a counts-only one doesn't", async () => {
    const { ours, tap, summary } = await town()
    const [{ event: early }] = ours.apply({ type: 'createEvent', name: 'Early night' })
    ours.apply({ type: 'goLive', eventId: early.id })
    tap(ours, 'k1')
    const [{ event: later }] = ours.apply({ type: 'createEvent', name: 'Later night' })
    ours.apply({ type: 'goLive', eventId: later.id })
    ours.apply({ type: 'end', ...named(ours, early.id) })
    ours.apply({ type: 'close', eventId: early.id }) // Close now: a Past night
    const ghost = ours.addPastCounts({ name: 'Halloween 2025 (counts)', buckets: [{ start: '18:00', end: '18:30', count: 40 }] })

    expect((await summary(early.id)).status).toBe(200)
    expect((await (await summary(early.id)).json()).kids).toHaveLength(1)
    expect((await summary(ghost)).status).toBe(404)
  })

  test('only a Manager of that Household can read it', async () => {
    const { app, ours, neighbours, phone, info } = await town()
    await phone('/api/end')
    const id = ours.snapshot().event.id

    expect((await fetch(`${app.url}/api/summary?event=${id}`)).status).toBe(401)
    expect((await fetch(`${app.url}/api/summary?event=${id}`, { headers: { 'X-Join-Key': info.joinKey } })).status).toBe(401)
    expect((await fetch(`${app.url}/api/summary?event=${neighbours[0].snapshot().event.id}`, { headers: { Cookie: 'cd_session=someone-else' } })).status).toBe(401)
  })
})

describe('the nearby slide', () => {
  test('keeps the Area figures as they were when the night ended, even after the Location moves', async () => {
    const { app, clock, ours, neighbours, tap, summary, phone } = await town()
    for (const [i, h] of [ours, ...neighbours].entries()) tap(h, `k${i}`)
    app.refreshNearby()

    await phone('/api/end')
    ours.apply({ type: 'setLocation', cell: 'c2b2q' }) // moved far away
    clock.now += 20 * MINUTE
    app.refreshNearby()

    const s = await (await summary(ours.snapshot().event.id)).json()
    expect(s.nearby).toEqual({ houses: 6, kids30: 5, topCostume: null })
  })

  test('the 3 am auto-end freezes them too', async () => {
    const { app, clock, ours, neighbours, tap, summary } = await town()
    for (const [i, h] of [ours, ...neighbours].entries()) tap(h, `k${i}`)
    app.refreshNearby()

    clock.now = Date.parse('2026-11-01T08:00:00Z') // 3:00 am EST
    app.tick()

    const s = await (await summary(ours.snapshot().event.id)).json()
    expect(s.event.endedAutomatically).toBe(true)
    expect(s.nearby).toMatchObject({ houses: 6 })
  })

  test('is absent below the minimum', async () => {
    const { ours, tap, summary, phone } = await town()
    tap(ours, 'k1')

    await phone('/api/end')

    expect((await (await summary(ours.snapshot().event.id)).json()).nearby).toBeNull()
  })
})
