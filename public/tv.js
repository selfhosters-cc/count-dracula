// The porch TV: renders the live state and plays what the celebration director decides.
// It never celebrates a snapshot, only deltas (spec §3), and never shows an error screen.
import { connectLive } from '/live.js'
import { formatCode, startPairing } from '/tv-pairing.js'
import { tvNearby } from '/nearby-text.js'
import qrcode from '/vendor/qrcode/qrcode.js'
import { createDirector } from '/director.js'
import { animate } from '/vendor/motion/motion.js'
import confettiLib, { create as createConfetti } from '/vendor/canvas-confetti/confetti.module.js'
import { createRaceChart } from '/race-chart.js'
import { biggestCrew, clockTime, costumeOfTheNight, eventNow, ghost, leaderboard, minuteOfDay, pace, peakHalfHour, rush, tagColour } from '/shared/night-maths.js'
import { createSound } from '/sound.js'
import { createWebAudio } from '/web-audio.js'
import { createTeaser, teaserLines } from '/teaser.js'
import { noNightLines } from '/no-night.js'
import { helperLink, tvQrCodeLine } from '/door-view.js'

const $ = (id) => document.getElementById(id)
const CATCHING_UP_AFTER_MS = 20_000
const ROLL_UP_MS = 2_000

const confetti = createConfetti($('confetti'), { resize: true, useWorker: false })
const clock = { now: () => Date.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id) }

// What this page shows: the TV link's live night (/tv/k/<token>), one past night's recap (/tv?event=<id>,
// for a Manager), or a bare /tv: the TV link it was paired to, or else the pairing screen.
const STORED_LINK = 'cd.tvLink' // { tvToken, deviceToken } from pairing
const tvToken = location.pathname.match(/^\/tv\/k\/([^/]+)/)?.[1] ?? null
const pastEventId = new URLSearchParams(location.search).get('event')
const stored = tvToken || pastEventId ? null : storedLink()
const pairingMode = !tvToken && !pastEventId && !stored

function storedLink() {
  try {
    const link = JSON.parse(localStorage.getItem(STORED_LINK) ?? 'null')
    return link?.tvToken ? link : null
  } catch {
    return null
  }
}

function storeLink(link) {
  try {
    if (link) localStorage.setItem(STORED_LINK, JSON.stringify(link))
    else localStorage.removeItem(STORED_LINK)
  } catch {}
}

// ---- sound (spec §9): the board always shows. While the AudioContext isn't running, a corner pill asks
// for any click, touch or key (a TV remote can't aim at a button). The full-screen "Start the night" is
// only for a night with no kid yet, until sound has been unlocked once on this page load.
const audio = await createWebAudio()
const sound = createSound({ audio, clock })
let kidsCounted = null // unknown until the first snapshot: the pill, not a flash of Start
let unlockedOnce = false
function showStart() {
  const needsSound = !sound.running && !pastEventId && !pairingMode
  const startScreen = needsSound && kidsCounted === 0 && !unlockedOnce
  $('start').hidden = !startScreen
  $('sound-pill').hidden = !needsSound || startScreen
}
audio.onStateChange(showStart)
showStart()
if (sound.running) sound.unlock() // the kiosk's autoplay flag (ticket 37) starts it without a click
// (the mix from the snapshot is applied when it arrives, below)
async function unlockSound() {
  if (sound.running) return
  await sound.unlock()
  if (sound.running) unlockedOnce = true
  showStart()
}
document.addEventListener('pointerdown', unlockSound)
document.addEventListener('keydown', unlockSound)

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
  const merging = show?.kind === 'pop' && playing?.kind === 'pop' && playing.from === show.from
  const ending = playing
  playing = show
  if (show?.kind === 'takeover' || ending?.kind === 'takeover') renderJoinQr() // the takeover wins; the card comes back after
  if (!show) {
    if (ending?.kind === 'takeover') animate($('takeover'), { opacity: 0 }, { duration: 0.4 })
    if (ending?.kind === 'milestone' || ending?.moment === 'milestone') sinkTomb()
    return
  }
  if (show.kind === 'milestone') return playMilestone(show)
  if (show.kind === 'takeover') return playTakeover(show)
  const merged = show.from !== show.to
  sound.cue(merging ? 'scale' : 'bloop', { step: show.to - show.from })
  // The hero number itself pops and throws confetti; nothing covers the chart (the user's change, Oct 10).
  const count = $('count')
  const peak = merged ? 1.4 : 1.3
  animate(count, { scale: [1, peak, 0.95, 1.03, 1] }, { duration: 0.6, times: [0, 0.3, 0.6, 0.8, 1], ease: 'easeOut' })
  animate(count, { color: ['#ffcf3a', getComputedStyle(count.parentElement).color] }, { duration: 0.8 })
  const box = count.getBoundingClientRect()
  confetti({
    particleCount: merged ? 70 : 40,
    spread: merged ? 120 : 90,
    angle: 60, // up and out to the right, over the hero, away from the screen's edge
    startVelocity: merged ? 45 : 38,
    origin: { x: (box.left + box.width / 2) / innerWidth, y: (box.top + box.height / 2) / innerHeight },
    colors: ['#ff7a1a', '#ffcf3a', '#9085e9', '#199e70'],
  })
}

