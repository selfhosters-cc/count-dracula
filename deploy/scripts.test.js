import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openLedger } from '../server/ledger.js'
import { openAccounts } from '../server/accounts.js'
import { computeNearby, nearYou } from '../server/nearby.js'

// Two Households with a Manager each, the way sign-up leaves them.
function database() {
  const path = join(mkdtempSync(join(tmpdir(), 'count-dracula-runbook-')), 'db.sqlite')
  const db = new Database(path, { create: true })
  const ledger = openLedger(db, { now: () => Date.parse('2026-10-20T20:00:00Z') })
  const ids = ['The Smiths', 'Casa Ortiz'].map((name, i) => {
    const id = ledger.createHousehold({ displayName: name, timeZone: 'America/Toronto' })
    db.query('INSERT INTO managers (google_sub, email, name, household_id, last_sign_in_at) VALUES (?, ?, ?, ?, 0)').run(`sub-${i}`, `m${i}@example.com`, `M ${i}`, id)
    const door = ledger.doorEvent(id)
    ledger.household(id).apply({ type: 'tap', eventId: door.id, stamp: door.wentLiveAt, id: `kid-${i}`, tagId: null, tappedAt: 1, phoneName: 'Dad' })
    return id
  })
  db.close()
  return { path, ids }
}

async function run(script, ...args) {
  const proc = Bun.spawn([process.execPath, join(import.meta.dir, script), ...args], { stdout: 'pipe', stderr: 'pipe' })
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
  return { out, err, code }
}

describe('deploy/redelete.js (after restoring a backup)', () => {
  test('deletes the listed Households again, everything they own, and logs each in deletions', async () => {
    const { path, ids } = database()

    const { out, code } = await run('redelete.js', path, String(ids[0]), '999')

    expect(code).toBe(0)
    expect(out).toContain(`deleted household ${ids[0]}`)
    expect(out).toContain('household 999 is not in this database')
    const db = new Database(path)
    expect(db.query('SELECT id FROM households').all().map((r) => r.id)).toEqual([ids[1]])
    expect(db.query('SELECT COUNT(*) AS n FROM events WHERE household_id = ?').get(ids[0]).n).toBe(0)
    expect(db.query('SELECT COUNT(*) AS n FROM managers WHERE household_id = ?').get(ids[0]).n).toBe(0)
    expect(db.query('SELECT household_id AS id FROM deletions').all()).toEqual([{ id: ids[0] }])
  })
})

describe('deploy/access-request.js', () => {
  test("prints what we hold about one email: the Manager, their Household and its Events", async () => {
    const { path, ids } = database()

    const { out, code } = await run('access-request.js', path, 'M1@Example.com')

    expect(code).toBe(0)
    const held = JSON.parse(out)
    expect(held.manager).toMatchObject({ email: 'm1@example.com', name: 'M 1' })
    expect(held.household).toMatchObject({ id: ids[1], display_name: 'Casa Ortiz', time_zone: 'America/Toronto' })
    expect(held.household).not.toHaveProperty('tv_token')
    expect(held.household).not.toHaveProperty('join_key')
    expect(held.events.map((e) => e.name).sort()).toEqual(['Halloween 2026', 'Test night'])
    expect(held.events.find((e) => e.name === 'Test night')).toMatchObject({ state: 'live', kids: 1 })
    expect(out.toLowerCase()).not.toContain('rehearsal')
  })

  test('says so when nobody has that email', async () => {
    const { path } = database()

    const { out, code } = await run('access-request.js', path, 'nobody@example.com')

    expect(code).toBe(1)
    expect(out).toContain('No Manager with that email')
  })
})

describe('deploy/import-past-counts.js (Household #1, after its sign-up)', () => {
  test('makes the Past counts-only "Halloween 2025 (counts)" of 346 kids in the five 2025 buckets, and prints its id', async () => {
    const { path, ids } = database()

    const { out, code } = await run('import-past-counts.js', path, String(ids[0]))

    expect(code).toBe(0)
    const house = openLedger(new Database(path), {}).household(ids[0])
    const event = house.events().find((e) => e.name === 'Halloween 2025 (counts)')
    expect(event).toMatchObject({ state: 'past', countsOnly: true })
    expect(out).toContain(`event ${event.id}`)
    const db = new Database(path)
    expect(db.query('SELECT slot_start AS start, slot_end AS end, count FROM ghost_buckets WHERE event_id = ? ORDER BY slot_start').all(event.id)).toEqual([
      { start: '17:42', end: '18:00', count: 14 },
      { start: '18:00', end: '18:30', count: 72 },
      { start: '18:30', end: '19:00', count: 107 },
      { start: '19:00', end: '19:30', count: 119 },
      { start: '19:30', end: '20:00', count: 34 },
    ])
    expect(db.query('SELECT SUM(count) AS n FROM ghost_buckets WHERE event_id = ?').get(event.id).n).toBe(346)
    expect(db.query('SELECT COUNT(*) AS n FROM events WHERE household_id = ?').get(ids[1]).n).toBe(2)
  })

  test('a second run refuses, and adds nothing', async () => {
    const { path, ids } = database()
    await run('import-past-counts.js', path, String(ids[0]))

    const again = await run('import-past-counts.js', path, String(ids[0]))

    expect(again.code).not.toBe(0)
    expect(again.err).toContain('already has')
    expect(new Database(path).query("SELECT COUNT(*) AS n FROM events WHERE name = 'Halloween 2025 (counts)'").get().n).toBe(1)
  })

  test('refuses a Household that is not in the database', async () => {
    const { path } = database()

    const { err, code } = await run('import-past-counts.js', path, '999')

    expect(code).not.toBe(0)
    expect(err).toContain('999')
  })
})

