# Sound assets

Type: task (HITL)
Status: ready-for-agent
Blocked by: 25

## What to build

Real sounds replace the generated fallbacks before the **Oct 24** freeze. See [spec §13](../spec.md#13-asset-task) and [§10](../spec.md#10-sound). This never blocks the build: any missing slot keeps its fallback.

- **Bloops** (~5 variations): browser-generated or a Kenney.nl CC0 pack.
- **Stings:** 50th organ sting, takeover fanfare plus spooky flourish, golden "you won" fanfare, new-costume ding-ding, end-of-night closing sting, rising-scale notes for merged pops. Freesound or Pixabay, **CC0 only**.
- **Ambience loop** (wind, crickets, owl), CC0.
- **3 stock soundboard clips** (scream, creaky door, thunder plus organ), CC0.
- **3 homemade soundboard clips** recorded by the family (for example Dad's evil laugh, "Happy Halloween!", a kid's wolf howl), with their labels set in the server config file.
- *Nice-to-have:* ~6 signature costume sounds.
- Short one-shots (≲3 s), punchy mid-range, normalised loudness, served same-origin.
- A note of each file's source and licence, kept with the files.

Needs the family for the homemade recordings and someone to judge the sounds by ear.

**Modules:** [Sound engine](../modules.md#7-sound-engine-tv) (files are mapped by slot).

## Built so far (2026-10-10)

- **Stock slots filled with CC0 candidates** in `public/sounds/stock/` (Kenney packs, BigSoundBank, OpenGameArt), with every source and licence in `public/sounds/SOURCES.md`. Each page was checked for CC0 before download; the Wilhelm scream was rejected because its page isn't CC0.
- **Audition page** `/sounds/audition.html`: 2–4 options per slot plus the generated stand-in, played the way the TV plays them; the user picks by ear and copies the result into `manifest.json`.
- **Manifest** entries can trim (`start`, `length`); every file is evened out to the same loudness on load.
- Still to do: the family's three homemade soundboard clips (`public/sounds/homemade/`), the by-ear picks, and a level check on the real TV. The every-50th sting keeps the generated organ by default (no CC0 organ found).

## Acceptance criteria

- [ ] Every sound slot has a file, or a deliberate decision to keep its fallback
- [x] Every downloaded file is CC0, with source and licence noted
- [ ] Levels sound even on the real TV (no sting much louder than the others)
- [ ] The soundboard labels in config match the recordings
