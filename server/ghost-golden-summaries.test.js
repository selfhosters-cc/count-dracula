// v2.1 ticket 55: the Household's estimate is its default Race against, golden tickets follow one rule per
// Event, every Ended or Past Event has a Night summary, the tally sheet names its Event, and the Race against
// picker offers only nights there's something to race (spec v2.1 §7).
import { afterEach, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BadCommand, openLedger } from './ledger.js'
import { startServer } from './app.js'
import { zonedTime } from '../shared/night-maths.js'
import { raceChoices } from '../shared/race-against.js'
import { tallySnapshotUrl } from '../public/tally-view.js'
import { fakeGoogle } from '../test/fake-google.js'
import { cookieOf, signIn } from '../test/sign-in.js'

const ZONE = 'America/Toronto'
const local = (date, hhmm) => zonedTime(date, hhmm, ZONE)
const ESTIMATE = 'Halloween 2025 (estimated)'

// Signed up on Oct 20 at noon: the Test night is Live, Halloween 2026 goes live Oct 31 at 4:00 pm.
function signedUp({ switches } = {}) {
  const clock = { now: local('2026-10-20', '12:00') }
  const db = new Database(':memory:')
  let r = 0
  const randoms = [0.1, 0.5, 0.9, 0.3, 0.7]
  const config = { now: () => clock.now, random: () => randoms[r++ % randoms.length], switches }
  const ledger = openLedger(db, config)
  const house = ledger.household(ledger.createHousehold({ displayName: 'House', timeZone: ZONE }))
  return { clock, db, config, ledger, house }
}

const byName = (house, name) => house.events().find((e) => e.name === name)
const idOf = (house, name) => byName(house, name).id
const raceOf = (house, name) => byName(house, name).raceAgainstId
const make = (house, name) => house.apply({ type: 'createEvent', name })[0].event.id
const named = (house, id) => ({ eventId: id, stamp: house.events().find((e) => e.id === id).wentLiveAt })
const counts = (house, name) => house.addPastCounts({ name, buckets: [{ start: '18:00', end: '18:30', count: 40 }] })
const withoutSeq = (deltas) => deltas.map(({ seq, ...d }) => d)

