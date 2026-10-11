import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { STATUSES, healthTiles, householdStatus } from './operator.js'
import { startServer } from './app.js'
import { fakeGoogle } from '../test/fake-google.js'
import { cookieOf, signIn } from '../test/sign-in.js'
import { named, namingTheDoor } from '../test/v1-night.js'

const MINUTE = 60_000
const NOW = Date.parse('2026-10-31T23:00:00Z')

describe("Household status (spec v2.1 §10: the 30-minute rule, on the door's Event)", () => {
  test.each([
    ['a live night with no kids yet', { state: 'live', kids: 0, lastKidAt: null }, 'Waiting'],
    ['a kid 29 minutes ago', { state: 'live', kids: 12, lastKidAt: NOW - 29 * MINUTE }, 'Counting'],
    ['quiet for 31 minutes', { state: 'live', kids: 12, lastKidAt: NOW - 31 * MINUTE }, 'Stale'],
    ['Ended, with a late kid 10 minutes ago', { state: 'ended', kids: 12, lastKidAt: NOW - 10 * MINUTE }, 'Counting'],
    ['Ended, quiet for 31 minutes', { state: 'ended', kids: 12, lastKidAt: NOW - 31 * MINUTE }, 'Ended'],
    ['Ended with no kids at all', { state: 'ended', kids: 0, lastKidAt: null }, 'Ended'],
    ['nothing open', { state: null, kids: 0, lastKidAt: null }, 'No night'],
  ])('%s → %s', (_, door, status) => {
    expect(householdStatus(door, NOW)).toBe(status)
  })

  test('sorted Counting, Stale, Waiting, Ended, No night', () => {
    expect(STATUSES).toEqual(['Counting', 'Stale', 'Waiting', 'Ended', 'No night'])
  })
})

describe('health strip', () => {
  const quiet = {
    statusCounts: { Counting: 0, Stale: 0, Waiting: 0, Ended: 0, 'No night': 0 },
    connections: { phones: 0, tvScreens: 0, total: 0 },
    cap: 3_000,
    refusals: { total: 0, lastAt: null },
    errors: { total: 0, lastAt: null, last: null },
    lastTapAt: null,
    backupAt: NOW - 5 * MINUTE,
    backups: true,
    rssBytes: 100 * 1024 * 1024,
    startedAt: NOW - 60 * MINUTE,
    switches: { recap: true },
  }
  const level = (overrides, key) => healthTiles({ ...quiet, ...overrides }, NOW).find((t) => t.key === key).level

  test('all quiet is all ok', () => {
    expect(healthTiles(quiet, NOW).map((t) => [t.key, t.level])).toEqual([
      ['live', 'ok'], ['connections', 'ok'], ['refused', 'ok'], ['errors', 'ok'], ['lastTap', 'ok'], ['backup', 'ok'], ['server', 'ok'],
    ])
  })

  test('connections: amber from 80% of the cap, red at it', () => {
    expect(level({ connections: { phones: 100, tvScreens: 2_299, total: 2_399 } }, 'connections')).toBe('ok')
    expect(level({ connections: { phones: 100, tvScreens: 2_300, total: 2_400 } }, 'connections')).toBe('amber')
    expect(level({ connections: { phones: 100, tvScreens: 2_900, total: 3_000 } }, 'connections')).toBe('red')
  })

  test('refused: amber if any in the last 10 minutes', () => {
    expect(level({ refusals: { total: 3, lastAt: NOW - 9 * MINUTE } }, 'refused')).toBe('amber')
    expect(level({ refusals: { total: 3, lastAt: NOW - 11 * MINUTE } }, 'refused')).toBe('ok')
  })

  test('errors: red if any in the last 10 minutes', () => {
    expect(level({ errors: { total: 1, lastAt: NOW - 2 * MINUTE, last: 'TypeError in POST /api/taps' } }, 'errors')).toBe('red')
    expect(level({ errors: { total: 1, lastAt: NOW - 20 * MINUTE, last: 'TypeError in POST /api/taps' } }, 'errors')).toBe('ok')
  })

  test('last tap: amber past 10 minutes while any Household is Counting', () => {
    const counting = { statusCounts: { ...quiet.statusCounts, Counting: 2 } }
    expect(level({ ...counting, lastTapAt: NOW - 9 * MINUTE }, 'lastTap')).toBe('ok')
    expect(level({ ...counting, lastTapAt: NOW - 11 * MINUTE }, 'lastTap')).toBe('amber')
    expect(level({ lastTapAt: NOW - 60 * MINUTE }, 'lastTap')).toBe('ok') // nobody counting: quiet is fine
  })

  test('backup: amber past 30 minutes, or none yet', () => {
    expect(level({ backupAt: NOW - 29 * MINUTE }, 'backup')).toBe('ok')
    expect(level({ backupAt: NOW - 31 * MINUTE }, 'backup')).toBe('amber')
    expect(level({ backupAt: null }, 'backup')).toBe('amber')
  })

  test('server: amber past 800 MB of the 1 GB', () => {
    expect(level({ rssBytes: 799 * 1024 * 1024 }, 'server')).toBe('ok')
    expect(level({ rssBytes: 801 * 1024 * 1024 }, 'server')).toBe('amber')
  })
})

