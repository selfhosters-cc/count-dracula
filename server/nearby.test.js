import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { computeNearby, nearYou } from './nearby.js'
import { isBlocked } from './blocklist.js'
import { startServer } from './app.js'
import { readFrames } from '../test/sse.js'
import { namingTheDoor } from '../test/v1-night.js'

// A Household's door's Event as the Ledger reports it. Defaults: an active night in Area "dpz8".
let nextId = 1
function night(overrides = {}) {
  const id = nextId++
  return { householdId: id, cell: 'dpz83', suspended: false, live: true, kids: 20, kids30: 6, costumes: [], ...overrides }
}
const area = (result, a) => result.areas.get(a) ?? null
const compute = (nights) => computeNearby(nights, { isBlocked })

describe('Area figures', () => {
  // What one Household's screens get for its own Area (spec v2.1 §10: no minimum crowd).
  const seen = (nights, house) => nearYou(compute(nights), house.householdId, house.cell)

  test('two Active Households in an Area each see "near you"; one alone sees nothing', () => {
    const [a, b] = [night({ kids30: 4 }), night({ kids30: 3 })]

    expect(seen([a], a)).toBeNull()
    expect(seen([a, b], a)).toEqual({ houses: 2, kids30: 5, topCostume: null })
    expect(seen([a, b], b)).toEqual({ houses: 2, kids30: 5, topCostume: null })
  })

  test('a Household that is not counting itself sees its Area once one other house is', () => {
    const quiet = night({ kids30: 0 })
    const other = night()

    expect(seen([quiet], quiet)).toBeNull()
    expect(seen([quiet, other], quiet)).toMatchObject({ houses: 1 })
    expect(seen([other], { householdId: 99, cell: 'dpz8b' })).toMatchObject({ houses: 1 }) // nothing open at all
    expect(seen([other], { householdId: 99, cell: null })).toBeNull() // no Location
  })

  test("Suspended Households, nights with no kid in 30 minutes and Households without a Location aren't the other house", () => {
    const me = night()

    for (const other of [night({ suspended: true }), night({ kids30: 0 }), night({ cell: null })]) {
      expect(seen([me, other], me)).toBeNull()
    }
  })

  test('kid counts are rounded to 5s', () => {
    const active = (n) => Array.from({ length: 5 }, () => night({ kids30: n }))

    expect(area(compute([night({ kids30: 0 }), night({ kids30: 2 })]), 'dpz8').kids30).toBe(0) // "under 5 kids"
    expect(area(compute(active(1)), 'dpz8').kids30).toBe(5) // 5 kids
    expect(area(compute(active(3)), 'dpz8').kids30).toBe(15)
    expect(area(compute([...active(1).slice(0, 4), night({ kids30: 3 })]), 'dpz8').kids30).toBe(5) // 7 → 5
    expect(area(compute([...active(1).slice(0, 4), night({ kids30: 4 })]), 'dpz8').kids30).toBe(10) // 8 → 10
  })

  test('neighbouring cells across a 4-character boundary land in different Areas', () => {
    // dpz8z and dpzb0 are side by side, but their parents differ.
    const nights = [...Array.from({ length: 5 }, () => night({ cell: 'dpz8z' })), ...Array.from({ length: 5 }, () => night({ cell: 'dpzb0' }))]

    const result = compute(nights)

    expect(area(result, 'dpz8')).toMatchObject({ houses: 5 })
    expect(area(result, 'dpzb')).toMatchObject({ houses: 5 })
  })
})

