import { describe, expect, test } from 'bun:test'
import {
  deleteConfirm,
  doorEvent,
  goldenLine,
  goLiveOffer,
  nightActions,
  nightGroups,
  nightHelpKey,
  nightsTabLabel,
  nightTools,
  noteActions,
  noteHeadline,
  resetConfirm,
  rowActions,
  screenFrom,
  searchFor,
  waitingNights,
  whenLine,
} from './setup-view.js'

const flags = (state) => ({ state, open: state === 'live' || state === 'ended', live: state === 'live', ended: state === 'ended', past: state === 'past' })
const ev = (id, name, state, extra = {}) => ({ id, name, ...flags(state), wentLiveAt: null, goesLiveAt: null, kids: 0, note: null, golden: { drawn: 0, won: 0, left: 0 }, ...extra })
const day = (ms) => `@${ms}`

// Halloween at 7:10 pm with an afternoon test still Live (the prototype's "halloween" scenario).
const halloween = [
  ev(4, 'Halloween 2025 (counts)', 'past', { countsOnly: true, counted: 141 }),
  ev(1, 'Halloween 2026', 'live', { wentLiveAt: 1600, kids: 132, golden: { drawn: 5, won: 2, left: 3 } }),
  ev(2, 'Afternoon test', 'live', { wentLiveAt: 1405, kids: 4 }),
  ev(3, 'Practice night', 'past', { wentLiveAt: 1015, kids: 9 }),
  ev(9, 'Halloween 2025 (estimated)', 'past', { countsOnly: true, estimated: true, counted: 120 }),
]

describe('the door and the tabs', () => {
  test("the door's Event is the open one that went live last", () => {
    expect(doorEvent(halloween).name).toBe('Halloween 2026')
    expect(doorEvent(halloween.filter((e) => !e.open))).toBeNull()
  })

  test('Nights says how many are open only when more than one is', () => {
    expect(nightsTabLabel(halloween)).toBe('Nights (2 open)')
    expect(nightsTabLabel(halloween.filter((e) => e.id !== 2))).toBe('Nights')
  })
})

describe('Nights', () => {
  test('Open newest go-live first, Coming up scheduled soonest first, Past newest first with imported counts last; no estimate', () => {
    const events = [
      ...halloween,
      ev(5, 'Street party', 'upcoming'),
      ev(6, 'Halloween 2027', 'upcoming', { goesLiveAt: 9000 }),
      ev(7, 'Sound check', 'upcoming', { goesLiveAt: 5000 }),
      ev(8, 'Old test', 'past', { wentLiveAt: 2000 }),
    ]
    const { open, coming, past } = nightGroups(events)
    expect(open.map((e) => e.id)).toEqual([1, 2])
    expect(coming.map((e) => e.id)).toEqual([7, 6, 5])
    expect(past.map((e) => e.id)).toEqual([8, 3, 4])
  })
})

describe("each Event's actions", () => {
  test("the header's, by state (spec v2.1 §9)", () => {
    expect(nightActions(ev(1, 'A', 'upcoming'))).toEqual(['goLive', 'delete'])
    expect(nightActions(ev(1, 'A', 'live'))).toEqual(['end', 'reset'])
    expect(nightActions(ev(1, 'A', 'ended'))).toEqual(['resume', 'close', 'reset', 'delete'])
    expect(nightActions(ev(1, 'A', 'past'))).toEqual(['delete'])
    expect(nightActions(ev(1, 'A', 'past', { countsOnly: true }))).toEqual(['delete'])
  })

  test("Tonight's rows: End or Close now, and Reset", () => {
    expect(rowActions(ev(1, 'A', 'live'))).toEqual(['end', 'reset'])
    expect(rowActions(ev(1, 'A', 'ended'))).toEqual(['close', 'reset'])
    expect(rowActions(ev(1, 'A', 'upcoming'))).toEqual([])
  })

  test('the night tools, by state', () => {
    expect(nightTools(ev(1, 'A', 'upcoming'))).toEqual(['tally'])
    expect(nightTools(ev(1, 'A', 'live'))).toEqual(['ticket', 'missed', 'csv', 'tally'])
    expect(nightTools(ev(1, 'A', 'live', { golden: null }))).toEqual(['missed', 'csv', 'tally'])
    expect(nightTools(ev(1, 'A', 'ended'))).toEqual(['missed', 'csv', 'tally', 'summary'])
    expect(nightTools(ev(1, 'A', 'past'))).toEqual(['csv', 'tally', 'summary', 'recap'])
    expect(nightTools(ev(1, 'A', 'past', { countsOnly: true }))).toEqual([])
  })

  test('the auto-end note carries Resume, Close now and the summary; the others carry nothing', () => {
    expect(noteActions({ kind: 'autoEnded', at: 1 })).toEqual(['resume', 'close', 'summary'])
    expect(noteActions({ kind: 'closedForRoom', at: 1, for: 'X' })).toEqual([])
    expect(noteActions({ kind: 'waiting', at: 1 })).toEqual([])
    expect(noteActions(null)).toEqual([])
  })

  test("the night screen's help topic", () => {
    expect(nightHelpKey(ev(1, 'A', 'ended'))).toBe('night-Ended')
    expect(nightHelpKey(ev(1, 'A', 'past', { countsOnly: true }))).toBe('night-imported')
  })
})