// The headstone with the milestone carved on it (the user's idea while building, Oct 10): small for every
// 50th, giant inside the #100/#200/#300 takeovers.
function raiseTomb(number, { big = false } = {}) {
  const text = `#${number}`
  const size = text.length > 4 ? 78 : 96 // "#1000" still fits the stone
  for (const id of ['tomb-number', 'tomb-number-hi']) {
    $(id).textContent = text
    $(id).setAttribute('font-size', size)
  }
  $('tomb').classList.toggle('big', big)
  animate($('tomb'), { transform: ['translateY(120%) rotate(-4deg)', 'translateY(-4%) rotate(2deg)', 'translateY(0%) rotate(0deg)'] }, { duration: big ? 1.2 : 0.9, ease: 'easeOut' })
}
const sinkTomb = () => animate($('tomb'), { transform: 'translateY(120%)' }, { duration: 0.5, ease: 'easeIn' }) // back underground

// Every 50th: the headstone, emoji confetti and a cartoon organ (spec §8).
function playMilestone({ number }) {
  raiseTomb(number)
  emojiConfetti(['🎃', '🍬', '🦇'], 3)
  sound.cue('sting:50')
}

// #100/#200/#300 and Beat last year: full screen, Creepster headline, fanfare plus a spooky flourish.
const TAKEOVERS = {
  golden: ({ number }) => ['🎫 Golden ticket 🎫', `KID #${number} WINS!`, 'You found a golden ticket! 🍫'],
  milestone: ({ number }) => ['🎃 What a night 🎃', `${number} trick-or-treaters!`, ''], // the giant headstone carries the number
  'beat-last-year': () => {
    const g = live?.state?.ghost
    return ['New record', 'WE BEAT LAST YEAR! 🏆', g ? `${g.label}: ${g.total} kids. Tonight: ${live.state.kids.length} and counting!` : '']
  },
}

function playTakeover(show) {
  const text = TAKEOVERS[show.moment]?.(show)
  if (!text) return
  const gold = show.moment === 'golden'
  const tomb = show.moment === 'milestone'
  ;[$('take-k').textContent, $('take-h').textContent, $('take-s').textContent] = text
  $('takeover').classList.toggle('gold', gold)
  $('takeover').classList.toggle('with-tomb', tomb)
  if (tomb) raiseTomb(show.number, { big: true })
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
  if (inRecap(state)) return verdict(state)
  if (!g) return '' // Race against None: no ghost, no pace line
  const now = minuteOfDay(eventNow(Date.now(), state.event.clockShiftMs ?? 0), state.timeZone)
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
  const entry = live?.state?.settings.soundboard.find((s) => s.slot === slot)
  sound.cue(`board:${slot}`) // the engine keeps it out of the golden fanfare
  const shout = Object.assign(document.createElement('div'), { className: 'shout', textContent: entry?.shout ?? `${label.toUpperCase()}!` })
  $('fx').append(shout)
  animate(shout, { opacity: [0, 1, 1, 0], scale: [0.6, 1.1, 1, 1] }, { duration: 2.4, times: [0, 0.15, 0.8, 1] }).then(() => shout.remove())
  // The icons drift up from below the screen like smoke: random spots, sizes, starts, speeds and sways.
  const icon = entry?.emoji ?? FLYERS[(slot - 1) % FLYERS.length]
  const count = 8 + Math.floor(Math.random() * 4)
  const rand = (lo, hi) => lo + Math.random() * (hi - lo)
  for (let i = 0; i < count; i++) {
    const flyer = Object.assign(document.createElement('div'), { className: 'flyer', textContent: icon })
    flyer.style.left = `${rand(4, 92)}vw`
    flyer.style.fontSize = `${rand(3.5, 8)}vw`
    $('fx').append(flyer)
    const sway = rand(2, 6) * (Math.random() < 0.5 ? -1 : 1)
    animate(
      flyer,
      {
        y: ['110vh', '70vh', '35vh', '-25vh'],
        x: ['0vw', `${sway}vw`, `${-sway * 0.6}vw`, `${sway * 0.4}vw`],
        rotate: [rand(-15, 15), rand(-15, 15), rand(-15, 15), rand(-15, 15)],
        opacity: [0, 0.95, 0.9, 0],
      },
      { duration: rand(3.5, 5.5), delay: rand(0, 1.4), ease: 'easeInOut' },
    ).then(() => flyer.remove())
  }
}

