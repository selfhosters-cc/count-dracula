// Celebration director (modules.md §6): decides what the TV shows and when. The server decides *which*
// moments happened; this only orders, merges and times them. play(show) renders a show; play(null) clears.
//
// Shows: { kind: 'pop', from, to }            "YOU'RE KID #N!" / "WELCOME, KIDS #N–M!"
//        { kind: 'milestone', number }         every 50th: the big white chip
//        { kind: 'takeover', moment, number }  full screen: 'golden' | 'beat-last-year' | 'milestone' (every 100th)

const POP_MS = 1_500 // "YOU'RE KID #N!"
const MERGE_EXTEND_MS = 1_100 // each merged kid keeps the pop up this much longer…
const MERGE_CAP_MS = 3_000 // …but a merged pop never runs past this
const MILESTONE_MS = 3_000
const TAKEOVER_MS = 5_500
const GOLDEN_MS = 6_000
const GAP_MS = 350 // breathing room between queued shows

// Spec §8: golden ticket > beat last year > every 100th > every 50th > pop.
const PRIORITY = { golden: 5, 'beat-last-year': 4, hundred: 3, fifty: 2, pop: 1 }

// The one show a kid (or a deferred moment) gets: its highest-priority moment, else a pop.
function showFor(moments, kid) {
  const number = kid?.number ?? null
  const candidates = moments.map((m) => {
    if (m === 'golden') return { rank: PRIORITY.golden, show: { kind: 'takeover', moment: 'golden', number } }
    if (m === 'beat-last-year') return { rank: PRIORITY['beat-last-year'], show: { kind: 'takeover', moment: 'beat-last-year', number } }
    const n = Number(m.split(':')[1])
    return n % 100 === 0
      ? { rank: PRIORITY.hundred, show: { kind: 'takeover', moment: 'milestone', number: n } }
      : { rank: PRIORITY.fifty, show: { kind: 'milestone', number: n } }
  })
  if (!candidates.length) return { rank: PRIORITY.pop, show: { kind: 'pop', from: number, to: number } }
  return candidates.reduce((best, c) => (c.rank > best.rank ? c : best))
}

function durationOf(show) {
  if (show.kind === 'pop') return POP_MS
  if (show.kind === 'milestone') return MILESTONE_MS
  return show.moment === 'golden' ? GOLDEN_MS : TAKEOVER_MS
}

export function createDirector({ clock, play }) {
  let active = null // { show, startedAt }
  let endTimer = null
  const queue = [] // { rank, show }, played highest rank first, oldest first within a rank

  function finish() {
    active = null
    play(null)
    if (queue.length) clock.setTimeout(next, GAP_MS)
  }

  function next() {
    if (active || !queue.length) return
    const best = queue.reduce((b, item) => (item.rank > b.rank ? item : b))
    queue.splice(queue.indexOf(best), 1)
    active = { show: best.show, startedAt: clock.now() }
    play(best.show)
    endTimer = clock.setTimeout(finish, durationOf(best.show))
  }

  // Kids arriving while a pop shows merge into it (capped); otherwise into the pop waiting in the queue.
  function pop(number) {
    const now = clock.now()
    if (active?.show.kind === 'pop' && now - active.startedAt < MERGE_CAP_MS) {
      active.show = { ...active.show, to: number }
      play(active.show)
      clock.clearTimeout(endTimer)
      endTimer = clock.setTimeout(finish, Math.min(active.startedAt + MERGE_CAP_MS, now + MERGE_EXTEND_MS) - now)
      return
    }
    const waiting = queue.find((item) => item.show.kind === 'pop')
    if (waiting) waiting.show.to = number
    else queue.push({ rank: PRIORITY.pop, show: { kind: 'pop', from: number, to: number } })
    next()
  }

  return {
    // From a kid.added delta (moments + kid) or a deferred `moment` delta (no kid).
    push(moments = [], kid) {
      if (kid?.late) return // late taps tick the count up quietly; the TV page rolls it
      const item = showFor(moments, kid)
      if (item.show.kind === 'pop') return pop(kid.number)
      queue.push(item)
      next()
    },
  }
}
