import { describe, expect, test } from 'bun:test'
import { atEventTime, tickNoteText, biggestCrew, clockTime, raceWindow, rush, costumeOfTheNight, eventNow, ghost, leaderboard, minuteOfDay, pace, peakHalfHour, releaseOpen, slots, tagColour, toBuckets, visits } from './night-maths.js'
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

// Every time of night is read in the Household's zone, never the machine's: these tests use Vancouver
// (PDT, UTC-7, until Nov 1 2026 2am), so they fail on a machine that reads them in its own zone.
const ZONE = 'America/Vancouver'
const p2 = (n) => String(n).padStart(2, '0')
const pdt = (date) => (hh, mm, ss = 0) => Date.parse(`${date}T${p2(hh)}:${p2(mm)}:${p2(ss)}-07:00`)

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
  const threePm = pdt('2026-10-24')(15, 0)

  test('moves "now" by the event\'s shift: +3h at 3pm reads as 6pm', () => {
    expect(minuteOfDay(eventNow(threePm, 3 * HOUR), ZONE)).toBe(at(18))
    expect(minuteOfDay(eventNow(threePm, 0), ZONE)).toBe(at(15))
  })

  test('keeps seconds as a fraction of a minute', () => {
    expect(minuteOfDay(threePm + 90_000, ZONE)).toBe(at(15, 1.5))
  })
})

