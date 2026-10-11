// The nearby check (v2 spec §18, v2.1 §10), on the dev box only: fills one Area with fake Households counting
// right now (6 by default, 2 to see the smallest "near you"), so the TV box and the phone strip can be seen
// before Halloween. Never on production.
//
//   bun deploy/seed-nearby.js <scratch database> [houses]
//
// Each Household goes live on "Halloween 2026" with recent taps, over its sign-up Test night when that's Live
// (so it has two open Events and counts once, through Halloween: its door's Event). Witch is counted
// everywhere (the top costume, from 3 houses); Bluey, counted most of all but in only 2 Households, and a
// blocklisted name in 3, must never show as top. Then start (or restart) a server on that database: nearby
// refreshes at start, and every 10 minutes.
import { Database } from 'bun:sqlite'
import { resolve } from 'node:path'
import { openLedger } from '../server/ledger.js'

const PRODUCTION_DB = '/var/lib/count-dracula/count-dracula.sqlite'
const [path, count = '6'] = process.argv.slice(2)
if (!path) fail('Usage: bun deploy/seed-nearby.js <scratch database> [houses]')
const houses = Number(count)
if (!Number.isInteger(houses) || houses < 1 || houses > 6) fail('Seed 1 to 6 houses.')
if (resolve(path) === PRODUCTION_DB) fail('That is the production database: fake Households never go there.')
if (process.env.PUBLIC_HOST) fail('PUBLIC_HOST is set: this looks like production. The seed is for the dev box only.')

const db = new Database(path, { create: true })
const ledger = openLedger(db, {})
const now = Date.now()
const CELLS = ['dpz83', 'dpz86', 'dpz8d', 'dpz89', 'dpz8f', 'dpz8g'] // all in Area dpz8
const RUDE = 'Sh1t head' // blocklisted: saved here by hand, as a name that got past the filter would be

for (const [i, cell] of CELLS.slice(0, houses).entries()) {
  const id = ledger.createHousehold({ displayName: `Seed house ${i + 1}`, timeZone: 'America/Toronto' })
  const house = ledger.household(id)
  house.apply({ type: 'setLocation', cell })
  const halloween = () => house.events().find((e) => e.name === 'Halloween 2026')
  // A sign-up from Nov 1, 3 am on makes no Halloween 2026 (spec v2.1 §8): make it, with the Test night's costumes.
  if (!halloween()) house.apply({ type: 'createEvent', name: 'Halloween 2026', copyTagsFrom: house.doorEvent().id })
  if (!halloween().open) house.apply({ type: 'goLive', eventId: halloween().id })
  const night = halloween() // with its go-live stamp, which every tap names
  const tags = Object.fromEntries(house.snapshot(night.id).tags.map((t) => [t.name, t.id]))
  const extra = (name) => db.query('INSERT INTO tags (event_id, name, emoji, sort_order) VALUES (?, ?, ?, 99) RETURNING id').get(night.id, name, name === RUDE ? '💩' : '🐶').id
  const plan = [['Witch', 4], ...(i < 2 ? [['Bluey', 20]] : []), ...(i < 3 ? [[RUDE, 30]] : [])]
  let k = 0
  for (const [name, count] of plan) {
    const tagId = tags[name] ?? extra(name)
    for (let n = 0; n < count; n++) {
      house.apply({ type: 'tap', eventId: night.id, stamp: night.wentLiveAt, id: `seed-${id}-${k++}`, tagId, tappedAt: now - (n % 25) * 60_000, phoneName: 'Seed' })
    }
  }
  console.log(`Seed house ${i + 1} (${cell}): ${k} kids · TV /tv/k/${house.tvToken()} · phone /door?key=${house.joinKey()}`)
}
console.log('\nStart (or restart) a server on this database; nearby refreshes at start and every 10 minutes.')
console.log(
  houses >= 3
    ? `Expected: "Near you" with ${houses} houses and Witch on top; never Bluey (2 Households) nor the blocklisted name.`
    : houses === 2
      ? 'Expected: "Near you" with 2 houses on both, and no top costume (none is counted in 3 Households).'
      : 'Expected: no "near you" (nobody else counting); the phone falls back to the Site-wide total, hidden below 5.',
)

function fail(message) {
  console.error(`!! ${message}`)
  process.exit(2)
}
