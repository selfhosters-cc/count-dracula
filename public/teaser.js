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

// The idle spooks: huge lines over the whole TV when no kid has come for a while (createTeaser with idleMs
// 2 minutes and showMs 6 s). Fixed, like the word board's phrases.
export const SPOOKS = ['IS ANYONE OUT THERE?', 'WE HAVE CANDY…', 'COME CLOSER…', 'KNOCK IF YOU DARE', 'THE CANDY AWAITS', 'TRICK… OR TREAT?', "DON'T BE SHY", 'THE BOWL IS HUNGRY', 'WE SEE YOU THERE…', 'BOO!']

// SPOOKS shuffled (so two TVs side by side don't say the same thing), or none with the switch off.
export function spookLines(state, random = Math.random) {
  if (state.settings.switches.idleSpooks === false) return []
  const lines = [...SPOOKS]
  for (let i = lines.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[lines[i], lines[j]] = [lines[j], lines[i]]
  }
  return lines
}

// show(line) / hide() render it; lines() supplies what to say when it's time. idleMs and showMs: how long with
// no taps before a line, and how long each stays up (the teaser's 45 s and 8 s unless told).
export function createTeaser({ clock, show, hide, lines, idleMs = IDLE_MS, showMs = SHOW_MS }) {
  let timer = null
  let showing = false
  let paused = false
  let next = 0

  function wait() {
    clock.clearTimeout(timer)
    if (!paused) timer = clock.setTimeout(appear, idleMs)
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
    }, showMs)
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
