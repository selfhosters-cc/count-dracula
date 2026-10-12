// v2.1 ticket 58: what sign-up makes, by when it happens in the Household's zone, and the Test night it
// remembers by id (spec v2.1 §8).
import { afterEach, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openLedger } from './ledger.js'
import { startServer } from './app.js'
import { zonedTime } from '../shared/night-maths.js'
import { fakeGoogle } from '../test/fake-google.js'
import { cookieOf, signIn } from '../test/sign-in.js'

const ZONES = ['America/Toronto', 'Pacific/Auckland']

// Signs up at a wall time in the Household's own zone, on a fake clock.
function signUpAt(date, time, timeZone) {
  const clock = { now: zonedTime(date, time, timeZone) }
  const db = new Database(':memory:')
  const ledger = openLedger(db, { now: () => clock.now })
  const house = ledger.household(ledger.createHousehold({ displayName: 'House', timeZone }))
  return { clock, db, ledger, house }
}

const made = (house) =>
  house
    .events()
    .map((e) => ({ name: e.name, state: e.state, goldenCount: e.goldenCount, goesLiveAt: e.goesLiveAt, raceAgainstId: e.raceAgainstId, costumes: e.tags.length }))
    .sort((a, b) => a.name.localeCompare(b.name))
const byName = (house, name) => house.events().find((e) => e.name === name)

describe.each(ZONES)('sign-up in %s', (timeZone) => {
  const halloweenAt = zonedTime('2026-10-31', '16:00', timeZone)

  test('before Oct 31, 4:00 pm: a live Test night and Halloween 2026 going live at 4:00 pm', () => {
    for (const [date, time] of [['2026-10-20', '12:00'], ['2026-10-31', '15:59']]) {
      const { house } = signUpAt(date, time, timeZone)

      expect(made(house)).toEqual([
        { name: 'Halloween 2026', state: 'upcoming', goldenCount: 5, goesLiveAt: halloweenAt, raceAgainstId: null, costumes: 8 },
        { name: 'Test night', state: 'live', goldenCount: 0, goesLiveAt: null, raceAgainstId: null, costumes: 8 },
      ])
      expect(house.testNightId()).toBe(byName(house, 'Test night').id)
      expect(house.doorEvent().name).toBe('Test night')
    }
  })

  test('Oct 31, 4:00 pm to Nov 1, 3:00 am: only Halloween 2026, live now, and no Test night', () => {
    for (const [date, time] of [['2026-10-31', '16:00'], ['2026-10-31', '18:00'], ['2026-11-01', '02:59']]) {
      const { house } = signUpAt(date, time, timeZone)

      expect(made(house)).toEqual([{ name: 'Halloween 2026', state: 'live', goldenCount: 5, goesLiveAt: null, raceAgainstId: null, costumes: 8 }])
      expect(house.testNightId()).toBeNull()
      expect(house.tickets(house.doorEvent().id)).toEqual([]) // no Race against and no Expected kids: nothing drawn
    }
  })

  test('after Nov 1, 3:00 am: only a live Test night', () => {
    for (const [date, time] of [['2026-11-01', '03:00'], ['2026-11-02', '12:00']]) {
      const { house } = signUpAt(date, time, timeZone)

      expect(made(house)).toEqual([{ name: 'Test night', state: 'live', goldenCount: 0, goesLiveAt: null, raceAgainstId: null, costumes: 8 }])
      expect(house.testNightId()).toBe(house.doorEvent().id)
    }
  })
})

describe('the Test night, by id', () => {
  test('survives renaming it', () => {
    const { house } = signUpAt('2026-10-20', '12:00', 'America/Toronto')
    const id = house.testNightId()

    house.apply({ type: 'settings', eventId: id, name: 'Garage test' })

    expect(house.testNightId()).toBe(id)
    expect(house.events().find((e) => e.id === id).name).toBe('Garage test')
  })

  test("isn't another Event that's named Test night", () => {
    const { house } = signUpAt('2026-10-31', '18:00', 'America/Toronto')

    house.apply({ type: 'createEvent', name: 'Test night' })

    expect(house.testNightId()).toBeNull()
  })

  test('is forgotten when it is deleted, so a reused id is never taken for it', () => {
    const { house } = signUpAt('2026-11-02', '12:00', 'America/Toronto')
    const id = house.testNightId()
    house.apply({ type: 'end', eventId: id, stamp: house.doorEvent().wentLiveAt })

    house.apply({ type: 'deleteEvent', eventId: id })

    expect(house.testNightId()).toBeNull()
  })

  test('a migrated Household #1 has none: nothing is ever taken for it by name', () => {
    const db = new Database(':memory:')
    db.exec(readFileSync(new URL('../test/fixtures/v1.sql', import.meta.url), 'utf8'))
    db.exec("UPDATE events SET name = 'Test night' WHERE id = (SELECT MIN(id) FROM events)")

    const ledger = openLedger(db, {})

    expect(ledger.household(1).testNightId()).toBeNull()
  })
})

describe('/api/household', () => {
  const running = []
  afterEach(() => running.splice(0).forEach((app) => app.stop()))

  async function managerAt(iso) {
    const dir = mkdtempSync(join(tmpdir(), 'count-dracula-'))
    const configPath = join(dir, 'config.json')
    writeFileSync(configPath, JSON.stringify({ dbPath: join(dir, 'db.sqlite') }))
    const google = fakeGoogle()
    const app = startServer({ configPath, port: 0, google, env: {}, now: () => Date.parse(iso) })
    running.push(app)
    const cookie = cookieOf(await signIn({ app, google }, { sub: 'a', email: 'a@example.com' }, { displayName: 'House A' }))
    return (await fetch(`${app.url}/api/household`, { headers: { Cookie: cookie } })).json()
  }

  test("names the Test night and the door's Event, for the checklist and its TV tick", async () => {
    const house = await managerAt('2026-10-20T16:00:00Z')

    expect(house.testNightEventId).toEqual(expect.any(Number))
    expect(house.door).toEqual({ id: house.testNightEventId, name: 'Test night' })
    expect(house.checklist).toEqual({ tvWatching: false, anyKids: 0, named: true, kid: false, night: false, hidden: false }) // named at sign-in: 'House A'
  })

  test('a Halloween-evening sign-up has no Test night; its TV shows Halloween 2026', async () => {
    const house = await managerAt('2026-11-01T01:00:00Z') // 6 pm Oct 31 in Vancouver, sign-in's zone

    expect(house.testNightEventId).toBeNull()
    expect(house.door).toMatchObject({ name: 'Halloween 2026' })
  })
})

describe('wording (spec v2.1 §8)', () => {
  test('no Rehearsal left in public/: pages, scripts or styles', () => {
    const dir = new URL('../public/', import.meta.url).pathname
    const files = readdirSync(dir).filter((f) => /\.(html|js|css)$/.test(f) && !f.endsWith('.test.js'))
    expect(files.length).toBeGreaterThan(10)
    for (const file of files) expect({ file, rehearsal: /rehearsal/i.test(readFileSync(join(dir, file), 'utf8')) }).toEqual({ file, rehearsal: false })
  })

  test('/privacy: an Abandoned sign-up never counted a kid on any Event but its Test night', () => {
    const html = readFileSync(new URL('../public/privacy.html', import.meta.url), 'utf8')
    expect(html).toContain('never counted a kid on any Event but its Test night')
  })
})
