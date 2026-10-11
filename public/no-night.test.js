import { describe, expect, test } from 'bun:test'
import { noNightLines } from './no-night.js'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const now = Date.parse('2026-10-12T15:00:00Z')
const next = (inMs) => ({ id: 2, name: 'Halloween 2026', goesLiveAt: inMs == null ? null : now + inMs })

describe('"No night on right now"', () => {
  test('names the next Upcoming Event and counts down to its Goes live at', () => {
    expect(noNightLines(next(19 * 24 * HOUR + 5 * HOUR), now)).toEqual({ next: 'Next up: Halloween 2026', countdown: 'Goes live in 19 days' })
    expect(noNightLines(next(5 * HOUR + 12 * MINUTE + 30_000), now).countdown).toBe('Goes live in 5 h 12 min')
    expect(noNightLines(next(26 * HOUR), now).countdown).toBe('Goes live in 26 h 0 min')
    expect(noNightLines(next(12 * MINUTE + 4_000), now).countdown).toBe('Goes live in 12:04')
  })

  test('at or past its time (waiting at the cap, or the tick about to run) it says so', () => {
    expect(noNightLines(next(0), now).countdown).toBe('Going live any minute')
    expect(noNightLines(next(-5 * MINUTE), now).countdown).toBe('Going live any minute')
  })

  test('with no Goes live at, just the name; with no Upcoming Event, nothing', () => {
    expect(noNightLines(next(null), now)).toEqual({ next: 'Next up: Halloween 2026', countdown: null })
    expect(noNightLines(null, now)).toEqual({ next: null, countdown: null })
  })
})
