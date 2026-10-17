// The README demo's night (docs/demo/README.md): a scratch database with one Household, "The Smiths on Elm
// St", live on Halloween 2026 at about 6:30 pm, racing the real 2025 night (346 kids), a few kids short of
// #100, with the next golden ticket on #104. Never the repo's database or production's.
//
//   bun docs/demo/seed.js <scratch database>
//
// Prints what the recorder needs as JSON: { joinKey, tvToken }.
import { Database } from 'bun:sqlite'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { openLedger } from '../../server/ledger.js'
import { zonedTime } from '../../shared/night-maths.js'

const [path] = process.argv.slice(2)
if (!path) fail('Usage: bun docs/demo/seed.js <scratch database>')
if (existsSync(path)) fail(`${path} already exists: the demo seeds a fresh scratch database`)
if (resolve(path) === resolve(import.meta.dir, '../../count-dracula.sqlite')) fail("That's the repo's own database")

const ZONE = 'America/Toronto'
const NOW_READS = '18:29' // on Oct 31: tonight's count a nose ahead of last year's ghost
const KIDS = 94 // six taps short of the #100 takeover
const GOLDEN = [104, 152, 188, 231, 266] // the first lands four kids after #100
const LAST_YEAR = [
  { start: '17:42', end: '18:00', count: 14 },
  { start: '18:00', end: '18:30', count: 72 },
  { start: '18:30', end: '19:00', count: 107 },
  { start: '19:00', end: '19:30', count: 119 },
  { start: '19:30', end: '20:00', count: 34 },
]
// A realistic mix, Spider-Man the one costume the door added tonight.
const MIX = { Witch: 16, Superhero: 14, Princess: 13, 'Spider-Man': 12, Ghost: 9, Dinosaur: 9, Vampire: 8, Skeleton: 7, Other: 6 }
const PHONES = ['Greg', 'Sam', 'Ava']

const db = new Database(path, { create: true })
const ledger = openLedger(db, {})
const id = ledger.createHousehold({ displayName: 'The Smiths on Elm St', timeZone: ZONE })
const house = ledger.household(id)
const past = house.addPastCounts({ name: 'Halloween 2025', buckets: LAST_YEAR })
const halloween = () => house.events().find((e) => e.name === 'Halloween 2026')
if (!halloween()) fail('No Halloween 2026: seed before Nov 1, 3 am')
const now = Date.now()
const shift = zonedTime('2026-10-31', NOW_READS, ZONE) - now
house.apply({ type: 'settings', eventId: halloween().id, raceAgainstId: past, clockShiftMs: shift })
house.apply({ type: 'createTag', eventId: halloween().id, name: 'Spider-Man', emoji: '🕷️' })
house.apply({ type: 'goLive', eventId: halloween().id })
const night = halloween()
const tags = Object.fromEntries(house.snapshot(night.id).tags.map((t) => [t.name, t.id]))

// Costumes shuffled, tap times ramping up from 5:38 pm (event time) to a minute ago, as a real night does.
let seed = 31
const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
const costumes = Object.entries(MIX).flatMap(([name, n]) => Array(n).fill(name))
for (let i = costumes.length - 1; i > 0; i--) {
  const j = Math.floor(random() * (i + 1))
  ;[costumes[i], costumes[j]] = [costumes[j], costumes[i]]
}
if (costumes.length !== KIDS) fail(`The mix adds up to ${costumes.length}, not ${KIDS}`)
const first = zonedTime('2026-10-31', '17:38', ZONE) - shift
const last = now - 60_000
costumes.forEach((name, i) => {
  const at = first + (last - first) * Math.sqrt((i + random() * 0.6) / KIDS)
  house.apply({ type: 'tap', eventId: night.id, stamp: night.wentLiveAt, id: `demo-${i}`, tagId: tags[name], tappedAt: Math.round(at), phoneName: PHONES[i % 3] })
})

// The seeded kids are late, so any ticket they landed on rolled forward: put all five back, hidden, ahead.
const tickets = db.query('SELECT id FROM golden_tickets WHERE event_id = ? ORDER BY id').all(night.id)
tickets.forEach((t, i) => db.query("UPDATE golden_tickets SET number = ?, state = 'hidden', kid_id = NULL WHERE id = ?").run(GOLDEN[i], t.id))

console.log(JSON.stringify({ joinKey: house.joinKey(), tvToken: house.tvToken() }))

function fail(message) {
  console.error(`!! ${message}`)
  process.exit(2)
}
