import { describe, expect, test } from 'bun:test'
import { nightFacts } from './summary.js'

// A Toronto night (EDT, UTC-4) of 6 kids, read here wherever the test runs.
const at = (hh, mm, ss = 0) => Date.parse(`2026-10-31T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}-04:00`)
const tags = [
  { id: 1, name: 'Witch', emoji: '🧙', order: 1 },
  { id: 2, name: 'Ghost', emoji: '👻', order: 2 },
  { id: 3, name: 'Bluey', emoji: '🐶', order: 3 },
]
const kid = (number, tappedAt, tagId = null, extra = {}) => ({ id: `k${number}`, number, tappedAt, tagId, teen: false, golden: false, ...extra })
const night = {
  displayName: 'The Smiths',
  timeZone: 'America/Toronto',
  event: { name: 'Halloween 2026', ended: true, clockShiftMs: 0, visitWindowMs: 15_000 },
  tags,
  kids: [
    kid(1, at(18, 5), 1),
    kid(2, at(19, 1), 1),
    kid(3, at(19, 1, 10), 2),
    kid(4, at(19, 1, 20), 1, { golden: true }),
    kid(5, at(19, 20), null, { teen: true }),
    kid(6, at(20, 40), 3),
  ],
  ghost: { label: '2025', total: 4, buckets: [{ start: '18:00', end: '18:30', count: 4 }] },
  recap: { tickets: [{ number: 4, state: 'won', kidNumber: 4 }, { number: 9, state: 'expired', kidNumber: null }] },
  nearby: null,
}

describe('night facts', () => {
  test("are the TV recap's figures, in the Household's zone", () => {
    const f = nightFacts(night)

    expect(f).toMatchObject({
      total: 6,
      span: '6:05pm – 8:40pm',
      peak: { start: '19:00', end: '19:30', count: 4 },
      peakText: '7:00–7:30',
      crew: { size: 3 },
      crewAt: '7:01pm',
      top: { name: 'Witch', count: 3 },
      untagged: 1,
      teens: 1,
      won: [4],
      gap: 2,
      verdict: '🏆 New record! +2 on 2025',
    })
    expect(f.board.map((t) => [t.name, t.count])).toEqual([['Witch', 3], ['Ghost', 1], ['Bluey', 1]])
  })

  test('the barcode has a bar for every minute from the first kid to the last', () => {
    const f = nightFacts(night)

    expect(f.perMinute).toHaveLength(156) // 6:05 to 8:40 inclusive
    expect(f.perMinute[0]).toBe(1)
    expect(f.perMinute[56]).toBe(3) // 7:01
    expect(f.perMinute.at(-1)).toBe(1)
  })

  test("with no ghost there is no verdict, and the number to beat is tonight's", () => {
    const f = nightFacts({ ...night, ghost: null })

    expect(f.verdict).toBeNull()
    expect(f.gap).toBeNull()
    expect(f.numberToBeat).toBe(6)
  })

  test('a night with no kids at all still adds up', () => {
    const f = nightFacts({ ...night, kids: [], recap: { tickets: [] } })

    expect(f).toMatchObject({ total: 0, span: '', peak: null, crew: null, top: null, won: [], perMinute: [] })
  })
})
