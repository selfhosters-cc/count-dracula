# TV sounds

`manifest.json` maps each sound slot to a file under `public/sounds/`. A slot that isn't listed (or whose file
fails to load) plays a browser-generated sound, so nothing ever blocks on assets.

An entry is a path, or `{ "file": …, "start": seconds, "length": seconds, "gain": number }` to trim a longer
recording. Files are evened out to the same loudness on load unless the entry sets a `gain`.

**Pick by ear:** open `/sounds/audition.html` (on the real TV if you can), choose one option per slot, and copy
the result into `manifest.json`. `candidates.json` lists the options.

## Slots

| Slot | When it plays |
|---|---|
| `bloop` | each kid (the TV plays it at ~5 pitches and lowers it in a rush) |
| `note` | one note of the merged-pop scale (the TV pitches it up) |
| `tick` | the quiet roll-up for late taps |
| `sting50` | every 50th kid (the headstone) |
| `fanfare` | #100/#200/#300 and Beat last year |
| `golden` | a golden ticket win (plays alone) |
| `ding` | a new costume spotted |
| `close` | 🌙 End the night |
| `ambience` | all night, quietly, looped |
| `board1`–`board6` | the ☰ soundboard buttons (labels come from the server config) |

## Files

- `stock/`: CC0 sounds (Kenney, BigSoundBank, OpenGameArt). Every source and licence is in `SOURCES.md`.
- `homemade/`: the family's own recordings for soundboard 1–3 (e.g. Dad's evil laugh, "Happy Halloween!",
  a kid's wolf howl). Any of `.m4a`, `.mp3`, `.wav`, `.ogg`; about 3 s, close to the mic, little silence at
  the start. Then name them in `manifest.json`, e.g. `"board1": "homemade/evil-laugh.m4a"`.

Short one-shots (≲3 s), punchy mid-range. Deploy with `deploy/deploy.sh` to put them on the TV.
