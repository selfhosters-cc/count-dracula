# The homepage

Type: prototype (HITL)
Status: resolved
Blocked by:

## Question

What does the public homepage on `/` say and look like?

Decided at charting: `/` is the homepage; the door phone moves to `/door`; `/?key=…` redirects to `/door` with the key; a phone with a remembered key goes to the door, not the homepage; a signed-in Manager gets a "Go to Setup" button, not a redirect; `/signup` folds into it.

Open:

- **Content:** what Count Dracula is in a line or two, screenshots from `docs/screenshots/`, the site-wide total (ticket 46), Sign up / Sign in with Google, the House rules / Privacy line, Help: email us.
- **Settled by [Sign-up, first-run and the ready checklist](09-sign-up-and-first-run.md):** the Start form and Sign in move onto `/` unchanged, `/signup` and every sign-in link redirect to `/`, and paused sign-ups show on `/` before Google. This ticket decides how the page looks.
- **Tone and layout:** one screen or a scroll; phone first.
- **The site-wide line's wording outside the night:** it can show an October figure when 5+ Households test at once, and it shows last night's total until noon on Nov 1, while Ended Events are still open ([Nearby, the site-wide total and Operator status](06-nearby-sitewide-operator.md)). "Count Dracula tonight" won't fit every case.
- Social preview (`og-image.png`, title, description).

A rough prototype on a `prototype/` branch, linked here.

## Answer

Resolved 2026-10-11 (HITL prototype, agent defaults confirmed by the user). Prototype: branch `prototype/homepage`, `public/home-prototype.html` (stub data; `?scenario=october|halloween|morning|paused|signed-in`). View it by serving the repo root (`python3 -m http.server`) and opening `/public/home-prototype.html`.

**The frame**
- **One phone-width column**, max 560 px, centred on wide screens. It's a scroll led by **How it works**, with Start and Sign in always one tap away. It keeps the `/signup` page's dark palette and panels.
- **From the top:**
  - 🧛 Count Dracula and its one line: *"Count your trick-or-treaters on your phones, while a TV on the porch cheers every kid."*
  - The **site-wide line**, when there is one.
  - A **compact button row**: **Start counting** (orange) and **Sign in**, which jump to the full forms.
  - **How it works**, large: a 24 px heading, "Three things on Halloween night. Nothing to install.", and a big panel per step, each with its own full-width screenshot:
    1. 📺 Put a TV on the porch (`tv.png`).
    2. 📱 Tap a costume at the door (`phone.png`).
    3. 🎉 The TV cheers every kid (`tv-milestone.png`, then `tv-golden.png` and `tv-recap.png` side by side).
  - The full **Start your household** form, then **Already counting?**
  - **Footer:** Privacy and House rules · TV setup help (`/help/tv`) · Help: email us.
- **Sticky bar on phones:** Start counting · Sign in slides up from the bottom while neither the top button row nor the forms are on screen, so it shows through How it works and hides at the forms. It's hidden for a signed-in Manager.
- **Screenshots** are copied from `docs/screenshots/` into `public/` at build time; they aren't served from `docs/`. Image weight is a build detail: downscale the TV shots to about 800 px wide.

**Start and sign in** (the plumbing is [Sign-up, first-run and the ready checklist](09-sign-up-and-first-run.md)'s)
- **Start your household:** the name field, Continue with Google, and the privacy line, as on `/signup`.
- **While sign-ups are paused:** "Sign-ups are paused, try again later." replaces the button. Sign in still shows.
- **Already counting?** Sign in with Google, then a muted line for helpers who land here without a key: *"Helping at someone's door? Scan the QR on their phone, or open the link they sent you."*
- **A signed-in Manager:** a **Welcome back** card at the top ("Signed in to *The Smiths on Elm St*", **Go to Setup ›**, 📱 Count on this device, Not you? Sign out). It replaces the button row, the sticky bar, Start and Sign in, since a Manager runs one Household. The rest of the page stays. There's no redirect.

**The site-wide line's wording**
- The lead depends on the Events it counts: **"🎃 Counting now on Count Dracula: 212 houses · ~3,140 kids · top costume: 🧙 Witch"** while any counted door Event is **Live**, and **"🌙 Last night on Count Dracula: …"** once every one has **Ended**, until they go Past at noon.
- Under it, in small text: "Rounded, updated every 10 minutes."
- **Hidden** below 5 Households, as v2. In October it shows only when 5 or more Households test at once, which is true and harmless. In early October it's usually hidden.
- `GET /api/site` gains one boolean: `live`, meaning any counted door Event is Live.
- The **door phone's** strip keeps "Count Dracula tonight", since it only shows during a night.

**Social preview**
- `<title>`: **"Count Dracula — count your trick-or-treaters"**.
- `og:title` "Count Dracula". `og:description` and the meta description are the one-line pitch.
- **`og-home.png`:** the existing `og-image.png` artwork without its "How our Halloween night went" line, so the home card doesn't read as a summary. `og-image.png` stays for share links. `twitter:card` is `summary_large_image`.

**Not chosen**
- A separate landing page with sign-up a click away.
- A live-updating line.
- A sign-up counter ("N households signed up").

Build notes for the addendum: `GET /api/site` gains `live`; screenshots copied into `public/`; `og-home.png` made from the existing artwork.

Glossary ([CONTEXT.md](../../../CONTEXT.md)): **Site-wide total** now shows on the homepage, not the sign-up page.
