// The Night summary's figures (v2 spec §12), worked out once from a night's stored data: the same functions,
// and so the same numbers, as the TV's end-of-night recap, read in the Household's zone.
import { biggestCrew, clockTime, costumeOfTheNight, eventNow, leaderboard, minuteOfDay, peakHalfHour } from './night-maths.js'

// summary: what /api/summary answers (or a share link's page).
export function nightFacts(summary) {
  const { event, kids, tags, ghost, timeZone } = summary
  const shift = event.clockShiftMs ?? 0
  const time = (ms) => clockTime(ms + shift, timeZone).replace(/\s/, '').toLowerCase()
  const clock = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number)
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}`
  }
  const total = kids.length
  const times = kids.map((k) => k.tappedAt)
  const first = total ? Math.min(...times) : null
  const last = total ? Math.max(...times) : null
  const peak = peakHalfHour(kids, shift, timeZone)
  const crew = biggestCrew(kids, event.visitWindowMs ?? 15_000)
  const gap = ghost ? total - ghost.total : null

  // The receipt's barcode: kids per minute of event time, from the first kid's minute to the last's (a night
  // that runs past midnight wraps round).
  const perMinute = []
  if (total) {
    const minute = (ms) => Math.floor(minuteOfDay(eventNow(ms, shift), timeZone))
    const from = minute(first)
    const length = ((minute(last) - from + 1440) % 1440) + 1
    for (let i = 0; i < length; i++) perMinute.push(0)
    for (const t of times) perMinute[(minute(t) - from + 1440) % 1440]++
  }

  return {
    displayName: summary.displayName,
    night: event.name,
    total,
    first,
    last,
    span: total ? `${time(first)} – ${time(last)}` : '',
    peak,
    peakText: peak ? `${clock(peak.start)}–${clock(peak.end)}` : '—',
    crew,
    crewAt: crew ? time(crew.at) : '',
    top: costumeOfTheNight(kids, tags),
    board: leaderboard(kids, tags, Infinity).filter((t) => t.count),
    untagged: kids.filter((k) => k.tagId == null).length,
    teens: kids.filter((k) => k.teen).length,
    won: (summary.recap?.tickets ?? []).filter((t) => t.kidNumber != null).map((t) => t.kidNumber),
    tickets: summary.recap?.tickets ?? [],
    ghost,
    gap,
    // The TV recap's wording, so the two agree.
    verdict: !ghost ? null : gap > 0 ? `🏆 New record! +${gap} on ${ghost.label}` : gap < 0 ? `👻 ${ghost.label} wins this year by ${-gap}` : `🤝 Tied with ${ghost.label} at ${ghost.total}`,
    numberToBeat: total,
    perMinute,
    nearby: summary.nearby ?? null,
  }
}
