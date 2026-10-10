// The porch TV: renders the live state and plays what the celebration director decides.
// It never celebrates a snapshot, only deltas (spec §3), and never shows an error screen.
import { connectLive } from '/live.js'
import { createDirector } from '/director.js'
import { animate } from '/vendor/motion/motion.js'
import { create as createConfetti } from '/vendor/canvas-confetti/confetti.module.js'

const $ = (id) => document.getElementById(id)
const CATCHING_UP_AFTER_MS = 20_000
const ROLL_UP_MS = 2_000

const confetti = createConfetti($('confetti'), { resize: true, useWorker: false })

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

// ---- celebrations: the director decides, this renders
function play(show) {
  const pop = $('pop')
  if (!show) {
    animate(pop, { opacity: 0, scale: 0.9 }, { duration: 0.25 })
    return
  }
  if (show.kind !== 'pop') return // milestones and takeovers render in their own tickets
  const merged = show.from !== show.to
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

const director = createDirector({
  clock: { now: () => Date.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id) },
  play,
})

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
    return
  }
  if (delta.type === 'kid.added') {
    showCount(total, delta.kid.late ? 'roll' : 'bump')
    director.push(delta.moments ?? [], delta.kid)
  } else if (delta.type === 'kid.removed') {
    showCount(total, 'dip')
  } else if (delta.type === 'moment') {
    director.push(delta.moments)
  }
})

// ---- the 🦇 chip and the clock
setInterval(() => {
  $('catching-up').classList.toggle('on', !live.connected && live.disconnectedFor >= CATCHING_UP_AFTER_MS)
  $('clock').textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}, 1_000)
