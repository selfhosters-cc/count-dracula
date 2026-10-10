import { describe, expect, test } from 'bun:test'
import { atEventTime, biggestCrew, costumeOfTheNight, eventNow, ghost, leaderboard, minuteOfDay, pace, peakHalfHour, releaseOpen, slots, tagColour, toBuckets, visits } from './night-maths.js'
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

describe('releaseOpen', () => {
  const local = (hh, mm) => new Date(2026, 9, 31, hh, mm).getTime()

  test('opens "Release remaining" from 7:45pm event time', () => {
    expect(releaseOpen(local(19, 44))).toBe(false)
    expect(releaseOpen(local(19, 45))).toBe(true)
    expect(releaseOpen(local(20, 30))).toBe(true)
  })

  test('goes by event time: a +3h rehearsal at 4:45pm real time is past the gate', () => {
    expect(releaseOpen(eventNow(local(16, 45), 3 * 3_600_000))).toBe(true)
    expect(releaseOpen(eventNow(local(16, 45), 0))).toBe(false)
  })
})

describe('slots', () => {
  test('gives the tally sheet and Add missed kids their 15-minute rows, 5:30 to 9:00', () => {
    const rows = slots('17:30', '21:00', 15)

    expect(rows).toHaveLength(14)
    expect(rows[0]).toEqual({ start: '17:30', end: '17:45' })
    expect(rows[4]).toEqual({ start: '18:30', end: '18:45' })
    expect(rows.at(-1)).toEqual({ start: '20:45', end: '21:00' })
  })
})

describe('atEventTime', () => {
  const HOUR = 3_600_000
  const local = (hh, mm) => new Date(2026, 9, 24, hh, mm).getTime()

  test("turns a row's event time into a real timestamp on tonight's date", () => {
    expect(atEventTime('18:30', local(19, 2), 0)).toBe(local(18, 30))
  })

  test('undoes the clock shift: with +3h at 3:10pm real, a 6:30pm row is 3:30pm real', () => {
    expect(atEventTime('18:30', local(15, 10), 3 * HOUR)).toBe(local(15, 30))
  })
})

describe('leaderboard', () => {
  const tags = ['Witch', 'Ghost', 'Bluey', 'Spidey', 'Elsa', 'Dino', 'Pirate'].map((name, i) => ({ id: i + 1, name, emoji: '🎃', order: i + 1 }))
  const kids = (counts) => Object.entries(counts).flatMap(([tagId, n]) => Array.from({ length: n }, () => ({ tagId: Number(tagId) })))

  test('ranks the top 5 costumes by count, in their tag colours; untagged kids are not a costume', () => {
    const board = leaderboard([...kids({ 1: 2, 2: 9, 3: 4, 4: 1, 5: 7, 6: 3, 7: 8 }), { tagId: null }, { tagId: null }], tags)

    expect(board.map((r) => [r.name, r.count])).toEqual([['Ghost', 9], ['Pirate', 8], ['Elsa', 7], ['Bluey', 4], ['Dino', 3]])
    expect(board.map((r) => r.colour)).toEqual(['#199e70', '#8a84a8', '#9085e9', '#c98500', '#e66767'])
  })

  test('breaks ties by the costumes\' order, and keeps costumes nobody wore yet', () => {
    const board = leaderboard(kids({ 3: 2, 2: 2 }), tags.slice(0, 4))

    expect(board.map((r) => [r.name, r.count])).toEqual([['Ghost', 2], ['Bluey', 2], ['Witch', 0], ['Spidey', 0]])
  })
})

describe('recap stats', () => {
  const HOUR = 3_600_000
  const local = (hh, mm, ss = 0) => new Date(2026, 9, 31, hh, mm, ss).getTime()
  const kidsAt = (...times) => times.map((tappedAt, i) => ({ id: `k${i}`, tappedAt, tagId: null }))

  test('peak half-hour: the busiest aligned half-hour in event time, earliest on a tie', () => {
    const kids = kidsAt(local(18, 5), local(18, 50), local(19, 1), local(19, 10), local(19, 29), local(19, 31), local(19, 45))

    expect(peakHalfHour(kids)).toEqual({ start: '19:00', end: '19:30', count: 3 })
    expect(peakHalfHour(kidsAt(local(18, 5), local(19, 5)))).toEqual({ start: '18:00', end: '18:30', count: 1 })
    expect(peakHalfHour(kids.map((k) => ({ ...k, tappedAt: k.tappedAt - 3 * HOUR })), 3 * HOUR)).toEqual({ start: '19:00', end: '19:30', count: 3 })
    expect(peakHalfHour([])).toBeNull()
  })

  test('visits: kids whose taps fall within the window of each other, chained', () => {
    const kids = kidsAt(local(19, 0, 0), local(19, 0, 10), local(19, 0, 22), local(19, 1, 0), local(19, 1, 5))

    expect(visits(kids, 15_000).map((v) => v.length)).toEqual([3, 2])
    expect(visits(kids, 5_000).map((v) => v.length)).toEqual([1, 1, 1, 2])
  })

  test('biggest crew: the largest visit and when it started; changing the window regroups it', () => {
    const kids = kidsAt(local(19, 0, 0), local(19, 0, 10), local(19, 0, 22), local(19, 12, 0), local(19, 12, 3), local(19, 12, 30), local(19, 12, 40))

    expect(biggestCrew(kids, 15_000)).toEqual({ size: 3, at: local(19, 0, 0) })
    expect(biggestCrew(kids, 30_000)).toEqual({ size: 4, at: local(19, 12, 0) })
  })

  test('costume of the night: the most-worn costume, or none', () => {
    const tags = [{ id: 1, name: 'Witch', emoji: '🧙', order: 1 }, { id: 2, name: 'Ghost', emoji: '👻', order: 2 }]

    expect(costumeOfTheNight([{ tagId: 2 }, { tagId: 2 }, { tagId: 1 }, { tagId: null }], tags)).toMatchObject({ name: 'Ghost', count: 2 })
    expect(costumeOfTheNight([{ tagId: null }], tags)).toBeNull()
  })
})
