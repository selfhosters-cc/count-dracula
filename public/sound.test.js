import { describe, expect, test } from 'bun:test'
import { createSound } from './sound.js'
import { fakeClock } from '../test/fake-clock.js'

// Stands in for Web Audio: records every voice and every bus ramp the engine asks for.
function fakeAudio(clock) {
  const lengths = { bloop: 0.25, note: 0.2, tick: 0.08, sting50: 1.6, fanfare: 3, golden: 4, ding: 0.7 }
  const audio = {
    state: 'suspended',
    voices: [],
    ramps: [],
    ambienceOn: false,
    async resume() {
      audio.state = 'running'
    },
    voice(slot, { gain, detune, bus = 'fx' }) {
      const v = { slot, gain, detune, bus, at: clock.now(), until: clock.now() + (lengths[slot] ?? 2) * 1000, stopped: false }
      audio.voices.push(v)
      return { duration: lengths[slot] ?? 2, stop: () => ((v.stopped = true), (v.until = clock.now())) }
    },
    ramp(bus, level, seconds) {
      audio.ramps.push({ bus, level, seconds, at: clock.now() })
    },
    ambience(on) {
      audio.ambienceOn = on
    },
  }
  return audio
}

async function setup({ unlocked = true } = {}) {
  const clock = fakeClock(0)
  const audio = fakeAudio(clock)
  let r = 0
  const sound = createSound({ audio, clock, random: () => (r = (r + 0.37) % 1) })
  if (unlocked) await sound.unlock()
  // Voices sounding at time t (a stopped voice ends when it was stopped).
  const sounding = (t = clock.now()) => audio.voices.filter((v) => v.at <= t && t < v.until)
  return { clock, audio, sound, sounding }
}

describe('before "Start the night"', () => {
  test('nothing plays until the AudioContext is unlocked, and unlocking starts the ambience', async () => {
    const { sound, audio } = await setup({ unlocked: false })

    expect(sound.running).toBe(false)
    sound.cue('bloop')
    expect(audio.voices).toEqual([])

    await sound.unlock()
    expect(sound.running).toBe(true)
    expect(audio.ambienceOn).toBe(true)
  })
})

describe('kid bloop', () => {
  test('plays at one of ~5 pitches, full volume when kids are sparse', async () => {
    const { sound, audio, clock } = await setup()
    const pitches = new Set()

    for (let i = 0; i < 20; i++) {
      sound.cue('bloop')
      pitches.add(audio.voices.at(-1).detune)
      await clock.advance(30_000)
    }

    expect(audio.voices.every((v) => v.slot === 'bloop' && v.gain === 1)).toBe(true)
    expect(pitches.size).toBeGreaterThanOrEqual(4)
    expect(pitches.size).toBeLessThanOrEqual(5)
  })

  test('gets quieter through a sustained burst, then is back to full once kids are sparse', async () => {
    const { sound, audio, clock } = await setup()

    for (let i = 0; i < 12; i++) {
      sound.cue('bloop')
      await clock.advance(500)
    }
    const burst = audio.voices.map((v) => v.gain)
    await clock.advance(30_000)
    sound.cue('bloop')

    expect(burst.slice(0, 2)).toEqual([1, 1])
    expect(burst.every((g, i) => i === 0 || g <= burst[i - 1])).toBe(true)
    expect(burst.at(-1)).toBeCloseTo(0.35)
    expect(audio.voices.at(-1).gain).toBe(1)
  })
})

describe('merged pop scale and the voice cap', () => {
  test('each merged kid plays the next note up, capped at the top of the scale', async () => {
    const { sound, audio, clock } = await setup()

    for (let step = 1; step <= 12; step++) {
      sound.cue('scale', { step })
      await clock.advance(400)
    }

    const detunes = audio.voices.map((v) => v.detune)
    expect(audio.voices.every((v) => v.slot === 'note')).toBe(true)
    expect(detunes.slice(0, 8).every((d, i) => i === 0 || d > detunes[i - 1])).toBe(true)
    expect(new Set(detunes.slice(7))).toEqual(new Set([detunes[7]]))
  })

  test('a 5-kid burst never sounds more than 4 voices at once, newest kept', async () => {
    const { sound, clock, sounding, audio } = await setup()
    let most = 0

    sound.cue('bloop')
    for (let step = 1; step <= 4; step++) {
      await clock.advance(30)
      sound.cue('scale', { step })
      most = Math.max(most, sounding().length)
    }
    for (let i = 0; i < 6; i++) {
      sound.cue('bloop')
      most = Math.max(most, sounding().length)
    }

    expect(most).toBeLessThanOrEqual(4)
    expect(sounding()).toContain(audio.voices.at(-1))
  })
})

describe('ambience', () => {
  const ambienceRamps = (audio) => audio.ramps.filter((r) => r.bus === 'ambience').map(({ level, at }) => [at, level])

  test('ducks under a pop and comes back once it has finished', async () => {
    const { sound, audio, clock } = await setup()

    sound.cue('bloop')
    await clock.advance(5_000)

    expect(ambienceRamps(audio)).toEqual([[0, 0.3], [550, 1]])
  })

  test('stays ducked through a run of pops, coming back once after the last', async () => {
    const { sound, audio, clock } = await setup()

    sound.cue('bloop')
    for (let step = 1; step <= 4; step++) {
      await clock.advance(200)
      sound.cue('scale', { step })
    }
    await clock.advance(5_000)

    expect(ambienceRamps(audio)).toEqual([[0, 0.3], [800 + 200 + 300, 1]])
  })
})

