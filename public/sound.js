// Sound engine (modules.md §7): callers learn one verb, cue(name). Every mixing rule lives here.
// `audio` is the adapter that touches Web Audio (createWebAudio below); tests pass a fake.

const BLOOP_PITCHES = [-300, -100, 0, 200, 400] // cents: ~5 variations so 350 bloops don't drone

// Bloops get quieter as the arrival rate climbs (spec §10; the curve is builder's latitude, §16):
// full up to 2 arrivals in the last 10 s, sliding to 35% at 10 or more.
const RATE_WINDOW_MS = 10_000
const QUIET_BELOW = 2
const QUIETEST_AT = 10
const QUIETEST_GAIN = 0.35

// A merged pop rises one note per merged kid up a major scale (cents above the base note), then holds.
const SCALE = [0, 200, 400, 500, 700, 900, 1100, 1200]
const MAX_VOICES = 4 // spec §10: at most 3–4 overlapping

// Celebrations duck the ambience; it comes back this long after the last one ends.
const DUCK_LEVEL = 0.3
const DUCK_ATTACK_S = 0.08
const DUCK_HOLD_MS = 300
const DUCK_RELEASE_S = 0.8

// The big moments' sounds, by cue (spec §10): a cartoon organ for every 50th, a full fanfare plus a
// spooky flourish for #100/#200/#300 and Beat last year.
const STINGS = { 'sting:50': 'sting50', fanfare: 'fanfare', ding: 'ding' } // ding: the new-costume "ding-ding"

const TICK_GAIN = 0.4 // a late-tap roll-up: one soft tick
const TICK_QUIET_MS = 2_000 // a backlog arrives as a run of late kids: one tick for the lot

function bloopGain(arrivals) {
  if (arrivals <= QUIET_BELOW) return 1
  const t = Math.min(1, (arrivals - QUIET_BELOW) / (QUIETEST_AT - QUIET_BELOW))
  return 1 - t * (1 - QUIETEST_GAIN)
}

export function createSound({ audio, clock, random = Math.random }) {
  let arrivals = [] // when recent kids arrived, for the bloop volume
  let voices = [] // { stop, until } for what's sounding now
  let ducked = false
  let unduckTimer = null
  let lastTick = -Infinity
  let goldenUntil = 0 // nothing else plays during the golden fanfare (spec §10)
  let mutes = {}

  const ambienceLevel = () => (mutes.ambience ? 0 : 1) // muted, the loop keeps running silently: the keep-alive

  // Called for every celebration cue: duck now (once), and come back after the last one ends.
  function duckUntil(until) {
    if (!ducked) audio.ramp('ambience', DUCK_LEVEL * ambienceLevel(), DUCK_ATTACK_S)
    ducked = true
    clock.clearTimeout(unduckTimer)
    unduckTimer = clock.setTimeout(() => {
      ducked = false
      audio.ramp('ambience', ambienceLevel(), DUCK_RELEASE_S)
    }, until - clock.now() + DUCK_HOLD_MS)
  }

  function arrive() {
    const now = clock.now()
    arrivals = [...arrivals.filter((t) => now - t < RATE_WINDOW_MS), now]
    return arrivals.length
  }

  // Plays a one-shot within the voice cap: when 4 are already sounding, the oldest makes way.
  function play(slot, options) {
    const now = clock.now()
    voices = voices.filter((v) => v.until > now)
    while (voices.length >= MAX_VOICES) voices.shift().stop()
    const voice = audio.voice(slot, options)
    const until = now + voice.duration * 1000
    voices.push({ stop: voice.stop, until })
    return until
  }

  return {
    get running() {
      return audio.state === 'running'
    },

    // One click on "Start the night" (spec §7 States).
    async unlock() {
      await audio.resume()
      audio.ambience(true)
    },

    // The ☰ menu's controls (ticket 26): master volume plus the Ambience / Kid bloops / Everything mutes.
    mix({ volume = 1, mutes: next = {} }) {
      mutes = next
      audio.ramp('master', mutes.everything ? 0 : volume, 0.1)
      audio.ramp('ambience', (ducked ? DUCK_LEVEL : 1) * ambienceLevel(), 0.3)
    },

    cue(name, opts = {}) {
      if (audio.state !== 'running') return
      if (name === 'golden') {
        for (const v of voices.splice(0)) v.stop()
        goldenUntil = play('golden', { gain: 1, detune: 0 })
        duckUntil(goldenUntil)
        return
      }
      if (clock.now() < goldenUntil) return
      if (name === 'tick') {
        const now = clock.now()
        if (now - lastTick >= TICK_QUIET_MS) play('tick', { gain: TICK_GAIN, detune: 0 })
        lastTick = now
        return
      }
      if ((name === 'bloop' || name === 'scale') && mutes.bloops) return
      if (name === 'bloop') {
        const detune = BLOOP_PITCHES[Math.floor(random() * BLOOP_PITCHES.length)]
        duckUntil(play('bloop', { gain: bloopGain(arrive()), detune }))
      } else if (STINGS[name]) {
        duckUntil(play(STINGS[name], { gain: 1, detune: 0 }))
      } else if (name === 'scale') {
        const detune = SCALE[Math.min(Math.max(opts.step ?? 1, 1) - 1, SCALE.length - 1)] // step 1 = the 2nd kid
        duckUntil(play('note', { gain: bloopGain(arrive()), detune }))
      }
    },
  }
}
