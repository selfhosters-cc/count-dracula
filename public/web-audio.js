// The sound engine's Web Audio adapter. Chain: voices → fx bus ─┐
//                                            ambience loop → ambience bus ─┴→ master gain → compressor → out
// Files come from /sounds/manifest.json ({ slot: "file.mp3" }); any slot without one gets a generated
// sound, so missing assets never block the build (spec §10 Fallbacks).

const RATE = 44_100
const AMBIENCE_BASE = 0.22 // the loop sits well under everything

// Generated fallbacks, rendered once at start with an OfflineAudioContext.
const GENERATORS = {
  bloop: { seconds: 0.25, draw: bloop },
  note: { seconds: 0.2, draw: pluck },
  tick: { seconds: 0.08, draw: tick },
  sting50: { seconds: 1.6, draw: organSting },
  fanfare: { seconds: 3, draw: fanfare },
  golden: { seconds: 4, draw: goldenFanfare },
  ding: { seconds: 0.7, draw: dingDing },
  close: { seconds: 2.5, draw: closingSting },
  // Soundboard fallbacks until the real (mostly homemade) recordings land: rough cartoon versions.
  board1: { seconds: 2.2, draw: (ctx) => cackle(ctx) },
  board2: { seconds: 2.6, draw: (ctx) => howl(ctx) },
  board3: { seconds: 1.6, draw: (ctx) => cheer(ctx) },
  board4: { seconds: 1.6, draw: (ctx) => scream(ctx) },
  board5: { seconds: 1.8, draw: (ctx) => creak(ctx) },
  board6: { seconds: 3, draw: (ctx, s) => thunder(ctx, s) },
  ambience: { seconds: 8, draw: nightLoop },
}

export async function createWebAudio({ manifestUrl = '/sounds/manifest.json' } = {}) {
  const ctx = new AudioContext({ latencyHint: 'interactive' })
  const compressor = new DynamicsCompressorNode(ctx, { threshold: -14, knee: 8, ratio: 6, attack: 0.003, release: 0.2 })
  const master = new GainNode(ctx, { gain: 1 })
  const buses = { master, fx: new GainNode(ctx), ambience: new GainNode(ctx), board: new GainNode(ctx) }
  buses.fx.connect(master)
  buses.ambience.connect(master)
  buses.board.connect(master)
  master.connect(compressor).connect(ctx.destination)

  const manifest = await fetch(manifestUrl).then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
  const buffers = Object.fromEntries(
    await Promise.all(Object.keys(GENERATORS).map(async (slot) => [slot, await loadSlot(ctx, slot, manifest[slot])])),
  )

  let ambienceSource = null
  const listeners = new Set()
  ctx.addEventListener('statechange', () => listeners.forEach((fn) => fn(ctx.state)))

  return {
    get state() {
      return ctx.state
    },
    onStateChange(fn) {
      listeners.add(fn)
    },
    resume: () => ctx.resume(),

    // Swap a slot's generated sound for a real file (the soundboard's, named in the server config).
    // A soundboard file named in the server config, for a slot the manifest leaves to it.
    async useFile(slot, path) {
      if (manifest[slot]) return // the manifest wins
      try {
        const res = await fetch(path)
        if (res.ok) buffers[slot] = shape(await ctx.decodeAudioData(await res.arrayBuffer()), {})
      } catch {}
    },

    voice(slot, { gain, detune, bus = 'fx' }) {
      const source = new AudioBufferSourceNode(ctx, { buffer: buffers[slot], detune })
      source.connect(new GainNode(ctx, { gain })).connect(buses[bus])
      source.start()
      return {
        duration: buffers[slot].duration / 2 ** (detune / 1200),
        stop: () => {
          try {
            source.stop()
          } catch {} // already ended
        },
      }
    },

    ramp(bus, level, seconds) {
      const param = buses[bus].gain
      const now = ctx.currentTime
      param.cancelScheduledValues(now)
      param.setValueAtTime(param.value, now)
      param.linearRampToValueAtTime(level, now + seconds)
    },

    ambience(on) {
      if (on && !ambienceSource) {
        ambienceSource = new AudioBufferSourceNode(ctx, { buffer: buffers.ambience, loop: true })
        ambienceSource.connect(new GainNode(ctx, { gain: AMBIENCE_BASE })).connect(buses.ambience)
        ambienceSource.start()
      } else if (!on && ambienceSource) {
        ambienceSource.stop()
        ambienceSource = null
      }
    },
  }
}

