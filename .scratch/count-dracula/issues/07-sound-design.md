# Sound design

Type: grilling (HITL)
Status: resolved
Blocked by: 03, 04

## Question

Which events make sound, and what does it sound like? Decide: the trigger list (every kid? milestones? new tag? beat last year?), style (spooky vs cartoony vs mixed), how to stop repetition getting grating over 3 hours (variations, cooldowns), where the sound effects come from and their licensing, and volume and mute control from the phone.

Constraints from [Laptop kiosk setup](03-laptop-kiosk-setup.md): Web Audio one-shots, at most 3–4 overlapping, bursts combined into one flourish, and a plan for TVs that cut off the start of a sound after silence (an ambience bed or lead-ins that can afford to lose their start).

**Events that need sounds** (from [Fun-features shortlist](04-fun-features-shortlist.md)): kid pop (with burst combining), milestones, full-screen takeovers, golden ticket win, beat-last-year, new-trend alert. Also design the **phone soundboard**: which sounds (cackle, scream, howl, …), the cooldown or abuse limits, and how it mixes with automatic sounds.

The [TV screen prototype](06-tv-screen-prototype.md) has placeholder synth sounds for pop, merged pop, milestone, fanfare, trend, cackle and howl, wired to the celebration queue. Use it to audition timing.

## Answer

**Style: mixed by moment.** Each kid gets a clean, arcade-like bloop, because it plays about 350 times. Big moments get cartoony-spooky stings. Real scares exist **only on the phone soundboard**, so a person decides who gets scared.

| Moment | Sound |
|---|---|
| Each kid | A short bloop, one of ~5 pitch variations picked at random. *Nice-to-have:* signature sounds for ~6 preset costumes (thwip, roar, cackle…); other costumes use the bloop |
| Burst (merged pop) | A rising scale, one note per merged kid, capped |
| Every 50th | A cartoon organ sting |
| #100/#200/#300, beat last year | A full fanfare plus a spooky flourish |
| Golden ticket | A distinctive "you won" fanfare. **Nothing else plays during it**, soundboard included |
| New costume spotted | A two-tone "ding-ding" |
| Undo | Silence |
| Ambience | A quiet loop (wind, crickets, owl) all night, ducking under everything. It also keeps the TV's audio path awake so the start of short sounds isn't cut off. When it's muted, an inaudible keep-alive replaces it |

**Mixing rules:** Web Audio one-shots, at most 3–4 overlapping. The volume of each kid's bloop **drops automatically as the arrival rate climbs** (the 6:30–7:30 rush) and is full when kids are sparse. Celebrations duck the ambience, and the soundboard ducks the automatic sounds.

**Soundboard:** 6 fixed slots in v1 (labels in config): 3 homemade (e.g. Dad's evil laugh, "Happy Halloween!", a kid's wolf howl) and 3 stock (scream, creaky door, thunder plus organ). It plays **on the TV** straight away, over celebrations except golden tickets. A **3 s cooldown** across all buttons stops spamming. Each button triggers a TV visual (flying bats or wolves plus the shouted text), as in the TV screen prototype.

**Controls (phone secondary menu, off the counting screen):** master TV volume slider, mute toggles for **Ambience**, **Kid bloops** and **Everything**. The TV shows a small 🔇 when anything is muted. No automatic stop at the end of the night. The laptop's system volume is the hard ceiling, set at the rehearsal.

**Sources:** browser-generated sounds or Kenney.nl CC0 packs for the bloops. Freesound or Pixabay CC0 for stings, ambience and stock scares. The family records 3 soundboard clips. Browser-generated fallbacks fill any slot that has no file yet, so audio never blocks the build. **Build task before Oct 24:** gather the stock sounds and record the homemade clips.
