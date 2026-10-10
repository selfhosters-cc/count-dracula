// The porch TV: renders the live state and plays what the celebration director decides.
// It never celebrates a snapshot, only deltas (spec §3), and never shows an error screen.
import { connectLive } from '/live.js'
import { createDirector } from '/director.js'
import { animate } from '/vendor/motion/motion.js'
import confettiLib, { create as createConfetti } from '/vendor/canvas-confetti/confetti.module.js'
import { createRaceChart } from '/race-chart.js'
import { eventNow, ghost, leaderboard, minuteOfDay, pace } from '/shared/night-maths.js'
import { createSound } from '/sound.js'
import { createWebAudio } from '/web-audio.js'

const $ = (id) => document.getElementById(id)
const CATCHING_UP_AFTER_MS = 20_000
const ROLL_UP_MS = 2_000

const confetti = createConfetti($('confetti'), { resize: true, useWorker: false })
const clock = { now: () => Date.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id) }

// ---- sound: "Start the night" whenever the AudioContext isn't running; one click unlocks it
const audio = await createWebAudio()
const sound = createSound({ audio, clock })
const showStart = () => ($('start').hidden = sound.running)
audio.onStateChange(showStart)
showStart()
if (sound.running) sound.unlock() // the kiosk's autoplay flag (ticket 37) starts it without a click
// (the mix from the snapshot is applied when it arrives, below)
$('start').addEventListener('click', async () => {
  await sound.unlock()
  showStart()
})

// ---- the giant count: set, bump, quiet roll-up, quiet dip
let shown = null // the number on screen
let roll = null
function showCount(target, mode) {
  roll?.stop()
  const el = $('count')
  if (mode === 'set' || shown == null) {
    shown = target
    el.textContent = target
    return
  }
  if (mode === 'roll' && target !== shown) {
    if (target > shown) sound.cue('tick') // one soft tick for a backlog (the engine keeps it to one)
    const from = Number(el.textContent) // mid-roll, carry on from what's on screen
    shown = target
    roll = animate(from, target, {
      duration: Math.min(ROLL_UP_MS, Math.abs(target - from) * 150) / 1000,
      ease: 'easeOut',
      onUpdate: (v) => (el.textContent = Math.round(v)),
    })
    return
  }
  shown = target
  el.textContent = target
  if (mode === 'bump') animate(el, { scale: [1, 1.12, 1] }, { duration: 0.35 })
  if (mode === 'dip') animate(el, { opacity: [1, 0.55, 1], y: [0, 6, 0] }, { duration: 0.6 })
}

// ---- celebrations: the director decides, this renders (and cues the sound)
let playing = null
function play(show) {
  const pop = $('pop')
  const merging = show?.kind === 'pop' && playing?.kind === 'pop' && playing.from === show.from
  const ending = playing
  playing = show
  if (!show) {
    if (ending?.kind === 'takeover') animate($('takeover'), { opacity: 0 }, { duration: 0.4 })
    else animate(pop, { opacity: 0, scale: 0.9 }, { duration: 0.25 })
    return
  }
  if (show.kind === 'milestone') return playMilestone(show)
  if (show.kind === 'takeover') return playTakeover(show)
  pop.classList.remove('ms')
  const merged = show.from !== show.to
  sound.cue(merging ? 'scale' : 'bloop', { step: show.to - show.from })
  pop.innerHTML = merged ? `<small>Welcome, kids</small>#${show.from}–${show.to}!` : `<small>You're kid</small>#${show.from}!`
  animate(pop, { opacity: 1, scale: [0.3, 1] }, { type: 'spring', bounce: 0.5, duration: 0.45 })
  confetti({
    particleCount: merged ? 60 : 30,
    spread: merged ? 110 : 90,
    startVelocity: merged ? 50 : 43,
    origin: { y: 0.7 },
    colors: ['#ff7a1a', '#ffcf3a', '#9085e9', '#199e70'],
  })
}

// Every 50th: the big white chip, emoji confetti and a cartoon organ (spec §8).
function playMilestone({ number }) {
  const pop = $('pop')
  pop.classList.add('ms')
  pop.innerHTML = `<small>Milestone</small>#${number}! 🎉`
  animate(pop, { opacity: 1, scale: [0.3, 1] }, { type: 'spring', bounce: 0.5, duration: 0.5 })
  emojiConfetti(['🎃', '🍬'], 3)
  sound.cue('sting:50')
}

