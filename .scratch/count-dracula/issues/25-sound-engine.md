# Sound engine, Start the night, bloops and ambience

Type: build (AFK)
Status: ready-for-agent
Blocked by: 20

## What to build

The TV becomes porch-audible. See [spec §10](../spec.md#10-sound) and [§7 States](../spec.md#7-tv-screen).

- **Web Audio, not `<audio>`.** Preload and decode every sound at start, as same-origin short one-shots. The signal chain is a master `GainNode` → `DynamicsCompressorNode`. **At most 3–4 voices overlap.**
- **Fallbacks:** any slot without a file uses a browser-generated sound, so missing assets never block the build. Sound files are mapped by slot, so the assets ticket can drop them in later.
- **"Start the night":** a full-screen button shown whenever `audioCtx.state !== 'running'`. One click unlocks sound for the session.
- **Kid bloop:** a short bloop at one of ~5 random pitch variations. Its volume **drops automatically as the arrival rate climbs** and is full when kids are sparse (pick the curve, see [§16](../spec.md#16-builders-latitude)).
- **Merged pop:** a rising scale, one note per merged kid, capped.
- **Late-tap roll-up:** one soft tick. **Undo / delete:** silence.
- **Ambience:** a quiet wind/cricket/owl loop all night that **ducks** under celebrations and keeps the TV's audio path awake.
- A small sound API (play a sting, duck, mute groups) that later tickets use for stings, the soundboard and mutes.

## Acceptance criteria

- [ ] With no sound files present, every moment still makes a generated sound
- [ ] "Start the night" appears whenever the AudioContext isn't running, and one click starts ambience
- [ ] A 5-kid burst plays a capped rising scale with no clipping, and never more than 4 voices
- [ ] Bloops get quieter during a sustained burst and return to full when it's sparse
- [ ] Ambience ducks under a pop and comes back
- [ ] A roll-up plays one soft tick; an undo plays nothing
