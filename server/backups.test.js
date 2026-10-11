import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createBackups } from './backups.js'
import { openLedger } from './ledger.js'

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

function setUp(start = Date.parse('2026-10-01T00:00:00Z')) {
  const dir = mkdtempSync(join(tmpdir(), 'count-dracula-backups-'))
  const db = new Database(join(dir, 'live.sqlite'), { create: true })
  const clock = { now: start }
  const ledger = openLedger(db, { now: () => clock.now })
  const house = ledger.household(ledger.createHousehold({ displayName: 'A', timeZone: 'UTC' }))
  const backups = createBackups({ db, dir: join(dir, 'backups'), now: () => clock.now })
  return { db, clock, house, backups, dir: join(dir, 'backups') }
}

describe('VACUUM INTO backups', () => {
  test('a timestamped copy that opens as a valid database with the same counts', () => {
    const { house, backups, dir, clock } = setUp()
    house.apply({ type: 'tap', id: 'k1', tagId: null, tappedAt: clock.now, phoneName: 'Dad' })
    house.apply({ type: 'tap', id: 'k2', tagId: null, tappedAt: clock.now, phoneName: 'Dad' })

    const path = backups.run()

    expect(readdirSync(dir)).toEqual(['count-dracula-20261001-000000.sqlite'])
    expect(path).toBe(join(dir, 'count-dracula-20261001-000000.sqlite'))
    const copy = new Database(path, { readonly: true })
    expect(copy.query('PRAGMA integrity_check').get().integrity_check).toBe('ok')
    expect(copy.query('SELECT COUNT(*) AS n FROM kids').get().n).toBe(2)
    expect(backups.lastAt()).toBe(clock.now)
  })

  test('the timer makes one every 15 minutes', async () => {
    const { backups, dir, clock } = setUp()
    const timers = []
    const stop = backups.start({ setInterval: (fn, ms) => timers.push({ fn, ms }) })

    for (let i = 0; i < 4; i++) {
      clock.now += 15 * MINUTE
      timers[0].fn()
    }

    expect(timers[0].ms).toBe(15 * MINUTE)
    expect(readdirSync(dir)).toHaveLength(4)
    void stop
  })

  test('keeps exactly the last 8, plus the newest of each of the last 14 days', () => {
    const start = Date.parse('2026-10-01T00:00:00Z')
    const { backups, dir, clock } = setUp(start)
    const made = []
    for (let t = start; t <= start + 20 * DAY; t += 6 * 60 * MINUTE) {
      clock.now = t
      made.push(backups.run())
    }

    const kept = readdirSync(dir).sort()

    // Independently: the newest 8 by time, and for each of the 14 days up to now, that day's last copy.
    const name = (t) => `count-dracula-${new Date(t).toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)}.sqlite`
    const times = Array.from({ length: 81 }, (_, i) => start + i * 6 * 60 * MINUTE)
    const expected = new Set(times.slice(-8).map(name))
    const now = times.at(-1)
    for (let d = 0; d < 14; d++) {
      const dayStart = Date.UTC(2026, 9, 21) - d * DAY
      const ofDay = times.filter((t) => t >= dayStart && t < dayStart + DAY && t <= now)
      if (ofDay.length) expected.add(name(ofDay.at(-1)))
    }
    expect(made).toHaveLength(81)
    expect(kept).toEqual([...expected].sort())
  })
})