describe('Tonight', () => {
  test('a night waiting at the cap is picked out', () => {
    const waiting = ev(1, 'Halloween 2026', 'upcoming', { goesLiveAt: 1600, note: { kind: 'waiting', at: 1601 } })
    expect(waitingNights([waiting, ...halloween])).toEqual([waiting])
  })

  test('with nothing open, it offers the scheduled Upcoming Event the door ☰ offers', () => {
    expect(goLiveOffer([ev(1, 'Halloween 2026', 'upcoming', { goesLiveAt: 1600 }), ev(5, 'Street party', 'upcoming')]).name).toBe('Halloween 2026')
    expect(goLiveOffer([ev(5, 'Street party', 'upcoming')])).toBeNull()
  })
})

describe('the lines', () => {
  test('when or how many, by state', () => {
    expect(whenLine(ev(1, 'A', 'upcoming', { goesLiveAt: 5 }), day)).toBe('Goes live by itself @5')
    expect(whenLine(ev(1, 'A', 'upcoming'), day)).toBe('Goes live when you press Go live')
    expect(whenLine(ev(1, 'A', 'live', { kids: 1, wentLiveAt: 7 }), day)).toBe('1 kid · live since @7')
    expect(whenLine(ev(1, 'A', 'ended', { kids: 11 }), day)).toBe('11 kids · ended, late kids count until noon')
    expect(whenLine(ev(1, 'A', 'past', { kids: 9, wentLiveAt: 3 }), day)).toBe('9 kids · @3')
    expect(whenLine(ev(1, 'A', 'past', { countsOnly: true, counted: 141 }), day)).toBe('141 kids · imported counts')
  })

  test('a Live Event keeps its old Goes live at, but only an Upcoming one shows it', () => {
    expect(whenLine(ev(1, 'A', 'live', { kids: 2, wentLiveAt: 7, goesLiveAt: 5 }), day)).toBe('2 kids · live since @7')
  })

  test('golden tickets won, only once some were drawn', () => {
    expect(goldenLine(halloween[1])).toBe('golden tickets 2 of 5 won')
    expect(goldenLine(halloween[2])).toBe('')
    expect(goldenLine(ev(1, 'A', 'live', { golden: null }))).toBe('')
  })

  test("a note's first sentence, for a Nights row", () => {
    expect(noteHeadline("Couldn't go live at 4:00 pm: 3 nights are open. It'll go live as soon as you end or close one.")).toBe("Couldn't go live at 4:00 pm: 3 nights are open")
    expect(noteHeadline('Ended automatically at 3:00 am. Late kids still count until noon.')).toBe('Ended automatically at 3:00 am')
    expect(noteHeadline('Closed at 4:00 pm so Halloween 2026 could go live')).toBe('Closed at 4:00 pm so Halloween 2026 could go live')
  })
})

describe('the confirms', () => {
  test("Reset names the count, and above 20 kids the name is typed (spec v2.1 §6)", () => {
    expect(resetConfirm(ev(1, 'Test night', 'live', { kids: 7 }), 0)).toEqual({ typed: false, text: 'Reset "Test night"? Its 7 kids are deleted and it goes back to Upcoming.' })
    expect(resetConfirm(ev(1, 'Test night', 'live', { kids: 1 }), 0).text).toBe('Reset "Test night"? Its 1 kid is deleted and it goes back to Upcoming.')
    expect(resetConfirm(ev(1, 'Test night', 'live'), 0).text).toBe('Reset "Test night"? It goes back to Upcoming.')
    expect(resetConfirm(ev(1, 'Test night', 'live', { kids: 20 }), 0).typed).toBe(false)
    expect(resetConfirm(ev(1, 'Test night', 'live', { kids: 21 }), 0)).toEqual({
      typed: true,
      text: 'Reset "Test night"? Its 21 kids are deleted and it goes back to Upcoming.\n\nType its name to confirm.',
    })
  })

  test("Reset says it won't go live by itself again once Goes live at has passed", () => {
    const e = ev(1, 'Halloween 2026', 'live', { kids: 3, goesLiveAt: 100 })
    expect(resetConfirm(e, 100).text).toBe(
      'Reset "Halloween 2026"? Its 3 kids are deleted and it goes back to Upcoming.\n\nHalloween 2026 won\'t go live by itself again. Go live when you\'re ready.',
    )
    expect(resetConfirm(e, 99).text).not.toContain("won't go live")
  })

  test('Delete: a typed name with kids or imported counts, a plain confirm otherwise', () => {
    expect(deleteConfirm(ev(1, 'Party', 'upcoming'))).toMatchObject({ typed: false })
    expect(deleteConfirm(ev(1, 'Party', 'ended', { kids: 3 }))).toEqual({ typed: true, text: 'Delete "Party" and its 3 kids for good? Type its name to confirm.' })
    expect(deleteConfirm(ev(1, 'Halloween 2025', 'past', { countsOnly: true, counted: 40 }))).toMatchObject({ typed: true })
  })
})

describe('the URL', () => {
  test('a night screen, a tab, or Tonight', () => {
    expect(screenFrom('?event=4')).toEqual({ tab: 'tonight', event: 4 })
    expect(screenFrom('?tab=nights&event=4')).toEqual({ tab: 'nights', event: 4 })
    expect(screenFrom('?tab=household')).toEqual({ tab: 'household', event: null })
    expect(screenFrom('?pair=K7Q-M4X')).toEqual({ tab: 'tonight', event: null })
    expect(screenFrom('?event=nope&tab=bogus')).toEqual({ tab: 'tonight', event: null })
  })

  test('round trips', () => {
    for (const screen of [{ tab: 'tonight', event: null }, { tab: 'nights', event: 3 }, { tab: 'household', event: null }, { tab: 'tonight', event: 7 }]) {
      expect(screenFrom(searchFor(screen))).toEqual(screen)
    }
    expect(searchFor({ tab: 'tonight', event: null })).toBe('')
  })
})
