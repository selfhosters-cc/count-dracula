import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { BadCommand, openLedger } from './ledger.js'

function signUp(config = {}) {
  const ledger = openLedger(new Database(':memory:'), { now: () => Date.parse('2026-10-15T15:00:00Z'), random: () => 0.5, ...config })
  const house = ledger.household(ledger.createHousehold({ displayName: 'New house', timeZone: 'America/Vancouver' }))
  return { ledger, house, halloween: () => house.events().find((e) => e.name === 'Halloween 2026') }
}

describe('last year, estimated', () => {
  test("a total of 200 makes five buckets in 2025's shape that add up to exactly 200", () => {
    const { house, halloween } = signUp()

    house.apply({ type: 'setLastYear', total: 200 })

    const estimated = house.events().find((e) => e.name === 'Halloween 2025 (estimated)')
    expect(estimated).toMatchObject({ countsOnly: true, estimated: true })
    expect(halloween().raceAgainstId).toBe(estimated.id)
    house.apply({ type: 'goLive', eventId: halloween().id })
    const { ghost } = house.snapshot()
    // 14, 72, 107, 119 and 34 of 346, scaled to 200; the rounding remainder goes to the biggest bucket.
    expect(ghost.buckets).toEqual([
      { start: '17:42', end: '18:00', count: 8 },
      { start: '18:00', end: '18:30', count: 41 },
      { start: '18:30', end: '19:00', count: 61 },
      { start: '19:00', end: '19:30', count: 71 },
      { start: '19:30', end: '20:00', count: 19 },
    ])
    expect(ghost).toMatchObject({ total: 200, estimated: true, label: 'last year (estimated)' })
  })

  test('the golden draw uses it, like any Race against', () => {
    const { house, halloween } = signUp()
    house.apply({ type: 'setLastYear', total: 100 })

    house.apply({ type: 'goLive', eventId: halloween().id })

    const numbers = house.tickets(halloween().id).map((t) => t.number)
    expect(numbers).toHaveLength(5)
    for (const n of numbers) expect(n >= 10 && n <= 80).toBe(true) // 10–80% of 100
  })

  test('Change reshapes it; Clear removes it and sets Race against back to None', () => {
    const { house, halloween } = signUp()
    house.apply({ type: 'setLastYear', total: 200 })
    const first = halloween().raceAgainstId

    house.apply({ type: 'setLastYear', total: 50 })
    expect(halloween().raceAgainstId).toBe(first)
    expect(house.lastYear()).toBe(50)

    house.apply({ type: 'setLastYear', total: null })
    expect(halloween().raceAgainstId).toBeNull()
    expect(house.events().some((e) => e.estimated)).toBe(false)
    expect(house.lastYear()).toBeNull()
  })

  test('is only offered while the Household has no past night of its own', () => {
    const { house } = signUp()
    expect(house.canEstimateLastYear()).toBe(true)
    const [{ event }] = house.apply({ type: 'createEvent', name: 'A real night' })
    house.apply({ type: 'goLive', eventId: event.id })
    const [{ event: next }] = house.apply({ type: 'createEvent', name: 'Next' })
    house.apply({ type: 'goLive', eventId: next.id }) // "A real night" is a past night now

    expect(house.canEstimateLastYear()).toBe(false)
    expect(() => house.apply({ type: 'setLastYear', total: 100 })).toThrow(BadCommand)
  })

  test('needs a whole number of kids', () => {
    const { house } = signUp()

    for (const total of [0, -5, 2.5, 'lots', 100_001]) expect(() => house.apply({ type: 'setLastYear', total })).toThrow(BadCommand)
  })

  test('the switch turns the field off, while a night already racing it keeps racing', () => {
    const db = new Database(':memory:')
    const now = () => Date.parse('2026-10-15T15:00:00Z')
    const on = openLedger(db, { now })
    const id = on.createHousehold({ displayName: 'Early bird', timeZone: 'UTC' })
    on.household(id).apply({ type: 'setLastYear', total: 120 })

    const house = openLedger(db, { now, switches: { estimatedGhost: false } }).household(id)

    expect(house.canEstimateLastYear()).toBe(false)
    expect(() => house.apply({ type: 'setLastYear', total: 100 })).toThrow(BadCommand)
    const halloween = house.events().find((e) => e.name === 'Halloween 2026')
    expect(house.events().find((e) => e.id === halloween.raceAgainstId)?.estimated).toBe(true)
  })
})