describe('/api/operator', () => {
  const running = []
  afterEach(() => running.splice(0).forEach((app) => app.stop()))

  async function setUp() {
    const dir = mkdtempSync(join(tmpdir(), 'count-dracula-'))
    const configPath = join(dir, 'config.json')
    writeFileSync(configPath, JSON.stringify({ dbPath: join(dir, 'db.sqlite') }))
    const google = fakeGoogle()
    const app = startServer({ configPath, port: 0, google, env: { OPERATOR_EMAILS: 'op@example.com' }, log: () => {} })
    running.push(app)
    const op = cookieOf(await signIn({ app, google }, { sub: 'op', email: 'op@example.com' }, { displayName: 'Ops' }))
    const smith = cookieOf(await signIn({ app, google }, { sub: 's', email: 'smith@example.com' }, { displayName: 'The Smiths' }))
    await fetch(`${app.url}/api/admin`, { method: 'POST', headers: { Cookie: smith }, body: JSON.stringify({ type: 'setLocation', cell: 'dpz83' }) })
    const info = await (await fetch(`${app.url}/api/household`, { headers: { Cookie: smith } })).json()
    return { app, op, info }
  }

  test('rows show the Area (4 characters), never the 5-character cell, and never an email', async () => {
    const { app, op, info } = await setUp()

    const body = await (await fetch(`${app.url}/api/operator`, { headers: { Cookie: op } })).text()
    const data = JSON.parse(body)

    expect(data.households.find((h) => h.id === info.id)).toMatchObject({ displayName: 'The Smiths', area: 'dpz8', status: 'Waiting', managers: 1, reports: 0 })
    expect(body).not.toContain('dpz83')
    expect(body).not.toContain('@example.com')
    expect(data.health.map((t) => t.key)).toEqual(['live', 'connections', 'refused', 'errors', 'lastTap', 'backup', 'server'])
  })

  test('emails are only in the detail view', async () => {
    const { app, op, info } = await setUp()

    const detail = await (await fetch(`${app.url}/api/operator/household?id=${info.id}`, { headers: { Cookie: op } })).json()

    expect(detail).toMatchObject({ id: info.id, area: 'dpz8', managers: ['smith@example.com'] })
    expect(JSON.stringify(detail)).not.toContain('dpz83')
  })

  test('an error counts on the Errors tile without anything from the request', async () => {
    const { app, op } = await setUp()
    app.failNextRequest('kaboom')

    const res = await fetch(`${app.url}/api/admin`, { method: 'POST', headers: { Cookie: op }, body: JSON.stringify({ type: 'rename', displayName: 'SECRET-BODY-TOKEN' }) })
    const errors = (await (await fetch(`${app.url}/api/operator`, { headers: { Cookie: op } })).json()).health.find((t) => t.key === 'errors')

    expect(res.status).toBe(500)
    expect(errors.level).toBe('red')
    expect(errors.detail).toContain('Error in POST /api/admin')
    expect(JSON.stringify(errors)).not.toContain('SECRET-BODY-TOKEN')
    expect(JSON.stringify(errors)).not.toContain('kaboom')
  })

  test("rows and the detail read the door's Event: Ended for a night ended at 10 pm, No night with nothing open", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'count-dracula-'))
    const configPath = join(dir, 'config.json')
    writeFileSync(configPath, JSON.stringify({ dbPath: join(dir, 'db.sqlite') }))
    const google = fakeGoogle()
    const clock = { now: Date.parse('2026-10-31T23:00:00Z') } // 7 pm in Toronto: Halloween is the door's Event
    const app = startServer({ configPath, port: 0, google, env: { OPERATOR_EMAILS: 'op@example.com' }, log: () => {}, now: () => clock.now })
    running.push(app)
    const op = cookieOf(await signIn({ app, google }, { sub: 'op', email: 'op@example.com' }, { displayName: 'Ops' }))
    const make = (name) => namingTheDoor(app.ledger.household(app.ledger.createHousehold({ displayName: name, timeZone: 'America/Toronto' })))
    const [ended, none, counting] = [make('Ended at ten'), make('Nothing open'), make('Still counting')]
    // A second open Event with more kids, that went live first: never the one the row reads.
    const [{ event: party }] = counting.apply({ type: 'createEvent', name: 'Party' })
    counting.apply({ type: 'goLive', eventId: party.id })
    for (let k = 0; k < 9; k++) counting.apply({ type: 'tap', ...named(counting, party.id), id: `p${k}`, tagId: null, tappedAt: clock.now, phoneName: 'Dad' })
    clock.now += MINUTE
    const [{ event: halloween }] = counting.apply({ type: 'createEvent', name: 'Late Halloween' })
    counting.apply({ type: 'goLive', eventId: halloween.id })
    for (let k = 0; k < 2; k++) counting.apply({ type: 'tap', id: `c${k}`, tagId: null, tappedAt: clock.now, phoneName: 'Dad' })
    for (let k = 0; k < 4; k++) ended.apply({ type: 'tap', id: `e${k}`, tagId: null, tappedAt: clock.now, phoneName: 'Dad' })
    clock.now = Date.parse('2026-11-01T02:00:00Z') // 10 pm
    ended.apply({ type: 'end' })
    for (const e of none.events().filter((e) => e.open)) {
      none.apply({ type: 'end', ...named(none, e.id) })
      none.apply({ type: 'close', eventId: e.id })
    }
    clock.now += 31 * MINUTE

    const data = await (await fetch(`${app.url}/api/operator`, { headers: { Cookie: op } })).json()
    const row = (house) => data.households.find((h) => h.id === house.id)
    const detail = async (house) => (await fetch(`${app.url}/api/operator/household?id=${house.id}`, { headers: { Cookie: op } })).json()

    expect(row(ended)).toMatchObject({ status: 'Ended', kids: 4 })
    expect(row(none)).toMatchObject({ status: 'No night', kids: 0, lastKidAt: null })
    expect(row(counting)).toMatchObject({ status: 'Stale', kids: 2 })
    for (const house of [ended, none, counting]) {
      const { status, kids, lastKidAt } = row(house)
      expect(await detail(house)).toMatchObject({ status, kids, lastKidAt })
    }
    expect(data.health.find((t) => t.key === 'live').value).toBe('0 Counting · 1 Stale · 1 Waiting · 1 Ended · 1 No night') // the Operator's own Household is Waiting
  })
})