describe('top costume', () => {
  const witch = { name: 'Witch', emoji: '🧙', count: 4 }

  test('the most-counted name across 3 or more Households, case-insensitive and trimmed', () => {
    const nights = [
      night({ costumes: [witch, { name: 'Ghost', emoji: '👻', count: 30 }] }),
      night({ costumes: [{ name: ' witch ', emoji: '🧙', count: 2 }, { name: 'Ghost', emoji: '👻', count: 30 }] }),
      night({ costumes: [{ name: 'WITCH', emoji: '🧙', count: 1 }] }),
      night(),
      night(),
    ]

    expect(area(compute(nights), 'dpz8').topCostume).toEqual({ name: 'Witch', emoji: '🧙' }) // Ghost: only 2 Households
  })

  test('never one counted in only 2 Households, nor a blocklisted one; with none qualifying, there is none', () => {
    const rude = { name: 'Sh1t', emoji: '💩', count: 50 }
    const nights = [night({ costumes: [rude, witch] }), night({ costumes: [rude, witch] }), night({ costumes: [rude] }), night(), night()]

    expect(area(compute(nights), 'dpz8').topCostume).toBeNull()
  })

  test('a name made of HTML is just a name', () => {
    const tag = { name: '<img src=x onerror=alert(1)>', emoji: '🎃', count: 3 }
    const nights = [night({ costumes: [tag] }), night({ costumes: [tag] }), night({ costumes: [tag] }), night(), night()]

    expect(area(compute(nights), 'dpz8').topCostume).toEqual({ name: '<img src=x onerror=alert(1)>', emoji: '🎃' })
  })
})

describe('the site-wide top costume', () => {
  const witch = { name: 'Witch', emoji: '🧙', count: 2 }
  const rude = { name: 'Sh1t', emoji: '💩', count: 90 }
  const bluey = { name: 'Bluey', emoji: '🐶', count: 90 }
  const withTop = (nights) => computeNearby(nights, { isBlocked, siteTopCostume: true }).site

  test('the most-counted name in at least 3 Households, never a blocklisted one', () => {
    const nights = [
      night({ costumes: [witch, rude, bluey] }),
      night({ costumes: [witch, rude, bluey] }),
      night({ cell: null, costumes: [witch, rude] }), // no Location: still on the site line
      night({ kids30: 0 }),
      night(),
    ]

    expect(withTop(nights).topCostume).toEqual({ name: 'Witch', emoji: '🧙' })
  })

  test('with none qualifying, there is none; and it comes only with its switch', () => {
    const nights = [night({ costumes: [bluey] }), night({ costumes: [bluey] }), night(), night(), night()]

    expect(withTop(nights).topCostume).toBeNull()
    expect(computeNearby(nights, { isBlocked }).site).not.toHaveProperty('topCostume')
  })

  test('a name made of HTML is just a name', () => {
    const tag = { name: '<img src=x onerror=alert(1)>', emoji: '🎃', count: 1 }
    const nights = [night({ costumes: [tag] }), night({ costumes: [tag] }), night({ costumes: [tag] }), night(), night()]

    expect(withTop(nights).topCostume.name).toBe('<img src=x onerror=alert(1)>')
  })
})

describe('the Site-wide total', () => {
  test("every open night's Household and kids, rounded, from 5 Households", () => {
    const nights = [night({ kids: 100, kids30: 0 }), night({ kids: 3, kids30: 0 }), night({ kids: 0, kids30: 0 }), night({ kids: 9 }), night({ suspended: true, kids: 500 })]

    expect(compute(nights).site).toBeNull() // 4 Households that aren't Suspended
    expect(compute([...nights, night({ kids: 0, cell: null })]).site).toEqual({ houses: 5, kids: 110 }) // 112 → 110
    expect(compute([...nights, night({ suspended: true })]).site).toBeNull()
  })

  test("it's live while any counted door's Event is Live, and not once every one is Ended", () => {
    const ended = Array.from({ length: 5 }, () => night({ live: false }))

    expect(compute(ended).live).toBe(false)
    expect(compute([...ended.slice(1), night({ live: true })]).live).toBe(true)
    expect(compute([...ended, night({ live: true, suspended: true })]).live).toBe(false) // a Suspended one isn't counted
    expect(compute(ended.slice(1).map((n) => ({ ...n, live: true }))).live).toBe(false) // below 5: nothing to say
  })
})