describe('roll-up tick', () => {
  test('a backlog of late kids makes one soft tick, not one per kid', async () => {
    const { sound, audio, clock } = await setup()

    for (let i = 0; i < 10; i++) sound.cue('tick')
    await clock.advance(1_000)
    sound.cue('tick')

    expect(audio.voices.map((v) => v.slot)).toEqual(['tick'])
    expect(audio.voices[0].gain).toBeLessThan(1)

    await clock.advance(3_000)
    sound.cue('tick') // a later roll-up gets its own tick
    expect(audio.voices).toHaveLength(2)
  })
})

describe('mix', () => {
  const lastRamp = (audio, bus) => audio.ramps.filter((r) => r.bus === bus).at(-1)?.level

  test('sets the master volume, and "Everything" mutes it', async () => {
    const { sound, audio } = await setup()

    sound.mix({ volume: 0.6, mutes: {} })
    expect(lastRamp(audio, 'master')).toBe(0.6)

    sound.mix({ volume: 0.6, mutes: { everything: true } })
    expect(lastRamp(audio, 'master')).toBe(0)
  })

  test('"Kid bloops" silences bloops and the merged scale', async () => {
    const { sound, audio } = await setup()
    sound.mix({ volume: 1, mutes: { bloops: true } })

    sound.cue('bloop')
    sound.cue('scale', { step: 1 })

    expect(audio.voices).toEqual([])
  })

  test('"Ambience" mutes the loop, and a duck releasing afterwards keeps it muted', async () => {
    const { sound, audio, clock } = await setup()
    sound.cue('bloop')
    sound.mix({ volume: 1, mutes: { ambience: true } })
    expect(lastRamp(audio, 'ambience')).toBe(0)

    await clock.advance(5_000)

    expect(lastRamp(audio, 'ambience')).toBe(0)
    expect(audio.ambienceOn).toBe(true) // still running underneath: the keep-alive
  })
})

describe('milestone stings', () => {
  const ambienceRamps = (audio) => audio.ramps.filter((r) => r.bus === 'ambience').map(({ level, at }) => [at, level])

  test.each([
    ['sting:50', 'sting50', 1_600],
    ['fanfare', 'fanfare', 3_000],
    ['ding', 'ding', 700],
  ])('%s plays its sound at full volume and ducks the ambience until it ends', async (cue, slot, ms) => {
    const { sound, audio, clock } = await setup()
    sound.mix({ volume: 1, mutes: { bloops: true } }) // muting bloops doesn't touch the big moments
    audio.ramps.length = 0

    sound.cue(cue)
    await clock.advance(10_000)

    expect(audio.voices).toMatchObject([{ slot, gain: 1 }])
    expect(ambienceRamps(audio)).toEqual([[0, 0.3], [ms + 300, 1]])
  })
})

describe('golden fanfare', () => {
  test('plays alone: it cuts what is sounding, and nothing else plays until it ends', async () => {
    const { sound, audio, clock, sounding } = await setup()
    sound.cue('bloop')
    const bloop = audio.voices[0]

    sound.cue('golden')
    expect(bloop.stopped).toBe(true)
    expect(sounding().map((v) => v.slot)).toEqual(['golden'])

    await clock.advance(1_000)
    for (const cue of ['bloop', 'scale', 'sting:50', 'fanfare', 'tick']) sound.cue(cue, { step: 1 })
    expect(audio.voices.map((v) => v.slot)).toEqual(['bloop', 'golden'])

    await clock.advance(3_100)
    sound.cue('bloop')
    expect(audio.voices.at(-1).slot).toBe('bloop')
  })
})

describe('soundboard', () => {
  const lastRamp = (audio, bus) => audio.ramps.filter((r) => r.bus === bus).at(-1)?.level

  test('plays its slot on its own bus over everything, ducking the automatic sounds and the ambience until it ends', async () => {
    const { sound, audio, clock } = await setup()
    sound.cue('bloop')

    sound.cue('board:3')

    expect(audio.voices.at(-1)).toMatchObject({ slot: 'board3', bus: 'board', gain: 1 })
    expect(audio.voices[0].stopped).toBe(false) // it doesn't cut off the pop
    expect(lastRamp(audio, 'fx')).toBeLessThan(1)
    expect(lastRamp(audio, 'ambience')).toBeLessThan(1)

    await clock.advance(5_000)
    expect(lastRamp(audio, 'fx')).toBe(1)
    expect(lastRamp(audio, 'ambience')).toBe(1)
  })

  test("doesn't play during the golden fanfare", async () => {
    const { sound, audio } = await setup()
    sound.cue('golden')

    sound.cue('board:1')

    expect(audio.voices.map((v) => v.slot)).toEqual(['golden'])
  })
})
