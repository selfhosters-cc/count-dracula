// An Extension's tables (v2.2 §5–6, ADR 0001), through the fixture Extension under test/: its own steps, run
// from its own counter and checked against sqlite_master, and its rows deleted with the Households and Events
// they belong to, even when no Extension is loaded.
import { afterEach, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer } from './app.js'
import * as fixture from '../test/fixture-extension/index.js'
import { fakeGoogle } from '../test/fake-google.js'
import { cookieOf, signIn } from '../test/sign-in.js'

const running = []
const stopAll = () => running.splice(0).forEach((app) => app.stop())
afterEach(stopAll)

// A fresh database, or `dir`'s again (a restart).
function start({ dir = mkdtempSync(join(tmpdir(), 'count-dracula-')), extensions = [fixture], ...options } = {}) {
  const configPath = join(dir, 'config.json')
  writeFileSync(configPath, JSON.stringify({ dbPath: join(dir, 'db.sqlite') }))
  const app = startServer({ configPath, port: 0, env: {}, extensions, log: () => {}, ...options })
  running.push(app)
  return { app, dir }
}

// The database's tables and indexes, as a backup would carry them.
function tablesIn(dir) {
  const db = new Database(join(dir, 'db.sqlite'))
  const names = db.query("SELECT name FROM sqlite_master WHERE type IN ('table', 'index') ORDER BY name").all().map((r) => r.name)
  db.close()
  return names
}

// The CREATE statement sqlite_master holds for `name`.
const sqlOf = (db, name) => db.query('SELECT sql FROM sqlite_master WHERE name = ?').get(name).sql

// The fixture with each step counted as it runs, and `more` steps after its own.
function counted(ran, more = []) {
  return { ...fixture, migrations: [...fixture.migrations, ...more].map((step, i) => (...args) => (ran.push(i), step(...args))) }
}

describe("an Extension's steps", () => {
  test("the fixture's two steps run once; a restart runs nothing; a third added later runs alone", () => {
    const ran = []
    const { dir } = start({ extensions: [counted(ran)] })
    expect(ran).toEqual([0, 1])

    stopAll()
    start({ dir, extensions: [counted(ran)] })
    expect(ran).toEqual([0, 1])

    stopAll()
    start({ dir, extensions: [counted(ran, [(db) => db.exec('CREATE TABLE fixture_later (x INTEGER)')])] })
    expect(ran).toEqual([0, 1, 2])
  })

  test.each([
    ['a table not named fixture_…', (db) => db.exec('CREATE TABLE fixture_kept (x INTEGER); CREATE TABLE other_table (x INTEGER)')],
    ['an unprefixed index', (db) => db.exec('CREATE TABLE fixture_kept (x INTEGER); CREATE INDEX by_x ON fixture_kept (x)')],
    ["a fixture_… index on a core table", (db) => db.exec('CREATE TABLE fixture_kept (x INTEGER); CREATE INDEX fixture_by_name ON events (name)')],
    ['a changed core table', (db) => db.exec('CREATE TABLE fixture_kept (x INTEGER); ALTER TABLE events ADD COLUMN fixture_x INTEGER')],
    ['a dropped core table', (db) => db.exec('CREATE TABLE fixture_kept (x INTEGER); DROP TABLE site_visits')],
    ['a core table made again as it was', (db) => db.exec(`CREATE TABLE fixture_kept (x INTEGER); DROP TABLE site_visits; ${sqlOf(db, 'site_visits')}`)],
    ["the core's last-made table made again as it was", (db) => db.exec(`DROP TABLE extension_owns; ${sqlOf(db, 'extension_owns')}`)],
  ])('a step that touches %s fails the boot and leaves nothing behind', (_, step) => {
    const dir = mkdtempSync(join(tmpdir(), 'count-dracula-'))
    start({ dir, extensions: [] })
    stopAll()
    const before = tablesIn(dir)

    expect(() => start({ dir, extensions: [{ ...fixture, migrations: [step] }] })).toThrow('fixture_…')
    expect(tablesIn(dir)).toEqual(before)
    // ...and it runs again at the next boot, as the step it is.
    expect(() => start({ dir, extensions: [{ ...fixture, migrations: [step] }] })).toThrow('fixture_…')
  })

  test("its own tables, indexes and SQLite's own for them are fine", () => {
    const { dir } = start({
      extensions: [{ ...fixture, owns: {}, migrations: [(db) => db.exec('CREATE TABLE fixture_kept (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE)')] }],
    })
    expect(tablesIn(dir)).toContain('fixture_kept')
    expect(tablesIn(dir)).toContain('sqlite_autoindex_fixture_kept_1')
  })
})

describe("an Extension's name and the core's tables", () => {
  // Its steps may touch whatever is named <name>_…, so no core table or index may be: extension_owns,
  // event_devices, ghost_buckets, golden_tickets, email_links, paired_devices, backfill_batches, fired_moments, ….
  test.each(['extension', 'event', 'ghost', 'golden', 'email', 'paired', 'backfill', 'fired'])('%s, the first part of a core table, fails the boot', (name) => {
    expect(() => start({ extensions: [{ ...fixture, name, owns: {}, migrations: [] }] })).toThrow(`${name}_`)
  })
})

describe("an Extension's owns", () => {
  test.each([
    ['a core table', { events: { household: 'household_id' } }],
    ['a column its table lacks', { fixture_entries: { household: 'house_id' } }],
    ['a table it has no step for', { fixture_nowhere: { event: 'event_id' } }],
    ['something other than household and event', { fixture_entries: { household: 'household_id', manager: 'note' } }],
  ])('naming %s fails the boot', (_, owns) => {
    expect(() => start({ extensions: [{ ...fixture, owns }] })).toThrow()
  })
})