// #100/#200/#300 and Beat last year: full screen, Creepster headline, fanfare plus a spooky flourish.
const TAKEOVERS = {
  golden: ({ number }) => ['🎫 Golden ticket 🎫', `KID #${number} WINS!`, 'You found a golden ticket! 🍫'],
  milestone: ({ number }) => ['Milestone', `KID #${number}!`, `${number} trick-or-treaters tonight 🎃`],
  'beat-last-year': () => {
    const g = live.state?.ghost
    return ['New record', 'WE BEAT LAST YEAR! 🏆', g ? `${g.label}: ${g.total} kids. Tonight: ${live.state.kids.length} and counting!` : '']
  },
}

function playTakeover(show) {
  const text = TAKEOVERS[show.moment]?.(show)
  if (!text) return
  const gold = show.moment === 'golden'
  ;[$('take-k').textContent, $('take-h').textContent, $('take-s').textContent] = text
  $('takeover').classList.toggle('gold', gold)
  animate($('takeover'), { opacity: 1 }, { duration: 0.4 })
  animate($('take-h'), { scale: [2.2, 1], opacity: [0, 1] }, { type: 'spring', bounce: 0.45, duration: 0.7 })
  const emoji = gold ? ['🎫', '🍫', '⭐'] : ['🎃', '👻', '🍬']
  emojiConfetti(emoji, 6)
  setTimeout(() => emojiConfetti(emoji, 5), 700)
  sound.cue(gold ? 'golden' : 'fanfare')
}

function emojiConfetti(emoji, power) {
  let shapes
  try {
    shapes = emoji.map((text) => confettiLib.shapeFromText({ text, scalar: 3 }))
  } catch {}
  confetti({
    particleCount: 30 * power,
    spread: 70 + 20 * power,
    startVelocity: 35 + 8 * power,
    origin: { y: 0.7 },
    ...(shapes?.length ? { shapes, scalar: 3 } : { colors: ['#ff7a1a', '#ffcf3a', '#9085e9', '#199e70'] }),
  })
}

const director = createDirector({ clock, play })

// ---- the race: chart, legend and the hero's pace line, redrawn in the same pass as the count
const race = createRaceChart($('race'))

function paceText(state) {
  const g = state.ghost
  if (!g) return '' // Race against None: no ghost, no pace line
  const now = minuteOfDay(eventNow(Date.now(), state.event.clockShiftMs ?? 0))
  const p = pace(state.kids.length, ghost(g.buckets)(now), g.total)
  if (p.kind === 'record') return '🏆 New record!'
  if (p.kind === 'level') return "👻 Neck and neck with last year's ghost"
  return p.kind === 'ahead' ? `👻 ${p.by} ahead of last year's ghost` : `👻 ${p.by} behind last year's ghost`
}

// ---- "NEW COSTUME SPOTTED!" (Must #6): an overlay, so it never waits behind or stomps on the pop
let bannerTimer
function showNewCostume({ name, emoji, count }) {
  $('banner-text').textContent = `${emoji ?? ''} ${name} ×${count}`.trim()
  animate($('banner'), { transform: 'translateY(0%)' }, { type: 'spring', bounce: 0.35, duration: 0.5 })
  sound.cue('ding')
  clearTimeout(bannerTimer)
  bannerTimer = setTimeout(() => animate($('banner'), { transform: 'translateY(-110%)' }, { duration: 0.4 }), 4_000)
}

// ---- the soundboard (Must #7): its own layer, so it never waits for or interrupts the queue
const FLYERS = ['🦇', '🐺', '🎃', '👻', '🚪', '⚡']
function playBoard({ slot, label }) {
  const entry = live.state?.settings.soundboard.find((s) => s.slot === slot)
  sound.cue(`board:${slot}`) // the engine keeps it out of the golden fanfare
  const shout = Object.assign(document.createElement('div'), { className: 'shout', textContent: entry?.shout ?? `${label.toUpperCase()}!` })
  $('fx').append(shout)
  animate(shout, { opacity: [0, 1, 1, 0], scale: [0.6, 1.1, 1, 1] }, { duration: 2.4, times: [0, 0.15, 0.8, 1] }).then(() => shout.remove())
  for (let i = 0; i < 5; i++) {
    const flyer = Object.assign(document.createElement('div'), { className: 'flyer', textContent: entry?.emoji ?? FLYERS[(slot - 1) % FLYERS.length] })
    flyer.style.top = `${10 + i * 12}vh`
    $('fx').append(flyer)
    animate(flyer, { x: ['-15vw', '55vw', '120vw'], y: [0, '-18vh', '4vh'], rotate: [-10, 8, -6] }, { duration: 2.4, delay: i * 0.15, ease: 'linear' }).then(() => flyer.remove())
  }
}

