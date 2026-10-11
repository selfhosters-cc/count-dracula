// The idle teaser (spec §7 States): after 45 s with no taps, a calm top banner shows one line, hides,
// and repeats every ~45 s. Silent. Any tap cancels it; it doesn't run when ended or disconnected.
import { eventNow, ghost, minuteOfDay } from '../shared/night-maths.js'

const IDLE_MS = 45_000
const SHOW_MS = 8_000

// The lines it rotates through right now. The ghost's number comes from the same curve and event time
// as the race chart's 👻 marker.
export function teaserLines(state, realNowMs) {
  const lines = []
  const count = state.kids.length
  const left = state.golden?.left ?? 0
  if (state.settings.switches.goldenTickets && left > 0) {
    lines.push(`🎫 ${left} golden ticket${left === 1 ? '' : 's'} still hidden — could be YOU!`)
  }
  if (state.ghost) {
    const then = Math.round(ghost(state.ghost.buckets)(minuteOfDay(eventNow(realNowMs, state.event.clockShiftMs ?? 0), state.timeZone)))
    const tail = count < then ? 'help us catch up!' : count > then ? `we're ${count - then} ahead!` : "we're neck and neck!"
    lines.push(`👻 Last year had ${then} kids by now — ${tail}`)
  }
  if (state.settings.switches.milestones) lines.push(`Next milestone: kid #${(Math.floor(count / 50) + 1) * 50}!`)
  return lines
}

// show(line) / hide() render it; lines() supplies what to say when it's time.
export function createTeaser({ clock, show, hide, lines }) {
  let timer = null
  let showing = false
  let paused = false
  let next = 0

  function wait() {
    clock.clearTimeout(timer)
    if (!paused) timer = clock.setTimeout(appear, IDLE_MS)
  }

  function appear() {
    const options = lines()
    if (!options.length) return wait()
    show(options[next++ % options.length])
    showing = true
    timer = clock.setTimeout(() => {
      hide()
      showing = false
      wait()
    }, SHOW_MS)
  }

  function stop() {
    clock.clearTimeout(timer)
    if (showing) hide()
    showing = false
  }

  return {
    // Any tap (a kid arriving): hide at once, and the 45 s start over.
    activity() {
      stop()
      wait()
    },
    pause(on) {
      if (on === paused) return // told again on every live update: only a change matters
      paused = on
      if (on) stop()
      else wait()
    },
  }
}
