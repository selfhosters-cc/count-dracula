import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { computeNearby } from './nearby.js'
import { isBlocked } from './blocklist.js'
import { startServer } from './app.js'
import { readFrames } from '../test/sse.js'

// A live night as the Ledger reports it. Defaults: an active, non-Rehearsal night in Area "dpz8".
let nextId = 1
function night(overrides = {}) {
  const id = nextId++
  return { householdId: id, cell: 'dpz83', rehearsal: false, suspended: false, kids: 20, kids30: 6, costumes: [], ...overrides }
}
const area = (result, a) => result.areas.get(a) ?? null
const compute = (nights) => computeNearby(nights, { isBlocked })

describe('Area figures', () => {
  test('4 active Households in an Area show nothing; 5 show figures', () => {
    const four = Array.from({ length: 4 }, () => night())

    expect(area(compute(four), 'dpz8')).toBeNull()
    expect(area(compute([...four, night()]), 'dpz8')).toMatchObject({ houses: 5, kids30: 30 })
  })

  test("Rehearsals, Suspended Households and nights with no kid in 30 minutes don't count", () => {
    const four = Array.from({ length: 4 }, () => night())

    for (const sixth of [night({ rehearsal: true }), night({ suspended: true }), night({ kids30: 0 }), night({ cell: null })]) {
      expect(area(compute([...four, sixth]), 'dpz8')).toBeNull()
    }
  })

  test('kid counts are rounded to 5s', () => {
    const active = (n) => Array.from({ length: 5 }, () => night({ kids30: n }))

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

describe('the Site-wide total', () => {
  test("every live, non-Rehearsal night's Household and kids, rounded, from 5 Households", () => {
    const nights = [night({ kids: 100, kids30: 0 }), night({ kids: 3, kids30: 0 }), night({ kids: 0, kids30: 0 }), night({ kids: 9 }), night({ rehearsal: true, kids: 500 })]

    expect(compute(nights).site).toBeNull() // 4 live non-Rehearsal Households
    expect(compute([...nights, night({ kids: 0, cell: null })]).site).toEqual({ houses: 5, kids: 110 }) // 112 → 110
    expect(compute([...nights, night({ suspended: true })]).site).toBeNull()
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
      const house = app.ledger.household(app.ledger.createHousehold({ displayName: `House ${i}`, timeZone: 'America/Toronto' }))
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
    expect(pushed.data).toEqual({ area: { houses: 6, kids30: 10, topCostume: { name: 'Witch', emoji: '🧙' } }, site: { houses: 6, kids: 10 } })
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