// One slot's sound: its file from the manifest, else the generated fallback. A manifest entry is
// "file.ogg" or { file, start, length, gain } (seconds; files live under /sounds/). Files are trimmed and
// evened out to the same loudness unless the entry sets a gain (spec §10 "normalised loudness").
export async function loadSlot(ctx, slot, entry) {
  const spec = typeof entry === 'string' ? { file: entry } : entry
  if (spec?.file) {
    try {
      const res = await fetch(`/sounds/${spec.file}`)
      if (res.ok) return shape(await ctx.decodeAudioData(await res.arrayBuffer()), spec)
    } catch {}
  }
  const { seconds, draw } = GENERATORS[slot]
  const offline = new OfflineAudioContext(1, Math.ceil(seconds * RATE), RATE)
  draw(offline, seconds)
  return offline.startRendering()
}

export const SLOTS = Object.keys(GENERATORS)

const TARGET_DB = -16 // RMS of the audible part, for every file
const FADE_S = 0.04

function shape(buffer, { start = 0, length, gain }) {
  const sr = buffer.sampleRate
  const from = Math.min(buffer.length - 1, Math.max(0, Math.round(start * sr)))
  const to = length == null ? buffer.length : Math.min(buffer.length, from + Math.round(length * sr))
  const out = new AudioBuffer({ length: Math.max(1, to - from), numberOfChannels: buffer.numberOfChannels, sampleRate: sr })
  const first = buffer.getChannelData(0).subarray(from, to)
  let sum = 0
  let audible = 0
  let peak = 0
  for (const x of first) {
    const a = Math.abs(x)
    if (a > peak) peak = a
    if (a > 0.01) (sum += x * x), audible++
  }
  const rms = Math.sqrt(sum / Math.max(1, audible))
  const level = gain ?? Math.min(10 ** (TARGET_DB / 20) / Math.max(rms, 1e-6), 0.95 / Math.max(peak, 1e-6))
  const fadeIn = start > 0 ? Math.round(0.005 * sr) : 0 // only where we cut into the sound
  const fadeOut = length != null ? Math.round(FADE_S * sr) : 0
  const n = to - from
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c).subarray(from, to)
    const dst = out.getChannelData(c)
    for (let i = 0; i < n; i++) {
      const edge = Math.min(fadeIn ? i / fadeIn : 1, fadeOut ? (n - 1 - i) / fadeOut : 1, 1)
      dst[i] = src[i] * level * edge
    }
  }
  return out
}

// ---- the generated sounds

function envelope(ctx, peak, attack, release, start = 0) {
  const g = new GainNode(ctx, { gain: 0 })
  g.gain.setValueAtTime(0, start)
  g.gain.linearRampToValueAtTime(peak, start + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, start + attack + release)
  g.connect(ctx.destination)
  return g
}

// An arcade bloop: a quick upward sine sweep.
function bloop(ctx) {
  const osc = new OscillatorNode(ctx, { type: 'sine', frequency: 520 })
  osc.frequency.exponentialRampToValueAtTime(940, 0.09)
  osc.connect(envelope(ctx, 0.7, 0.005, 0.22))
  osc.start(0)
  osc.stop(0.25)
}

// One plucked note for the merged-pop scale (C5; the engine detunes it up the scale).
function pluck(ctx) {
  const osc = new OscillatorNode(ctx, { type: 'triangle', frequency: 523.25 })
  osc.connect(envelope(ctx, 0.6, 0.004, 0.18))
  osc.start(0)
  osc.stop(0.2)
}

// A soft wooden tick for the late-tap roll-up.
function tick(ctx, seconds) {
  const noise = noiseSource(ctx, seconds)
  noise.connect(new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 1800, Q: 4 })).connect(envelope(ctx, 0.8, 0.002, 0.06))
  noise.start(0)
}

// A cartoon organ "da-DAAA": two chords built from a few organ-ish harmonics.
function organSting(ctx) {
  const chords = [[0, 0.25, [261.6, 329.6, 392]], [0.3, 1.25, [349.2, 440, 523.3, 698.5]]]
  for (const [at, length, freqs] of chords) {
    for (const f of freqs) {
      for (const [harmonic, level] of [[1, 0.09], [2, 0.05], [4, 0.025]]) {
        const osc = new OscillatorNode(ctx, { type: 'sine', frequency: f * harmonic })
        const g = new GainNode(ctx, { gain: 0 })
        g.gain.setValueAtTime(0, at)
        g.gain.linearRampToValueAtTime(level, at + 0.02)
        g.gain.setValueAtTime(level, at + length - 0.15)
        g.gain.linearRampToValueAtTime(0, at + length)
        osc.connect(g).connect(ctx.destination)
        osc.start(at)
        osc.stop(at + length)
      }
    }
  }
}