describe('toBuckets', () => {
  const HOUR = 3_600_000
  const local = pdt('2026-10-31')
  const taps = [local(18, 31), local(17, 42, 10), local(17, 50), local(18, 5), local(18, 29, 59), local(19, 10)]

  test('groups taps into half-hour buckets, the first starting at the first tap\'s minute', () => {
    expect(toBuckets(taps, 0, ZONE)).toEqual([
      { start: '17:42', end: '18:00', count: 2 },
      { start: '18:00', end: '18:30', count: 2 },
      { start: '18:30', end: '19:00', count: 1 },
      { start: '19:00', end: '19:30', count: 1 },
    ])
  })

  test("buckets in the event's own time: a +3h rehearsal tapped at 2:42pm lands at 17:42", () => {
    expect(toBuckets(taps.map((t) => t - 3 * HOUR), 3 * HOUR, ZONE)).toEqual(toBuckets(taps, 0, ZONE))
  })

  test('skips empty half-hours, and gives a ghost that ends at the event\'s total', () => {
    const sparse = [local(18, 10), local(19, 40)]
    expect(toBuckets(sparse, 0, ZONE)).toEqual([
      { start: '18:10', end: '18:30', count: 1 },
      { start: '19:30', end: '20:00', count: 1 },
    ])
    expect(ghost(toBuckets(taps, 0, ZONE))(at(21))).toBe(6)
    expect(toBuckets([], 0, ZONE)).toEqual([])
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
  const local = pdt('2026-10-31')

  test('opens "Release remaining" from 7:45pm event time', () => {
    expect(releaseOpen(local(19, 44), ZONE)).toBe(false)
    expect(releaseOpen(local(19, 45), ZONE)).toBe(true)
    expect(releaseOpen(local(20, 30), ZONE)).toBe(true)
  })

  test('goes by event time: a +3h rehearsal at 4:45pm real time is past the gate', () => {
    expect(releaseOpen(eventNow(local(16, 45), 3 * 3_600_000), ZONE)).toBe(true)
    expect(releaseOpen(eventNow(local(16, 45), 0), ZONE)).toBe(false)
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
  const local = pdt('2026-10-24')

  test("turns a row's event time into a real timestamp on tonight's date", () => {
    expect(atEventTime('18:30', local(19, 2), 0, ZONE)).toBe(local(18, 30))
  })

  test('undoes the clock shift: with +3h at 3:10pm real, a 6:30pm row is 3:30pm real', () => {
    expect(atEventTime('18:30', local(15, 10), 3 * HOUR, ZONE)).toBe(local(15, 30))
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
  const local = pdt('2026-10-31')
  const kidsAt = (...times) => times.map((tappedAt, i) => ({ id: `k${i}`, tappedAt, tagId: null }))

  test('peak half-hour: the busiest aligned half-hour in event time, earliest on a tie', () => {
    const kids = kidsAt(local(18, 5), local(18, 50), local(19, 1), local(19, 10), local(19, 29), local(19, 31), local(19, 45))

    expect(peakHalfHour(kids, 0, ZONE)).toEqual({ start: '19:00', end: '19:30', count: 3 })
    expect(peakHalfHour(kidsAt(local(18, 5), local(19, 5)), 0, ZONE)).toEqual({ start: '18:00', end: '18:30', count: 1 })
    expect(peakHalfHour(kids.map((k) => ({ ...k, tappedAt: k.tappedAt - 3 * HOUR })), 3 * HOUR, ZONE)).toEqual({ start: '19:00', end: '19:30', count: 3 })
    expect(peakHalfHour([], 0, ZONE)).toBeNull()
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

describe('rush meter', () => {
  const NOW = 1_800_000_000_000
  const MIN = 60_000
  const kidsAt = (...minutesAgo) => minutesAgo.map((m, i) => ({ id: `k${i}`, tappedAt: NOW - m * MIN }))

  test('kids per minute over the last 5 minutes, by tap time', () => {
    expect(rush(kidsAt(0.5, 1, 2, 4.9, 5.1, 30), NOW)).toEqual({ perMinute: 0.8, level: 'quiet' })
  })

  test('levels: quiet under 1/min, busy from 1/min, RUSH from 3/min', () => {
    const n = (count) => kidsAt(...Array.from({ length: count }, (_, i) => (i * 4.9) / Math.max(1, count - 1)))
    expect(rush(n(4), NOW).level).toBe('quiet') // 0.8/min
    expect(rush(n(5), NOW)).toEqual({ perMinute: 1, level: 'busy' })
    expect(rush(n(14), NOW).level).toBe('busy') // 2.8/min
    expect(rush(n(15), NOW)).toEqual({ perMinute: 3, level: 'rush' })
    expect(rush([], NOW)).toEqual({ perMinute: 0, level: 'quiet' })
  })
})

describe('race chart window', () => {
  const at = (hh, mm = 0) => hh * 60 + mm

  test('is 5:30–8:30pm event time on the night', () => {
    expect(raceWindow([at(17, 45), at(19, 10)], at(19, 30))).toEqual({ min: at(17, 30), max: at(20, 30) })
  })

  test('stretches back to the earliest tap and to "now", so an afternoon test still shows its line', () => {
    expect(raceWindow([at(15, 6), at(15, 13)], at(15, 15))).toEqual({ min: at(15), max: at(20, 30) })
    expect(raceWindow([], at(14, 10))).toEqual({ min: at(14), max: at(20, 30) })
  })

  test('stretches forward past 8:30pm when kids keep coming', () => {
    expect(raceWindow([at(18)], at(20, 41))).toEqual({ min: at(17, 30), max: at(21) })
  })
})

describe('time zones', () => {
  // Nov 1 2026, 2am: Toronto falls back from EDT (UTC-4) to EST (UTC-5), so 1:00–2:00 happens twice.
  const toronto = 'America/Toronto'
  const utc = (iso) => Date.parse(`${iso}Z`)

  test('a night that runs past the DST change buckets by the wall clock', () => {
    const taps = [utc('2026-11-01T04:50:00'), utc('2026-11-01T05:40:00'), utc('2026-11-01T06:10:00'), utc('2026-11-01T07:20:00')]
    // 0:50 EDT, 1:40 EDT, 1:10 EST (the second 1 o'clock), 2:20 EST

    expect(toBuckets(taps, 0, toronto)).toEqual([
      { start: '00:50', end: '01:00', count: 1 },
      { start: '01:00', end: '01:30', count: 1 },
      { start: '01:30', end: '02:00', count: 1 },
      { start: '02:00', end: '02:30', count: 1 },
    ])
    expect(minuteOfDay(utc('2026-11-01T06:10:00'), toronto)).toBe(at(1, 10))
    expect(minuteOfDay(utc('2026-11-01T07:20:00'), toronto)).toBe(at(2, 20))
  })

  test('the same instant reads differently in each Household', () => {
    const instant = utc('2026-10-31T23:15:00')

    expect(minuteOfDay(instant, 'America/Toronto')).toBe(at(19, 15))
    expect(minuteOfDay(instant, 'America/Vancouver')).toBe(at(16, 15))
    expect(minuteOfDay(instant, 'Europe/London')).toBe(at(23, 15))
    expect(releaseOpen(instant + 30 * 60_000, 'America/Toronto')).toBe(true) // 7:45pm there
    expect(releaseOpen(instant + 30 * 60_000, 'America/Vancouver')).toBe(false)
  })

  test("a backfill row is tonight's wall time in the Household's zone, on either side of the change", () => {
    expect(atEventTime('18:30', utc('2026-10-31T23:15:00'), 0, toronto)).toBe(utc('2026-10-31T22:30:00'))
    expect(atEventTime('02:30', utc('2026-11-01T08:00:00'), 0, toronto)).toBe(utc('2026-11-01T07:30:00'))
  })

  test('clock text is in the zone', () => {
    expect(clockTime(utc('2026-10-31T23:15:00'), toronto)).toMatch(/^7:15\sPM$/)
    expect(clockTime(utc('2026-10-31T23:15:00'), 'America/Vancouver')).toMatch(/^4:15\sPM$/)
  })
})

describe('tickNoteText: what the tick did, in the Household’s zone (spec v2.1 §5)', () => {
  const utc = (iso) => Date.parse(`${iso}Z`)
  const toronto = 'America/Toronto'

  test('the auto-end', () => {
    expect(tickNoteText({ kind: 'autoEnded', at: utc('2026-11-01T08:00:00') }, toronto)).toBe('Ended automatically at 3:00 am. Late kids still count until noon.')
  })

  test('closed to make room', () => {
    expect(tickNoteText({ kind: 'closedForRoom', at: utc('2026-10-31T20:00:00'), for: 'Halloween 2026' }, toronto)).toBe('Closed at 4:00 pm so Halloween 2026 could go live')
  })

  test('waiting at the cap', () => {
    expect(tickNoteText({ kind: 'waiting', at: utc('2026-10-31T16:05:00') }, toronto)).toBe("Couldn't go live at 12:05 pm: 3 nights are open. It'll go live as soon as you end or close one.")
  })

  test('none', () => {
    expect(tickNoteText(null, toronto)).toBe('')
  })
})
