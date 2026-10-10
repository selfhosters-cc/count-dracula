import { describe, expect, test } from 'bun:test'
import { doorView } from './door-view.js'

function state(kidIds, tags = []) {
  return { tags, kids: kidIds.map((id, i) => ({ id, number: i + 1, tagId: null, tappedAt: i })) }
}

function outbox(ids) {
  return { pending: ids.map((id) => ({ id, tagId: null, tappedAt: 0, phoneName: 'Dad' })), unconfirmed: [], mine: new Set(ids) }
}

describe('door view total', () => {
  test('is the server count when nothing is queued', () => {
    expect(doorView(state(['a', 'b']), outbox([])).total).toBe(2)
  })

  test('adds taps still waiting in the outbox', () => {
    expect(doorView(state(['a', 'b']), outbox(['q1', 'q2'])).total).toBe(4)
  })

  test("counts a queued tap once when the server's copy arrives before the ack", () => {
    expect(doorView(state(['a', 'q1']), outbox(['q1', 'q2'])).total).toBe(3)
  })

  test('is unknown until the first snapshot arrives', () => {
    expect(doorView(null, outbox(['q1'])).total).toBeNull()
  })
})

describe('door view total across a reconnect', () => {
  test('counts taps the server acknowledged that the live state has not shown yet', () => {
    const box = { pending: [{ id: 'q3' }], unconfirmed: [{ id: 'q1' }, { id: 'q2' }], mine: new Set() }

    expect(doorView(state(['a', 'q1']), box).total).toBe(4)
  })
})

const WITCH = { id: 1, name: 'Witch', emoji: '🧙', order: 1 }
const BLUEY = { id: 2, name: 'Bluey', emoji: '🐶', order: 2 }

function kid(id, number, tagId, tappedAt = number) {
  return { id, number, tagId, tappedAt }
}

describe('door view costume counts', () => {
  test("count each costume and the untagged kids, in the costumes' order and colours", () => {
    const live = {
      tags: [BLUEY, WITCH],
      kids: [kid('a', 1, 1), kid('b', 2, null), kid('c', 3, 1), kid('d', 4, 2)],
    }

    const view = doorView(live, { pending: [], unconfirmed: [], mine: new Set() })

    expect(view.untagged).toBe(1)
    expect(view.tags).toEqual([
      { id: 1, name: 'Witch', emoji: '🧙', colour: '#3987e5', count: 2 },
      { id: 2, name: 'Bluey', emoji: '🐶', colour: '#199e70', count: 1 },
    ])
  })

  test("include this phone's queued and unconfirmed taps, each once", () => {
    const live = { tags: [WITCH], kids: [kid('a', 1, 1), kid('q1', 2, 1)] }
    const box = {
      pending: [{ id: 'q2', tagId: null }, { id: 'q3', tagId: 1 }],
      unconfirmed: [{ id: 'q1', tagId: 1 }, { id: 'q4', tagId: 1 }],
      mine: new Set(),
    }

    const view = doorView(live, box)

    expect(view.total).toBe(5)
    expect(view.untagged).toBe(1)
    expect(view.tags[0].count).toBe(4)
  })

  test('count a queued tap for a costume that no longer exists as untagged', () => {
    const view = doorView({ tags: [], kids: [] }, { pending: [{ id: 'q', tagId: 9 }], unconfirmed: [], mine: new Set() })

    expect(view.untagged).toBe(1)
  })
})

describe('catch-up preview', () => {
  // Arrival order a..e; c arrived late with the earliest tap time; b is a Witch.
  const live = {
    tags: [WITCH],
    kids: [kid('a', 1, null, 100), kid('b', 2, 1, 200), kid('c', 3, null, 50), kid('d', 4, null, 300), kid('e', 5, null, 400)],
  }
  const empty = { pending: [], unconfirmed: [], mine: new Set() }

  test('caps the stepper at the untagged kids the server has', () => {
    expect(doorView(live, empty).catchUp.max).toBe(4)
  })

  test('previews the numbers of the N most recently tapped untagged kids, lowest first', () => {
    const { catchUp } = doorView(live, empty)

    expect(catchUp.preview(0)).toEqual([])
    expect(catchUp.preview(2)).toEqual([4, 5])
    expect(catchUp.preview(3)).toEqual([1, 4, 5])
    expect(catchUp.preview(9)).toEqual([1, 3, 4, 5])
  })
})

describe('door view with removals', () => {
  test("drops kids whose removal is queued or not yet reflected, from the total and their costume", () => {
    const live = { tags: [WITCH], kids: [kid('a', 1, 1), kid('b', 2, 1), kid('c', 3, null)] }
    const box = {
      pending: [{ type: 'remove', id: 'r1', kidId: 'a', queuedAt: 0 }],
      unconfirmed: [{ type: 'remove', id: 'r2', kidId: 'c', queuedAt: 0 }],
      mine: new Set(),
    }

    const view = doorView(live, box)

    expect(view.total).toBe(1)
    expect(view.tags[0].count).toBe(1)
    expect(view.untagged).toBe(0)
  })
})