// The soundboard's own recordings, once the snapshot says which files they are.
let boardFilesLoaded = false
function loadBoardFiles(state) {
  if (boardFilesLoaded) return
  boardFilesLoaded = true
  for (const s of state.settings.soundboard ?? []) if (s.file) audio.useFile(`board${s.slot}`, `/${s.file}`)
}

// ---- the costume leaderboard (Must #5): top 5 bars, keyed by costume so an overtake slides into place
const lbRows = new Map()
function renderLeaderboard(state) {
  const on = state.settings.switches.costumeLeaderboard
  $('board').classList.toggle('no-leaderboard', !on)
  if (!on) return
  const board = leaderboard(state.kids, state.tags)
  const max = Math.max(1, ...board.map((r) => r.count))
  const box = $('leaderboard')
  if (!board.length) {
    box.innerHTML = '<div class="lb-empty">Costumes show up here as the helpers add them.</div>'
    lbRows.clear()
    return
  }
  box.querySelector('.lb-empty')?.remove()
  for (const [id, row] of lbRows) if (!board.some((r) => r.id === id)) (row.remove(), lbRows.delete(id))
  board.forEach((r, rank) => {
    let row = lbRows.get(r.id)
    if (!row) {
      row = Object.assign(document.createElement('div'), { className: 'lb-row' })
      row.innerHTML = '<div class="lb-name"></div><div class="lb-track"><div class="lb-bar"></div><div class="lb-val num"></div></div>'
      row.style.top = `${rank * 20}%`
      box.append(row)
      lbRows.set(r.id, row)
    }
    const share = (r.count / max) * 88 // leave room for the number at the end of the longest bar
    row.style.top = `${rank * 20}%`
    row.querySelector('.lb-name').textContent = `${r.emoji ?? ''} ${r.name}`.trim()
    row.querySelector('.lb-bar').style.cssText = `width: ${share}%; background: ${r.colour}`
    const val = row.querySelector('.lb-val')
    val.textContent = r.count
    val.style.left = `${share}%`
  })
}

// The only golden thing the TV knows before a win: how many are left (spec §9).
function renderGoldenPill(state) {
  const left = state.golden?.left ?? 0
  $('golden-pill').hidden = !left
  $('golden-left').textContent = left
}

// The ☰ menu's volume and mutes: into the sound engine, and 🔇 in the top bar while any mute is on.
function applyMix(state) {
  const mix = state.settings.mix
  if (!mix) return
  sound.mix(mix)
  $('muted').hidden = !Object.values(mix.mutes).some(Boolean)
}

function renderRace(state, animate = true) {
  race.update(state, Date.now(), animate)
  $('pace').textContent = paceText(state)
  $('legend').innerHTML = state.ghost
    ? `<span><i style="border-top: 6px solid var(--pumpkin)"></i>Tonight</span>` +
      `<span><i style="border-top: 4px dashed #c9d2ff"></i>${state.ghost.label}</span>`
    : ''
}

// ---- live state
const live = connectLive()
let wasDisconnected = false

live.on(({ state, cause, delta }) => {
  if (cause === 'disconnected') {
    wasDisconnected = true
    return // stay frozen: no error screen, spinner or red
  }
  const total = state.kids.length
  if (cause === 'snapshot') {
    // First load shows the count as is; a reconnect rolls up quietly to the new total.
    showCount(total, wasDisconnected && shown != null ? 'roll' : 'set')
    wasDisconnected = false
    renderRace(state)
    renderGoldenPill(state)
    renderLeaderboard(state)
    applyMix(state)
    loadBoardFiles(state)
    return
  }
  if (delta.type === 'soundboard') return playBoard(delta)
  if (delta.type === 'mix.changed') return applyMix(state)
  renderRace(state)
  renderGoldenPill(state)
  renderLeaderboard(state)
  if (delta.type === 'kid.added') {
    showCount(total, delta.kid.late ? 'roll' : 'bump')
    director.push(delta.moments ?? [], delta.kid)
  } else if (delta.type === 'kid.removed' || delta.type === 'kids.removed') {
    showCount(total, 'dip')
  } else if (delta.type === 'moment') {
    director.push(delta.moments)
  } else if (delta.type === 'tag.added' && delta.newCostume) {
    showNewCostume(delta.newCostume)
  }
})

// ---- the 🦇 chip and the clock
setInterval(() => {
  $('catching-up').classList.toggle('on', !live.connected && live.disconnectedFor >= CATCHING_UP_AFTER_MS)
  const shift = live.state?.event.clockShiftMs ?? 0 // the clock shows event time
  $('clock').textContent = new Date(eventNow(Date.now(), shift)).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}, 1_000)

// The ghost marker and tonight's line creep along with the clock.
setInterval(() => {
  if (live.state && live.connected) renderRace(live.state, false)
}, 5_000)
