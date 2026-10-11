# The homepage on /

Type: build (AFK)
Status: ready-for-agent
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

- [ ] `/` shows the homepage to a fresh browser; `/signup` lands there; every listed sign-in link lands there
- [ ] Each prototype scenario matches the real page (site line wording, paused, signed in)
- [ ] Sign-up from `/` reaches first-run; Sign in reaches Tonight
- [ ] The social card renders with `og-home.png`
- [ ] No horizontal scroll at 360 px; checked in a browser
- [ ] `bun test` passes