// Two Households signed up, with the fixture's rows for each: an entry on its door's Event, one on no Event, and
// a mark on the door's Event, written through the db the fixture started with.
async function twoHouseholds(options = {}) {
  const google = fakeGoogle()
  let core
  const { app, dir } = start({ google, extensions: [{ ...fixture, start: (c) => fixture.start((core = c)) }], ...options })
  const houses = {}
  for (const [i, name] of ['The Smiths', 'Casa Ortiz'].entries()) {
    const cookie = cookieOf(await signIn({ app, google }, { sub: `s${i}`, email: `m${i}@example.com` }, { displayName: name }))
    const { id } = await (await fetch(`${app.url}/api/household`, { headers: { Cookie: cookie } })).json()
    const house = app.ledger.household(id)
    const door = house.doorEvent().id
    core.db.query('INSERT INTO fixture_entries (household_id, event_id, note) VALUES (?, ?, ?), (?, NULL, ?)').run(id, door, `${name} door`, id, `${name} any`)
    core.db.query('INSERT INTO fixture_marks (event_id, mark) VALUES (?, ?)').run(door, `${name} mark`)
    houses[name] = { id, cookie, house, door }
  }
  return { app, dir, core, houses }
}

// What's left of the fixture's rows, by note and mark.
const left = (db) => [
  ...db.query('SELECT note FROM fixture_entries ORDER BY id').all().map((r) => r.note),
  ...db.query('SELECT mark FROM fixture_marks ORDER BY rowid').all().map((r) => r.mark),
]

describe('deleting what an Extension owns', () => {
  test("Delete Household removes the fixture's rows for that Household and no other's", async () => {
    const { app, core, houses } = await twoHouseholds()

    const res = await fetch(`${app.url}/api/household/delete`, { method: 'POST', headers: { Cookie: houses['The Smiths'].cookie }, body: JSON.stringify({ confirm: 'The Smiths' }) })

    expect(res.status).toBe(200)
    expect(left(core.db)).toEqual(['Casa Ortiz door', 'Casa Ortiz any', 'Casa Ortiz mark'])
  })

  // The Smiths' Halloween 2026 gets an entry and a mark too, beside their door's (the live Test night).
  function onHalloween({ core, houses }) {
    const { id, house } = houses['The Smiths']
    const halloween = house.events().find((e) => e.name === 'Halloween 2026').id
    core.db.query('INSERT INTO fixture_entries (household_id, event_id, note) VALUES (?, ?, ?)').run(id, halloween, 'The Smiths halloween')
    core.db.query('INSERT INTO fixture_marks (event_id, mark) VALUES (?, ?)').run(halloween, 'The Smiths halloween mark')
    return halloween
  }

  test("Delete Event removes the fixture's rows for that Event and leaves the Household's other Events'", async () => {
    const night = await twoHouseholds()
    const halloween = onHalloween(night)

    night.houses['The Smiths'].house.apply({ type: 'deleteEvent', eventId: halloween })

    expect(left(night.core.db)).toEqual(['The Smiths door', 'The Smiths any', 'Casa Ortiz door', 'Casa Ortiz any', 'The Smiths mark', 'Casa Ortiz mark'])
  })

  test("Reset removes the fixture's rows for that Event and leaves the Household's other Events'", async () => {
    const night = await twoHouseholds()
    onHalloween(night)
    const { house, door } = night.houses['The Smiths']

    house.apply({ type: 'reset', eventId: door })

    expect(left(night.core.db)).toEqual(['The Smiths any', 'Casa Ortiz door', 'Casa Ortiz any', 'The Smiths halloween', 'Casa Ortiz mark', 'The Smiths halloween mark'])
  })

  test("deploy/redelete.js, run with no Extension, deletes the fixture's rows for a logged Household", async () => {
    const { dir, houses } = await twoHouseholds()
    stopAll()

    const script = join(import.meta.dir, '..', 'deploy', 'redelete.js')
    const proc = Bun.spawn([process.execPath, script, join(dir, 'db.sqlite'), String(houses['The Smiths'].id)], { stdout: 'pipe', stderr: 'pipe' })

    expect(await proc.exited).toBe(0)
    const db = new Database(join(dir, 'db.sqlite'))
    expect(left(db)).toEqual(['Casa Ortiz door', 'Casa Ortiz any', 'Casa Ortiz mark'])
    db.close()
  })

  test('a recorded table that was dropped is skipped: Delete Household still succeeds', async () => {
    const { app, core, houses } = await twoHouseholds()
    core.db.exec('DROP TABLE fixture_marks') // the Extension removed, its tables with it

    const res = await fetch(`${app.url}/api/household/delete`, { method: 'POST', headers: { Cookie: houses['The Smiths'].cookie }, body: JSON.stringify({ confirm: 'The Smiths' }) })

    expect(res.status).toBe(200)
    expect(core.db.query('SELECT note FROM fixture_entries ORDER BY id').all().map((r) => r.note)).toEqual(['Casa Ortiz door', 'Casa Ortiz any'])
  })

  test("a new Event that reuses a deleted Event's id has none of its rows", async () => {
    const night = await twoHouseholds()
    const { house } = night.houses['Casa Ortiz']
    house.apply({ type: 'createEvent', name: 'Spare' })
    const id = house.events().find((e) => e.name === 'Spare').id
    night.core.db.query('INSERT INTO fixture_marks (event_id, mark) VALUES (?, ?)').run(id, 'Spare mark')

    house.apply({ type: 'deleteEvent', eventId: id })
    house.apply({ type: 'createEvent', name: 'Again' })

    const again = house.events().find((e) => e.name === 'Again').id
    expect(again).toBe(id)
    expect(night.core.db.query('SELECT mark FROM fixture_marks WHERE event_id = ?').all(again)).toEqual([])
  })
})
