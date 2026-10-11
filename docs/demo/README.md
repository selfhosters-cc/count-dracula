# The README demo

`demo.gif` (the README's hero) and `demo.webm` (the same clip at full size) show a night in progress: the
door phone being tapped beside the TV, kid #100's headstone takeover, then a golden ticket on #104.

They're made by three scripts, run on a throwaway server with a scratch database, never the repo's
`count-dracula.sqlite`, a dev server or production:

- `seed.js`: a fresh database with "The Smiths on Elm St" live on Halloween 2026, its Clock shift set so the
  TV reads about 6:30 pm on Oct 31, racing the real 2025 night (346 kids), 94 kids in, golden tickets put on
  #104 and up. It only works before Nov 1, 2026 (after that, sign-up makes no Halloween 2026).
- `record.js`: lays the phone (390×844, in a phone bezel) and the TV (1280×720, in a TV's frame on a stand)
  out side by side, each in its own labelled panel, taps the phone's costume tiles and records it frame by
  frame. The phone's own #103 is what shows "NEXT KID IS GOLDEN" on it.
- `encode.js`: the frames into `demo.webm` (VP8) and `demo.gif` (960 px, 10 fps, 128 colours, under 8 MB).

## Re-recording

You need Bun, a `playwright-core` install with its Chromium, an `ffmpeg` with `libvpx` (Playwright's own
`~/.cache/ms-playwright/ffmpeg-*/ffmpeg-linux` will do) and ImageMagick's `convert`. **playwright-core is
not a dependency of this repo**: point `PLAYWRIGHT_CORE` at any install of it. Headless Chromium needs a
colour emoji font (Noto Color Emoji): if the costume tiles show boxes, add one with `FONTCONFIG_FILE`.

```sh
scratch=$(mktemp -d)
seeded=$(bun docs/demo/seed.js $scratch/demo.sqlite)
DB=$scratch/demo.sqlite bun -e 'const c = require("./config/config.example.json"); console.log(JSON.stringify({ ...c, port: 3477, dbPath: process.env.DB }))' > $scratch/config.json
bun server/main.js $scratch/config.json & sleep 1
PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core bun docs/demo/record.js http://127.0.0.1:3477 "$seeded" $scratch/frames
kill %1
FFMPEG=/path/to/ffmpeg bun docs/demo/encode.js $scratch/frames docs/demo
```

Record straight after seeding: the Clock shift is fixed when the database is seeded. Look through the
frames before committing (the takeovers, the golden banner on the phone, no error or placeholder) and keep
any host name out of the clip.