describe('the estimate is the Household’s default Race against', () => {
  test('entering 120 sets it on every Upcoming or open Event racing None, and a night made afterwards races it', () => {
    const { house } = signedUp()
    const imported = counts(house, 'Halloween 2025 (counts)')
    const party = make(house, 'Party')
    house.apply({ type: 'settings', eventId: party, raceAgainstId: imported })
    const old = make(house, 'Old night')
    house.apply({ type: 'goLive', eventId: old })
    house.apply({ type: 'end', ...named(house, old) })
    house.apply({ type: 'close', eventId: old }) // Past, racing None

    const deltas = house.apply({ type: 'setLastYear', total: 120 })

    const estimate = idOf(house, ESTIMATE)
    expect(raceOf(house, 'Test night')).toBe(estimate)
    expect(raceOf(house, 'Halloween 2026')).toBe(estimate)
    expect(raceOf(house, 'Party')).toBe(imported) // racing something else: untouched
    expect(raceOf(house, 'Old night')).toBeNull() // Past: untouched
    expect(raceOf(house, ESTIMATE)).toBeNull()
    expect(raceOf(house, 'Halloween 2025 (counts)')).toBeNull()
    // The open Event racing it resyncs (its ghost appears).
    expect(withoutSeq(deltas)).toEqual([{ type: 'event.updated', eventId: idOf(house, 'Test night') }])
    expect(house.snapshot(idOf(house, 'Test night')).ghost).toMatchObject({ total: 120, label: 'last year (estimated)' })

    house.apply({ type: 'createEvent', name: 'Later' })
    expect(raceOf(house, 'Later')).toBe(estimate)
  })

  test('changing it reshapes the same Event, and leaves a night set back to None alone', () => {
    const { house } = signedUp()
    house.apply({ type: 'setLastYear', total: 120 })
    const estimate = idOf(house, ESTIMATE)
    house.apply({ type: 'settings', eventId: idOf(house, 'Halloween 2026'), raceAgainstId: null }) // the Manager's choice

    const deltas = house.apply({ type: 'setLastYear', total: 80 })

    expect(idOf(house, ESTIMATE)).toBe(estimate)
    expect(house.lastYear()).toBe(80)
    expect(raceOf(house, 'Test night')).toBe(estimate)
    expect(raceOf(house, 'Halloween 2026')).toBeNull()
    expect(withoutSeq(deltas)).toEqual([{ type: 'event.updated', eventId: idOf(house, 'Test night') }])
    expect(house.snapshot(idOf(house, 'Test night')).ghost.total).toBe(80)
  })

  test('clearing it puts its racers back to None, and touches nothing else', () => {
    const { house } = signedUp()
    const imported = counts(house, 'Halloween 2025 (counts)')
    const party = make(house, 'Party')
    house.apply({ type: 'settings', eventId: party, raceAgainstId: imported })
    house.apply({ type: 'setLastYear', total: 120 })
    make(house, 'Later')

    const deltas = house.apply({ type: 'setLastYear', total: null })

    expect(byName(house, ESTIMATE)).toBeUndefined()
    for (const name of ['Test night', 'Halloween 2026', 'Later']) expect(raceOf(house, name)).toBeNull()
    expect(raceOf(house, 'Party')).toBe(imported)
    expect(withoutSeq(deltas)).toEqual([{ type: 'event.updated', eventId: idOf(house, 'Test night') }])
    expect(house.snapshot(idOf(house, 'Test night')).ghost).toBeNull()
  })

  test('is offered after the Household has a Past Event of its own (no gate), behind the switch', () => {
    const { house } = signedUp()
    const test = idOf(house, 'Test night')
    house.apply({ type: 'end', ...named(house, test) })
    house.apply({ type: 'close', eventId: test })
    counts(house, 'Halloween 2024 (counts)')

    expect(house.canEstimateLastYear()).toBe(true)
    house.apply({ type: 'setLastYear', total: 120 })
    expect(raceOf(house, 'Halloween 2026')).toBe(idOf(house, ESTIMATE))
    expect(raceOf(house, 'Test night')).toBeNull() // Past: untouched

    const off = signedUp({ switches: { estimatedGhost: false } }).house
    expect(off.canEstimateLastYear()).toBe(false)
    expect(() => off.apply({ type: 'setLastYear', total: 120 })).toThrow(BadCommand)
  })

  test('with the switch off, an Event already racing it keeps racing, and new Events start at None', () => {
    const { db, config, house } = signedUp()
    house.apply({ type: 'setLastYear', total: 120 })

    const off = openLedger(db, { ...config, switches: { estimatedGhost: false } }).household(house.id)
    off.apply({ type: 'createEvent', name: 'Later' })

    expect(raceOf(off, 'Halloween 2026')).toBe(idOf(off, ESTIMATE))
    expect(raceOf(off, 'Later')).toBeNull()
  })
})

