// What /setup shows (spec v2.1 §9): its tabs, the night groups, and each Event's actions, tools, lines and
// confirms. Pure: setup.js draws the screens from these and sends the commands.
import { goLiveNowTarget } from './door-view.js'

export const MAX_OPEN = 3
// Reset (spec v2.1 §6): above this many kids, the Event's name is typed to confirm. The Ledger checks it too.
export const RESET_TYPED_ABOVE = 20

export const STATE_LABEL = { upcoming: 'Upcoming', live: 'Live', ended: 'Ended', past: 'Past' }
const kidsText = (n) => `${n} kid${n === 1 ? '' : 's'}`

// The door's Event (spec v2.1 §3): the open Event that went live most recently (ties by id), or null.
export function doorEvent(events) {
  return events.filter((e) => e.open).sort((a, b) => b.wentLiveAt - a.wentLiveAt || b.id - a.id)[0] ?? null
}

// Nights: Open (newest go-live first), Coming up (scheduled soonest first, then the rest oldest first) and Past
// (newest first, imported counts last). The estimate isn't a night: it lives under Household → Last year.
export function nightGroups(events) {
  const nights = events.filter((e) => !e.estimated)
  return {
    open: nights.filter((e) => e.open).sort((a, b) => b.wentLiveAt - a.wentLiveAt || b.id - a.id),
    coming: nights
      .filter((e) => e.state === 'upcoming' && !e.countsOnly)
      .sort((a, b) => (a.goesLiveAt ?? Infinity) - (b.goesLiveAt ?? Infinity) || a.id - b.id),
    past: nights
      .filter((e) => e.state === 'past' || e.countsOnly)
      .sort((a, b) => !!a.countsOnly - !!b.countsOnly || (b.wentLiveAt ?? 0) - (a.wentLiveAt ?? 0) || b.id - a.id),
  }
}

// "Nights (2 open)" when more than one is open.
export function nightsTabLabel(events) {
  const open = events.filter((e) => e.open).length
  return open > 1 ? `Nights (${open} open)` : 'Nights'
}

// The header's actions for an Event's state (spec v2.1 §9), primary first.
export function nightActions(e) {
  if (e.countsOnly) return ['delete']
  return { upcoming: ['goLive', 'delete'], live: ['end', 'reset'], ended: ['resume', 'close', 'reset', 'delete'], past: ['delete'] }[e.state] ?? []
}

// Tonight's short rows for the other open Events: End or Close now, and Reset.
export function rowActions(e) {
  return { live: ['end', 'reset'], ended: ['close', 'reset'] }[e.state] ?? []
}

// Night tools by state (spec v2.1 §7, §9). `golden` is null with golden tickets switched off.
export function nightTools(e) {
  if (e.countsOnly) return []
  const tools = []
  if (e.state === 'live' && e.golden) tools.push('ticket')
  if (e.open) tools.push('missed')
  if (e.state !== 'upcoming') tools.push('csv')
  tools.push('tally') // an Upcoming night's is a blank sheet with its costumes, to print ahead
  if (e.state === 'ended' || e.state === 'past') tools.push('summary')
  if (e.state === 'past') tools.push('recap')
  return tools
}

// The buttons a note carries: the auto-end's Resume, Close now and the summary (spec v2.1 §5).
export function noteActions(note) {
  return note?.kind === 'autoEnded' ? ['resume', 'close', 'summary'] : []
}

// The night screen's help topic (spec v2.1 §9's help keys).
export const nightHelpKey = (e) => (e.countsOnly ? 'night-imported' : `night-${STATE_LABEL[e.state]}`)

// The help column's open topic (spec v2.1 §9): the first section in the band, in page order. With none in it,
// the one already open stays, unless it's gone from the screen, when the first topic opens.
export function currentTopic(order, inBand, previous) {
  return order.find((k) => inBand.has(k)) ?? (order.includes(previous) ? previous : order[0] ?? null)
}

// Upcoming Events waiting at the cap: their note shows on Tonight too.
export const waitingNights = (events) => events.filter((e) => e.state === 'upcoming' && e.note?.kind === 'waiting')

// With nothing open: the Event Tonight offers to Go live on, the same one the door ☰ offers.
export const goLiveOffer = (events) => goLiveNowTarget(events)

// One line of when or how many. `day(ms)` formats a time in the Household's zone.
export function whenLine(e, day) {
  if (e.countsOnly) return `${kidsText(e.counted ?? 0)} · imported counts`
  if (e.state === 'upcoming') return e.goesLiveAt != null ? `Goes live by itself ${day(e.goesLiveAt)}` : 'Goes live when you press Go live'
  if (e.state === 'live') return `${kidsText(e.kids)} · live since ${day(e.wentLiveAt)}`
  if (e.state === 'ended') return `${kidsText(e.kids)} · ended, late kids count until noon`
  return e.wentLiveAt != null ? `${kidsText(e.kids)} · ${day(e.wentLiveAt)}` : kidsText(e.kids)
}

// "golden tickets 2 of 5 won", or '' with none drawn.
export function goldenLine(e) {
  return e.golden?.drawn ? `golden tickets ${e.golden.won} of ${e.golden.drawn} won` : ''
}

// The first sentence of a note's text, for a Nights row.
export const noteHeadline = (text) => text.split('. ')[0].replace(/\.$/, '')