// A brassy rising fanfare, then a spooky theremin-ish flourish sliding down with vibrato.
function fanfare(ctx) {
  const notes = [[0, 392], [0.14, 523.3], [0.28, 659.3], [0.42, 784], [0.62, 1046.5]]
  for (const [at, f] of notes) {
    const osc = new OscillatorNode(ctx, { type: 'sawtooth', frequency: f })
    const tone = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 2400 })
    const last = at === 0.62
    osc.connect(tone).connect(envelope(ctx, last ? 0.22 : 0.16, 0.01, last ? 1.1 : 0.16, at))
    osc.start(at)
    osc.stop(at + (last ? 1.2 : 0.2))
  }
  const ghost = new OscillatorNode(ctx, { type: 'sine', frequency: 1300 })
  ghost.frequency.setValueAtTime(1300, 1.7)
  ghost.frequency.exponentialRampToValueAtTime(420, 2.9)
  const vibrato = new OscillatorNode(ctx, { frequency: 6 })
  vibrato.connect(new GainNode(ctx, { gain: 25 })).connect(ghost.frequency)
  ghost.connect(envelope(ctx, 0.18, 0.15, 1.1, 1.7))
  ghost.start(1.7)
  vibrato.start(1.7)
  ghost.stop(3)
  vibrato.stop(3)
}

// The distinctive "you won": bright bell arpeggios climbing twice, a held major chord, then sparkles.
function goldenFanfare(ctx) {
  const bell = (at, f, length, level) => {
    for (const [ratio, part] of [[1, 1], [2.76, 0.35], [5.4, 0.15]]) {
      const osc = new OscillatorNode(ctx, { type: 'sine', frequency: f * ratio })
      osc.connect(envelope(ctx, level * part, 0.004, length, at))
      osc.start(at)
      osc.stop(at + length + 0.05)
    }
  }
  const arpeggio = [523.3, 659.3, 784, 1046.5]
  arpeggio.forEach((f, i) => bell(i * 0.11, f, 0.5, 0.18))
  arpeggio.forEach((f, i) => bell(0.55 + i * 0.11, f * 1.5, 0.5, 0.18))
  for (const f of [523.3, 659.3, 784, 1046.5]) bell(1.15, f, 2.2, 0.12)
  for (let i = 0; i < 10; i++) bell(1.4 + i * 0.13, 2093 * (1 + (i % 3) * 0.25), 0.25, 0.06)
}

// The new-costume "ding-ding": two bright bell tones, a fourth apart.
function dingDing(ctx) {
  for (const [at, f] of [[0, 1318.5], [0.18, 1760]]) {
    for (const [ratio, level] of [[1, 0.3], [2.76, 0.08]]) {
      const osc = new OscillatorNode(ctx, { type: 'sine', frequency: f * ratio })
      osc.connect(envelope(ctx, level, 0.004, 0.45, at))
      osc.start(at)
      osc.stop(at + 0.5)
    }
  }
}

function tone(ctx, { type = 'sine', from, to = from, at = 0, length, level, filter }) {
  const osc = new OscillatorNode(ctx, { type, frequency: from })
  osc.frequency.setValueAtTime(from, at)
  osc.frequency.exponentialRampToValueAtTime(to, at + length)
  const out = envelope(ctx, level, 0.02, length, at)
  if (filter) osc.connect(new BiquadFilterNode(ctx, filter)).connect(out)
  else osc.connect(out)
  osc.start(at)
  osc.stop(at + length + 0.05)
  return osc
}

// "MWAHAHAHA": six falling sawtooth "ha"s through a vowel-ish band-pass.
function cackle(ctx) {
  for (let i = 0; i < 6; i++) tone(ctx, { type: 'sawtooth', from: 330 - i * 22, to: 260 - i * 22, at: 0.15 + i * 0.3, length: 0.22, level: 0.25, filter: { type: 'bandpass', frequency: 900, Q: 2 } })
}

// "AWOOOOO": a sine that rises, holds with vibrato, and falls away.
function howl(ctx) {
  const osc = tone(ctx, { from: 300, to: 620, length: 2.4, level: 0.3 })
  osc.frequency.setValueAtTime(300, 0)
  osc.frequency.exponentialRampToValueAtTime(620, 0.6)
  osc.frequency.setValueAtTime(620, 1.6)
  osc.frequency.exponentialRampToValueAtTime(380, 2.4)
  const vibrato = new OscillatorNode(ctx, { frequency: 5.5 })
  vibrato.connect(new GainNode(ctx, { gain: 12 })).connect(osc.frequency)
  vibrato.start(0.6)
  vibrato.stop(2.4)
}

