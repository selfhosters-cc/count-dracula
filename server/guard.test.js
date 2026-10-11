import { describe, expect, test } from 'bun:test'
import { LIMITS, createGuard } from './guard.js'

const SECOND = 1_000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

function guardAt() {
  const clock = { now: 0 }
  const lines = []
  const guard = createGuard({ now: () => clock.now, log: (line) => lines.push(line) })
  return { clock, lines, guard }
}

// How many in a row a rule lets through before it refuses.
function burst(guard, rule, key) {
  let n = 0
  while (guard.take(rule, key) && n < 10_000) n++
  return n
}

describe('rate limits', () => {
  test.each([
    ['householdsPerIp', 3, DAY],
    ['householdsSite', 60, HOUR],
    ['signIn', 30, HOUR],
    ['pairCode', 30, HOUR],
    ['redeem', 10, 10 * MINUTE],
    ['invite', 20, DAY],
    ['report', 5, DAY],
  ])('%s: %i per window, refused after that, and back after the window', (rule, count, window) => {
    const { clock, guard } = guardAt()

    expect(burst(guard, rule, 'k')).toBe(count)
    clock.now += window / 2
    expect(burst(guard, rule, 'k')).toBe(Math.floor(count / 2))
    clock.now += window
    expect(burst(guard, rule, 'k')).toBe(count)
  })

  test('each key has its own bucket', () => {
    const { guard } = guardAt()

    expect(burst(guard, 'householdsPerIp', '203.0.113.1')).toBe(3)
    expect(guard.take('householdsPerIp', '203.0.113.2')).toBe(true)
  })

  test('taps: bursts up to 30, then 10 a second per Household', () => {
    const { clock, guard } = guardAt()

    expect(burst(guard, 'taps', 7)).toBe(30)
    clock.now += SECOND
    expect(burst(guard, 'taps', 7)).toBe(10)
    clock.now += 3 * SECOND
    expect(burst(guard, 'taps', 7)).toBe(30)
    expect(burst(guard, 'taps', 8)).toBe(30)
  })

  test('the numbers are the spec\'s, in one place', () => {
    expect(LIMITS).toMatchObject({
      householdViewers: 200,
      streamsPerIp: 20,
      siteStreams: 3_000,
      siteCeiling: 3_500,
      householdsPerIp: { count: 3, perMs: DAY },
      householdsSite: { count: 60, perMs: HOUR },
      signIn: { count: 30, perMs: HOUR },
      pairCode: { count: 30, perMs: HOUR },
      redeem: { count: 10, perMs: 10 * MINUTE },
      invite: { count: 20, perMs: DAY },
      taps: { count: 30, perMs: 3 * SECOND },
      report: { count: 5, perMs: DAY },
    })
  })
})

describe('stream caps', () => {
  const quiet = { total: 0, fromIp: 0, household: { phone: 0, paired: 0, tvLink: 0 } }

  test("a Household's 201st TV-link viewer is refused; its phones and paired TV are not", () => {
    const { guard } = guardAt()
    const full = { ...quiet, total: 250, household: { phone: 4, paired: 1, tvLink: 200 } }

    expect(guard.admitStream({ kind: 'tvLink', ...full })).toBe('tvFull')
    expect(guard.admitStream({ kind: 'tvLink', ...full, household: { ...full.household, tvLink: 199 } })).toBeNull()
    expect(guard.admitStream({ kind: 'phone', ...full })).toBeNull()
    expect(guard.admitStream({ kind: 'paired', ...full })).toBeNull()
  })

  test('past 3,000 site-wide only phones and paired TVs get in; past 3,500 nothing does', () => {
    const { guard } = guardAt()

    expect(guard.admitStream({ kind: 'tvLink', ...quiet, total: 2_999 })).toBeNull()
    expect(guard.admitStream({ kind: 'tvLink', ...quiet, total: 3_000 })).toBe('tvFull')
    expect(guard.admitStream({ kind: 'phone', ...quiet, total: 3_000 })).toBeNull()
    expect(guard.admitStream({ kind: 'paired', ...quiet, total: 3_499 })).toBeNull()
    expect(guard.admitStream({ kind: 'phone', ...quiet, total: 3_500 })).toBe('siteFull')
  })

  test('the 21st open stream from one IP is refused', () => {
    const { guard } = guardAt()

    expect(guard.admitStream({ kind: 'phone', ...quiet, fromIp: 19 })).toBeNull()
    expect(guard.admitStream({ kind: 'phone', ...quiet, fromIp: 20 })).toBe('ipFull')
  })
})

describe('refusals', () => {
  test('each is counted for /operator and logged once', () => {
    const { clock, lines, guard } = guardAt()
    clock.now = 5_000

    guard.take('pairCode', '198.51.100.7')
    for (let i = 0; i < 31; i++) guard.take('signIn', '198.51.100.7')
    guard.admitStream({ kind: 'tvLink', total: 3_000, fromIp: 0, household: { phone: 0, paired: 0, tvLink: 0 } })

    expect(guard.refusals()).toEqual({ total: 2, lastAt: 5_000, byReason: { signIn: 1, tvFull: 1 } })
    expect(lines).toEqual(['refused reason=signIn key=198.51.100.7', 'refused reason=tvFull'])
  })
})