// The soundboard's own recordings, once the snapshot says which files they are.
let boardFilesLoaded = false
function loadBoardFiles(state) {
  if (boardFilesLoaded) return
  boardFilesLoaded = true
  for (const s of state.settings.soundboard ?? []) if (s.file) audio.useFile(`board${s.slot}`, `/${s.file}`)
}

// ---- the pumpkin patch (Must #8): one pumpkin per kid, in its costume's colour, gold for a winner.
// Canvas, redrawn only when something changed or a pumpkin is still popping in.
const POP_IN_MS = 500
const born = new Map() // kid id → when its pumpkin started popping in (live kids only)
let patchState = null
let patchDirty = false

function renderPatch(state) {
  const on = state.settings.switches.pumpkinPatch
  $('board').classList.toggle('no-patch', !on)
  patchState = on ? state : null
  patchDirty = true
}

function drawPumpkin(ctx, x, y, r, colour, gold) {
  ctx.fillStyle = gold ? '#ffcf3a' : colour
  for (const dx of [-0.45, 0.45, 0]) {
    ctx.beginPath()
    ctx.ellipse(x + dx * r, y, r * 0.62, r * 0.82, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.strokeStyle = 'rgba(0,0,0,.28)'
  ctx.lineWidth = Math.max(1, r * 0.08)
  for (const dx of [-0.3, 0.3]) {
    ctx.beginPath()
    ctx.ellipse(x + dx * r, y, r * 0.32, r * 0.78, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.fillStyle = '#3f6b2a'
  ctx.fillRect(x - r * 0.1, y - r * 1.05, r * 0.2, r * 0.32)
  if (gold) {
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(x + r * 0.5, y - r * 0.5, r * 0.14, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawPatch(now) {
  requestAnimationFrame(drawPatch)
  if (!patchState) return
  const popping = [...born.values()].some((t) => now - t < POP_IN_MS)
  if (!patchDirty && !popping) return
  patchDirty = false
  const canvas = $('patch')
  const W = canvas.clientWidth
  const H = canvas.clientHeight
  if (!W || !H) return
  const dpr = Math.min(2, devicePixelRatio || 1)
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
  }
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, W, H)
  const { kids, tags } = patchState
  const colours = new Map(tags.map((t) => [t.id, tagColour(t.order)]))
  const cap = Math.max(kids.length, 160) // early pumpkins stay small; the strip fills up as the night goes
  const cols = Math.ceil(Math.sqrt((cap * W) / H))
  const rows = Math.ceil(cap / cols)
  const cw = W / cols
  const ch = H / rows
  kids.forEach((k, i) => {
    let r = Math.min(cw, ch) * 0.4
    const t = born.get(k.id)
    if (t != null) {
      const age = (now - t) / POP_IN_MS
      if (age < 1) r *= Math.max(0, 1 + Math.sin(age * Math.PI) * 0.6 - (1 - age) * 0.9)
      else born.delete(k.id)
    }
    drawPumpkin(ctx, ((i % cols) + 0.5) * cw, (Math.floor(i / cols) + 0.55) * ch, Math.max(0, r), colours.get(k.tagId) ?? tagColour(null), k.golden)
  })
}
requestAnimationFrame(drawPatch)

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

// ---- 🌙 the ended night: "THAT'S A WRAP" in the top bar, and with Must #9 on, the recap
let wasEnded = false
const NO_NIGHT = { id: null, name: 'Count Dracula', state: null, open: false, live: false, ended: false, past: false, clockShiftMs: 0, visitWindowMs: 15_000 }
const over = (state) => !!(state.event.ended || state.event.past)
const inRecap = (state) => over(state) && state.settings.switches.recap
function renderEnded(state, cause) {
  const ended = over(state)
  $('board').classList.toggle('ended', ended)
  $('board').classList.toggle('recap', inRecap(state))
  $('title').textContent = ended ? `🎃 That's a wrap — ${state.event.name}` : state.event.id == null ? state.event.name : 'Count Dracula'
  if (inRecap(state)) renderCards(state)
  if (ended !== wasEnded) sound.ended(ended, { quietly: cause === 'snapshot' })
  wasEnded = ended
}

// "🏆 New record! +23 on 2025" / "👻 2025 wins this year by 12"
function verdict(state) {
  const g = state.ghost
  if (!g) return ''
  const gap = state.kids.length - g.total
  if (gap > 0) return `🏆 New record! +${gap} on ${g.label}`
  if (gap < 0) return `👻 ${g.label} wins this year by ${-gap}`
  return `🤝 Tied with ${g.label} at ${g.total}`
}

// The four recap cards, from stored data: peak half-hour, biggest crew, costume of the night, golden tickets.
function renderCards(state) {
  const shift = state.event.clockShiftMs ?? 0
  const clock = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number)
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}`
  }
  const at = (ms) => clockTime(ms + shift, state.timeZone).replace(/\s/, '').toLowerCase()
  const card = (k, v, s = '') => `<div class="card"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
  const peak = peakHalfHour(state.kids, shift, state.timeZone)
  const crew = biggestCrew(state.kids, state.event.visitWindowMs ?? 15_000)
  const top = costumeOfTheNight(state.kids, state.tags)
  const tickets = (state.recap?.tickets ?? [])
    .map((t) =>
      t.kidNumber != null
        ? `<span>#${t.kidNumber}${t.state === 'rolled' ? ` <small>rolled forward from #${t.number}</small>` : ''}</span>`
        : `<span class="unclaimed">#${t.number}</span>`,
    )
    .join('')
  $('cards').innerHTML = [
    card('Peak half-hour', peak ? `${clock(peak.start)}–${clock(peak.end)}` : '—', peak ? `${peak.count} kids` : ''),
    card('Biggest crew', crew ? `${crew.size} kids at once` : '—', crew ? at(crew.at) : ''),
    card('Costume of the night 👑', top ? esc(`${top.emoji ?? ''} ${top.name}`.trim()) : '—', top ? `${top.count} kids` : ''),
    state.settings.switches.goldenTickets
      ? `<div class="card"><div class="k">🎫 Golden tickets</div><div class="tickets">${tickets || '<span class="unclaimed">none drawn</span>'}</div></div>`
      : card('Kids tonight', state.kids.length),
  ].join('')
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

// ---- the rush meter (ticket 39): hidden on the recap and when switched off
const RUSH_LABELS = { quiet: 'Quiet', busy: 'Busy', rush: '🔥 RUSH!' }
function renderRush(state) {
  const show = state.settings.switches.rushMeter !== false && !over(state)
  $('rush').hidden = !show
  if (!show) return
  const { perMinute, level } = rush(state.kids, Date.now())
  $('rush').className = `rush ${level}`
  $('rush-label').textContent = RUSH_LABELS[level]
  $('rush-fill').style.width = `${Math.min(100, (perMinute / 6) * 100)}%`
  $('rush-rate').textContent = `${perMinute} kids/min`
}

function renderRace(state) {
  // A recap's chart is the finished race: "now" is the night's last tap, not today's clock.
  const until = inRecap(state) && state.kids.length ? Math.max(...state.kids.map((k) => k.tappedAt)) : Date.now()
  race.update(state, until)
  $('pace').textContent = paceText(state)
  renderRush(state)
  $('legend').innerHTML = state.ghost
    ? `<span><i style="border-top: 6px solid var(--pumpkin)"></i>Tonight</span>` +
      `<span><i style="border-top: 4px dashed #c9d2ff"></i>${state.ghost.label}</span>`
    : ''
}

// ---- the idle teaser: silent, gone on any tap, paused while ended or disconnected
const teaser = createTeaser({
  clock,
  show: (line) => {
    $('teaser').textContent = line
    animate($('teaser'), { transform: 'translateY(0%)' }, { duration: 0.6, ease: 'easeOut' })
  },
  hide: () => animate($('teaser'), { transform: 'translateY(-110%)' }, { duration: 0.4 }),
  lines: () => (live?.state ? teaserLines(live.state, Date.now()) : []),
})
const quietOrAway = (state) => !live?.connected || over(state) || state.event.id == null

// ---- live state (or, with /tv?event=<id>, one past night's recap from stored data). A TV link reads with its
// token; a paired bare /tv adds its device token, which marks it as the Household's own TV.
const streamUrl = () => {
  const query = new URLSearchParams({ key: tvToken ?? stored.tvToken })
  if (stored?.deviceToken) query.set('device', stored.deviceToken)
  return `/api/stream?${query}`
}
const live = pastEventId || pairingMode ? null : connectLive(streamUrl())
live?.onRefused(() => {
  // A paired bare /tv whose link was rotated, or whose Household is gone: forget it and pair again.
  if (stored) {
    storeLink(null)
    return location.reload()
  }
  $('unavailable').hidden = false // a rotated link, or a Household that's gone: nothing to say about which
  $('start').hidden = true
  $('sound-pill').hidden = true
})

// A cap turned this screen away (spec §15): say so, calmly; live.js tries again, backing off.
live?.onBusy(() => ($('tv-full').hidden = false))
live?.on(({ cause }) => {
  if (cause === 'snapshot') $('tv-full').hidden = true
  // With no Event open (spec v2.1 §4) the snapshot has no event: an empty board stands behind the "No night on
  // right now" screen. Registered first, so every handler sees it.
  if (live.state && !live.state.event) live.state = { ...live.state, event: NO_NIGHT }
  if (live.state) renderNoNight(live.state)
})

// "No night on right now", with the next Upcoming Event and its countdown (redrawn every second, below).
function renderNoNight(state) {
  const none = state.event.id == null
  $('no-night').hidden = !none
  if (!none) return
  const lines = noNightLines(state.next, Date.now())
  $('no-night-next').textContent = lines.next ?? ''
  $('no-night-countdown').textContent = lines.countdown ?? ''
}

// The door's Event moved (spec v2.1 §4): quietly, with no banner. Whatever is playing for the old board stops
// and is never finished over the new one; the new board's count is set, not rolled.
let onScreen // the Event id on screen (null: none open); undefined until the first snapshot
function cutOff() {
  director.cut()
  sound.cut()
  clearTimeout(bannerTimer)
  $('banner').style.transform = 'translateY(-110%)'
  $('takeover').style.opacity = 0
  $('tomb').style.transform = 'translateY(120%)'
  $('fx').replaceChildren()
  confetti.reset()
  born.clear()
  shown = null
  wasDisconnected = false
}

// ---- the pairing screen (spec §9): a code and a QR until a Manager redeems it, then the board
if (pairingMode) {
  $('pairing').hidden = false
  $('pair-where').textContent = location.host // the homepage's one code box (spec v2.1 §11)
  startPairing({
    show({ code }) {
      $('pair-code').textContent = formatCode(code)
      const qr = qrcode(0, 'M')
      qr.addData(`${location.origin}/setup?pair=${code}`)
      qr.make()
      $('pair-qr').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true })
    },
    onPaired({ tvToken, deviceToken }) {
      storeLink({ tvToken, deviceToken })
      location.reload()
    },
  })
}
let wasDisconnected = false

// ---- the helper join QR (spec v2.1 §4): only a paired TV is ever sent it, for 2 minutes from a door phone or
// /setup. No sound. It steps aside for a takeover and comes back after.
const JOIN_QR_MS = 2 * 60_000
let qrDrawnFor = null // the key and Household the card was drawn for
function renderJoinQr() {
  const q = live?.state?.joinQr
  const left = q ? q.until - Date.now() : 0
  const on = left > 0 && playing?.kind !== 'takeover'
  $('join-qr').hidden = !on
  if (!on) return
  if (qrDrawnFor !== `${q.key}|${q.household}`) {
    qrDrawnFor = `${q.key}|${q.household}`
    const qr = qrcode(0, 'M')
    qr.addData(helperLink(location.origin, q.key))
    qr.make()
    $('jq-code').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true })
    $('jq-for').textContent = `Scan to count kids for ${q.household}`
    const line = tvQrCodeLine(q.key, location.origin)
    $('jq-line').replaceChildren(line.slice(0, line.lastIndexOf(q.key)), Object.assign(document.createElement('b'), { textContent: q.key }))
  }
  $('jq-fill').style.transform = `scaleX(${Math.min(1, left / JOIN_QR_MS)})`
}

