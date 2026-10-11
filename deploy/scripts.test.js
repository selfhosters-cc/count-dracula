import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openLedger } from '../server/ledger.js'
import { openAccounts } from '../server/accounts.js'

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
  })

  test('says so when nobody has that email', async () => {
    const { path } = database()

    const { out, code } = await run('access-request.js', path, 'nobody@example.com')

    expect(code).toBe(1)
    expect(out).toContain('No Manager with that email')
  })
})