// "Happy Halloween!": a jolly four-note "hap-py hal-lo-ween" stand-in.
function cheer(ctx) {
  ;[523.3, 659.3, 784, 1046.5].forEach((f, i) => tone(ctx, { type: 'triangle', from: f, at: i * 0.22, length: i === 3 ? 0.7 : 0.18, level: 0.3 }))
}

// A scream: a high sawtooth sliding up and down, roughened with noise.
function scream(ctx, seconds = 1.6) {
  const osc = tone(ctx, { type: 'sawtooth', from: 900, to: 1500, length: 1.4, level: 0.18, filter: { type: 'bandpass', frequency: 2200, Q: 1.5 } })
  osc.frequency.setValueAtTime(900, 0)
  osc.frequency.linearRampToValueAtTime(1500, 0.3)
  osc.frequency.linearRampToValueAtTime(1100, 1.4)
  const noise = noiseSource(ctx, seconds)
  noise.connect(new BiquadFilterNode(ctx, { type: 'highpass', frequency: 2500 })).connect(envelope(ctx, 0.08, 0.05, 1.3))
  noise.start(0)
}

// A creaky door: a low sawtooth whose pitch judders and slowly climbs.
function creak(ctx) {
  const osc = tone(ctx, { type: 'sawtooth', from: 90, to: 160, length: 1.6, level: 0.3, filter: { type: 'bandpass', frequency: 700, Q: 6 } })
  const judder = new OscillatorNode(ctx, { type: 'square', frequency: 23 })
  judder.connect(new GainNode(ctx, { gain: 18 })).connect(osc.frequency)
  judder.start(0)
  judder.stop(1.6)
}

// Thunder with a held organ chord underneath.
function thunder(ctx, seconds) {
  const rumble = noiseSource(ctx, seconds)
  rumble.connect(new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 260 })).connect(envelope(ctx, 0.9, 0.04, 2.6))
  rumble.start(0)
  for (const f of [110, 164.8, 220, 261.6]) tone(ctx, { from: f, at: 0.3, length: 2.5, level: 0.07 })
}

// 🌙 The closing sting: a sad-trombone "wah-wah-WOOO", then an owl.
function closingSting(ctx) {
  const brass = { type: 'sawtooth', filter: { type: 'lowpass', frequency: 1100 } }
  tone(ctx, { ...brass, from: 311, to: 294, at: 0, length: 0.32, level: 0.22 })
  tone(ctx, { ...brass, from: 294, to: 277, at: 0.38, length: 0.32, level: 0.22 })
  const last = tone(ctx, { ...brass, from: 277, to: 207, at: 0.76, length: 1.1, level: 0.24 })
  const wobble = new OscillatorNode(ctx, { frequency: 6 })
  wobble.connect(new GainNode(ctx, { gain: 8 })).connect(last.frequency)
  wobble.start(0.9)
  wobble.stop(1.9)
  tone(ctx, { from: 392, to: 370, at: 2.0, length: 0.22, level: 0.12 })
  tone(ctx, { from: 349, to: 330, at: 2.25, length: 0.22, level: 0.12 })
}

// Wind, crickets and one owl, looping every `seconds` (all modulation divides the loop evenly).
function nightLoop(ctx, seconds) {
  const wind = noiseSource(ctx, seconds)
  const lowpass = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 500, Q: 0.7 })
  const gust = new GainNode(ctx, { gain: 0.35 })
  const lfo = new OscillatorNode(ctx, { frequency: 2 / seconds })
  lfo.connect(new GainNode(ctx, { gain: 0.2 })).connect(gust.gain)
  wind.connect(lowpass).connect(gust).connect(ctx.destination)
  wind.start(0)
  lfo.start(0)

  for (let burst = 0; burst < 4; burst++) {
    for (let chirp = 0; chirp < 3; chirp++) {
      const at = 0.6 + burst * 1.9 + chirp * 0.11
      const cricket = new OscillatorNode(ctx, { type: 'sine', frequency: 4400 })
      cricket.connect(envelope(ctx, 0.05, 0.005, 0.05, at))
      cricket.start(at)
      cricket.stop(at + 0.08)
    }
  }

  for (const [at, f] of [[3.9, 392], [4.35, 349]]) {
    const owl = new OscillatorNode(ctx, { type: 'sine', frequency: f })
    owl.frequency.linearRampToValueAtTime(f * 0.94, at + 0.35)
    owl.connect(envelope(ctx, 0.12, 0.06, 0.35, at))
    owl.start(at)
    owl.stop(at + 0.45)
  }
}

function noiseSource(ctx, seconds) {
  const buffer = new AudioBuffer({ length: Math.ceil(seconds * RATE), sampleRate: RATE })
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return new AudioBufferSourceNode(ctx, { buffer })
}
