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
  ambience: { seconds: 8, draw: nightLoop },
}

export async function createWebAudio({ manifestUrl = '/sounds/manifest.json' } = {}) {
  const ctx = new AudioContext({ latencyHint: 'interactive' })
  const compressor = new DynamicsCompressorNode(ctx, { threshold: -14, knee: 8, ratio: 6, attack: 0.003, release: 0.2 })
  const master = new GainNode(ctx, { gain: 1 })
  const buses = { master, fx: new GainNode(ctx), ambience: new GainNode(ctx) }
  buses.fx.connect(master)
  buses.ambience.connect(master)
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

    voice(slot, { gain, detune }) {
      const source = new AudioBufferSourceNode(ctx, { buffer: buffers[slot], detune })
      source.connect(new GainNode(ctx, { gain })).connect(buses.fx)
      source.start()
      return {
        duration: buffers[slot].duration / 2 ** (detune / 1200),
        stop: () => source.stop(),
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

async function loadSlot(ctx, slot, file) {
  if (file) {
    try {
      const res = await fetch(`/sounds/${file}`)
      if (res.ok) return await ctx.decodeAudioData(await res.arrayBuffer())
    } catch {}
  }
  const { seconds, draw } = GENERATORS[slot]
  const offline = new OfflineAudioContext(1, Math.ceil(seconds * RATE), RATE)
  draw(offline, seconds)
  return offline.startRendering()
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
