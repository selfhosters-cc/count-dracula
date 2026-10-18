import { describe, expect, test } from 'bun:test'
import { doorRedirect, doorScreen, doorView, goLiveNowTarget, helperLink, helperWording, joinCodeLine, quietNudge, refusedKey, tvQrButton, tvQrCodeLine, tvQrSays } from './door-view.js'

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

describe('the quiet nudge', () => {
  // Toronto, Oct 31 2026: EDT, UTC-4.
  const local = (hh, mm) => Date.parse(`2026-10-31T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00-04:00`)
  const night = ({ lastTap = local(20, 0), ended = false, shift = 0 } = {}) => ({
    event: { state: ended ? 'ended' : 'live', live: !ended, ended, clockShiftMs: shift },
    kids: lastTap == null ? [] : [{ id: 'a', tappedAt: lastTap - 3_600_000 }, { id: 'b', tappedAt: lastTap }],
    timeZone: 'America/Toronto',
  })
  const MIN = 60_000

  test('shows after 8:30 pm local with 30 minutes and no tap', () => {
    expect(quietNudge(night({ lastTap: local(20, 0) }), local(20, 30))).toBe(true)
    expect(quietNudge(night({ lastTap: local(20, 0) }), local(20, 29))).toBe(false)
    expect(quietNudge(night({ lastTap: local(20, 10) }), local(20, 35))).toBe(false)
    expect(quietNudge(night({ lastTap: local(17, 0) }), local(20, 15))).toBe(false) // quiet, but not 8:30 yet
    expect(quietNudge(night({ lastTap: local(22, 0) }), local(22, 45) + 2 * 60 * MIN)).toBe(true) // after midnight too
  })

  test('reads 8:30 in the Household\'s zone and its Clock shift', () => {
    expect(quietNudge({ ...night(), timeZone: 'America/Vancouver' }, local(21, 0))).toBe(false) // 6:00 pm there
    expect(quietNudge(night({ lastTap: local(16, 0), shift: 4 * 60 * MIN }), local(16, 45))).toBe(true) // 8:45 pm event time
  })

  test('never on an ended night, with no night on, or with no snapshot', () => {
    expect(quietNudge(night({ ended: true }), local(21, 0))).toBe(false)
    expect(quietNudge({ ...night(), event: { state: 'past', live: false, ended: false, clockShiftMs: 0 } }, local(21, 0))).toBe(false)
    expect(quietNudge({ ...night(), event: null }, local(21, 0))).toBe(false)
    expect(quietNudge(null, local(21, 0))).toBe(false)
  })

  test('a night with no kids at all is quiet too', () => {
    expect(quietNudge(night({ lastTap: null }), local(20, 45))).toBe(true)
  })

  test('stays hidden for 30 minutes once dismissed', () => {
    expect(quietNudge(night(), local(21, 0), local(20, 40))).toBe(false)
    expect(quietNudge(night(), local(21, 10), local(20, 40))).toBe(true)
  })
})

describe('queued taps across a switch (spec v2.1 §4)', () => {
  const TEST_NIGHT = { id: 1, wentLiveAt: 100 }
  const HALLOWEEN = { id: 2, wentLiveAt: 200 }
  const board = (event, kidIds = []) => ({ event, tags: [], kids: kidIds.map((id, i) => ({ id, number: i + 1, tagId: null, tappedAt: i })) })
  const queued = (id, night) => ({ id, tagId: null, tappedAt: 0, phoneName: 'Dad', eventId: night.id, stamp: night.wentLiveAt })

  test("show only on the board of the Event and go-live stamp they were tapped under", () => {
    const box = { pending: [queued('t1', TEST_NIGHT), queued('h1', HALLOWEEN)], unconfirmed: [queued('t2', TEST_NIGHT)], mine: new Set(['t1', 't2', 'h1']) }

    const onHalloween = doorView(board(HALLOWEEN, ['a']), box)
    expect(onHalloween.total).toBe(2)
    expect(onHalloween.recent.map((r) => r.id)).toEqual(['h1', 'a'])
    expect(onHalloween.undo.id).toBe('h1')
    expect(doorView(board(TEST_NIGHT), box).total).toBe(2)
  })

  test('a tap queued under an earlier go-live of the same Event (before a reset) stays off the board', () => {
    const box = { pending: [queued('old', { id: 2, wentLiveAt: 150 })], unconfirmed: [], mine: new Set(['old']) }

    expect(doorView(board(HALLOWEEN), box).total).toBe(0)
  })

  test('with no night on, nothing queued is counted', () => {
    const box = { pending: [queued('t1', TEST_NIGHT)], unconfirmed: [], mine: new Set(['t1']) }

    expect(doorView(board(null), box).total).toBe(0)
  })
})

describe('the door screen', () => {
  test('is the board with a night on, "No night on right now" with none, and nothing before the first snapshot', () => {
    expect(doorScreen({ event: { id: 2, state: 'live' } })).toBe('board')
    expect(doorScreen({ event: { id: 2, state: 'ended' } })).toBe('board')
    expect(doorScreen({ event: null, next: null })).toBe('no-night')
    expect(doorScreen(null)).toBe('connecting')
  })
})

