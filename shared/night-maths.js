// Night maths (modules.md §3): pure functions shared by the server, the phones and the TV. No build step.

const TAG_SLOTS = ['#3987e5', '#199e70', '#c98500', '#d55181', '#9085e9', '#e66767']
const UNTAGGED = '#ff7a1a'
const OVERFLOW = '#8a84a8'

// A costume's colour comes from its order (1-based); null means untagged (spec §7).
export function tagColour(order) {
  if (order == null) return UNTAGGED
  return TAG_SLOTS[order - 1] ?? OVERFLOW
}

const minutesOf = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

// The Race-against event's cumulative count by time of day (minutes into the day): linear within
// each bucket, flat across gaps and after the last bucket, 0 before the first (spec §2 Ghost line).
export function ghost(buckets) {
  const spans = buckets
    .map((b) => ({ start: minutesOf(b.start), end: minutesOf(b.end), count: b.count }))
    .sort((a, b) => a.start - b.start)
  return (minute) => {
    let total = 0
    for (const s of spans) {
      if (minute <= s.start) break
      total += minute >= s.end ? s.count : (s.count * (minute - s.start)) / (s.end - s.start)
    }
    return total
  }
}

// Clock shift (spec §2): timestamps are stored in real time; an event's shift moves its "now" for
// the ghost position, the chart's x-axis, the 7:45 Release gate and the backfill rows. Only here.
export function eventNow(realMs, shiftMs = 0) {
  return realMs + shiftMs
}

// Minutes into the (local) day, with seconds as a fraction: the ghost's and the chart's x unit.
export function minuteOfDay(ms) {
  const d = new Date(ms)
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60 + d.getMilliseconds() / 60_000
}

const hhmm = (minute) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`

// Half-hour buckets of an event's taps in its own event time: every ghost source becomes these
// (modules.md §3). The first bucket starts at the first tap's minute, like 2025's 17:42; empty
// half-hours are left out.
export function toBuckets(tappedAts, shiftMs = 0) {
  const minutes = tappedAts.map((t) => Math.floor(minuteOfDay(eventNow(t, shiftMs)))).sort((a, b) => a - b)
  if (!minutes.length) return []
  const first = minutes[0]
  const buckets = new Map()
  for (const m of minutes) {
    const slot = Math.floor(m / 30) * 30
    const start = Math.max(slot, first)
    const bucket = buckets.get(slot) ?? { start: hhmm(start), end: hhmm(slot + 30), count: 0 }
    bucket.count++
    buckets.set(slot, bucket)
  }
  return [...buckets.values()]
}

// The hero's pace line: "👻 4 ahead of last year's ghost", "…behind…", or "🏆 New record!" once
// tonight passes the ghost's final total.
export function pace(count, ghostNow, ghostTotal) {
  if (count > ghostTotal) return { kind: 'record', by: count - ghostTotal }
  const gap = Math.round(count - ghostNow)
  if (gap > 0) return { kind: 'ahead', by: gap }
  if (gap < 0) return { kind: 'behind', by: -gap }
  return { kind: 'level', by: 0 }
}
