// The TV's "No night on right now" screen (spec v2.1 §4): the next Upcoming Event's name, and a countdown when
// it has a Goes live at. Pure: the page calls it every second.
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function noNightLines(next, now) {
  if (!next) return { next: null, countdown: null }
  return { next: `Next up: ${next.name}`, countdown: next.goesLiveAt == null ? null : countdown(next.goesLiveAt - now) }
}

function countdown(ms) {
  if (ms <= 0) return 'Going live any minute'
  if (ms >= 2 * DAY) return `Goes live in ${Math.floor(ms / DAY)} days`
  if (ms >= HOUR) return `Goes live in ${Math.floor(ms / HOUR)} h ${Math.floor((ms % HOUR) / MINUTE)} min`
  const seconds = Math.floor(ms / 1000)
  return `Goes live in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