describe('on the screens', () => {
  const running = []
  const aborts = []
  afterEach(() => {
    aborts.splice(0).forEach((c) => c.abort())
    running.splice(0).forEach((app) => app.stop())
  })

  // Six Households in one Area, live on "Halloween 2026" (it's after 4 pm there), each with one Witch so far.
  function town(switches = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'count-dracula-'))
    const configPath = join(dir, 'config.json')
    writeFileSync(configPath, JSON.stringify({ dbPath: join(dir, 'db.sqlite'), switches }))
    const clock = { now: Date.parse('2026-10-31T23:00:00Z') }
    const app = startServer({ configPath, port: 0, env: {}, now: () => clock.now })
    running.push(app)
    const houses = Array.from({ length: 6 }, (_, i) => {
      const house = namingTheDoor(app.ledger.household(app.ledger.createHousehold({ displayName: `House ${i}`, timeZone: 'America/Toronto' })))
      house.apply({ type: 'setLocation', cell: 'dpz83' })
      return house
    })
    const tap = (house, id) => {
      const witch = house.snapshot().tags.find((t) => t.name === 'Witch')
      house.apply({ type: 'tap', id, tagId: witch.id, tappedAt: clock.now, phoneName: 'Dad' })
    }
    return { app, clock, houses, tap }
  }

  test('figures ride in the snapshot, change only on the 10-minute refresh, and are pushed to open screens', async () => {
    const { app, clock, houses, tap } = town()
    houses.forEach((h, i) => tap(h, `k${i}`))
    const snap = async () => (await fetch(`${app.url}/api/snapshot?key=${houses[0].tvToken()}`)).json()
    expect((await snap()).nearby).toEqual({ area: null, site: null }) // the start-up refresh saw no kids yet

    clock.now += 60_000
    houses.forEach((h, i) => tap(h, `j${i}`))
    expect((await snap()).nearby).toEqual({ area: null, site: null }) // still the old figures

    const controller = new AbortController()
    aborts.push(controller)
    const tv = readFrames(await fetch(`${app.url}/api/stream?key=${houses[0].tvToken()}`, { signal: controller.signal }))
    await tv.next()
    app.refreshNearby()

    const pushed = await tv.next()
    expect(pushed.event).toBe('nearby')
    expect(pushed.data).toEqual({ area: { houses: 6, kids30: 10, topCostume: { name: 'Witch', emoji: '🧙' } }, site: { houses: 6, kids: 10, topCostume: { name: 'Witch', emoji: '🧙' } } })
    expect((await snap()).nearby.area.houses).toBe(6)
  })

  test('the switch turns it off everywhere', async () => {
    const { app, houses, tap } = town({ nearby: false })
    houses.forEach((h, i) => tap(h, `k${i}`))

    app.refreshNearby()

    const snap = await (await fetch(`${app.url}/api/snapshot?key=${houses[0].joinKey()}`)).json()
    expect(snap.nearby).toBeNull()
    expect(snap.settings.switches.nearby).toBe(false)
  })
})

describe('the Site-wide total on the sign-up page', () => {
  const running46 = []
  afterEach(() => running46.splice(0).forEach((app) => app.stop()))

  function site(households, switches = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'count-dracula-'))
    const configPath = join(dir, 'config.json')
    writeFileSync(configPath, JSON.stringify({ dbPath: join(dir, 'db.sqlite'), switches }))
    const app = startServer({ configPath, port: 0, env: {}, now: () => Date.parse('2026-10-31T23:00:00Z') })
    running46.push(app)
    for (let i = 0; i < households; i++) {
      const house = namingTheDoor(app.ledger.household(app.ledger.createHousehold({ displayName: `House ${i}`, timeZone: 'America/Toronto' })))
      for (let k = 0; k < 3; k++) house.apply({ type: 'tap', id: `h${i}k${k}`, tagId: null, tappedAt: Date.parse('2026-10-31T22:59:00Z'), phoneName: 'Secret' })
    }
    app.refreshNearby()
    return app
  }

  test('shows with 5 live Households, hidden below, and holds only the rounded totals', async () => {
    const four = await (await fetch(`${site(4).url}/api/site`)).json()
    const res = await fetch(`${site(5).url}/api/site`)
    const body = await res.text()

    expect(four).toEqual({ site: null, live: false })
    expect(JSON.parse(body)).toEqual({ site: { houses: 5, kids: 15, topCostume: null }, live: true })
    expect(body).not.toContain('House')
    expect(body).not.toContain('Secret')
  })

  test('the nearby switch hides it', async () => {
    expect(await (await fetch(`${site(5, { nearby: false }).url}/api/site`)).json()).toEqual({ site: null, live: false })
  })
})