describe('recent', () => {
  function kidBy(id, number, tagId, phoneName, tappedAt) {
    return { id, number, tagId, phoneName, tappedAt }
  }

  test("lists all phones' kids newest-arrived first, unsent taps on top marked queued", () => {
    const live = {
      tags: [WITCH],
      kids: [
        kidBy('a', 1, 1, 'Mom', 100),
        kidBy('b', 2, null, 'Dad', 200),
        kidBy('c', 3, null, 'Grandma', 50), // late: arrived last, tapped first
      ],
    }
    const box = {
      pending: [{ id: 'q', tagId: 1, tappedAt: 300, phoneName: 'Dad' }],
      unconfirmed: [],
      mine: new Set(['b', 'q']),
    }

    expect(doorView(live, box).recent).toEqual([
      { id: 'q', number: null, tag: { emoji: '🧙', name: 'Witch' }, phoneName: 'Dad', tappedAt: 300, teen: false, queued: true, mine: true },
      { id: 'c', number: 3, tag: null, phoneName: 'Grandma', tappedAt: 50, teen: false, queued: false, mine: false },
      { id: 'b', number: 2, tag: null, phoneName: 'Dad', tappedAt: 200, teen: false, queued: false, mine: true },
      { id: 'a', number: 1, tag: { emoji: '🧙', name: 'Witch' }, phoneName: 'Mom', tappedAt: 100, teen: false, queued: false, mine: false },
    ])
  })

  test('shows only the last 10, and leaves out removed kids', () => {
    const live = { tags: [], kids: Array.from({ length: 12 }, (_, i) => kidBy(`k${i + 1}`, i + 1, null, 'Mom', i)) }
    const box = { pending: [{ type: 'remove', id: 'r', kidId: 'k12', queuedAt: 0 }], unconfirmed: [], mine: new Set() }

    expect(doorView(live, box).recent.map((r) => r.number)).toEqual([11, 10, 9, 8, 7, 6, 5, 4, 3, 2])
  })
})

describe('recent teens', () => {
  test("marks teens, the server's and this phone's unsent ones", () => {
    const live = { tags: [], kids: [{ id: 'a', number: 1, tagId: null, phoneName: 'Mom', tappedAt: 1, teen: true }, { id: 'b', number: 2, tagId: null, phoneName: 'Mom', tappedAt: 2, teen: false }] }
    const box = { pending: [{ id: 'q', tagId: null, tappedAt: 3, phoneName: 'Dad', teen: true }], unconfirmed: [], mine: new Set(['q']) }

    expect(doorView(live, box).recent.map((r) => [r.id, r.teen])).toEqual([['q', true], ['b', false], ['a', true]])
  })
})

describe('undo target', () => {
  const live = {
    tags: [WITCH],
    kids: [
      { id: 'mine-1', number: 1, tagId: 1, phoneName: 'Dad', tappedAt: 100 },
      { id: 'mine-2', number: 2, tagId: null, phoneName: 'Dad', tappedAt: 200 },
      { id: 'theirs', number: 3, tagId: null, phoneName: 'Dad', tappedAt: 300 }, // another phone also called Dad
    ],
  }
  const mine = new Set(['mine-1', 'mine-2', 'queued'])

  test("is this phone's latest kid, skipping other phones' kids even with the same name", () => {
    const view = doorView(live, { pending: [], unconfirmed: [], mine })

    expect(view.undo).toMatchObject({ id: 'mine-2', number: 2, tag: null })
  })

  test('is an unsent tap when there is one', () => {
    const box = { pending: [{ id: 'queued', tagId: 1, tappedAt: 400, phoneName: 'Dad' }], unconfirmed: [], mine }

    expect(doorView(live, box).undo).toMatchObject({ id: 'queued', number: null, queued: true })
  })

  test('walks back once the latest has a removal queued, and is null when nothing of ours is left', () => {
    const remove = (kidId) => ({ type: 'remove', id: `r-${kidId}`, kidId, queuedAt: 0 })

    expect(doorView(live, { pending: [remove('mine-2')], unconfirmed: [], mine }).undo).toMatchObject({ id: 'mine-1' })
    expect(doorView(live, { pending: [remove('mine-2')], unconfirmed: [remove('mine-1')], mine }).undo).toBeNull()
  })
})

describe('golden banner', () => {
  const live = (golden) => ({ tags: [], kids: [{ id: 'a', number: 1, tagId: null }], golden })
  const empty = { pending: [], unconfirmed: [], mine: new Set() }
  const golden = { left: 3, nextIsGolden: true }

  test('shows on a connected phone with nothing in its outbox when the next kid is golden', () => {
    expect(doorView(live(golden), empty, { connected: true }).goldenBanner).toBe(true)
  })

  test.each([
    ['disconnected', live(golden), empty, { connected: false }],
    ['a tap still queued', live(golden), { ...empty, pending: [{ id: 'q', tagId: null }] }, { connected: true }],
    ['a tap acked but not yet seen', live(golden), { ...empty, unconfirmed: [{ id: 'u', tagId: null }] }, { connected: true }],
    ['the next kid is not golden', live({ left: 3, nextIsGolden: false }), empty, { connected: true }],
    ['golden tickets switched off', live(null), empty, { connected: true }],
  ])('hides when %s', (_, state, box, link) => {
    expect(doorView(state, box, link).goldenBanner).toBe(false)
  })
})