describe('deploy/seed-nearby.js', () => {
  test("seeds 2 houses in one Area, each counted once through its door's Event, and each sees the other", async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'count-dracula-seed-')), 'db.sqlite')

    const { out, code } = await run('seed-nearby.js', path, '2')

    expect(code).toBe(0)
    expect(out).toContain('/door?key=')
    const ledger = openLedger(new Database(path), {})
    const nights = ledger.nearbyNights(Date.now())
    expect(nights).toHaveLength(2)
    for (const n of nights) expect(ledger.household(n.householdId).events().find((e) => e.id === n.eventId).name).toBe('Halloween 2026')
    const figures = computeNearby(nights, { isBlocked: () => false })
    for (const n of nights) expect(nearYou(figures, n.householdId, n.cell)).toMatchObject({ houses: 2 })
  })

  for (const [where, cells] of [['edge', ['dpz8r', 'dpzb2']], ['corner', ['dpz8z', 'dpzc0']]]) {
    test(`seeds 2 houses either side of an Area ${where}: each sees the other, and neither does with nearbyEdges off`, async () => {
      const path = join(mkdtempSync(join(tmpdir(), 'count-dracula-seed-')), 'db.sqlite')

      const { out, code } = await run('seed-nearby.js', path, where)

      expect(code).toBe(0)
      expect(out).toContain('/door?key=')
      const nights = openLedger(new Database(path), {}).nearbyNights(Date.now())
      expect(nights.map((n) => n.cell).sort()).toEqual(cells)
      const figures = computeNearby(nights, { isBlocked: () => false })
      for (const n of nights) {
        expect(nearYou(figures, n.householdId, n.cell)).toMatchObject({ houses: 2 })
        expect(nearYou(figures, n.householdId, n.cell, { edges: false })).toBeNull()
      }
    })
  }

  test('refuses anything but 1 to 6 houses, edge or corner', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'count-dracula-seed-')), 'db.sqlite')

    for (const arg of ['0', '7', 'middle']) expect((await run('seed-nearby.js', path, arg)).code).toBe(2)
  })
})

describe('deploy/caddy-site.caddy log masking', () => {
  // The site's request>uri regexps, applied the way Caddy does ("${1}" is JS's "$1").
  const caddy = readFileSync(join(import.meta.dir, 'caddy-site.caddy'), 'utf8')
  const uriBlock = caddy.slice(caddy.indexOf('request>uri multi_regexp'), caddy.indexOf('request>headers>Referer'))
  const rules = [...uriBlock.matchAll(/regexp "((?:[^"\\]|\\.)*)" "([^"]*)"/g)].map(([, find, put]) => [new RegExp(find, 'g'), put.replaceAll('${1}', '$1')])
  const mask = (uri) => rules.reduce((out, [find, put]) => out.replace(find, put), uri)

  test("/door?key= is masked by the existing key= regexp (spec v2.1 §4)", () => {
    expect(rules.length).toBeGreaterThan(0)
    expect(mask('/door?key=s3cret-key')).toBe('/door?key=REDACTED')
    expect(mask('/?key=s3cret-key')).toBe('/?key=REDACTED')
    expect(mask('/api/stream?key=s3cret&x=1')).toBe('/api/stream?key=REDACTED&x=1')
  })

  test("the /?key= redirect's Location header is masked too", () => {
    const block = caddy.slice(caddy.indexOf('resp_headers>Location multi_regexp'), caddy.indexOf('request>headers>X-Join-Key'))
    const own = [...block.matchAll(/regexp "((?:[^"\\]|\\.)*)" "([^"]*)"/g)].map(([, find, put]) => [new RegExp(find, 'g'), put.replaceAll('${1}', '$1')])
    expect(own.length).toBe(2)
    const maskLocation = (uri) => own.reduce((out, [find, put]) => out.replace(find, put), uri)
    expect(maskLocation('/door?key=s3cret-key')).toBe('/door?key=REDACTED')
    expect(maskLocation('/tv/k/s3cret')).toBe('/tv/k/REDACTED')
  })
})