describe('golden tickets: one rule, per Event', () => {
  // The Test night plus A (3 tickets) and B (5 tickets), both on Expected kids 100: all three open.
  function twoNights() {
    const env = signedUp()
    const { house } = env
    const a = make(house, 'A')
    const b = make(house, 'B')
    house.apply({ type: 'settings', eventId: a, expectedKids: 100, goldenCount: 3 })
    house.apply({ type: 'settings', eventId: b, expectedKids: 100, goldenCount: 5 })
    house.apply({ type: 'goLive', eventId: a })
    house.apply({ type: 'goLive', eventId: b })
    return { ...env, a, b }
  }
  const states = (house, id) => house.tickets(id).map((t) => t.state)

  test('each open Event draws from its own count at Go live, from 10–80% of its own base', () => {
    const { house, a, b } = twoNights()
    expect(house.tickets(a)).toHaveLength(3)
    expect(house.tickets(b)).toHaveLength(5)
    for (const t of [...house.tickets(a), ...house.tickets(b)]) expect(t.number >= 10 && t.number <= 80).toBe(true)
    expect(house.tickets(idOf(house, 'Test night'))).toEqual([]) // neither a ghost nor Expected kids: nothing
  })

  test('a test night draws like any other Event: no exemption', () => {
    const { house } = signedUp()
    const test = idOf(house, 'Test night')
    house.apply({ type: 'end', ...named(house, test) })
    house.apply({ type: 'reset', eventId: test })
    house.apply({ type: 'settings', eventId: test, expectedKids: 50, goldenCount: 2 })

    house.apply({ type: 'goLive', eventId: test })

    expect(house.tickets(test)).toHaveLength(2)
  })

  test('Add a ticket and Release remaining act on the Event they name', () => {
    const { house, a, b } = twoNights()

    const added = house.apply({ type: 'addTicket', ...named(house, a) })
    house.apply({ type: 'release', ...named(house, b) })

    expect(house.tickets(a)).toHaveLength(4)
    expect(states(house, a)).toEqual(['hidden', 'hidden', 'hidden', 'hidden'])
    expect(states(house, b)).toEqual(Array(5).fill('released'))
    expect(withoutSeq(added)).toEqual([{ type: 'golden.changed', eventId: a, golden: { left: 4, nextIsGolden: false } }])
    expect(house.snapshot(b).golden).toEqual({ left: 5, nextIsGolden: true })
  })

  test('End expires only its own Event’s tickets, and Resume brings only those back', () => {
    const { house, a, b } = twoNights()

    house.apply({ type: 'end', ...named(house, a) })
    expect(states(house, a)).toEqual(Array(3).fill('expired'))
    expect(states(house, b)).toEqual(Array(5).fill('hidden'))
    expect(house.snapshot(a).recap.tickets).toHaveLength(3) // revealed once Ended
    expect(house.snapshot(b).recap).toBeNull() // never while Live

    house.apply({ type: 'resume', ...named(house, a) })
    expect(states(house, a)).toEqual(Array(3).fill('hidden'))
  })

  test('the 3 am expiry ends each Live Event by name, each expiring its own; Resume brings back one', () => {
    const { clock, ledger, house, a, b } = twoNights()
    house.apply({ type: 'release', ...named(house, b) })

    clock.now = local('2026-10-21', '03:00')
    ledger.tick()

    expect(byName(house, 'A').state).toBe('ended')
    expect(byName(house, 'B').state).toBe('ended')
    expect(states(house, a)).toEqual(Array(3).fill('expired'))
    expect(states(house, b)).toEqual(Array(5).fill('expired'))

    house.apply({ type: 'resume', ...named(house, b) })
    expect(states(house, b)).toEqual(Array(5).fill('released')) // exactly as they were
    expect(states(house, a)).toEqual(Array(3).fill('expired'))
  })
})

describe('a Night summary for every Ended or Past Event', () => {
  test('an Ended test night has a Night summary, with its nearby slide frozen at End, and a share link', () => {
    const { ledger, house } = signedUp()
    const test = idOf(house, 'Test night')
    expect(house.summary(test)).toBeNull() // still Live

    house.apply({ type: 'end', ...named(house, test), nearby: { houses: 6, kids30: 5, topCostume: null } })

    expect(house.summary(test)).toMatchObject({ event: { id: test, name: 'Test night', ended: true }, nearby: { houses: 6 } })
    const token = house.share(test)
    expect(ledger.byShareToken(token)).toMatchObject({ householdId: house.id, eventId: test })
    expect(house.share(test)).toBe(token) // one per Event

    house.apply({ type: 'close', eventId: test })
    expect(house.summary(test)).toMatchObject({ event: { past: true }, nearby: { houses: 6 } })
    expect(ledger.byShareToken(token)).not.toBeNull()
  })

  test('“vs the ghost” follows the Event’s own Race against', () => {
    const { house } = signedUp()
    const test = idOf(house, 'Test night')
    house.apply({ type: 'setLastYear', total: 120 })
    const imported = counts(house, 'Halloween 2025 (counts)')
    const party = make(house, 'Party')
    house.apply({ type: 'settings', eventId: party, raceAgainstId: imported })
    house.apply({ type: 'goLive', eventId: party })
    house.apply({ type: 'end', ...named(house, test) })
    house.apply({ type: 'end', ...named(house, party) })

    expect(house.summary(test).ghost).toMatchObject({ total: 120, label: 'last year (estimated)' })
    expect(house.summary(party).ghost).toMatchObject({ total: 40, label: '2025' })
  })
})

