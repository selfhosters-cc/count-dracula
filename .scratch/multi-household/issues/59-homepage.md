# The homepage on /

Type: build (AFK)
Status: done
Blocked by: 52, 56

## What to build

`/` becomes the public homepage and `/signup` folds into it. See [v2.1 §11](../spec-v2.1.md#11-the-homepage). The prototype is `prototype/homepage` (`d414470`), `public/home-prototype.html?scenario=october|halloween|morning|paused|signed-in`. It's the page to build.

- **Routing:**
  - `/` serves the homepage (a stored key still goes to `/door`, per [ticket 52](52-door-phone.md))
  - `/signup` → 302 `/`
  - every sign-in redirect and error-page link (`/setup` and `/operator` without a session, sign-out, Try again, Start again, Sign up) points at `/`
- **The page:**
  - the pitch
  - the site-wide line ("Counting now" while `/api/site`'s `live`, "Last night" otherwise, hidden below 5, "Rounded, updated every 10 minutes.")
  - the compact Start counting / Sign in row
  - How it works (three panels with screenshots)
  - Start your household and Already counting? (with the helper line)
  - the footer
  - the sticky bar on phones
- **Paused sign-ups:** the message replaces the Continue button; Sign in stays.
- **Signed in:** the Welcome back card (Go to Setup ›, Count on this device, Sign out) replaces the row, bar and forms.
- **Screenshots:** copy from `docs/screenshots/` into `public/`, downscaled to about 800 px wide.
- **Social:** the title, `og:*` and meta description; a new **`og-home.png`** from the existing artwork without "How our Halloween night went"; `summary_large_image`.
- `signup.html` / `signup.js` go, or become the homepage's files.

## Acceptance criteria

- [x] `/` shows the homepage to a fresh browser; `/signup` lands there; every listed sign-in link lands there
- [x] Each prototype scenario matches the real page (site line wording, paused, signed in)
- [x] Sign-up from `/` reaches first-run; Sign in reaches Tonight
- [x] The social card renders with `og-home.png`
- [x] No horizontal scroll at 360 px; checked in a browser
- [x] `bun test` passes

## Notes from the build

- **Files:** `public/signup.html` / `signup.js` became **`home.html` / `home.js`** (`git mv`), ported from the prototype (`d414470`) with its unused CSS and the scenario switcher dropped. `PAGES['/']` is `home.html`; `GET /` still sends `/?key=` to `/door` (302). `GET /signup` is a **302 to `/`**. `door.js` lost its own `/` redirect and the `onDoor` checks, since `door.html` is only served on `/door` now.
- **What the page reads:** `GET /api/site` (unchanged, `{ site, live }`) for the line, and a new public **`GET /api/home` → `{ signUpsPaused, household }`**: the pause-sign-ups switch, and a signed-in Manager's Household name (or null), nothing else. It doesn't renew the session. Count on this device reads `/api/household` only when tapped (for the join key, stored as `/setup` does) and opens `/door`; with no answer (signed out meanwhile, Suspended) it goes to `/setup`, which says which. **Why not `/api/household`:** it 401s for every signed-out visitor (a console error on each homepage load) and carries the join key and emails.
- **The line:** `homeSiteLine()` in `public/nearby-text.js` (tested) gives `{ lead: '🎃 Counting now' | '🌙 Last night', rest }`, the lead drawn bold, with "Rounded, updated every 10 minutes." under it; null hides it. The phone's strip keeps "Count Dracula tonight" (`phoneNearby`), sharing one `siteFigures()`.
- **Judgment calls (conservative):**
  - **"Go sign in" lands on `/#sign-in`** (`/setup`, `/tally`, `/summary`, `/operator` without a session, and the pages' 401s in `setup.js`, `setup-household.js`, `summary.js`, `operator.js`), and the error pages' **Try again, Start again, Sign up and Back** on **`/#start`**. It's still `/`, but `doorRedirect` now takes `hash` and stays on the homepage for `#sign-in` / `#start` even when the phone remembers a door's key. Without that, a Manager who used Count on this device and whose session ran out would loop `/setup` → `/` → `/door` → ☰ Setup → `/` and never reach Sign in. Sign-out, backing out at Google, Leave and Delete my household go to plain `/` (so a phone with a key goes on to its door, per §11).
  - The **sticky bar is phones only**: hidden from 700 px up (spec "on phones"; the prototype showed it at any width).
  - The site line is weight 500 with the lead at 800, so "Counting now" / "Last night" reads bold as in the spec (the prototype had the whole line semibold).
  - While paused, the name field stays and Start counting still jumps to the form, which shows the message (the prototype's behaviour).
- **Screenshots:** `tv.png`, `tv-milestone.png`, `tv-golden.png`, `tv-recap.png` downscaled from 1600 to 800 px wide with ImageMagick (`convert -resize 800x -strip`); `phone.png` copied as is (390 px). About 700 KB together; all but the first are `loading="lazy"`, with `width`/`height` set.
- **`og-home.png`:** the line was baked into `og-image.png` and no generator was ever committed (ticket 44 made it by screenshotting an HTML card). I **recreated the card** in HTML with the vendored Creepster and Fredoka fonts and the same colours, checked it against `og-image.png` with the line in (near-identical), then screenshotted it at 1200×630 without the line. The card file wasn't kept. `og-image.png` is unchanged for share links.
- **Social tags:** the title, meta description, `og:type`, `og:url`, `og:title`, `og:description`, `og:image` (`__ORIGIN__/og-home.png`, 1200×630) and `twitter:card` `summary_large_image`.
- **Caddy / CSP:** nothing to change. Everything the page loads is same-origin (`img-src 'self'`), its script is a module file (no inline script or handler), and its forms post to `/auth/...` (`form-action 'self'`). No console errors or CSP reports in the browser.
- **Also:** RUNBOOK's two `/signup` mentions say `/` and "the homepage" (ticket 61 still owns its Rehearsal wording).
- **Tests:** new `server/homepage.test.js` (routing, `/signup`, every sign-in link, `/api/home` with the Operator's switch, social tags, image sizes); new cases in `public/nearby-text.test.js` and `public/door-view.test.js`; `door.test.js`, `sign-in.test.js`, `operator.test.js` and `privacy.test.js` updated. 649 pass.
- **Checked in the browser** at 360 px (no horizontal scroll) and 1280 px on two throwaway servers (fresh databases; a same-origin fake Google in front of the app; `deploy/seed-nearby.js` with 6 houses for the line):
  - Fresh: no line; the sticky bar slid up through How it works and hid at the forms. Start counting → name → Continue with Google → first-run's "Name your household".
  - Signed in: Welcome back, "Signed in to *The Smiths on Elm St*", no row, bar or forms. Go to Setup opened `/setup`; Count on this device stored the key and opened `/door`; `/` then went to `/door`; `/#sign-in` stayed; Sign out signed out.
  - `/setup` signed out landed on `/#sign-in` at the form; `/signup` landed on `/`; `/?key=` landed on `/door` with the key stored.
  - Paused from `/operator`'s switch: "Sign-ups are paused, try again later." in place of Continue, Sign in still there, and Sign in with Google reached `/setup`.
  - Seeded: "🎃 **Counting now** on Count Dracula: 6 houses · ~155 kids · top costume: 🧙 Witch"; after ending every night, "🌙 **Last night** on Count Dracula: …" (1280 px).
