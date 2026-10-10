import { describe, expect, test } from 'bun:test'
import { doorView } from './door-view.js'

function state(kidIds) {
  return { kids: kidIds.map((id, i) => ({ id, number: i + 1 })) }
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