// Reset's confirm (spec v2.1 §6): it names the count; above 20 kids, the name is typed. A Goes live at that has
// passed is cleared, and it says so.
export function resetConfirm(e, now) {
  const kids = !e.kids ? 'It' : e.kids === 1 ? 'Its 1 kid is deleted and it' : `Its ${e.kids} kids are deleted and it`
  const cleared = e.goesLiveAt != null && e.goesLiveAt <= now
  const text = `Reset "${e.name}"? ${kids} goes back to Upcoming.${cleared ? `\n\n${e.name} won't go live by itself again. Go live when you're ready.` : ''}`
  return e.kids > RESET_TYPED_ABOVE ? { typed: true, text: `${text}\n\nType its name to confirm.` } : { typed: false, text }
}

// Delete's confirm (spec v2.1 §3): the name typed when it has kids (imported counts are kids), a plain confirm
// otherwise. The Ledger checks the same rule.
export function deleteConfirm(e) {
  if (e.countsOnly) return { typed: true, text: `Delete "${e.name}" and its imported counts for good? Type its name to confirm.` }
  if (e.kids > 0) return { typed: true, text: `Delete "${e.name}" and its ${kidsText(e.kids)} for good? Type its name to confirm.` }
  return { typed: false, text: `Delete "${e.name}"? It has no kids, and nothing else goes with it but its settings and costumes.` }
}

export const closeConfirm = (e) =>
  `Close "${e.name}" now? It becomes a Past night: no more kids count, and it can't be resumed or reset. Its summary stays.`

export const goLiveConfirm = (e) =>
  `Go live with "${e.name}"?\n\nPhones and the TV switch to it by themselves. Any other live night stays open.`

export const endConfirm = (e) => `End "${e.name}"? Straggler taps still count, and you can resume it.`

// End with golden tickets still to find (v2's three choices, per Event): the question above them.
export function endQuestion(left) {
  return `🎫 ${left} golden ticket${left === 1 ? '' : 's'} never found. Release ${left === 1 ? 'it' : 'them'} to the next ${left === 1 ? 'kid' : `${left} kids`} instead?`
}

// ---- the ready checklist (spec v2.1 §8), at the top of Tonight. `testNightId` is the Test night sign-up made
// (by id, never by name), or null.

// Item 3's night: the next one with a Goes live at, else an open one that isn't the Test night, else null
// (the item hides).
export function checklistNight(events, testNightId) {
  const scheduled = events
    .filter((e) => e.state === 'upcoming' && e.goesLiveAt != null && !e.countsOnly)
    .sort((a, b) => a.goesLiveAt - b.goesLiveAt || a.id - b.id)[0]
  return scheduled ?? doorEvent(events.filter((e) => e.id !== testNightId))
}

// What the checklist shows (spec v2.1 §8, sign-in-simplify 05). `kid` is item 2's tick (a kid on any Event,
// remembered on this phone); `lastYear` is the Household's "About how many kids came last year?"; `skipped` and
// `dismissed` are remembered on this phone. `named` (renamed from "Our household") and `located` (a Location set)
// drive the optional Also lines, which never hold the list up.
export function checklist({ events, testNightId, tvWatching, kid, lastYear, skipped, dismissed, named = true, located = true, day }) {
  const night = checklistNight(events, testNightId)
  const nightDone = !!night && (night.expectedKids != null || lastYear != null || skipped)
  const nightLine = !night ? null : night.state === 'upcoming' ? `${night.name} goes live ${day(night.goesLiveAt)}` : night.state === 'live' ? `${night.name} is live` : `${night.name} has ended`
  // Once a TV is watching and a kid is counted: what happens next, saying only what's true.
  const testNight = events.find((e) => e.id === testNightId && e.state === 'live')
  const next = night?.state === 'upcoming' ? night : null
  const kidLine = tvWatching && kid
    ? [testNight && `${testNight.name} ends by itself at 3 am.`, next && `Your TV switches to ${next.name} when it goes live.`].filter(Boolean).join(' ') || null
    : null
  return { tv: tvWatching, kid, night, nightDone, nightLine, kidLine, also: { name: !named, location: !located }, hidden: dismissed || (tvWatching && kid && (!night || nightDone)) }
}

// Item 1's tick: the Event the TV is on, the door's (null with none open). The list draws the ✓.
export function tvTick(door) {
  return door ? { text: 'Your TV is showing ', name: door.name } : { text: 'Your TV is watching. No night is on right now.', name: null }
}

// The screen in the URL: ?event=<id> is a night's screen, ?tab=nights|household a tab, else Tonight.
export function screenFrom(search) {
  const params = new URLSearchParams(search)
  const event = Number(params.get('event'))
  if (params.has('event') && Number.isInteger(event) && event > 0) return { tab: params.get('tab') === 'nights' ? 'nights' : 'tonight', event }
  const tab = params.get('tab')
  return { tab: tab === 'nights' || tab === 'household' ? tab : 'tonight', event: null }
}

export function searchFor({ tab, event }) {
  const params = new URLSearchParams()
  if (tab !== 'tonight') params.set('tab', tab)
  if (event != null) params.set('event', event)
  const s = params.toString()
  return s ? `?${s}` : ''
}
