import { describe, expect, test } from 'bun:test'
import { eventNow, ghost, minuteOfDay, pace, tagColour, toBuckets } from './night-maths.js'
import seed2025 from '../config/2025-counts.json'

describe('tagColour', () => {
  test('gives the first six costumes the six slots, in order', () => {
    expect([1, 2, 3, 4, 5, 6].map(tagColour)).toEqual(['#3987e5', '#199e70', '#c98500', '#d55181', '#9085e9', '#e66767'])
  })

  test('folds the 7th costume and later to grey', () => {
    expect(tagColour(7)).toBe('#8a84a8')
    expect(tagColour(12)).toBe('#8a84a8')
  })

  test('colours untagged kids orange', () => {
    expect(tagColour(null)).toBe('#ff7a1a')
  })
})

const at = (hh, mm = 0) => hh * 60 + mm // minutes into the day

describe('ghost', () => {
  const last2025 = ghost(seed2025.buckets)

  test('matches the 2025 buckets at their boundaries (cumulative counts are at each bucket\'s end)', () => {
    expect(last2025(at(18))).toBe(14)
    expect(last2025(at(18, 30))).toBe(86)
    expect(last2025(at(19))).toBe(193)
    expect(last2025(at(19, 30))).toBe(312)
    expect(last2025(at(20))).toBe(346)
  })

  test('interpolates linearly within a bucket', () => {
    expect(last2025(at(17, 51))).toBe(7) // halfway through 17:42–18:00 (14 kids)
    expect(last2025(at(18, 15))).toBe(14 + 36)
  })

  test('is 0 before the first bucket and flat at the total after the last', () => {
    expect(last2025(at(17, 30))).toBe(0)
    expect(last2025(at(20, 30))).toBe(346)
    expect(last2025(at(23, 59))).toBe(346)
  })

  test('stays flat across a gap between buckets', () => {
    const gappy = ghost([
      { start: '18:00', end: '18:30', count: 10 },
      { start: '19:00', end: '19:30', count: 20 },
    ])
    expect(gappy(at(18, 45))).toBe(10)
    expect(gappy(at(19, 15))).toBe(20)
  })
})

describe('clock shift', () => {
  const HOUR = 3_600_000
  const threePm = new Date(2026, 9, 24, 15, 0).getTime() // local time, like the TV's

  test('moves "now" by the event\'s shift: +3h at 3pm reads as 6pm', () => {
    expect(minuteOfDay(eventNow(threePm, 3 * HOUR))).toBe(at(18))
    expect(minuteOfDay(eventNow(threePm, 0))).toBe(at(15))
  })

  test('keeps seconds as a fraction of a minute', () => {
    expect(minuteOfDay(threePm + 90_000)).toBe(at(15, 1.5))
  })
})

describe('toBuckets', () => {
  const HOUR = 3_600_000
  const local = (hh, mm, ss = 0) => new Date(2026, 9, 31, hh, mm, ss).getTime()
  const taps = [local(18, 31), local(17, 42, 10), local(17, 50), local(18, 5), local(18, 29, 59), local(19, 10)]

  test('groups taps into half-hour buckets, the first starting at the first tap\'s minute', () => {
    expect(toBuckets(taps)).toEqual([
      { start: '17:42', end: '18:00', count: 2 },
      { start: '18:00', end: '18:30', count: 2 },
      { start: '18:30', end: '19:00', count: 1 },
      { start: '19:00', end: '19:30', count: 1 },
    ])
  })

  test("buckets in the event's own time: a +3h rehearsal tapped at 2:42pm lands at 17:42", () => {
    expect(toBuckets(taps.map((t) => t - 3 * HOUR), 3 * HOUR)).toEqual(toBuckets(taps))
  })

  test('skips empty half-hours, and gives a ghost that ends at the event\'s total', () => {
    const sparse = [local(18, 10), local(19, 40)]
    expect(toBuckets(sparse)).toEqual([
      { start: '18:10', end: '18:30', count: 1 },
      { start: '19:30', end: '20:00', count: 1 },
    ])
    expect(ghost(toBuckets(taps))(at(21))).toBe(6)
    expect(toBuckets([])).toEqual([])
  })
})

describe('pace against the ghost', () => {
  test('ahead, behind or level by the rounded gap', () => {
    expect(pace(90, 86, 346)).toEqual({ kind: 'ahead', by: 4 })
    expect(pace(80, 86.4, 346)).toEqual({ kind: 'behind', by: 6 })
    expect(pace(86, 86.3, 346)).toEqual({ kind: 'level', by: 0 })
  })

  test("is a new record once tonight passes the ghost's total, not when it ties", () => {
    expect(pace(346, 346, 346)).toEqual({ kind: 'level', by: 0 })
    expect(pace(347, 346, 346)).toEqual({ kind: 'record', by: 1 })
  })
})
