// Household #1's real 2025 night (spec v2.1 §12), once, after it signs up again on the rebuilt database:
// makes the Past counts-only Event "Halloween 2025 (counts)" from the five half-hour buckets the user counted
// (.scratch/count-dracula/data/2025-counts.md, 346 kids) and prints its id. Then, in /setup, set Halloween 2026's
// Race against to it by hand. Refuses if the Household already has an Event of that name. Safe with the service
// running (WAL); shipped in the deploy tarball (deploy/RUNBOOK.md):
//   bun deploy/import-past-counts.js <database> <household id>
import { Database } from 'bun:sqlite'
import { openLedger } from '../server/ledger.js'

const NAME = 'Halloween 2025 (counts)'
const BUCKETS = [
  { start: '17:42', end: '18:00', count: 14 },
  { start: '18:00', end: '18:30', count: 72 },
  { start: '18:30', end: '19:00', count: 107 },
  { start: '19:00', end: '19:30', count: 119 },
  { start: '19:30', end: '20:00', count: 34 },
]

const [path, idArg] = process.argv.slice(2)
if (!path || !idArg) fail('Usage: bun deploy/import-past-counts.js <database> <household id>')
const householdId = Number(idArg)
if (!Number.isInteger(householdId) || householdId < 1) fail(`"${idArg}" isn't a household id`)

const db = new Database(path)
db.exec('PRAGMA busy_timeout = 5000') // the running service may hold the write lock for a moment
const ledger = openLedger(db, {})
const house = ledger.household(householdId)
if (!house) fail(`household ${householdId} is not in this database`)
if (db.query('SELECT 1 FROM events WHERE household_id = ? AND name = ?').get(householdId, NAME)) {
  fail(`household ${householdId} already has "${NAME}": nothing imported`)
}
const id = house.addPastCounts({ name: NAME, buckets: BUCKETS })
const total = BUCKETS.reduce((n, b) => n + b.count, 0)
console.log(`imported "${NAME}" (${total} kids) for household ${householdId} as event ${id}`)
console.log(`Next: /setup → Nights → Halloween 2026 → Race against "${NAME}".`)

function fail(message) {
  console.error(`!! ${message}`)
  process.exit(2)
}