describe('a refused key on /door', () => {
  test('is forgotten, with "no longer works", when it was a key', () => {
    expect(refusedKey({ hadKey: true, suspended: false })).toEqual({ forget: true, says: "This phone's link no longer works. Ask your host for a new link or QR code." })
  })

  test("is kept while its Household is Suspended, since Unsuspend restores everything", () => {
    expect(refusedKey({ hadKey: true, suspended: true })).toEqual({ forget: false, says: 'This Household is suspended by the Operator.' })
  })

  test('a phone that never joined is asked to scan a code', () => {
    expect(refusedKey({ hadKey: false, suspended: false })).toEqual({ forget: false, says: "This phone hasn't joined a door yet. Ask your host for a link or QR code." })
  })
})

describe('where / goes', () => {
  test('a ?key= or a remembered key goes to /door, keeping the query', () => {
    expect(doorRedirect({ pathname: '/', search: '?key=abc', storedKey: null })).toBe('/door?key=abc')
    expect(doorRedirect({ pathname: '/', search: '', storedKey: 'abc' })).toBe('/door')
  })

  test("a phone that holds a door's key can still reach Got a code? (a TV's code, another host's)", () => {
    expect(doorRedirect({ pathname: '/', search: '', hash: '#code', storedKey: 'abc' })).toBeNull()
    expect(doorRedirect({ pathname: '/', search: '?pair=K7QM4X', hash: '#sign-in', storedKey: 'abc' })).toBeNull()
  })

  test('/ with no key stays on the homepage, and /door never redirects', () => {
    expect(doorRedirect({ pathname: '/', search: '', storedKey: null })).toBeNull()
    expect(doorRedirect({ pathname: '/door', search: '?key=abc', storedKey: 'abc' })).toBeNull()
  })

  test("a Manager sent to sign in or sign up stays, even on a phone that remembers a door's key", () => {
    expect(doorRedirect({ pathname: '/', search: '', hash: '#sign-in', storedKey: 'abc' })).toBeNull()
    expect(doorRedirect({ pathname: '/', search: '', hash: '#start', storedKey: 'abc' })).toBeNull()
    expect(doorRedirect({ pathname: '/', search: '', hash: '#how', storedKey: 'abc' })).toBe('/door')
    expect(doorRedirect({ pathname: '/', search: '?key=abc', hash: '#sign-in', storedKey: null })).toBe('/door?key=abc')
  })
})

describe('Add a helper', () => {
  test('builds /door?key= and names the Household, never an Event', () => {
    expect(helperLink('https://count-dracula.example.com', 'a b/c')).toBe('https://count-dracula.example.com/door?key=a%20b%2Fc')
    expect(helperWording('The Smiths')).toBe('A helper scans this, or opens the link, to count at The Smiths on any night.')
    expect(helperWording(null)).toBe('A helper scans this, or opens the link, to count at this door on any night.')
  })
})

describe('Go live now (a signed-in Manager)', () => {
  const ev = (id, state, goesLiveAt = null) => ({ id, name: `Night ${id}`, state, goesLiveAt })

  test('offers the Upcoming Event with the soonest Goes live at, whatever else is open', () => {
    const events = [ev(1, 'live'), ev(2, 'upcoming', 500), ev(3, 'upcoming', 300), ev(4, 'upcoming'), ev(5, 'past', 100), ev(6, 'ended')]

    expect(goLiveNowTarget(events)).toMatchObject({ id: 3, name: 'Night 3' })
  })

  test('is hidden with none scheduled', () => {
    expect(goLiveNowTarget([ev(1, 'upcoming'), ev(2, 'live')])).toBeNull()
    expect(goLiveNowTarget([])).toBeNull()
  })
})

describe("a helper's code under the QR", () => {
  test("spells the code out for a phone that can't scan, worded like the TV's", () => {
    expect(joinCodeLine('K7Q-M4X', 'https://count-dracula.example.com')).toBe('No camera? On their phone, go to count-dracula.example.com and enter K7Q-M4X')
  })
})

describe('the helper QR on the TV', () => {
  test("the button shows it, or hides it with the time it has left", () => {
    expect(tvQrButton(0)).toEqual({ showing: false, label: '📺 Show the helper QR on the TV' })
    expect(tvQrButton(119_200)).toEqual({ showing: true, label: 'Hide from the TV (2:00 left)' })
    expect(tvQrButton(61_000)).toEqual({ showing: true, label: 'Hide from the TV (1:01 left)' })
    expect(tvQrButton(4_000)).toEqual({ showing: true, label: 'Hide from the TV (0:04 left)' })
  })

  test("says how many paired TVs got it, and doesn't pretend with none on", () => {
    expect(tvQrSays({ shown: true, tvs: 1 })).toBe('📺 On the TV for 2 minutes')
    expect(tvQrSays({ shown: true, tvs: 2 })).toBe('📺 On 2 TVs for 2 minutes')
    expect(tvQrSays({ shown: false, tvs: 1 })).toBe('Taken off the TV')
    expect(tvQrSays({ shown: false, tvs: 0 })).toBe('No paired TV is on right now. Pair your porch TV with the code on its screen to show the QR there.')
    // Only a TV-link screen on: it never gets the helper QR, and the answer says why, and what to do instead.
    expect(tvQrSays({ shown: false, tvs: 0, viewers: 1 })).toMatch(/^Your TV is on the TV link, so it can't show the helper QR/)
  })

  test("the TV card spells the code out too", () => {
    expect(tvQrCodeLine('K7Q-M4X', 'https://count-dracula.example.com')).toBe('No camera? Go to count-dracula.example.com and enter K7Q-M4X')
  })
})
