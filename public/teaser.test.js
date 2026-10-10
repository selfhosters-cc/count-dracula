import { describe, expect, test } from 'bun:test'
import { createTeaser, teaserLines } from './teaser.js'
import { fakeClock } from '../test/fake-clock.js'
import seed2025 from '../config/2025-counts.json'

const local = (hh, mm) => new Date(2026, 9, 31, hh, mm).getTime()
const on = { goldenTickets: true, milestones: true }
const state = ({ kids = 120, left = 3, ghost = true, switches = on, shift = 0 } = {}) => ({
  event: { clockShiftMs: shift },
  kids: Array.from({ length: kids }, (_, i) => ({ id: `k${i}` })),
  golden: switches.goldenTickets ? { left, nextIsGolden: false } : null,
  ghost: ghost ? { label: '2025', total: 346, buckets: seed2025.buckets } : null,
  settings: { switches },
})

describe('teaser lines', () => {
  test('rotate through hidden tickets, the ghost by now, and the next milestone', () => {
    // At 7:00pm the 2025 ghost had 193 kids.
    expect(teaserLines(state({ kids: 120 }), local(19, 0))).toEqual([
      '🎫 3 golden tickets still hidden — could be YOU!',
      '👻 Last year had 193 kids by now — help us catch up!',
      'Next milestone: kid #150!',
    ])
  })

  test("say we're ahead when we are, and use event time (Clock shift)", () => {
    expect(teaserLines(state({ kids: 207 }), local(16, 0), )[1]).toBe('👻 Last year had 0 kids by now — we\'re 207 ahead!')
    expect(teaserLines(state({ kids: 207, shift: 3 * 3_600_000 }), local(16, 0))[1]).toBe("👻 Last year had 193 kids by now — we're 14 ahead!")
  })

  test('leave out lines for switched-off features, no tickets left, or Race against None', () => {
    expect(teaserLines(state({ left: 0 }), local(19, 0))).toEqual(['👻 Last year had 193 kids by now — help us catch up!', 'Next milestone: kid #150!'])
    expect(teaserLines(state({ ghost: false, switches: {} }), local(19, 0))).toEqual([])
    expect(teaserLines(state({ left: 1 }), local(19, 0))[0]).toBe('🎫 1 golden ticket still hidden — could be YOU!')
  })
})

describe('teaser timing', () => {
  function setup(lines = ['one', 'two']) {
    const clock = fakeClock(0)
    const log = []
    const teaser = createTeaser({ clock, show: (line) => log.push([clock.now(), line]), hide: () => log.push([clock.now(), null]), lines: () => lines })
    return { clock, log, teaser }
  }

  test('after 45 s with no taps it shows a line, hides it, and repeats every ~45 s with the next line', async () => {
    const { clock, log, teaser } = setup()
    teaser.activity()

    await clock.advance(100_000)

    expect(log).toEqual([[45_000, 'one'], [53_000, null], [98_000, 'two']])
  })

  test('a tap hides it at once and starts the 45 s over', async () => {
    const { clock, log, teaser } = setup()
    teaser.activity()
    await clock.advance(46_000)

    teaser.activity()
    await clock.advance(44_000)

    expect(log).toEqual([[45_000, 'one'], [46_000, null]])
  })

  test("doesn't run while paused (ended, or the TV disconnected), and has nothing to say without lines", async () => {
    const paused = setup()
    paused.teaser.activity()
    paused.teaser.pause(true)
    await paused.clock.advance(200_000)
    expect(paused.log).toEqual([])

    const quiet = setup([])
    quiet.teaser.activity()
    await quiet.clock.advance(200_000)
    expect(quiet.log).toEqual([])
  })

  test('being told "not paused" again (on every live update) changes nothing: a line still hides on time', async () => {
    const { clock, log, teaser } = setup()
    teaser.activity()
    await clock.advance(46_000)

    teaser.pause(false)
    await clock.advance(10_000)

    expect(log).toEqual([[45_000, 'one'], [53_000, null]])
  })
})
