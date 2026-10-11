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

// Time zones (v2 spec §8): every time of night is read in the Household's IANA zone (the snapshot's
// timeZone), never the device's or the server's. Without a zone, the runtime's own.
const formatters = new Map()
const offsets = new Map()

// The zone's offset from UTC at ms. Offsets only change on a quarter-hour, so it's looked up once per one.
function offsetAt(ms, timeZone) {
  const quarter = Math.floor(ms / 900_000) * 900_000
  const key = `${timeZone}|${quarter}`
  let offset = offsets.get(key)
  if (offset === undefined) {
    let format = formatters.get(timeZone)
    if (!format) {
      format = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
      formatters.set(timeZone, format)
    }
    const p = Object.fromEntries(format.formatToParts(quarter).map(({ type, value }) => [type, Number(value)]))
    offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - quarter
    if (offsets.size > 10_000) offsets.clear()
    offsets.set(key, offset)
  }
  return offset
}

// The wall clock in the zone at ms, as a Date whose UTC fields read it (getUTCHours() is the zone's hour).
function wallClock(ms, timeZone) {
  return new Date(ms + offsetAt(ms, timeZone))
}

// Minutes into the day in the zone, with seconds as a fraction: the ghost's and the chart's x unit.
export function minuteOfDay(ms, timeZone) {
  const d = wallClock(ms, timeZone)
  return d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60 + d.getUTCMilliseconds() / 60_000
}

// "7:15 PM": a time of night as the zone's wall clock shows it.
export function clockTime(ms, timeZone) {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone })
}

// "2026-10-31 18:42:10" in the zone: readable in a spreadsheet.
export function stamp(ms, timeZone) {
  return wallClock(ms, timeZone).toISOString().slice(0, 19).replace('T', ' ')
}

const hhmm = (minute) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`

// Half-hour buckets of an event's taps in its own event time: every ghost source becomes these
// (modules.md §3). The first bucket starts at the first tap's minute, like 2025's 17:42; empty
// half-hours are left out.
export function toBuckets(tappedAts, shiftMs = 0, timeZone) {
  const minutes = tappedAts.map((t) => Math.floor(minuteOfDay(eventNow(t, shiftMs), timeZone))).sort((a, b) => a - b)
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

// "Release remaining tickets" shows in the ☰ menu from 7:45pm event time (spec §5, §9).
export function releaseOpen(eventNowMs, timeZone) {
  return minuteOfDay(eventNowMs, timeZone) >= 19 * 60 + 45
}

// The rows for the tally sheet and "Add missed kids" (spec §6): [{ start, end }] in event time.
export function slots(from, to, minutes) {
  const rows = []
  for (let m = minutesOf(from); m + minutes <= minutesOf(to); m += minutes) rows.push({ start: hhmm(m), end: hhmm(m + minutes) })
  return rows
}

// Real time (ms) of an event-time "HH:MM" on the event's current date in the zone: what a backfill row means.
export function atEventTime(hhmmText, realNowMs, shiftMs = 0, timeZone) {
  const day = wallClock(eventNow(realNowMs, shiftMs), timeZone)
  const [h, m] = hhmmText.split(':').map(Number)
  const wall = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h, m)
  // The offset at the wall time itself, found from a first guess, so a row across a DST change lands right.
  const guess = wall - offsetAt(wall, timeZone)
  return wall - offsetAt(guess, timeZone) - shiftMs
}

// The TV's costume leaderboard (spec §7): the top 5 costumes by count, ties by their order, in the
// same colours as the phone tiles. Costumes nobody has worn yet still show, at zero.
export function leaderboard(kids, tags, size = 5) {
  const counts = new Map(tags.map((t) => [t.id, 0]))
  for (const k of kids) if (counts.has(k.tagId)) counts.set(k.tagId, counts.get(k.tagId) + 1)
  return [...tags]
    .sort((a, b) => counts.get(b.id) - counts.get(a.id) || a.order - b.order)
    .slice(0, size)
    .map((t) => ({ id: t.id, name: t.name, emoji: t.emoji, colour: tagColour(t.order), count: counts.get(t.id) }))
}

// ---- the end-of-night recap (spec §7 Ended)

// The busiest aligned half-hour in event time ("7:00–7:30 · 104 kids"); the earliest wins a tie.
export function peakHalfHour(kids, shiftMs = 0, timeZone) {
  const counts = new Map()
  for (const k of kids) {
    const slot = Math.floor(minuteOfDay(eventNow(k.tappedAt, shiftMs), timeZone) / 30) * 30
    counts.set(slot, (counts.get(slot) ?? 0) + 1)
  }
  if (!counts.size) return null
  const [slot, count] = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]
  return { start: hhmm(slot), end: hhmm(slot + 30), count }
}

// Visits (spec §2): kids whose taps fall within the Visit window of each other, chained in tap order.
export function visits(kids, windowMs) {
  const sorted = [...kids].sort((a, b) => a.tappedAt - b.tappedAt)
  const groups = []
  for (const k of sorted) {
    const last = groups.at(-1)
    if (last && k.tappedAt - last.at(-1).tappedAt <= windowMs) last.push(k)
    else groups.push([k])
  }
  return groups
}

// "Biggest crew: 9 kids at once · 7:12pm" — the largest visit and when it began.
export function biggestCrew(kids, windowMs) {
  const crew = visits(kids, windowMs).reduce((best, v) => (v.length > (best?.length ?? 0) ? v : best), null)
  return crew ? { size: crew.length, at: crew[0].tappedAt } : null
}

// "Costume of the night 👑": the most-worn costume (ties by order), or none if nobody wore one.
export function costumeOfTheNight(kids, tags) {
  const top = leaderboard(kids, tags, 1)[0]
  return top?.count ? top : null
}

// The rush meter (nice-to-have, ticket 39): kids per minute over the last 5 minutes, by tap time.
const RUSH_WINDOW_MIN = 5
export function rush(kids, realNowMs) {
  const since = realNowMs - RUSH_WINDOW_MIN * 60_000
  const perMinute = Math.round((kids.filter((k) => k.tappedAt > since).length / RUSH_WINDOW_MIN) * 10) / 10
  return { perMinute, level: perMinute >= 3 ? 'rush' : perMinute >= 1 ? 'busy' : 'quiet' }
}

// The race chart's x-axis (minutes into the day, event time): 5:30–8:30pm, stretched to the half-hour
// to take in the earliest tap and "now" (builder's latitude, spec §16), so a daytime test without a
// Clock shift still shows its line instead of an empty chart.
export function raceWindow(kidMinutes, nowMinute) {
  const earliest = Math.min(nowMinute, ...kidMinutes)
  return {
    min: Math.min(17 * 60 + 30, Math.floor(earliest / 30) * 30),
    max: Math.max(20 * 60 + 30, Math.ceil(nowMinute / 30) * 30),
  }
}
