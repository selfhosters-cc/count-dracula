// doorView (modules.md §5): what the door phone shows, from the server's state plus this phone's outbox.
// Pure. Phone screens read through it, never from the snapshot or localStorage directly.
import { eventNow, minuteOfDay, tagColour } from '../shared/night-maths.js'

const RECENT_ROWS = 10

// link: { connected } from the live stream.
export function doorView(liveState, outbox, link = { connected: true }) {
  if (!liveState) {
    return { total: null, untagged: null, tags: [], recent: [], undo: null, goldenBanner: false, catchUp: { max: 0, preview: () => [] } }
  }

  // A queued tap keeps the Event and go-live stamp it was tapped under (spec v2.1 §4): it shows only on that
  // board, and lands there or is refused, never on whatever the door has moved on to.
  const board = liveState.event ?? null
  const onBoard = (e) => e.type === 'remove' || ((e.eventId ?? null) === (board?.id ?? null) && (e.stamp ?? null) === (board?.wentLiveAt ?? null))
  const outgoing = [...outbox.pending, ...outbox.unconfirmed].filter(onBoard)
  const removed = new Set(outgoing.filter((e) => e.type === 'remove').map((e) => e.kidId))
  const arrived = new Set(liveState.kids.map((k) => k.id))

  // Every kid this phone counts, in arrival order: the server's, then taps it doesn't have yet.
  const serverKids = liveState.kids.filter((k) => !removed.has(k.id))
  const queuedTaps = outgoing.filter((e) => e.type !== 'remove' && !arrived.has(e.id) && !removed.has(e.id))
  const everyKid = [...serverKids, ...queuedTaps]

  const counts = new Map(liveState.tags.map((t) => [t.id, 0]))
  let untagged = 0
  for (const k of everyKid) {
    if (counts.has(k.tagId)) counts.set(k.tagId, counts.get(k.tagId) + 1)
    else untagged++ // untagged, or a costume deleted while the tap was queued
  }

  const tags = [...liveState.tags]
    .sort((a, b) => a.order - b.order)
    .map((t) => ({ id: t.id, name: t.name, emoji: t.emoji, colour: tagColour(t.order), count: counts.get(t.id) }))

  const tagsById = new Map(liveState.tags.map((t) => [t.id, t]))
  const unsent = new Set(outbox.pending.map((e) => e.id))
  const row = (k) => {
    const tag = tagsById.get(k.tagId)
    return {
      id: k.id,
      number: k.number ?? null, // a tap the server hasn't numbered yet
      tag: tag ? { emoji: tag.emoji, name: tag.name } : null,
      phoneName: k.phoneName,
      tappedAt: k.tappedAt,
      teen: k.teen === true,
      queued: unsent.has(k.id),
      mine: outbox.mine.has(k.id),
    }
  }
  const recent = everyKid.slice(-RECENT_ROWS).reverse().map(row)
  // Undo takes this phone's latest kid that still counts. Phone names can repeat, so go by id.
  const latestMine = everyKid.findLast((k) => outbox.mine.has(k.id))

  return {
    total: everyKid.length,
    untagged,
    tags,
    recent,
    undo: latestMine ? row(latestMine) : null,
    // Only when this phone's count is the server's: connected, and nothing of ours in flight (spec §4).
    goldenBanner: !!(liveState.golden?.nextIsGolden && link.connected && !outbox.pending.length && !outbox.unconfirmed.length),
    catchUp: catchUpPreview(serverKids),
  }
}

// Which screen /door shows: the board while a night is open, "No night on right now" with none.
export function doorScreen(liveState) {
  if (!liveState) return 'connecting'
  return liveState.event ? 'board' : 'no-night'
}

// A key the server refused (spec v2.1 §4). It only dies by Change join key or the Household going, so it's
// forgotten then; a Suspended Household's key is kept, since Unsuspend restores everything.
export function refusedKey({ hadKey, suspended }) {
  if (suspended) return { forget: false, says: 'This Household is suspended by the Operator.' }
  if (!hadKey) return { forget: false, says: "This phone hasn't joined a door yet. Ask your host for a link or QR code." }
  return { forget: true, says: "This phone's link no longer works. Ask your host for a new link or QR code." }
}

// `/` with a ?key= or a remembered key goes to the door phone (spec v2.1 §11); otherwise null, and the homepage
// stays. Every "go sign in" lands on /#sign-in or /#start: those stay too, so a Manager whose phone remembers a
// door's key can still reach the forms (else /setup → / → /door → ☰ Setup → / would go round).
const SIGN_IN_HASHES = new Set(['#sign-in', '#start', '#code']) // and Got a code?, for a TV's code or another host's
export function doorRedirect({ pathname, search, hash = '', storedKey }) {
  if (pathname !== '/') return null
  if (new URLSearchParams(search).get('key')) return `/door${search}`
  return storedKey && !SIGN_IN_HASHES.has(hash) ? '/door' : null
}

// Add a helper: the join link and its wording name the Household, never an Event, so a QR made for a test
// night is right on the real one.
export function helperLink(origin, key) {
  return `${origin}/door?key=${encodeURIComponent(key)}`
}

// Under a helper's QR: the code spelled out, for a phone that can't scan. Every code goes in the same box on the
// homepage (spec v2.1 §11), so it's worded like the TV's.
export function joinCodeLine(key, origin) {
  return `No camera? On their phone, go to ${new URL(origin).host} and enter ${key}`
}

export function helperWording(householdName) {
  return `A helper scans this, or opens the link, to count at ${householdName || 'this door'} on any night.`
}

// ☰ "Go live on <Event> now" (spec v2.1 §5): the Upcoming Event with the soonest Goes live at, or null.
export function goLiveNowTarget(events) {
  return events.filter((e) => e.state === 'upcoming' && e.goesLiveAt != null).sort((a, b) => a.goesLiveAt - b.goesLiveAt)[0] ?? null
}

// Picks the kids the server will re-tag: the most recently *tapped* untagged ones it has
// (ties go to the later arrival). Queued taps aren't candidates: "+ New" needs an empty outbox.
function catchUpPreview(serverKids) {
  const candidates = serverKids
    .map((k, arrival) => ({ ...k, arrival }))
    .filter((k) => k.tagId == null)
    .sort((a, b) => b.tappedAt - a.tappedAt || b.arrival - a.arrival)
  return {
    max: candidates.length,
    preview: (n) =>
      candidates
        .slice(0, n)
        .map((k) => k.number)
        .sort((a, b) => a - b),
  }
}

// "Quiet out there? 🌙 End the night" (spec v2.1 §5): only the door's Event (the one the phone shows), while
// Live, from 8:30 pm event time in the Household's zone (and on through the small hours), with no kid for
// 30 minutes. Dismissing it hides it for 30.
const QUIET_MS = 30 * 60_000
const NUDGE_FROM = 20 * 60 + 30
const NIGHT_ENDS = 6 * 60 // after midnight still counts as late

export function quietNudge(state, realNowMs, dismissedAt = -Infinity) {
  const event = state?.event
  if (!event?.live || event.ended) return false
  if (realNowMs - dismissedAt < QUIET_MS) return false
  const minute = minuteOfDay(eventNow(realNowMs, event.clockShiftMs ?? 0), state.timeZone)
  if (minute < NUDGE_FROM && minute >= NIGHT_ENDS) return false
  const lastTap = Math.max(-Infinity, ...state.kids.map((k) => k.tappedAt))
  return realNowMs - lastTap >= QUIET_MS
}
