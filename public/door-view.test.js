import { describe, expect, test } from 'bun:test'
import { doorView } from './door-view.js'

function state(kidIds, tags = []) {
  return { tags, kids: kidIds.map((id, i) => ({ id, number: i + 1, tagId: null, tappedAt: i })) }
}

function outbox(ids) {
  return { pending: ids.map((id) => ({ id, tagId: null, tappedAt: 0, phoneName: 'Dad' })), unconfirmed: [] }
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
    const box = { pending: [{ id: 'q3' }], unconfirmed: [{ id: 'q1' }, { id: 'q2' }] }

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

    const view = doorView(live, { pending: [], unconfirmed: [] })

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
    }

    const view = doorView(live, box)

    expect(view.total).toBe(5)
    expect(view.untagged).toBe(1)
    expect(view.tags[0].count).toBe(4)
  })

  test('count a queued tap for a costume that no longer exists as untagged', () => {
    const view = doorView({ tags: [], kids: [] }, { pending: [{ id: 'q', tagId: 9 }], unconfirmed: [] })

    expect(view.untagged).toBe(1)
  })
})

describe('catch-up preview', () => {
  // Arrival order a..e; c arrived late with the earliest tap time; b is a Witch.
  const live = {
    tags: [WITCH],
    kids: [kid('a', 1, null, 100), kid('b', 2, 1, 200), kid('c', 3, null, 50), kid('d', 4, null, 300), kid('e', 5, null, 400)],
  }
  const empty = { pending: [], unconfirmed: [] }

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
