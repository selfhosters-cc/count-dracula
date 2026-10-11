// What a screen does with each delta on its Household's one stream (spec v2.1 §15): apply its own Event's,
// skip another Event's while still counting its seq, and reopen when the door's Event moves or a seq is missed.
import { describe, expect, test } from 'bun:test'
import { receive } from './live.js'

const board = (extra = {}) => ({ event: { id: 7, name: 'Halloween 2026', state: 'live' }, tags: [], kids: [], settings: { mix: null }, seq: 10, ...extra })
const kid = (id) => ({ id, number: 1, tagId: null })

describe('receive', () => {
  test("applies its own Event's delta", () => {
    const { action, state } = receive(board(), { type: 'kid.added', eventId: 7, kid: kid('a'), seq: 11 })

    expect(action).toBe('apply')
    expect(state.kids.map((k) => k.id)).toEqual(['a'])
    expect(state.seq).toBe(11)
  })

  test("skips another Event's delta, but counts its seq so the next one isn't a gap", () => {
    const skipped = receive(board(), { type: 'kid.added', eventId: 3, kid: kid('x'), seq: 11 })
    expect(skipped.action).toBe('skip')
    expect(skipped.state.kids).toEqual([])
    expect(skipped.state.seq).toBe(11)

    expect(receive(skipped.state, { type: 'kid.added', eventId: 7, kid: kid('a'), seq: 12 }).action).toBe('apply')
  })

  test("another Event's settings change or soundboard press is skipped, not a reopen", () => {
    expect(receive(board(), { type: 'event.updated', eventId: 3, seq: 11 }).action).toBe('skip')
    expect(receive(board(), { type: 'soundboard', eventId: 3, slot: 1, seq: 11 }).action).toBe('skip')
  })

  test("its own Event's settings change, the door moving, or a missed seq reopens", () => {
    expect(receive(board(), { type: 'event.updated', eventId: 7, seq: 11 }).action).toBe('reopen')
    expect(receive(board(), { type: 'door.changed', eventId: null, door: 3, seq: 11 }).action).toBe('reopen')
    expect(receive(board(), { type: 'kid.added', eventId: 7, kid: kid('a'), seq: 13 }).action).toBe('reopen')
  })

  test('a Household-wide delta applies whatever the board', () => {
    const { action, state } = receive(board(), { type: 'mix.changed', eventId: null, mix: { volume: 0.5, mutes: {} }, seq: 11 })

    expect(action).toBe('apply')
    expect(state.settings.mix.volume).toBe(0.5)
  })

  test('with nothing open, every Event\'s delta is skipped and next.changed updates the next night', () => {
    const idle = board({ event: null, next: { id: 9, name: 'Halloween 2026', goesLiveAt: 1 } })

    expect(receive(idle, { type: 'kid.added', eventId: 3, kid: kid('x'), seq: 11 }).action).toBe('skip')
    const { action, state } = receive(idle, { type: 'next.changed', eventId: null, next: { id: 9, name: 'Halloween', goesLiveAt: 2 }, seq: 11 })
    expect(action).toBe('apply')
    expect(state.next).toEqual({ id: 9, name: 'Halloween', goesLiveAt: 2 })
  })

  test('an old or repeated seq is ignored', () => {
    expect(receive(board(), { type: 'kid.added', eventId: 7, kid: kid('a'), seq: 10 }).action).toBe('stale')
  })
})
