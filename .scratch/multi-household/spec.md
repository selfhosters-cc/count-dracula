# Count Dracula — v2 spec: many households

v2 runs Count Dracula as **one public deployment for many households**. Each household signs up with Google and runs its own nights. Its TV can be shared by a secret link, and paired by a code or QR. It can add a fuzzy location and see nearby activity, and share a summary of the night. An Operator dashboard watches the whole site. Our own household becomes **Household #1** on the same deployment.

- **Assembled:** 2026-10-10 from the [map](map.md) and its resolved tickets. This document makes **no new decisions**. Each section links the ticket that holds the reasoning.
- **How to read it:** as changes on top of the [v1 spec](../count-dracula/spec.md). **Anything not mentioned here behaves as in v1**, within one Household. §19 lists every v1 rule that v2 changes.
- **Glossary:** [CONTEXT.md](../../CONTEXT.md) defines every new term. §2 summarises them.
- **Build tickets:** [issues/17–49](#17-build-order-and-the-opening-line), in build order. Sign-up opens after ticket 38.
- **Open questions:** none.

## Contents

1. [Dates](#1-dates)
2. [Domain model](#2-domain-model)
3. [Identity and tenancy](#3-identity-and-tenancy)
4. [Stored data and the Household #1 migration](#4-stored-data-and-the-household-1-migration)
5. [Config split](#5-config-split)
6. [Sign-up, first-run and the Rehearsal](#6-sign-up-first-run-and-the-rehearsal)
7. [Going live and ending, by themselves](#7-going-live-and-ending-by-themselves)
8. [Time zones](#8-time-zones)
9. [Shareable TV](#9-shareable-tv)
10. [Location](#10-location)
11. [Nearby activity](#11-nearby-activity)
12. [Night summary](#12-night-summary)
13. [Operator](#13-operator)
14. [Extras above the cut line](#14-extras-above-the-cut-line)
15. [Hosting, capacity and abuse](#15-hosting-capacity-and-abuse)
16. [Privacy and retention](#16-privacy-and-retention)
17. [Build order and the opening line](#17-build-order-and-the-opening-line)
18. [Launch and the night: runbook](#18-launch-and-the-night-runbook)
19. [What changes from v1](#19-what-changes-from-v1)
20. [Where it lands in the code](#20-where-it-lands-in-the-code)
21. [Builder's latitude](#21-builders-latitude)
22. [Out of scope](#22-out-of-scope)
23. [Sources](#23-sources)

---

## 1. Dates

| When | What happens |
|---|---|
| Oct 10–12 | Decisions (done) |
| From Oct 12 | Build, in [build order](#17-build-order-and-the-opening-line) |
| **As soon as tickets 17–37 are deployed** | **Open sign-up**: the opening-day checklist ([§18](#18-launch-and-the-night-runbook)), ticket 38 |
| Opening → Oct 31, 3 pm | Tickets 39–49 deploy **fix-forward** |
| Any time before Oct 31 | Restore drill and the nearby ≥ 5 check, both on the dev box |
| **Sat Oct 31, 3 pm–midnight** | **The only change freeze.** No deploys unless the site is down |
| Sat Oct 31, 4:00 pm local | Every Household's "Halloween 2026" goes live by itself |
| Sun Nov 1, 3:00 am local | Any live, non-Rehearsal night still on is ended by itself |
| Sun Nov 1 | Check the auto-ends, export our night, write a "what broke" note |

**No rehearsal and no fixed opening date.** The Oct 24 rehearsal, the Oct 28 re-test, the Oct 24 freeze and v1's printable rehearsal checklist are gone. Source: [v2 rehearsal and launch-day plan](issues/16-v2-rehearsal-and-launch-day.md).

---

## 2. Domain model

The v1 night-level terms ([v1 §2](../count-dracula/spec.md#2-domain-model)) still apply, inside one Household. v2 adds these terms. Full definitions, with the words to avoid, are in [CONTEXT.md](../../CONTEXT.md).

| Term | In short |
|---|---|
| **Household** | One home. It owns its Events, always has exactly one live, and keeps one IANA time zone. Nothing it owns is visible to another Household unless it chooses to share. |
| **Manager** | A person signed in with Google who runs one Household. A Household can have several Managers, all equal. |
| **Invite link** | Single-use, valid 7 days. Whoever opens it and signs in with Google becomes a Manager of that Household. |
| **Helper** | Taps kids in on a door phone. No account; the phone joins with the join key. Unchanged from v1. |
| **Operator** | Runs the deployment. A Manager whose email is on the operator list in `deploy/local.env`. |
| **TV link** | The one secret link that lets a device watch a Household's live Event read-only. The porch TV and remote viewers use the same link. It never expires; rotating it cuts off every holder. |
| **TV pairing code** | A short code on a TV that has no TV link yet. A signed-in Manager redeems it to give that TV the link. |
| **Rehearsal** | A practice Event, marked as one. Sign-up creates it live. It shows a "🎭 Rehearsal" chip, can be reset to 0 while live, and never counts in nearby figures. |
| **Goes live at** | The time a not-yet-live Event goes live by itself. |
| **Night summary** | The shareable tap-through slides of one ended Event. (The **recap** is still the TV's end-of-night screen.) |
| **Location** | Optional: a 5-character geohash cell (~5 × 3 km) picked on a map. The exact point never leaves the browser. |
| **Area** | The Location's 4-character geohash parent (~20 × 25 km). Its rounded totals are what "near you" shows, once at least 5 Households in it are active. |
| **Active Household** | A Household whose live, non-Rehearsal Event counted at least one kid in the last 30 minutes. |
| **Site-wide total** | Kids counted right now across every live, non-Rehearsal Event, and how many Households that is. Rounded to 5s, refreshed every 10 minutes, hidden below 5 Households. |
| **Estimated past event** | A counts-only past Event made from a typed-in "last year" total spread over a fixed curve. Labelled "last year (estimated)". |
| **Suspended** | Switched off by the Operator without deleting anything. Its Managers see a notice; its phones, TV link and share links are refused. |
| **Report** | A stranger's flag on a public Night summary share page. |
| **Pause sign-ups** | The Operator's switch that stops new Households being created. |
| **House rules** | The three rules every Household agrees to by signing in. |
| **Idle Household** / **Abandoned sign-up** | Retention rules: 2 years without a sign-in, or 60 days without a sign-in and without counting a kid outside the starter Rehearsal. The purge jobs come after Halloween. |

**v1 terms that change meaning:**

- **Event:** "exactly one live, never zero" now holds **per Household**.
- **Join key:** one per Household, kept across Go live (as v1 already does). It's now needed on **reads** too, not just writes.
- **Display:** a computer on HDMI running Chrome or Edge full-screen is the one supported TV. Other devices are best effort ([§6](#6-sign-up-first-run-and-the-rehearsal)).

---

## 3. Identity and tenancy

([Household identity and sign-up](issues/04-household-identity-and-sign-up.md), [What becomes per-household](issues/05-what-becomes-per-household.md), [Shareable TV](issues/06-shareable-tv.md))

### Signing in

- **Google sign-in only**, with the scopes `openid email profile`. With only these scopes Google doesn't review the app. The consent screen must be **In production**: Testing mode caps at 100 test users. Without brand verification people see the domain rather than an app name, which is fine.
- **No email is ever sent.** No email provider, no sign-in links, no mail code.
- A Manager is keyed by Google's stable account id (`sub`), not the email. Each Manager belongs to **exactly one** Household.
- **Sessions:** a random token stored server-side, in an `HttpOnly; Secure; SameSite=Lax` cookie. They last 90 days and are renewed with use. Sign-out is included.
- **Recovery is Google's job.** A Manager who loses their account is re-invited by another Manager, or by the Operator ([§13](#13-operator)).
- The Google client id, client secret and public host live in `deploy/local.env`. Creating the OAuth client is a HITL task (ticket 20).

### Signing up

- One field: the **Household display name**, at most 40 characters, checked against the blocklist ([§15](#15-hosting-capacity-and-abuse)). Google's verified email means there's no separate verification step.
- Sign-up creates the **Household and its first Manager together**, once Google sign-in completes. What else it creates is in [§6](#6-sign-up-first-run-and-the-rehearsal).
- One line under the Google button: *"By continuing you agree to the Privacy notice and House rules"*. No checkbox, and no stored consent.
- **Refused sign-ups** land on a plain "Sign-ups are paused, try again later" page and create nothing. That covers Pause sign-ups and the rate limits (3 per IP per day, 60 site-wide per hour).

### Managers

- Every Manager has the same powers. A Manager can remove another Manager. **The last Manager can't leave**; they delete the Household instead.
- **Invite** (any Manager): makes a single-use link valid for 7 days. It opens the phone's share sheet (`navigator.share({ url })`), with **Copy link** as the fallback. Unused invites are listed in `/setup` and can be revoked. At most 20 per Household per day.
- **Leaving or being removed** hard-deletes that Manager's Google id, email, name and sessions at once. The Household and its nights stay with the other Managers. Invites they made stay until used or revoked.
- **Delete my Household:** any Manager, confirmed by typing the Household's name. It **immediately hard-deletes** the Household and everything it owns: events, taps, tags, tickets, share links, Location, Managers, invites, sessions and Reports. It writes one row to `deletions` ([§16](#16-privacy-and-retention)).

### Roles

| Who | How they get in | What they reach |
|---|---|---|
| **Manager** | Google session cookie | `/setup` for their Household, past recaps, the tally sheet, Night summaries, Pair a TV, invites |
| **Helper phone** | The join key | The live Event: counting, ☰ door menu (as in v1) |
| **TV-link holder** | The TV link token | The live Event read-only, TV-shaped ([§9](#9-shareable-tv)) |
| **Share-link holder** | A Night summary share token | That one night's slides |
| **Operator** | A Manager session whose email is on `OPERATOR_EMAILS` | `/operator`, plus their own Household as a Manager |

- **The admin PIN is gone.** `/setup` needs a signed-in Manager of that Household.
- **The credential carries the Household.** There's no Household in any URL: no path slug, no subdomain. `/`, `/tv`, `/setup` and `/tally` keep their v1 paths.
  - A **session** leads to its Manager and their one Household.
  - A **join key** leads to the Event and so its Household.
  - A **TV link token** leads to its Household.
- **Reads stop being open.** In v1, `/api/snapshot`, `/api/stream` and `?event=<id>` needed no key. In v2 every read carries a join key, a TV link or a session, and only reaches that Household's Events.
- **Past recaps** (`/tv?event=<id>`) and the **print tally sheet** need a signed-in Manager of the Household. Both are opened from `/setup`.
- A **Suspended** Household's credentials are refused everywhere ([§13](#13-operator)).

---

## 4. Stored data and the Household #1 migration

([What becomes per-household](issues/05-what-becomes-per-household.md), [Public hosting and abuse](issues/11-public-hosting-and-abuse.md), [Privacy notice and retention](issues/15-privacy-notice-and-retention.md))

### What the server adds to v1's data

The shape the decisions imply. Column names are the builder's.

- **households:** display name, IANA time zone, Location cell (5-char, nullable), TV link token, join key (one per Household; see [§21](#21-builders-latitude) for where it lives), TV mix (v1's `kv` "mix"), suspended-since, signed-up-at, first-run-passed flag, "about how many kids last year" (nullable).
- **events:** `household_id`; a **Rehearsal** flag; **Goes live at** (nullable); an "ended automatically" marker for the `/setup` message.
- **managers:** Google `sub`, email, name, household, last sign-in.
- **sessions:** token, manager, expires (90 days, renewed with use).
- **invites:** token, household, made by, expires (7 days), used/revoked.
- **TV pairing codes:** in memory or a table. Code, expiry (10 minutes), and the device waiting on it.
- **share links:** Event, token, display-name toggle, on/off. Plus the Area figures frozen when the night ended, for the nearby slide.
- **reports:** household, page, time, optional short reason. The reason is deleted when the Operator dismisses the Report.
- **deletions:** household id and time, nothing else. Rows are dropped after 2 months.
- **Site switches:** the Pause sign-ups flag, editable from `/operator` with no redeploy.

### Migration: today's data becomes Household #1

- **One versioned migration at startup**, `PRAGMA user_version` 0 → 1, in a single transaction. It:
  - creates `households`
  - adds `events.household_id`, with every existing event going to Household #1
  - moves `kv` "mix" onto Household #1
- Kids, tags, tickets, batches and fired moments belong to a Household through their Event and need no change.
- It's idempotent, and a fresh install skips it. **A fresh install creates no Household and no events.** Households only come from sign-up, and the `ghostSeed` path is removed.
- **Household #1:** time zone `America/Toronto`. Its display name is set in `/setup` after the first sign-in. "Halloween 2025 (counts)", the Rehearsal, its Race against and every tap survive.
- **First Manager:** `HOUSEHOLD1_MANAGER_EMAIL` in `deploy/local.env`. The first Google sign-in with that verified email becomes Household #1's Manager, and is keyed by `sub` from then on.
- Later tables (sessions, invites, share links, reports, deletions …) arrive as the next `user_version` steps, one per ticket that needs them.
- **After sign-up opens, every migration only adds**, never rewrites ([v2 rehearsal and launch-day plan](issues/16-v2-rehearsal-and-launch-day.md)).
- **Practise on a copy of the production DB** before deploying. Pull it with `ssh proxmox pct pull` (the route `deploy.sh` uses) and run the migration on it locally.
- **Rollback:** before deploying v2, tag `v1-final` and copy the SQLite file with a timestamp. It's a rollback **only until the first stranger signs up**. After that, the tag and copy are kept but never used.

### Database settings

- **`PRAGMA synchronous = NORMAL`** in WAL mode. Multi-second stalls drop to tens of ms. The cost is that the last commits can roll back on a power loss.

---

## 5. Config split

([What becomes per-household](issues/05-what-becomes-per-household.md), [Public hosting and abuse](issues/11-public-hosting-and-abuse.md))

**`config.json`** (on the server, never overwritten by a deploy):

| Field | v2 |
|---|---|
| `adminPin` | **Removed** |
| `port`, `dbPath` | Deploy config, unchanged |
| `switches` | **Operator-wide site kill switches, all on.** v1's 8, plus one per switch-off-able v2 feature ([§17](#17-build-order-and-the-opening-line)). No per-Household toggles before Halloween |
| `soundboard` (6 slots) | The **shared stock library** for every Household. **Stock sounds or shout-text only, never homemade recordings**, since they play on strangers' TVs. Our Household included |
| `ghostSeed` | **Removed.** The 2025 event is already in the DB |
| `autoJoinHosts`, `lanUrl` | **Removed.** No auto-join; the helper QR always points at the public URL |

**`deploy/local.env`** (git-ignored; the repo's examples use `count-dracula.example.com`):

| Key | What |
|---|---|
| `PUBLIC_HOST` | The real public host name |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | The OAuth client (ticket 20) |
| `OPERATOR_EMAILS` | The operator list |
| `HOUSEHOLD1_MANAGER_EMAIL` | Who becomes Household #1's first Manager |
| `OPERATOR_CONTACT` | The one contact address: `/privacy`, the Suspended notice and "Help: email us". A forwarding address on the user's own domain. The committed fallback is `privacy@count-dracula.example.com` |

`TAILNET_HOST` is removed. **Never commit a real host name.**

---

## 6. Sign-up, first-run and the Rehearsal

([From sign-up to a TV on the porch](issues/12-sign-up-to-porch-tv.md), [What becomes per-household](issues/05-what-becomes-per-household.md))

### What sign-up creates

- The **Household** and its first **Manager** ([§3](#3-identity-and-tenancy)).
- A time zone captured from the browser (`Intl.DateTimeFormat().resolvedOptions().timeZone`).
- A **live "Rehearsal"** Event, marked as a Rehearsal. It has the Household's join key, **no golden tickets**, and the **starter costume list**. That list is a fixed site-wide set of about 8 Tags in code, such as 🧙 Witch, 🦸 Superhero, 👸 Princess, 👻 Ghost, 🧛 Vampire and 🎃 Other.
- **"Halloween 2026"**, not live, with **Goes live at** set to **Oct 31, 4:00 pm in the Household's zone**, the starter costumes and v1's default of 5 golden tickets. Signing up **after** that time makes "Halloween 2026" live straight away; the Rehearsal is still created, just not live.
- **Race against: None.** v1 already hides the ghost, teaser and "last year" lines when there's no ghost. Expected kids drives the golden range, unless the estimated ghost is set ([§14](#14-extras-above-the-cut-line)). A Household's own 2026 night becomes its 2027 ghost.

### First-run: 3 screens, then `/setup`

1. **Name your household.** The display name, with the captured time zone shown read-only.
2. **Location.** The map picker ([§10](#10-location)), with **Skip**.
3. **Put it on your TV**, pairing first: *"On the TV's computer, open Chrome and go to **count-dracula.example.com/tv**."*
   - The TV shows its pairing code and scan-to-pair QR.
   - The Manager scans that QR with the **phone's own camera app** (it opens `/setup?pair=…`) or types the 6 characters into a box. There's **no in-page QR scanner** and no QR-reader library.
   - The screen ticks over to **"✓ Your TV is showing your Rehearsal"** when the TV connects.
   - Alternatives on the same screen: **Send the link instead** (Share / Copy the TV link), **Use this screen as the TV** (opens the TV link here), **Skip for now**, and **Help with TV setup** (`/help/tv`).

Every screen can be skipped. First-run shows on each visit to `/setup` until screen 3 has been passed once.

### Ready-for-Halloween checklist

It sits at the top of `/setup`. It ticks itself from real state, and hides when done or dismissed.

1. **A TV is watching:** ticked by a TV-link stream connection.
2. **A phone counted a test kid:** ticked by any kid on the Rehearsal. Then it suggests "try **Reset the Rehearsal** so your TV starts at 0".
3. **Your Halloween night:** "goes live Sat Oct 31, 4:00 pm", with an **Expected kids** field and, once built, **"About how many kids came last year?"** ([§14](#14-extras-above-the-cut-line)). It's ticked once either is set, or skipped.

Location isn't an item: it's optional and first-run already asked.

### The Rehearsal

- It's the test night. There's **no simulator.** One person can do the whole test: TV on, their own phone joined, a few taps, hear the pop.
- **Reset the Rehearsal** (only while the Rehearsal is live) clears its kids.
- A small **"🎭 Rehearsal"** chip shows in the TV top bar and the door phone header. TV-link viewers see it too.
- Takeovers, sound and the recap behave as on the night. A Rehearsal **never counts** toward nearby figures, the Site-wide total or the Operator's Counting status.
- **Clock shift** and the **golden-ticket** fields move under an **Advanced** fold in the event editor.

### Helper phones

- **Count on this device:** a button in `/setup` and the checklist, for a signed-in Manager. It stores the join key on this device and opens `/`.
- **Add a helper** in `/setup`: the join QR plus **Share join link** (`navigator.share` / Copy). The door menu's Add a helper is unchanged, except that **every join QR points at the public HTTPS URL**.

### Which TVs

- **Supported:** any computer (laptop or mini PC) on HDMI running **Chrome or Edge full-screen**, which is v1's tested setup.
- **Best effort, and labelled so:** smart-TV browsers, a tablet in landscape, a cast Chrome tab. The help says "test it on your rehearsal; if the sound or screen misbehaves, use a laptop". There's no phone-as-TV.

### `/help/tv` and the launchers

- A public page adapted from `kiosk/README.md`. It covers:
  - power and sleep settings for Windows, macOS and Linux
  - full-screen and HDMI sound
  - the `/tv?border` overscan check
  - "a reload needs a click or key press for sound"
  - a smart-TV and other-devices section: open the browser, go to `/tv`, pair, test it on your Rehearsal
- **Launchers are optional, under "Advanced":** the Windows `.bat` and a generic Linux `.sh` (systemd-inhibit plus Chrome's autoplay flag), served from `/kiosk/` as today. They open a **bare `/tv`** and never carry a secret. There's no macOS launcher before Halloween. `install-cachyos.sh` stays for us and isn't advertised.

---

## 7. Going live and ending, by themselves

([From sign-up to a TV on the porch](issues/12-sign-up-to-porch-tv.md))

- **A server minute tick** makes any Event whose **Goes live at** has passed live, using v1's Go live: the old live Event (normally the Rehearsal) is frozen, the golden draw runs, and TVs and phones follow over SSE.
- A Manager can **change Goes live at** (for towns that trick-or-treat on Friday the 30th), or **Go live** early from `/setup`.
- **"Go live on Halloween 2026 now"** appears in the door phone's ☰ menu, but only on a phone where a **Manager is signed in**. Helpers can't Go live.
- **Nudge:** on a live, non-Rehearsal Event, after **8:30 pm** local with **no tap for 30 minutes**, the door phone shows **"Quiet out there? 🌙 End the night"**. It goes through the usual confirm, golden-ticket choices included. Dismissing it hides it for 30 minutes.
- **Safety net:** the same minute tick **ends** any live, non-Rehearsal Event still unended at **3:00 am** local the next morning. Unclaimed golden tickets expire, as with "End anyway". `/setup` then says *"Your night ended automatically at 3:00 am. Your summary is ready"* and links to the Night summary.
- **One join key per Household, kept across Go live**, so phones joined at the Rehearsal keep working on the night. **Change join key** still cuts off old phones.

---

## 8. Time zones

([What becomes per-household](issues/05-what-becomes-per-household.md))

- Each Household stores an **IANA time zone**, captured from the signing-up Manager's browser. `/setup` shows it read-only, and the Operator can fix it. It isn't derived from the Location.
- **All event-time maths uses the Household's zone, never the device's or the server's.** The snapshot carries `timeZone`.
- `minuteOfDay`, `atEventTime` and `toBuckets` in `shared/night-maths.js` take a zone and convert with `Intl`. That covers:
  - the ghost line and the race chart's x-axis
  - the 7:45 pm Release remaining gate
  - the backfill rows and the tally sheet
  - the CSV export (`server/export.js`)
  - Goes live at, the 8:30 pm nudge and the 3:00 am auto-end
  - the Night summary's half-hours and barcode
- So a remote viewer of a TV link sees the Household's own evening.
- The server's `TZ` stops mattering. Clock shift works unchanged on top.

---

## 9. Shareable TV

([Shareable TV: link, code and QR](issues/06-shareable-tv.md), [From sign-up to a TV on the porch](issues/12-sign-up-to-porch-tv.md))

### The TV link

- Each Household always has exactly one **TV link**: a secret URL such as `/tv/k/<long random token>`. The token identifies the Household. **There's no sharing on/off:** whoever holds the link can watch.
- **No expiry.** `/setup` has **Rotate TV link** (any Manager, with a confirm). Every device holding the old link is disconnected straight away (its stream closes) and falls back to the pairing screen.
- **In `/setup`:** the TV link with **Share** (`navigator.share`), **Copy**, and a full-screen **QR** for someone standing next to the Manager. The TV link's QR appears **only in `/setup`**: never on the porch TV, and there's no printable poster.

### The TV pairing code

- A **bare `/tv`** with no stored link shows a pairing screen with:
  - a **6-character code** from an alphabet with no lookalikes (e.g. `K7Q-M4X`), valid **10 minutes** and then replaced
  - a **scan-to-pair QR** (the vendored `public/vendor/qrcode`) that opens `/setup?pair=<code>`
  - the line *"On your phone, go to count-dracula.example.com/setup → Pair a TV, or scan this"*
- A signed-in Manager scans it or types it into `/setup` → **Pair a TV** and confirms "Show our TV here?". The waiting device then switches to the Household's TV link.
- Redeeming needs a Manager session and is rate-limited per Manager, so a guessed code gets nothing.
- The pairing QR may appear on a TV. v1's rule "the join QR never goes on the TV" still holds.
- **A bare `/tv` remembers the TV link it was paired to** (`localStorage`) and goes straight to it on the next load. If that link has been rotated or the Household is gone, it clears the stored link and shows pairing again.
- **Paired devices are exempt from the per-Household viewer cap** ([§15](#15-hosting-capacity-and-abuse)). The server must be able to tell a device paired by code from someone who was sent the link.

### What viewers get

- **The same `/tv` page** as the porch: takeovers, sound, recap.
- **Live Event only:** the live board, its ghost, the idle teaser and its end-of-night recap. It follows Go live to the next Event.
- **TV-shaped payload:** snapshots and streams read with the TV link **leave out each kid's `phoneName`** (and v1's `settings.lanUrl`, which is gone anyway). Everything else stays as the TV draws it: Event name, costume names and emoji, kid numbers, tap times, ghost buckets, won golden numbers and the golden summary. The join key was never in the snapshot and still isn't. Join-key phones keep the full payload.
- **Not on the TV:** the Household display name (the title stays "Count Dracula", or the Event name once ended) and anything location-related except the nearby box ([§11](#11-nearby-activity)).
- On a **portrait phone**, a "turn your phone sideways" overlay.
- When the Household is **Suspended**, the TV link shows a neutral "Not available".

### Sound: the board always shows

- When audio isn't running, the live board renders normally with a corner pill: **"🔇 Click or press OK for sound"**. **Any click, touch or key** unlocks it, which covers TV remotes that can't aim at a button.
- The full-screen **Start the night** welcome shows only while **no kid has been counted** on the live Event **and** audio hasn't been unlocked on this page load. After the first kid, a reload only ever shows the pill.
- The same applies to remote TV-link viewers.

### Separate from the Night summary

The Night summary's share links are per ended night, public, and each can be turned off. The TV link is per Household, live-only, and only rotated. They share no switch and no token.

---

## 10. Location

([Fuzzy location](issues/07-fuzzy-location.md), [Privacy notice and retention](issues/15-privacy-notice-and-retention.md))

- **Optional.** First-run asks once, with Skip. Any Manager can add, change or remove it later in `/setup`. **Having a Location is taking part in nearby**; there's no separate switch.
- **The picker:** a **Leaflet 1.9.4** map, vendored in `public/vendor/` with its BSD-2 notice kept.
  - The map appears only behind a **"Pick on a map"** tap, never on page load, so a Manager who skips it never contacts OpenStreetMap.
  - **Use my location** (browser geolocation, HTTPS) or pan and zoom by hand, worldwide.
  - **No postal codes and no typed addresses.**
  - OSM tiles load only in the picker, with the OSM credit visible. Nothing on the night depends on them.
- **Fuzzing happens in the browser.** The point is snapped to a **5-character geohash cell** and only the cell id is sent. The picker shows the shaded cell, never a pin.
- **The cell is all we store.** Changing it replaces it, with no history kept. Removing it, or deleting the Household, erases it.
- The picker carries the line *"Only a ~5 km square is saved · Privacy"*.
- The CSP allows `https://tile.openstreetmap.org` for images, and the referrer policy sends OSM the origin it requires ([§15](#15-hosting-capacity-and-abuse)).

---

## 11. Nearby activity

([Fuzzy location](issues/07-fuzzy-location.md), [Nearby activity indicator](issues/08-nearby-activity.md), [Public hosting and abuse](issues/11-public-hosting-and-abuse.md))

Prototype: branch `prototype/nearby-activity` (commit `74e6187`), `public/nearby-prototype.js`. **Variant A** was chosen, on both surfaces.

### The figures

- **Area:** the 4-character geohash parent of a Household's cell. Fixed and non-overlapping, so one Area's figures can't be subtracted from another's. There's **one level only**.
- **Active Household:** a live, **non-Rehearsal** Event that counted at least one kid in the **last 30 minutes**. Suspended Households never count.
- **An Area shows nothing until at least 5 Households in it are active.**
- **Figures:**
  - **kids in the last half hour**, rounded to 5s ("under 5 kids" when it rounds to 0)
  - **houses counting** (active Households)
  - the Area's **top costume**: the most-counted costume across its active Households' live Events, **only from names counted in at least 3 different Households** (case-insensitive, trimmed), and **never a blocklisted name**. If none qualifies, the clause is left out.
- **Computed every 10 minutes**, not on every tap, so "kids at this door right now" can't be tied to a home.
- **Only Area totals**, never anything about one Household. No place names: it only ever says "near you".

### Where it shows

- **TV:** a small **"🏘️ Near you tonight"** box under the hero's rush meter: kids in the last half hour · houses counting · top costume. It's kept small so the pumpkin patch stays on screen. Remote TV-link viewers see the same.
- **Phone:** a one-line strip under the count: *"🏘️ Near you: ~90 kids in 30 min · 14 houses"*.
- Both refresh with the figures, every 10 minutes. No trend line, no "you vs the average house", no chart, no public page.

### Below the minimum, or no Location

- **TV:** nothing; the box doesn't render.
- **Phone:** the strip shows the **Site-wide total** instead: *"🎃 Count Dracula tonight: 212 houses · ~3,140 kids"*.
  - That's Households with a live, non-Rehearsal Event right now, and the kids counted in those Events.
  - The same rules apply: ≥ 5 such Households, kids rounded to 5s, refreshed every 10 minutes.
  - Below that, the strip is hidden.

### Accepted risk

Someone could create 4 fake Households in a target's Area to get past the minimum and learn the target's rounded, 30-minute kid count. Rounding, the delay and the per-IP limit on creating Households keep this low-value.

---

## 12. Night summary

([Shareable night summary](issues/09-shareable-night-summary.md), [Fuzzy location](issues/07-fuzzy-location.md), [Public hosting and abuse](issues/11-public-hosting-and-abuse.md))

Prototype: branch `prototype/night-summary` (commit `ef3a9e3`), `public/summary-prototype.html` + `.js`. **Variant C** (Wrapped-style slides) was chosen, plus a receipt slide from B.

### The slides

Tap-through **9:16** stories, one stat per slide. People screenshot the slides they want, so each slide must stand alone. In order:

1. **Intro:** the display name and the night
2. **Total** and the time span
3. **Vs the ghost**, with the race chart. With no ghost, it says *"Next year: N is the number to beat"*. With an Estimated past event, it says **"last year (estimated)"**
4. **Peak half-hour** and **biggest crew**
5. **Costume of the night** and the runners-up
6. **Golden tickets**, with every number revealed as on the v1 recap
7. **Nearby**, only when it existed: "near you" with the Area figures **frozen when the night ended**, never a place name
8. **Receipt:** costume line items, teens, total, vs last year, golden tickets as a coupon, and the **kids-per-minute barcode**
9. **Closing card**, with the Share button

- Slides exist once the night is **ended** (🌙 End the night, or the 3 am auto-end), and for any past night. Resuming the night just updates them.
- Times use the Household's zone ([§8](#8-time-zones)).
- A Manager opens them from `/setup`, and from the "Your night ended automatically" message.

### Sharing

- **Screenshots plus a public share link.** The Share button on the last slide opens the phone's share sheet with a link that opens the slides **without signing in**.
- The link preview is **one fixed Count Dracula image**, never rendered per night. There's no "Save image" button and no server-side image rendering.
- **The display name** shows on the slides, and `/setup` warns "this appears on anything you share". Each share has a **toggle to hide the name**.
- A share link lasts **until the Household turns sharing off** for that night, or deletes the night.
- The public share page's footer links to **`/privacy`** and **"Report this page"** ([§15](#15-hosting-capacity-and-abuse)).
- For a Suspended Household, the share page shows a neutral "Not available".

---

## 13. Operator

([Operator dashboard](issues/10-operator-dashboard.md), [Public hosting and abuse](issues/11-public-hosting-and-abuse.md))

**One page, `/operator`, built for Halloween night.** It's open to a signed-in Manager whose email is in `OPERATOR_EMAILS`. It's phone-sized and you check it by looking at it: no alerts, no history graphs. It's refreshed by **polling one `/api/operator` endpoint every 30 s**, with no new SSE stream.

**Before opening, a bare `/operator` is enough:** a way to find a Household (name search), plus **Rename**, **Suspend / Unsuspend** and **Pause sign-ups**. The rest follows after opening ([§17](#17-build-order-and-the-opening-line)).

### Health strip

One row of tiles, each with a plain amber/red rule.

| Tile | Shows | Amber / red |
|---|---|---|
| Live nights | Households in each status (the filter chips' counts) | none |
| Connections | Phones · TV screens · total, against the site-wide cap | amber ≥ 80% of the cap, red at the cap |
| Refused | Connections and sign-ups refused by caps or rate limits since start | amber if any in the last 10 min |
| Errors | 5xx responses and uncaught exceptions since start, plus the last error's message and time (server-generated text only, never a request body) | red if any in the last 10 min |
| Last tap | Time since a kid was counted anywhere | amber > 10 min while any Household is Counting |
| Backup | Age of the last `VACUUM INTO` copy | amber > 30 min (2× the 15-minute interval) |
| Server | Uptime; RSS against **1 GB**; the switches on/off (read-only, still edited in config) | amber RSS > 800 MB |

Counters are in memory and reset on restart; uptime shows when that happened.

### Household status

Only a counted kid counts as activity; connections and setup changes don't. The same 30-minute window as nearby applies.

| Status | Rule |
|---|---|
| **Counting** | An Active Household |
| **Stale** | A live, non-Rehearsal Event that has counted kids, but none in the last 30 min |
| **Waiting** | A live, non-Rehearsal Event with no kids yet |
| **Rehearsal** | The live Event is a Rehearsal |

Stale is information, not an alarm: usually a forgotten 🌙 End the night, or a dead porch phone.

### Household table

- **Columns:** Status · Household (full display name) · Area (4-char, or "—") · Kids (live Event) · Last kid (relative) · Phones (join-key connections) · TV screens (TV-link connections) · Managers (a count) · Reports (open count) · Signed up.
- **TV screens** is one number: the porch TV and remote viewers share the TV link, so they can't be told apart.
- Sorted Counting → Stale → Waiting → Rehearsal, with the most kids first within each.
- **Status filter chips** with counts, and a **name search**. Households with an open Report are flagged.
- No per-row charts. Tapping a row opens the **detail view**.

### Detail view and actions

- It shows Managers' **Google emails** (only here, where recovery needs them), the Area (**never the 5-char cell**), the current state ("Suspended since 8:42 pm") and open Reports (each dismissable).
- **Actions** (in the detail view only, never on the table):
  1. **Rename** the display name.
  2. **Fix time zone:** pick from the IANA zones.
  3. **Make an Invite link** for the Household. This is the recovery path for a locked-out Manager: the Operator copies the link and sends it themselves.
  4. **Suspend / Unsuspend**, which is reversible:
     - Managers see *"This Household is suspended by the Operator"* plus `OPERATOR_CONTACT`, in place of `/setup`.
     - Join-key phones, the TV link and Night summary share links are refused, and open streams are closed.
     - It drops out of nearby and site-wide figures.
     - Nothing is deleted, and the retention clocks don't change.
- **Pause sign-ups:** a switch on `/operator`. While it's on, new sign-ups see "Sign-ups are paused, try again later". Existing Households, Managers and invites keep working.
- **Audit:** one structured log line per Operator action in journald, e.g. `operator action=suspend household=37 by=<operator email>`. There's no audit table and no history screen.

**Moderation policy:** a bad display name or costume name → **Rename**. A deliberate pattern (renaming back, a Household built for abuse, fake Households padding an Area) → **Suspend**. No warning step.

---

## 14. Extras above the cut line

([Multi-household extras shortlist](issues/13-multi-household-extras.md))

Built after the four must-haves, in this order. Cut from the bottom if the build slips.

1. **Last year's total, shaped into a ghost** (about ½ day).
   - Checklist item 3 asks an optional **"About how many kids came last year?"**, which is also editable in `/setup`.
   - The number becomes a **counts-only past event**, "Halloween 2025 (estimated)", through v1's existing `counts_only` + stored-buckets path. It's set as "Halloween 2026"'s **Race against**.
   - **Shape:** the total is spread over a fixed curve in code: our own 2025 night's five half-hour buckets ([2025-counts.md](../count-dracula/data/2025-counts.md), 17:42–20:00), normalised to fractions so no counts are revealed. The buckets are read at the same local times in the Household's zone. Rounding goes to the biggest bucket, so the total is exact.
   - It's labelled **"last year (estimated)"** on the race chart, the "vs last year" lines and the Night summary.
   - It's an ordinary Race against, so v1's golden draw uses its total. Expected kids stays the fallback.
   - A Manager can change or clear it; clearing sets Race against back to None.
   - It's only offered while the Household has **no past Event of its own**, so Household #1 keeps "Halloween 2025 (counts)".
2. **The Site-wide total on the public sign-up page** (1–2 hours): the same line and rules as the phone fallback ([§11](#11-nearby-activity)). It isn't on the TV or in `/setup`.
3. **A site-wide top costume clause** (about 1 hour): the site line gains "· top costume: 🧙 Witch" wherever it shows (the phone fallback and the sign-up page). It follows the Area's rule: ≥ 3 Households, case-insensitive and trimmed, never blocklisted, and left out if none qualifies. **First to drop.**

---

## 15. Hosting, capacity and abuse

([Public hosting and abuse](issues/11-public-hosting-and-abuse.md), [Public exposure](issues/03-public-exposure-limits.md), [v2 rehearsal and launch-day plan](issues/16-v2-rehearsal-and-launch-day.md))

### Hosting

```
 visitors ──HTTPS──► Cloudflare (proxied zone) ──► shared Caddy (LXC 117) ──► Bun on LXC 118
                       CF-Connecting-IP              own access log,            2 cores / 1 GB
                                                     tokens masked,             SQLite WAL,
                                                     stream_close_delay 10m     synchronous=NORMAL
```

- **LXC 118 stays the home, raised to 2 cores / 1 GB** (`pct set 118 --cores 2 --memory 1024`).
- Public at `count-dracula.example.com` in the repo. The real name is `PUBLIC_HOST`. It's a new subdomain under an existing wildcard on the shared Caddy (`host-public.sh add`), so there's no DNS or certificate work.
- The zone is **Cloudflare-proxied**: visitors never reach the home IP. Caddy already trusts `CF-Connecting-IP` from Cloudflare's ranges, and **the app takes the client IP from it**. SSE survives Cloudflare's ~100 s idle cut because the hub pings every 15 s.
- **No LAN route and no local DNS override.** If the home internet drops, every TV freezes, ours included. Taps wait in the phones' outbox, and nothing is lost.
- `lanUrl`, the `lanAddress()` fallback, `autoJoinHosts`, `/api/join` and `TAILNET_HOST` are removed.

### Live connections

- **Per-Household SSE channels, each with its own `seq`.** That's required before any cap means anything. Today's hub is global (every TV would get every Household's kids) and `seq` is process-wide.
- **Viewers that stop reading are dropped** (`desiredSize` < 0). EventSource reconnects them to a fresh snapshot.
- Streams can be **closed by credential**, for Rotate TV link, Change join key and Suspend.
- Clients wait a random **0–5 s before reconnecting**, so a restart doesn't arrive as one storm.
- **Caps** (starting numbers; the load check adjusts them):

| Cap | Number | When full |
|---|---|---|
| TV-link viewers per Household | **200** | Viewer 201 gets "This TV is full, try again soon", retrying with backoff |
| Open streams per IP | **20** | 429 |
| Site-wide | **3,000** streams | New TV-link viewers are refused first. Phones keep getting in up to a hard ceiling of **3,500** |

- **Never refused by the per-Household cap:** the Household's own phones (Managers and Helpers) and TVs paired by code. They still count site-wide.
- Every refusal is counted for the `/operator` Refused tile.

### Rate limits

In-process token buckets keyed on `CF-Connecting-IP`, with **all the numbers in one constants block**. Each refusal returns 429, counts on `/operator` and writes one log line. The buckets live in memory only.

| What | Limit |
|---|---|
| Create a Household | **3 per IP per day**, and **60 site-wide per hour** |
| Google sign-in attempts | 30 per IP per hour |
| Request a TV pairing code (bare `/tv`) | 30 per IP per hour |
| Redeem a TV pairing code | 10 per Manager per 10 min |
| Make an Invite link | 20 per Household per day |
| Taps | 10/s with bursts up to 30, per Household |
| Report this page | 5 per IP per day |
| Request bodies | 64 KB max (Caddy's built-in `request_body`) |

**No Turnstile** (Google-only sign-in already filters bots), and no Cloudflare Bot Fight Mode or "Under Attack" mode: their challenges break API calls and SSE.

### User text on shared screens

- A **vendored blocklist** (slurs and obvious obscenities, a few hundred entries) is matched on normalised words with leetspeak folded. It runs when a **display name** or **costume name** is saved. A match is refused with **"Pick another name"**, never silently starred out.
- The **top costume** in nearby and the site line also passes the blocklist, on top of the ≥ 3-Households rule.
- There's no review queue and no pre-moderation. The filter is leaky by design; what gets through is handled by Rename and Suspend.
- **Standing build rule:** user text never reaches `innerHTML` unescaped (today's code uses `esc()` / `textContent`). **Every ticket that renders user text has a test with `<img src=x onerror=…>` as a costume or display name.**

### Reports

- **"Report this page"** appears on public Night summary share pages only. It's not on the TV link, which is a passive porch display.
- It stores a **Report**: the Household, the page, the time and an optional short reason. No email is sent.
- `/operator` shows open Reports ([§13](#13-operator)).

### Browser security headers

The same set on every app response:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
  img-src 'self' data: https://tile.openstreetmap.org; connect-src 'self';
  form-action 'self' https://accounts.google.com; frame-ancestors 'none'
Referrer-Policy: strict-origin-when-cross-origin
X-Content-Type-Options: nosniff
```

- The three inline `<script type="module">` blocks in `index.html`, `setup.html` and `tally.html` move to `.js` files.
- **No embedding:** nobody can iframe a TV link or `/setup`.
- The referrer policy gives OSM the origin it requires, and keeps a TV link's secret path out of any Referer.
- HSTS already comes from Caddy.

### Backups

- **`VACUUM INTO` every 15 minutes**, run by the Bun process on a timer, into `/var/lib/count-dracula/backups/`.
- **Retention:** the last 8 copies (2 hours) plus one per day for **14 days**. The same timer deletes older ones.
- **Off-box:** a daily cron on the dev box pulls the newest copy through `ssh proxmox pct pull`, and **keeps 14 days** of pulls.
- The Proxmox vzdump job stays unchanged as a second layer.

### Things that drop every connection

- **`stream_close_delay 10m`** on the Count Dracula block in the shared Caddyfile, so other projects' reloads don't cut our streams.
- **Change freeze: Oct 31, 3 pm–midnight.** No app deploys and no Caddy changes unless the site is down. `deploy.sh` prints a warning (not a block) when run inside that window.

---

## 16. Privacy and retention

([Privacy notice and retention](issues/15-privacy-notice-and-retention.md))

**Posture:** a good-faith, plain-language notice, not compliance paperwork. **Every promise is something the build already keeps.** No cookie banner (there's one sign-in cookie and no analytics).

### The `/privacy` page

- One static page in `public/`, about a minute to read, dated at the top ("Updated Oct 2026").
- Headings: *What we keep · Who else sees it · What's public · How long · Deleting · Contact*, then **House rules**.
- **House rules,** three bullets:
  - keep names and costume text decent
  - one real Household per home, no fake ones
  - Managers are adults running their own door

  The Operator can Rename or Suspend a Household that breaks them. There's no separate Terms page.
- **Contact:** the server fills in `OPERATOR_CONTACT` when serving the page; the committed fallback is `privacy@count-dracula.example.com`. The promise is *"One person runs this as a hobby. Email us and we'll reply as soon as we can."* No contact form.
- **Linked from:**
  - the sign-up page footer
  - the line under the Google button
  - the Location picker
  - public Night summary share pages
  - `/setup`'s settings area

  It's **not** linked from the TV.

**What the notice says, and what the build must keep true:**

| The notice says | The build keeps it by |
|---|---|
| Nights are kept until a Manager deletes the night or the Household | No automatic deletion of nights |
| Idle Households (2 years) and Abandoned sign-ups (60 days) are deleted without warning | The rules are stated now; **the purge jobs come after Halloween** (the first deletion can't fall before late Dec 2026) |
| *"Deleting is immediate. Copies in our backups are gone within 2 months."* | Hard delete; the `deletions` table; `VACUUM INTO` 14 days; dev-box pulls 14 days; vzdump at most ~9 weeks |
| No restores for individuals | — |
| *"Our servers log IP addresses to stop abuse and fix problems. Logs are deleted after 30 days."* | journald `MaxRetentionSec=30day`; Count Dracula's own Caddy access log with `roll_keep_for 720h` and a size cap |
| Tokens aren't in logs | Caddy log masking: the TV link token (`/tv/k/<token>`), the share token and `?key=` join keys become `REDACTED`. **Every token-bearing URL the app uses must be in a masked shape** |
| *"Your exact position never leaves your device."* | Geohash snapping in the browser |
| OSM is contacted only while picking a Location | Tiles load only after the "Pick on a map" tap |
| *"Leaving a Household deletes your account details. The Household's nights stay with the other Managers."* | Manager hard delete on leave or remove |
| Report reasons are deleted when dismissed | Deleted on dismiss; otherwise deleted with the Household |
| *"Email us and we'll send you what we hold about you."* | The SQLite query in `deploy/RUNBOOK.md` |
| *"One sign-in cookie, kept 90 days and renewed while you use it. No other cookies."* | [§3](#3-identity-and-tenancy) sessions; `localStorage` (join key, phone name, the TV link) isn't a cookie |
| Who else sees it: **Google** (sign-in), **Cloudflare** (every request), **OSM** (only while picking a Location). *"No analytics, no ads, and we never sell or share your data."* *"Hosted on our own server in Canada."* | — |

- **What's public:**
  - **TV-link holders:** the live board (count, ghost, costumes; phone names stripped). The display name isn't shown on the TV ([§9](#9-shareable-tv)).
  - **Share-link holders:** that night's slides, with the display name per the share's toggle.
  - **Area figures and the Site-wide total**, rounded and with minimums.
  - **Never public:** emails, Manager names, the Location cell, phone names.
  - The notice adds: *"Anyone you give your TV link or a share link to can pass it on. Rotate the TV link or turn sharing off in `/setup` to cut them off."*
- **Children and Helpers:** *"We count trick-or-treaters, never who they are. … Please don't type children's names into costumes or phone names."* There's no UI change.
- **Changes to the notice:** the date at the top changes. No email is sent.

---

## 17. Build order and the opening line

([v2 rehearsal and launch-day plan](issues/16-v2-rehearsal-and-launch-day.md), [Multi-household extras shortlist](issues/13-multi-household-extras.md), and every ticket above)

The tickets live in `issues/` beside this spec, in v1's shape: `Type:`, `Status:`, `Blocked by:`, acceptance boxes. **Build in number order** unless a ticket is blocked. Tickets marked HITL need the user.

### Before the opening line: the core path and the public-safety set

| # | Ticket | Type | Set |
|---|---|---|---|
| 17 | [Households in the Ledger and the Household #1 migration](issues/17-households-and-migration.md) | AFK | Core |
| 18 | [Household time zones in the night maths](issues/18-household-time-zones.md) | AFK | Core |
| 19 | [Per-Household live channels](issues/19-per-household-channels.md) | AFK | Safety |
| 20 | [Google OAuth client and local.env](issues/20-google-oauth-client.md) | HITL | Core |
| 21 | [Google sign-in, Managers and deleting a Household](issues/21-google-sign-in.md) | AFK | Core |
| 22 | [Every read and write carries a credential](issues/22-credentials-scope-everything.md) | AFK | Core |
| 23 | [The TV link](issues/23-tv-link.md) | AFK | Core |
| 24 | [TV pairing code and QR](issues/24-tv-pairing.md) | AFK | Core |
| 25 | [Location picker](issues/25-location-picker.md) | AFK | Core |
| 26 | [Goes live at, the 8:30 nudge and the 3 am auto-end](issues/26-auto-go-live-and-auto-end.md) | AFK | Core |
| 27 | [First-run, the ready checklist and the Rehearsal](issues/27-first-run-and-rehearsal.md) | AFK | Core |
| 28 | [Connection caps and rate limits](issues/28-caps-and-rate-limits.md) | AFK | Safety |
| 29 | [Blocklist on names and costumes](issues/29-blocklist.md) | AFK | Safety |
| 30 | [Browser security headers](issues/30-security-headers.md) | AFK | Safety |
| 31 | [Bare /operator: Rename, Suspend and Pause sign-ups](issues/31-bare-operator.md) | AFK | Safety |
| 32 | [VACUUM INTO backups and the off-box pull](issues/32-backups.md) | AFK | Safety |
| 33 | [The /privacy page and support links](issues/33-privacy-page.md) | AFK | Safety |
| 34 | [Deploy scripts, config and logs for v2](issues/34-deploy-for-v2.md) | AFK | Safety |
| 35 | [Public host on the shared Caddy](issues/35-public-host-on-caddy.md) | HITL | Safety |
| 36 | [Load test script](issues/36-load-test.md) | AFK | Opening |
| 37 | [RUNBOOK.md and the opening-day checklist](issues/37-runbook.md) | AFK | Opening |
| **38** | **[Open sign-up](issues/38-open-sign-up.md)** | **HITL** | **The opening line** |

### After the opening line: fix-forward until Oct 31, 3 pm

Every deploy from here starts with a timestamped DB copy, and its migrations only add.

| # | Ticket | Type | Switch-off-able |
|---|---|---|---|
| 39 | [Invites and Managers leaving](issues/39-invites.md) | AFK | — |
| 40 | [Operator dashboard: health strip and Household table](issues/40-operator-dashboard.md) | AFK | — |
| 41 | [Nearby: the TV box, the phone strip and the site-wide fallback](issues/41-nearby.md) | AFK | **yes** (with 46) |
| 42 | [Nearby seed script and the ≥ 5 check](issues/42-nearby-seed.md) | AFK | — |
| 43 | [Night summary slides](issues/43-night-summary-slides.md) | AFK | — |
| 44 | [Night summary share links and Reports](issues/44-summary-share-links.md) | AFK | **yes** |
| 45 | [Estimated ghost from last year's total](issues/45-estimated-ghost.md) | AFK | **yes** |
| 46 | [Site-wide total on the sign-up page](issues/46-site-total-on-sign-up.md) | AFK | **yes** (with 41) |
| 47 | [Site-wide top costume clause](issues/47-site-top-costume.md) | AFK | **yes** |
| 48 | [/help/tv polish and the launchers](issues/48-help-tv-polish.md) | AFK | — |
| 49 | [Restore drill on the dev box](issues/49-restore-drill.md) | HITL | — |

- **Why this order after the line:** ticket 16 lists the full `/operator` first, then nearby and the Site-wide total, the Night summary and its share links, the estimated ghost, the top-costume clause and `/help/tv` polish. Ticket 13 ranks the three extras. Invites (39) are in neither of ticket 16's sets, so they land first after the line: the Operator's recovery path (Make an Invite link) needs them.
- **Switches:** each switch-off-able group above gets an Operator-wide switch in `config.json`, beside v1's 8. The groups are nearby + the Site-wide total, share links, the estimated ghost and the top-costume clause. Switching one off hides it everywhere.
- **Cut rule:**
  - A switch-off-able feature still broken at **3 pm on Oct 31** is **switched off site-wide** for the night, and never debugged on Halloween.
  - If time runs out, the extras drop from the bottom (47 first).
  - **Core path problems** are fixed forward whenever they turn up. If strangers would be signing up into something broken, **Pause sign-ups** until it's fixed.
- **Still open from v1:** [Kiosk launcher for the TV laptop](../count-dracula/issues/37-kiosk-launcher.md) and [Sound assets](../count-dracula/issues/38-sound-assets.md). Both are HITL and for our own porch; [§19](#19-what-changes-from-v1) lists what v2 changes in each.

---

## 18. Launch and the night: runbook

([v2 rehearsal and launch-day plan](issues/16-v2-rehearsal-and-launch-day.md), [Public hosting and abuse](issues/11-public-hosting-and-abuse.md), [Privacy notice and retention](issues/15-privacy-notice-and-retention.md))

All of this goes into **`deploy/RUNBOOK.md`** (ticket 37).

### Opening-day checklist

Done by the user, in order:

1. Tag **`v1-final`** and take a timestamped copy of the SQLite file.
2. **Deploy v2.** The migration runs. Sign in with `HOUSEHOLD1_MANAGER_EMAIL` to become Household #1's Manager. Check that "Halloween 2025 (counts)", the Rehearsal and Race against survived, and that our TV pairs.
3. **Load check** (below). Adjust the caps and redeploy if needed.
4. **Privacy checks:**
   - `/privacy` shows the real `OPERATOR_CONTACT`, and a test email to it arrives
   - a TV-link token appears **masked** in the Caddy log
   - OSM tiles load only after the tap in the Location picker
5. **Google consent screen:** set the production redirect URI, the app name and the `/privacy` link, then **Publish**. Until this step it stays in Testing, so only listed test users can sign in. **This is the gate between deploying and opening.**
6. **Test Household,** with the user's second Google account, through the public URL, on a phone that has never opened the site:
   - go through the 3-screen first-run
   - pair a second browser as its TV, both by code and by QR
   - set its "Halloween 2026" **Goes live at** to 10 minutes ahead, and watch it go live with its TV following
   - leave it overnight, and check next morning that it **ended at 3 am** and its summary is ready. The Night summary is built after the opening line, so before ticket 43 is deployed this means `/setup`'s "Your night ended automatically" message
   - **delete** it, which tests the hard delete

   This is the one place auto go-live and auto-end are tested before Oct 31.
7. Turn **Pause sign-ups** off: **sign-up is open.**

### Load check

- **`deploy/loadtest.js`** (ticket 36) re-does the [Public exposure](issues/03-public-exposure-limits.md) appendix method (whose scripts were never committed) against the v2 per-Household hub. It opens N TV-link viewers on one Household plus a few on others, taps, and reports the fan-out time per tap and RSS.
- It runs **on LXC 118 against a second instance on a spare port with a scratch DB**. Never against the real DB, and not through Cloudflare or Caddy: the per-IP cap would block it, and CPU is what's being measured.
- It runs **once**, right after the v2 deploy and before opening. About 15 minutes.
- **Pass:** a tap reaches 200 viewers on one Household in under ~100 ms, and 3,000 site-wide streams stay under ~800 MB RSS. Otherwise lower the caps to what passes.

### Checked off production

- **Nearby's ≥ 5 view:** on the dev box, a seed script (ticket 42) makes 6 fake Households in one Area with taps and costumes. Look at the TV box and the phone strip there, including a costume counted in only 2 Households (hidden) and a blocklisted one (hidden). **There are no fake Households on production**, which only ever shows the below-minimum view.
- **Restore drill** (ticket 49): on the dev box, from the daily pulled `VACUUM INTO` copy: stop, copy into place, start, check the counts. It checks the off-box pull at the same time. Once, any time before Oct 31.

### Incident plan

| Scenario | First move |
|---|---|
| Site down | systemd restarts it; `journalctl -u count-dracula` on LXC 118; the `/operator` health strip |
| Bad deploy | `deploy/deploy.sh --rollback` |
| Database file damaged | Stop the service, copy the newest `VACUUM INTO` copy into place, start (≤ 15 min lost). **Then delete every Household listed in `deletions` since the backup's time** |
| Overload | Lower the caps and redeploy (outside the freeze, unless the site is down); phones keep priority by design |
| Abuse | Rename or Suspend from `/operator` |
| Suspected breach | Wipe the sessions table (every Manager signs in again), rotate every TV link and join key, rotate the Google client secret in `local.env` |
| Sign-up flood | Pause sign-ups on `/operator` |
| Access request by email | The SQLite query that pulls a Manager's row, their Household and its Events; reply by hand |

### Support, from opening to Oct 31

- **One channel: `OPERATOR_CONTACT`**, as "Help: email us" in `/setup`'s footer, on `/help/tv` and on the sign-up page. No forum, chat, status page or banner.
- The inbox is checked **once a day**, and on **Oct 31** at **3 pm** and about **6 pm**. Nothing is promised during the night; replies come the next day.
- A question that comes up twice becomes a line on `/help/tv` (a fix-forward deploy), not a separate FAQ.

### Household #1 before Oct 31

This is v1's Oct 30 step, moved onto v2. It's not a new decision: Household #1 was migrated rather than signed up, so it has no auto-created "Halloween 2026".

1. In `/setup`, create **"Halloween 2026"** with **Copy costumes from** the Rehearsal. Set **Race against "Halloween 2025 (counts)"**, **5 golden tickets**, **Clock shift 0**, and **Goes live at Oct 31, 4:00 pm**.
2. Test our own porch like any Household's: our Rehearsal, the checklist and `/help/tv`. v1's hardware checks (overscan, HDMI sound, volume ceiling, kiosk flags) are ours to run this way ([v1 §14](../count-dracula/spec.md#14-laptop-kiosk-setup)).
3. Print the tally sheet. **Our porch keeps v1's last resort:** the paper tally sheet plus a Nov 1 backfill.

### Oct 31

- **On call:** the user, alone, best effort, between kids at our own door. Check `/operator` on the phone at **4 pm** (Households went live), **6 pm**, and then in lulls.
- **Decided in advance:**
  - **Near the caps, or RSS amber:** do nothing. The caps already refuse TV-link viewers first. Lowering the caps means a redeploy that drops every stream, so only do it if the process is actually restarting from memory pressure.
  - **Sign-up flood:** Pause sign-ups. Otherwise sign-up stays open all night (a late sign-up's "Halloween 2026" goes live at once).
  - **A Report or a bad name:** Rename or Suspend at the next glance. Never urgent.
  - **Site down mid-evening:** phones keep counting into the outbox, and TVs freeze calmly. Make **one 10-minute attempt**: `journalctl -u count-dracula`, restart, and restore the newest `VACUUM INTO` copy if the DB is damaged. If it's not back by then, **stop debugging**. Our porch goes to the paper tally, and every Household's outboxes drain when the site returns.
  - **Home internet down:** nothing to do; wait.

### Nov 1

1. Check that every live, non-Rehearsal Event auto-ended at 3 am.
2. If our night ran on paper, **➕ Add missed kids** from the tally sheet first.
3. **⬇ Export "Halloween 2026"** and commit the CSV to `.scratch/count-dracula/data/`.
4. Write a short "what broke" note for after Halloween.

---

## 19. What changes from v1

Every rule in the [v1 spec](../count-dracula/spec.md) that v2 replaces. Everything else stands.

| v1 | v2 |
|---|---|
| §1 Dates: Oct 24 freeze, rehearsal, Oct 28 re-test | No rehearsal; the only freeze is Oct 31 3 pm–midnight ([§1](#1-dates)) |
| §2 Event: exactly one live event | Exactly one live **per Household** |
| §2 Event: first install creates "Rehearsal" live | Sign-up creates a live **Rehearsal** (no golden tickets) and "Halloween 2026" ([§6](#6-sign-up-first-run-and-the-rehearsal)); a fresh install creates nothing |
| §2 Join key: reads need no key | Every read carries a credential ([§3](#3-identity-and-tenancy)) |
| §3 Two ways in (tailnet HTTPS, LAN HTTP); tailnet auto-join | One public HTTPS URL behind Cloudflare; no LAN route, no auto-join ([§15](#15-hosting-capacity-and-abuse)) |
| §3 Plain-HTTP constraints (no `randomUUID`, no service workers) | Still kept: the outbox code doesn't change |
| §3 Hub: one global stream | Per-Household channels with their own `seq` ([§15](#15-hosting-capacity-and-abuse)) |
| §3 Config file: admin PIN, switches, soundboard, ghost seed | [§5](#5-config-split) |
| §3 Pages: `/tv` needs no key; `/tv?event=<id>` open | TV link or pairing; past recaps and the tally need a Manager ([§9](#9-shareable-tv)) |
| §4 First open: tailnet phones pick up the key | Every phone joins by QR or Share join link |
| §5 Add a helper: LAN URL | The public URL |
| §5 ☰ menu | Adds "Go live on Halloween 2026 now" (Manager phones only), the nudge, the 🎭 chip and the nearby strip |
| §6 `/setup` behind the admin PIN | Behind a Manager session; adds first-run, the checklist, TV link, Pair a TV, Location, Managers and invites, Count on this phone, Reset the Rehearsal, Goes live at, the Advanced fold, Delete Household |
| §7 Start the night: full-screen whenever audio isn't running | Only before the first kid on this page load; otherwise the 🔇 pill ([§9](#9-shareable-tv)) |
| §7 Title bar | Adds the 🎭 Rehearsal chip; the nearby box goes under the rush meter |
| §8 / §11 Time of day in the runtime's zone | In the Household's zone ([§8](#8-time-zones)) |
| §9 "The rehearsal draws for real" | The Rehearsal has no golden tickets |
| §10 Soundboard: 3 homemade + 3 stock | All stock or shout-text, shared by every Household. **Amends [Sound assets](../count-dracula/issues/38-sound-assets.md):** no homemade clips |
| §11 Failure: LXC down → LAN keeps working | No LAN route: an outage freezes every TV, and the outbox keeps the taps |
| §11 Data safety: no backups during the night | `VACUUM INTO` every 15 min, plus the off-box pull ([§15](#15-hosting-capacity-and-abuse)) |
| §12 Build order and cut rule | [§17](#17-build-order-and-the-opening-line) |
| §14 Kiosk: tailnet or LAN URL | A bare `/tv` that remembers its TV link. **Amends [Kiosk launcher](../count-dracula/issues/37-kiosk-launcher.md):** the launchers open `/tv` on the public host and are optional |
| §15 Runbook | [§18](#18-launch-and-the-night-runbook) |
| §17 Out of scope: multi-household, accounts, shareable recap | Now in scope |

---

## 20. Where it lands in the code

The v1 modules ([modules.md](../count-dracula/modules.md)) stay. The principle stands: the server **decides**, the TV and phones **present**. These are the seams the decisions imply. Names are the builder's.

- **Ledger** (`server/ledger.js`): every command and snapshot is scoped to one Household. The "one live Event" rule, Go live, End, the minute tick's go-live and auto-end, Reset the Rehearsal and the starter costumes all live here, and tests stay on `:memory:`. The process-wide `seq` becomes one per Household.
- **SSE hub** (`server/hub.js`): channels keyed by Household. `attach` takes the Household and the credential kind (phone, paired TV, TV link), which feed the payload shape and the caps. `publish` goes to one channel. It drops stalled viewers, and can close streams by credential.
- **Accounts** (new, server): Households, Managers, sessions, invites, the TV link and pairing codes, and the Google code exchange behind one small interface. Google is the one external call, so give it a seam (a fake in tests).
- **Guard** (new, server): from a request to its credential, Household and client IP (`CF-Connecting-IP`), plus the caps, the rate-limit buckets and the refusal counters. The HTTP layer stays thin.
- **Night maths** (`shared/night-maths.js`): takes a time zone. It's still the only place Clock shift is applied.
- **Nearby** (new, server): Area and site-wide figures on a 10-minute timer, with the minimums, rounding, the ≥ 3-Household top costume and the blocklist. A pure function over the live Events is easy to test without the timer.
- **Blocklist** (new, shared or server): `isBlocked(text)`, used on save and by Nearby.

---

## 21. Builder's latitude

These were never decided and don't need a decision. Pick something sensible.

- URL paths for sign-up, the Night summary share page, `/operator`'s API, the pairing flow and the OAuth callback. Table and column names.
  - **Constraint:** every token-bearing URL must fit the shapes the Caddy log masks (`/tv/k/<token>`, the share path, `?key=`). Name any new shape in ticket 35's masking rules.
- How the join key is stored now that it's one per Household (on `households`, or still on the live Event and carried over as v1 does).
- How a waiting bare `/tv` learns it has been paired (a short poll, or a small stream of its own), within the pairing-code rate limit.
- How a paired TV is told apart from a TV-link viewer for the cap exemption (e.g. a device token issued at pairing, alongside the TV link).
- The exact starter costume list (about 8, including 🎃 Other).
- Whether the migration marks Household #1's v1 "Rehearsal" event as a Rehearsal. Either way, it's frozen when "Halloween 2026" goes live.
- The switch names in `config.json`.
- The fixed Count Dracula link-preview image for share links.
- How the 10-minute nearby figures reach screens (in the snapshot plus a delta on each refresh, or a separate fetch).
- Where the 🎭 chip and the nearby strip sit, within the layouts above.
- The blocklist source, as long as it's vendored, a few hundred entries, and its licence is noted.

---

## 22. Out of scope

From the [map](map.md#out-of-scope). All of these come after Halloween, or never:

- Native apps and app stores.
- Per-Household feature switches, sound uploads and per-Household soundboards.
- Passkeys, email sign-in links, Apple sign-in and any outgoing email.
- One person running several Households.
- A portrait (phone) layout for TV viewers, expiring or per-viewer TV links, and a porch poster with the TV link.
- Postal-code and typed-address location entry, and any map on the night.
- Promotion: how households find it.
- Push alerts and history graphs for the Operator; Operator delete; ending a stale night from `/operator`.
- Postgres, a local DNS override for our porch, and Cloudflare-level rate limiting.
- A macOS kiosk launcher, an in-page QR scanner, a "simulate a rush" button, and promised support for smart-TV browsers or casting.
- Half-hour grid entry and CSV upload for last year's counts, a top-3 costume list, neighbourhood leaderboards and percentiles, cross-household moments and site-wide milestones.
- The automatic purge of Idle Households and Abandoned sign-ups, and a self-serve "Download my data" export.

---

## 23. Sources

- **Map:** [map.md](map.md)
- **Tickets:**
  - [Sign-in and email options](issues/01-sign-in-and-email-options.md)
  - [Geocoding and location-fuzzing options](issues/02-geocoding-and-fuzzing-options.md)
  - [Public exposure: abuse protection and live-connection capacity](issues/03-public-exposure-limits.md)
  - [Household identity and sign-up](issues/04-household-identity-and-sign-up.md)
  - [What becomes per-household](issues/05-what-becomes-per-household.md)
  - [Shareable TV: link, code and QR](issues/06-shareable-tv.md)
  - [Fuzzy location](issues/07-fuzzy-location.md)
  - [Nearby activity indicator](issues/08-nearby-activity.md)
  - [Shareable night summary](issues/09-shareable-night-summary.md)
  - [Operator dashboard](issues/10-operator-dashboard.md)
  - [Public hosting and abuse](issues/11-public-hosting-and-abuse.md)
  - [From sign-up to a TV on the porch](issues/12-sign-up-to-porch-tv.md)
  - [Multi-household extras shortlist](issues/13-multi-household-extras.md)
  - [Assemble the v2 spec and build tickets](issues/14-assemble-the-v2-spec.md)
  - [Privacy notice and retention](issues/15-privacy-notice-and-retention.md)
  - [v2 rehearsal and launch-day plan](issues/16-v2-rehearsal-and-launch-day.md)
- **Glossary:** [CONTEXT.md](../../CONTEXT.md)
- **v1:** [spec](../count-dracula/spec.md), [modules](../count-dracula/modules.md)
- **Branches:**
  - `research/sign-in-and-email` (`fc5cb78`)
  - `research/geocoding-and-fuzzing` (`cd8a184`)
  - `research/public-exposure-limits` (`d9dcefc`)
  - `prototype/nearby-activity` (`74e6187`)
  - `prototype/night-summary` (`ef3a9e3`)
