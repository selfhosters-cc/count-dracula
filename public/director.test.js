import { describe, expect, test } from 'bun:test'
import { createDirector } from './director.js'
import { fakeClock } from '../test/fake-clock.js'

// Records every show the director asks the TV to play, with the time it asked.
function setup() {
  const clock = fakeClock(0)
  const played = []
  const director = createDirector({ clock, play: (show) => played.push({ at: clock.now(), show }) })
  return { clock, played, director }
}

function kid(number, extra = {}) {
  return { id: `k${number}`, number, late: false, ...extra }
}

describe('kid pop', () => {
  test('a live kid gets "YOU\'RE KID #N!", cleared after about 1.5 s', async () => {
    const { director, played, clock } = setup()

    director.push([], kid(58))
    await clock.advance(5_000)

    expect(played).toEqual([
      { at: 0, show: { kind: 'pop', from: 58, to: 58 } },
      { at: 1_500, show: null },
    ])
  })

  test('a burst of 5 in under 3 s is one merged pop, capped at 3 s', async () => {
    const { director, played, clock } = setup()

    for (const [n, gap] of [[1, 0], [2, 600], [3, 600], [4, 600], [5, 600]]) {
      await clock.advance(gap)
      director.push([], kid(n))
    }
    await clock.advance(5_000)

    expect(played).toEqual([
      { at: 0, show: { kind: 'pop', from: 1, to: 1 } },
      { at: 600, show: { kind: 'pop', from: 1, to: 2 } },
      { at: 1_200, show: { kind: 'pop', from: 1, to: 3 } },
      { at: 1_800, show: { kind: 'pop', from: 1, to: 4 } },
      { at: 2_400, show: { kind: 'pop', from: 1, to: 5 } },
      { at: 3_000, show: null },
    ])
  })

  test('kids after the cap start a fresh pop, which merges in turn', async () => {
    const { director, played, clock } = setup()

    for (const [n, gap] of [[1, 0], [2, 700], [3, 700], [4, 700], [5, 700], [6, 400], [7, 400]]) {
      await clock.advance(gap)
      director.push([], kid(n))
    }
    await clock.advance(5_000)

    expect(played.map(({ at, show }) => [at, show && `${show.from}-${show.to}`])).toEqual([
      [0, '1-1'],
      [700, '1-2'],
      [1_400, '1-3'],
      [2_100, '1-4'],
      [2_800, '1-5'],
      [3_000, null],
      [3_200, '6-6'],
      [3_600, '6-7'],
      [4_700, null],
    ])
  })
})

describe('late kids', () => {
  test('never pop, and never join a pop that is showing', async () => {
    const { director, played, clock } = setup()

    director.push([], kid(10, { late: true }))
    director.push([], kid(11))
    await clock.advance(500)
    director.push([], kid(12, { late: true }))
    await clock.advance(5_000)

    expect(played).toEqual([
      { at: 0, show: { kind: 'pop', from: 11, to: 11 } },
      { at: 1_500, show: null },
    ])
  })
})

describe('celebration queue', () => {
  const summary = (played) =>
    played.map(({ at, show }) => [at, show && [show.kind, show.moment ?? null, show.kind === 'pop' ? `${show.from}-${show.to}` : show.number]])

  test('a milestone waits for the pop that is showing instead of stomping on it, and never merges into it', async () => {
    const { director, played, clock } = setup()

    director.push([], kid(49))
    await clock.advance(500)
    director.push(['milestone:50'], kid(50))
    await clock.advance(10_000)

    expect(summary(played)).toEqual([
      [0, ['pop', null, '49-49']],
      [1_500, null],
      [1_850, ['milestone', null, 50]],
      [4_850, null],
    ])
  })

  test('waiting shows play highest priority first: golden > beat last year > every 100th > every 50th > pop', async () => {
    const { director, played, clock } = setup()

    director.push(['golden', 'milestone:100'], kid(100)) // one kid, one show: the highest moment
    await clock.advance(1_000)
    director.push([], kid(101))
    director.push(['milestone:150'], kid(150))
    director.push(['milestone:200'], kid(200))
    director.push(['beat-last-year']) // deferred: no kid number
    await clock.advance(30_000)

    expect(summary(played)).toEqual([
      [0, ['takeover', 'golden', 100]],
      [6_000, null],
      [6_350, ['takeover', 'beat-last-year', null]],
      [11_850, null],
      [12_200, ['takeover', 'milestone', 200]],
      [17_700, null],
      [18_050, ['milestone', null, 150]],
      [21_050, null],
      [21_400, ['pop', null, '101-101']],
      [22_900, null],
    ])
  })
})