// The nearby box (spec §11, v2.1 §10): only with an Area's figures; nothing without another house counting nearby or without a Location.
function renderNearby(state) {
  const text = tvNearby(state.nearby)
  $('nearby').hidden = !text
  $('nearby-text').textContent = text ?? ''
}

function renderSnapshot(state, cause) {
  renderNearby(state)
  // First load shows the count as is; a reconnect rolls up quietly to the new total.
  showCount(state.kids.length, wasDisconnected && shown != null ? 'roll' : 'set')
  wasDisconnected = false
  renderRace(state)
  renderGoldenPill(state)
  renderLeaderboard(state)
  renderPatch(state)
  applyMix(state)
  loadBoardFiles(state)
  renderEnded(state, cause)
}

if (pastEventId) {
  fetch(`/api/snapshot?event=${encodeURIComponent(pastEventId)}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((state) => renderSnapshot(state, 'snapshot'))
    .catch(() => ($('title').textContent = 'No such event'))
}

live?.on(({ state, cause, delta }) => {
  if (cause === 'disconnected') {
    wasDisconnected = true
    teaser.pause(true)
    return // stay frozen: no error screen, spinner or red
  }
  if (cause === 'nearby') return renderNearby(state)
  if (cause === 'joinQr') return renderJoinQr()
  teaser.pause(quietOrAway(state))
  kidsCounted = state.event.id == null ? null : state.kids.length // no night on: no "Start the night"
  showStart()
  if (cause === 'snapshot') {
    if (onScreen !== undefined && state.event.id !== onScreen) cutOff()
    onScreen = state.event.id
    teaser.activity() // (re)connected: the 45 s count from now
    renderJoinQr() // a TV that reconnects mid-way shows the card with the time left
    return renderSnapshot(state, cause)
  }
  if (delta.type === 'next.changed') return renderNoNight(state)
  const total = state.kids.length
  if (delta.type === 'event.ended') {
    renderGoldenPill(state) // End expires the tickets left; Resume brings them back
    renderEnded(state, cause)
    return renderRace(state) // the hero's pace line becomes the verdict (and back on Resume)
  }
  if (delta.type === 'soundboard') return playBoard(delta)
  if (delta.type === 'mix.changed') return applyMix(state)
  renderRace(state)
  renderGoldenPill(state)
  renderLeaderboard(state)
  renderPatch(state)
  if (inRecap(state)) renderCards(state) // a straggler: it pops, and the recap keeps up
  if (delta.type === 'kid.added') {
    teaser.activity() // any tap cancels the teaser and starts the 45 s over
    if (!delta.kid.late) born.set(delta.kid.id, performance.now()) // late kids appear quietly
    showCount(total, delta.kid.late ? 'roll' : 'set') // the director's pop does the bounce
    director.push(delta.moments ?? [], delta.kid)
  } else if (delta.type === 'kid.removed' || delta.type === 'kids.removed') {
    showCount(total, 'dip')
  } else if (delta.type === 'moment') {
    director.push(delta.moments)
  } else if (delta.type === 'tag.added' && delta.newCostume) {
    showNewCostume(delta.newCostume)
  }
})

// ---- stay awake: a screen Wake Lock on HTTPS (a bonus; the laptop's own settings are what's relied on)
async function keepAwake() {
  if (!('wakeLock' in navigator) || !isSecureContext || document.visibilityState !== 'visible') return
  try {
    await navigator.wakeLock.request('screen')
  } catch {} // refused (battery saver, policy): the OS settings still hold
}
keepAwake()
document.addEventListener('visibilitychange', keepAwake) // the lock drops whenever the page is hidden

// ---- /tv?border: a test pattern for checking overscan on the real TV (spec §14)
if (new URLSearchParams(location.search).has('border')) document.body.classList.add('overscan-test')

// ---- the 🦇 chip and the clock
setInterval(() => {
  if (!live) return
  $('catching-up').classList.toggle('on', !live.connected && live.disconnectedFor >= CATCHING_UP_AFTER_MS)
  const shift = live.state?.event.clockShiftMs ?? 0 // the clock shows event time, in the Household's zone
  $('clock').textContent = clockTime(eventNow(Date.now(), shift), live.state?.timeZone)
  if (live.state && live.state.event.id == null) renderNoNight(live.state)
  renderJoinQr() // the countdown bar, and gone when time's up
}, 1_000)

// The ghost marker and tonight's line creep along with the clock.
setInterval(() => {
  if (live?.state && live.connected && !over(live.state)) renderRace(live.state)
}, 5_000)
