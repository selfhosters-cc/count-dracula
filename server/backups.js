// Backups (v2 spec §15, §16): the Bun process copies the database with VACUUM INTO every 15 minutes, and
// keeps the last 8 copies plus the newest of each of the last 14 days (UTC). A deleted Household is gone
// from every copy within 2 months: 14 days here, 14 days of off-box pulls, and the Proxmox dumps.
import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const EVERY_MS = 15 * 60_000
const KEEP_LAST = 8
const KEEP_DAYS = 14
const DAY = 86_400_000
const NAME = /^count-dracula-(\d{8})-(\d{6})\.sqlite$/

// db: the live bun:sqlite database. dir: where the copies go.
export function createBackups({ db, dir, now = Date.now, log = console.log }) {
  let lastAt = null
  mkdirSync(dir, { recursive: true })

  function copies() {
    return readdirSync(dir)
      .map((file) => {
        const m = file.match(NAME)
        if (!m) return null
        const [, d, t] = m
        return { file, at: Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8), +t.slice(0, 2), +t.slice(2, 4), +t.slice(4, 6)) }
      })
      .filter(Boolean)
      .sort((a, b) => a.at - b.at)
  }

  function prune() {
    const all = copies()
    const keep = new Set(all.slice(-KEEP_LAST).map((c) => c.file))
    const today = Math.floor(now() / DAY) * DAY
    const newestOfDay = new Map()
    for (const c of all) if (c.at >= today - (KEEP_DAYS - 1) * DAY) newestOfDay.set(Math.floor(c.at / DAY), c.file)
    for (const file of newestOfDay.values()) keep.add(file)
    for (const c of all) if (!keep.has(c.file)) rmSync(join(dir, c.file))
  }

  const backups = {
    // One copy now; returns its path.
    run() {
      const stamp = new Date(now()).toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
      const path = join(dir, `count-dracula-${stamp}.sqlite`)
      rmSync(path, { force: true }) // VACUUM INTO won't overwrite
      db.exec(`VACUUM INTO '${path.replaceAll("'", "''")}'`)
      lastAt = now()
      prune()
      return path
    },

    // When the last good copy was made, for /operator's Backup tile; null until the first.
    lastAt() {
      return lastAt
    },

    // Every 15 minutes from now, then `also` (the deletions prune). Returns stop().
    start({ setInterval: every = setInterval, clearInterval: stop = clearInterval, also = () => {} } = {}) {
      const tick = () => {
        try {
          backups.run()
          also()
        } catch (err) {
          log(`backup failed: ${err.message}`)
        }
      }
      const timer = every(tick, EVERY_MS)
      return () => stop(timer)
    },
  }
  return backups
}