describe("one house per Household, through the door's Event (spec v2.1 §10)", () => {
  const running56 = []
  afterEach(() => running56.splice(0).forEach((app) => app.stop()))

  // Households signed up at 2 pm on Halloween in Toronto: each has its Test night Live, and "Halloween 2026"
  // goes live by itself at 4 pm.
  function afternoon(cells) {
    const dir = mkdtempSync(join(tmpdir(), 'count-dracula-'))
    const configPath = join(dir, 'config.json')
    writeFileSync(configPath, JSON.stringify({ dbPath: join(dir, 'db.sqlite') }))
    const clock = { now: Date.parse('2026-10-31T18:00:00Z') }
    const app = startServer({ configPath, port: 0, env: {}, now: () => clock.now })
    running56.push(app)
    const houses = cells.map((cell, i) => {
      const house = namingTheDoor(app.ledger.household(app.ledger.createHousehold({ displayName: `House ${i}`, timeZone: 'America/Toronto' })))
      if (cell) house.apply({ type: 'setLocation', cell })
      return house
    })
    const tap = (house, n) => {
      for (let k = 0; k < n; k++) house.apply({ type: 'tap', id: `${house.id}-${clock.now}-${k}`, tagId: null, tappedAt: clock.now, phoneName: 'Dad' })
    }
    const read = async (path) => (await fetch(`${app.url}${path}`)).json()
    const nearbyOf = async (house) => (await read(`/api/snapshot?key=${house.joinKey()}`)).nearby
    return { app, clock, houses, tap, read, nearbyOf }
  }

  test("a 2 pm test night drops out once Halloween goes live: one house each, with only its door's Event's kids", async () => {
    const { app, clock, houses, tap, read, nearbyOf } = afternoon(Array(5).fill('dpz83'))
    houses.forEach((h) => tap(h, 3))
    app.refreshNearby()
    expect(await read('/api/site')).toMatchObject({ site: { houses: 5, kids: 15 } })
    expect((await nearbyOf(houses[0])).area).toMatchObject({ houses: 5, kids30: 15 })

    clock.now = Date.parse('2026-10-31T20:05:00Z') // 4:05 pm: Halloween goes live over each Test night
    app.tick()
    expect(houses.every((h) => h.events().filter((e) => e.open).length === 2)).toBe(true)
    tap(houses[0], 2)
    app.refreshNearby()

    expect(await read('/api/site')).toMatchObject({ site: { houses: 5, kids: 0 } }) // 2 kids, not 17: 5 houses, not 10
    expect((await nearbyOf(houses[1])).area).toMatchObject({ houses: 1, kids30: 0 })
    expect((await nearbyOf(houses[0])).area).toBeNull() // nobody else is counting on Halloween yet
  })

  test('two Active Households in an Area each see "near you"; one alone falls back to the Site-wide total', async () => {
    const { app, houses, tap, nearbyOf } = afternoon(['dpz83', 'dpz8g', 'f2m6x', null, null])
    houses.forEach((h) => tap(h, 2))
    app.refreshNearby()

    const site = { houses: 5, kids: 10, topCostume: null }
    expect(await nearbyOf(houses[0])).toEqual({ area: { houses: 2, kids30: 5, topCostume: null }, site })
    expect(await nearbyOf(houses[1])).toEqual({ area: { houses: 2, kids30: 5, topCostume: null }, site })
    expect(await nearbyOf(houses[2])).toEqual({ area: null, site }) // alone in its Area
    expect(await nearbyOf(houses[3])).toEqual({ area: null, site }) // no Location
  })

  test("/api/site says live during a night, and not once every night is Ended", async () => {
    const { app, houses, tap, read } = afternoon(Array(5).fill(null))
    houses.forEach((h) => tap(h, 1))
    app.refreshNearby()
    expect(await read('/api/site')).toEqual({ site: { houses: 5, kids: 5, topCostume: null }, live: true })

    for (const h of houses) h.apply({ type: 'end' })
    app.refreshNearby()

    expect(await read('/api/site')).toEqual({ site: { houses: 5, kids: 5, topCostume: null }, live: false })
  })
})
