# TV sounds

Drop a sound file here and name it in `manifest.json` by slot, e.g. `{ "bloop": "bloop.mp3" }`.
Any slot that isn't listed (or fails to load) uses a browser-generated sound, so nothing blocks on assets.

Slots so far: `bloop` (each kid), `note` (one note of the merged-pop scale, pitched up by the engine),
`tick` (late-tap roll-up), `ambience` (the night loop). Short one-shots (≲3 s), normalised loudness.