describe('the Race against picker', () => {
  test('offers only Ended, Past, counts-only or estimated Events, never the Event itself', () => {
    const { house } = signedUp()
    house.apply({ type: 'setLastYear', total: 120 })
    counts(house, 'Halloween 2025 (counts)')
    const ended = make(house, 'Ended night')
    house.apply({ type: 'goLive', eventId: ended })
    house.apply({ type: 'end', ...named(house, ended) })
    const past = make(house, 'Past night')
    house.apply({ type: 'goLive', eventId: past })
    house.apply({ type: 'end', ...named(house, past) })
    house.apply({ type: 'close', eventId: past })
    make(house, 'Upcoming night')

    const events = house.events()
    const offered = (name) => raceChoices(events, byName(house, name)).map((e) => e.name).sort()

    expect(offered('Halloween 2026')).toEqual(['Ended night', 'Halloween 2025 (counts)', ESTIMATE, 'Past night'].sort())
    expect(offered('Ended night')).toEqual(['Halloween 2025 (counts)', ESTIMATE, 'Past night'].sort())
  })

  test('the server refuses a new pointer at an Upcoming or Live Event, and keeps one at a reset Event', () => {
    const { house } = signedUp()
    const test = idOf(house, 'Test night')
    const halloween = idOf(house, 'Halloween 2026')
    const party = make(house, 'Party')
    expect(() => house.apply({ type: 'settings', eventId: halloween, raceAgainstId: test })).toThrow(BadCommand) // Live
    expect(() => house.apply({ type: 'settings', eventId: halloween, raceAgainstId: party })).toThrow(BadCommand) // Upcoming
    expect(() => house.apply({ type: 'settings', eventId: halloween, raceAgainstId: halloween })).toThrow(BadCommand)

    house.apply({ type: 'end', ...named(house, test) })
    house.apply({ type: 'settings', eventId: halloween, raceAgainstId: test })
    house.apply({ type: 'reset', eventId: test }) // Upcoming again

    house.apply({ type: 'settings', eventId: halloween, raceAgainstId: test, name: 'Halloween!' }) // the form sends it back
    expect(raceOf(house, 'Halloween!')).toBe(test)
    expect(raceChoices(house.events(), byName(house, 'Halloween!')).map((e) => e.id)).toEqual([test])
  })
})

describe('the tally sheet', () => {
  test('reads the named Event, or the door’s', () => {
    expect(tallySnapshotUrl('?event=7')).toBe('/api/snapshot?event=7')
    expect(tallySnapshotUrl('')).toBe('/api/snapshot')
    expect(tallySnapshotUrl('?event=')).toBe('/api/snapshot')
  })

  const running = []
  afterEach(() => running.splice(0).forEach((app) => app.stop()))

  test('over HTTP: /tally?event= serves the sheet, and its read names that Event; a bare read is the door’s', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'count-dracula-'))
    const configPath = join(dir, 'config.json')
    writeFileSync(configPath, JSON.stringify({ dbPath: join(dir, 'db.sqlite') }))
    const google = fakeGoogle()
    const app = startServer({ configPath, port: 0, google, env: {}, log: () => {} })
    running.push(app)
    const cookie = cookieOf(await signIn({ app, google }, { sub: 'a', email: 'a@example.com' }, { displayName: 'The Smiths' }))
    const get = (path) => fetch(`${app.url}${path}`, { headers: { Cookie: cookie } })
    const info = await (await get('/api/household')).json()
    const house = app.ledger.household(info.id)
    const halloween = house.events().find((e) => e.name === 'Halloween 2026')

    expect((await get(`/tally?event=${halloween.id}`)).status).toBe(200)
    expect((await (await get(tallySnapshotUrl(`?event=${halloween.id}`))).json()).event.name).toBe('Halloween 2026')
    expect((await (await get(tallySnapshotUrl(''))).json()).event.name).toBe('Test night')
  })
})
