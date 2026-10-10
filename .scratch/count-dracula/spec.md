# Count Dracula — v1 spec

A Halloween trick-or-treater tracker for one household. Helpers' phones at the door tap each kid in, and a laptop-driven TV facing the **porch** celebrates each one live, racing tonight's count against last year's.

- **Assembled:** 2026-10-10 from the [map](map.md) and its resolved tickets. This document makes **no new decisions**. Each section links the ticket that holds the reasoning.
- **Open questions:** none. The last one, [Kid numbers under undo and late taps](issues/14-kid-numbers-under-undo-and-late-taps.md), is folded in.
- **Printable rehearsal checklist:** [rehearsal-checklist.md](rehearsal-checklist.md).
- **Modules and seams for the build:** [modules.md](modules.md).

## Contents

1. [Dates](#1-dates)
2. [Domain model](#2-domain-model)
3. [Architecture and hosting](#3-architecture-and-hosting)
4. [Phone: counting screen](#4-phone-counting-screen)
5. [Phone: ☰ door menu](#5-phone--door-menu)
6. [Setup page](#6-setup-page)
7. [TV screen](#7-tv-screen)
8. [Celebration rules](#8-celebration-rules)
9. [Golden tickets](#9-golden-tickets)
10. [Sound](#10-sound)
11. [Failure handling](#11-failure-handling)
12. [Build order, cut line and feature switches](#12-build-order-cut-line-and-feature-switches)
13. [Asset task](#13-asset-task)
14. [Laptop kiosk setup](#14-laptop-kiosk-setup)
15. [Rehearsal and the night: runbook](#15-rehearsal-and-the-night-runbook)
16. [Builder's latitude](#16-builders-latitude)
17. [Out of scope](#17-out-of-scope)
18. [Sources](#18-sources)

---

## 1. Dates

| Date | What happens |
|---|---|
| Sat Oct 10 → Sat Oct 24 3pm | Build, in [build order](#12-build-order-cut-line-and-feature-switches) |
| **Sat Oct 24, 3pm** | **Feature freeze.** Rehearsal Part 1 (Clock shift +3h) |
| Sat Oct 24, 6:30pm | Rehearsal Part 2 at dusk (Clock shift 0) |
| Oct 25–30 | Fixes and polish only |
| Wed Oct 28, evening | Re-test of failed blockers only |
| Fri Oct 30 | Create "Halloween 2026" |
| **Sat Oct 31, afternoon** | **Go live** (golden draw happens here). The night. |
| Sun Nov 1 | Export, commit the CSV, delete the rehearsal events |

Source: [Dress rehearsal plan](issues/12-dress-rehearsal-plan.md).

---

## 2. Domain model

UI copy says **costume**. The domain term is **Tag**. They mean the same thing.

| Term | Meaning |
|---|---|
| **Event** | One night ("Dress rehearsal", "Halloween 2026", …). **Exactly one is live, never zero.** Creating an event doesn't make it live. **Go live** (with a confirmation) makes it live and **freezes** the previous live event as a read-only past event. Past events can be deleted after a typed confirmation. First install creates "Rehearsal" and makes it live. |
| **Counts-only past event** | "Halloween 2025 (counts)": the five half-hour buckets in [data/2025-counts.md](data/2025-counts.md), seeded from a config/JSON file on first install. It has no kids and no entry UI. It exists only to be raced against. |
| **Ended** | A live event can be **ended** ("🌙 End the night") and **resumed**. It stays live while ended, so straggler taps still count. Only the next Go live freezes it. |
| **Kid** | One tap = one kid, with a phone-generated ID, a tap timestamp, the phone's name, at most one Tag, and a source (`tap` or `backfill`). Removals are soft deletes. |
| **Kid number** | The live (non-deleted) count at the moment a kid **reaches the server**, stored once and **never rewritten**, so "YOU'RE KID #58!" always matches the giant count. After an undo or delete, the next kid reuses the freed number, and Recent may then show two kids with the same number. Late kids (backfill included) are numbered when they land; a backfill batch is numbered in tap-time order. An unsent tap that's undone never gets a number. |
| **Visit** | Derived, never entered: kids whose taps fall within the event's **Visit window** (default 15 s) of each other. Used for the recap's "Biggest crew". Changing the window just regroups. |
| **Tag** | A costume: name, emoji, order, optional signature sound. **Tags belong to an event.** Tapping a tag button *adds* a kid with that tag; "+1 Kid" adds an untagged kid. Rename any time. Deleting a tag that has kids makes those kids untagged (after a confirmation). |
| **Catch-up** | Creating a tag live ("+ New") asks "How many already seen before this one?" (N, capped at the number of untagged kids). It re-tags the N most recent *untagged* kids **and adds the kid at the door with the new tag**. Total goes up by exactly 1. Timestamps are untouched. |
| **Undo** | Per phone: removes *that phone's* most recent kid. Repeatable. Toast: "Removed #N · 🧙 Witch". |
| **Recent** | The last 10 kids from all phones, newest first, each deletable. |
| **Ghost line** | The **Race against** event's cumulative count by time of day, interpolated linearly within each bucket and flat after its last bucket. Race against can be None. Events from 2026 on produce a ghost from their own taps. |
| **Clock shift** | Per event, default 0 (e.g. +3h for the rehearsal). Moves the event's "now" for the ghost-line position, the chart's x-axis, the 7:45 "Release remaining" offer and the backfill rows. **Timestamps are stored in real time**; the shift applies only on display or comparison. |
| **Golden ticket** | A secret kid number that wins a prize. See [§9](#9-golden-tickets). |
| **Late tap** | A tap that reaches the server **more than 10 s after it was tapped** (an outbox flush after a Wi-Fi drop or outage, or any backfilled kid). It gets a quiet tick-up, never a celebration. See [§8](#8-celebration-rules). |
| **Backfill batch** | One "➕ Add missed kids" save: untagged kids with `source: backfill`, spread evenly across each 15-minute row. Each batch can be removed as a whole. |
| **Join key** | Random per event, **required on every write**. Reads (including the TV) need no key. It carries over on Go live. "Change key" cuts off phones that joined with the old one. |
| **Phone name** | Asked on a phone's first open ("Who's tapping?": Dad / Mom / Grandma / custom), stored on the phone, sent with every tap, shown in Recent. |
| **Display** | A laptop on HDMI running Chrome in kiosk mode. The TV faces the **porch**, so its audience is the trick-or-treaters: huge, glanceable visuals and porch-audible sound. |

Sources: map Notes, [Kid numbers under undo and late taps](issues/14-kid-numbers-under-undo-and-late-taps.md), [Phone controller prototype](issues/05-phone-controller-prototype.md), [Event setup and phone menu](issues/09-event-setup-and-phone-menu.md), [Quiet stretches and end of night](issues/10-quiet-stretches-and-end-of-night.md), [Failure fallback](issues/11-failure-fallback.md).

---

## 3. Architecture and hosting

### Shape

```
 door phones ──POST taps (+join key)──┐
 (tailnet: HTTPS via Caddy            │
  LAN helpers: plain HTTP)            ▼
                              ┌──────────────────┐
                              │ Bun process       │  Proxmox LXC (Debian 12)
                              │  bun:sqlite (WAL) │  systemd, Restart=always
                              │  static files     │
                              └────────┬─────────┘
                                       │ one SSE stream per device:
                                       │ snapshot, then seq-numbered deltas
             ┌─────────────────────────┴──────────┐
             ▼                                    ▼
      door phones (Recent, tags,           TV laptop (Chrome kiosk,
      golden banner)                       display only)
```

- **Server:** one Bun process with `bun:sqlite` in WAL mode, serving the static files too. No npm dependencies on the server. It runs in a **new Proxmox LXC** (debian-12 template) under systemd with `Restart=always`. The SQLite file lives inside the LXC. The laptop is display-only, so a display-side crash loses nothing. ([Live-update stack](issues/02-live-update-stack.md), [Hosting and phone access](issues/08-hosting-and-phone-access.md))
- **Two ways in, one server, identical behaviour:**
  - **Tailnet devices:** `https://count-dracula.example.com` via Caddy (LXC 117), added with `/opt/docker-compose/caddy-int/host.sh add count-dracula <LXC-IP>:<port>`. Tailnet phones receive the join key automatically on first open.
  - **LAN helpers without Tailscale:** `http://<LXC LAN IP>:<port>`, joined with the "Add a helper" QR code.
  - **TV laptop:** the HTTPS URL if it has Tailscale (which also enables the Wake Lock API), otherwise the LAN URL.
- **Plain-HTTP constraints:** the code must not rely on `crypto.randomUUID`, service workers or Background Sync. Build UUIDs from `crypto.getRandomValues`.

### Transport

- **Taps and every other write are plain POSTs** carrying the join key.
- **One Server-Sent Events stream per device.** Each connection opens with a full **snapshot** (live event, its tags, its kids, the ghost buckets, settings, the current `seq`), then sends numbered deltas (`id: <seq>`), e.g. `kid.added`, `kid.removed`, `kid.retagged`, `tag.added`, `event.switched`.
- **The TV never celebrates a snapshot**, only deltas.
- **Bun idle timeout:** call `server.timeout(req, 0)` on each SSE request and send a heartbeat every 15 s. *(Built as a named `ping` event rather than a `:` comment, because the page can't see comments and needs the ping to notice a link that died without closing: after 35 s of silence it counts as disconnected. Changed while building golden tickets, ticket 28.)*
- **WebSockets were rejected** (more reconnect code, and Caddy closes them on reload).

### Taps: idempotent and offline-tolerant

1. On a tap the phone generates a UUID, saves `{id, tagId, tappedAt, phoneName}` to a **localStorage outbox**, updates its count optimistically, then POSTs.
2. The server runs `INSERT … ON CONFLICT(id) DO NOTHING`, returns 200 either way, and broadcasts only new rows. Retries never double-count.
3. The phone retries on a timer, on `online` and on `visibilitychange`, and drops entries once acknowledged.
4. **Undo** is an idempotent soft delete, or just removes the entry from the outbox if it hasn't been sent.
5. Charts use the phone's `tapped_at`. The server also stores `received_at`. `received_at − tapped_at > 10 s` makes a **late tap**.

### Data the server stores

The shape the decisions imply. Column names are the builder's.

- **events:** name, live flag, frozen flag, ended flag, join key, Clock shift, Race-against event (or none), Expected kids, Visit window, golden-ticket count, counts-only flag.
- **ghost_buckets:** event, slot, count (for the counts-only 2025 event).
- **tags:** event, name, emoji, order, signature sound. TV colour comes from order (see [§7](#7-tv-screen)).
- **kids:** id (phone-generated, primary key), event, **number** (assigned on arrival), tag (nullable), phone name, `tapped_at`, `received_at`, `deleted_at`, source (`tap`/`backfill`), backfill batch (nullable).
- **golden tickets:** event, secret number, state (hidden / won / rolled forward / released / expired) and the winning kid. The recap needs the original number of a rolled-forward ticket. **Won is final**, even if the winning kid is later removed.
- **fired moments:** which milestones and Beat last year have already fired in the event, since each fires once.
- **backfill batches:** event, rows entered, created at.
- Catch-up is one `UPDATE … WHERE tag_id IS NULL ORDER BY tapped_at DESC LIMIT N` plus an insert.

### Server config file

Read at startup. No UI.

- **Admin PIN** (4–6 digits) for `/setup`.
- **Feature switches for Must 3–9** (see [§12](#12-build-order-cut-line-and-feature-switches)).
- **Soundboard slot labels** (6) and their sound files.
- The **2025 ghost seed** (a config/JSON file holding the five buckets).

### Pages

| Page | Who | Key |
|---|---|---|
| Phone counting screen (+ ☰ door menu) | Any helper | Join key for writes |
| `/setup` | The admin | Join key + admin PIN (remembered on the phone once entered) |
| `/tv` | The laptop | None (read-only). `/tv?event=<id>` shows any past event's recap |
| Tally-sheet print page | Linked from `/setup` | None |

### Client libraries

The TV and phones use plain ES modules with **no build step**. These libraries are **vendored locally** (no CDN on the night):

- **Chart.js:** the race chart, two line datasets.
- **Motion** (`animate()`): the pops.
- **canvas-confetti:** confetti, using `shapeFromText` for emoji.
- **Preact + htm** via an import map, only if the phone's state gets messy.

---

## 4. Phone: counting screen

**Variant A, "Thumb pad".** Reference: branch `prototype/phone-controller` (commit `7aadcef`), `prototypes/phone-controller/`. Run it with `bun prototypes/phone-controller/serve.ts`. ([Phone controller prototype](issues/05-phone-controller-prototype.md))

Top to bottom:

1. **Header:** tonight's total and a small "N untagged" count.
2. **Golden banner** (only when the next number is golden): "⭐ NEXT KID IS GOLDEN — get the prize ready", full width. It shows only on a phone that is **connected and has an empty outbox**; otherwise the phone can't know the real count.
3. **Costume grid:** 3 columns of tiles showing emoji, name, tonight's count and a coloured bar along the bottom (the tag's TV colour). **"+ New"** is the last tile. The grid scrolls if needed.
4. **Utility row:** "↶ Undo" and "🕘 Recent ▴".
5. **"+1 Kid":** a giant button filling the bottom ~30% of the screen.

Behaviour:

- **Every tap** flashes an optimistic "#N 🧙" and vibrates. The server assigns the real number, and the flash corrects to it if another phone's tap got there first.
- **Golden confirmation:** the strong golden buzz and "🎫 GOLDEN — hand over the prize!" come only when **the server confirms this phone's tap won**. The server is the referee: whichever tap reaches it first takes the golden number.
- **Undo** removes this phone's most recent kid. It can be repeated, with a toast each time.
- **Recent** is a slide-up panel showing the last 10 kids from all phones, **newest-arrived first**. Each row shows the stored number, costume, phone name, *tap* time and a ✕ to delete. A late kid shows at the top with its earlier tap time. Deleting another phone's kid says so in the toast. Queued (unsent) kids show a faint ⏳.
- **"+ New" costume** opens a panel with:
  - a name field
  - an emoji choice
  - a − / + stepper for "How many already seen before this one?", capped at the untagged count, with a preview of which kid numbers it will re-tag

  **Create** applies [Catch-up](#2-domain-model): total +1, and the alert says ×(N+1).
- **Offline pill:** after about 5 s of failed sends, an amber **"⏳ N waiting to send"** pill appears at the top and clears with a brief "✓ sent". After more than about 2 minutes, a line is added under it: **"Server's down — keep tapping, don't reload."** See [§11](#11-failure-handling).
- **First open:** "Who's tapping?" asks for the phone name. Tailnet phones pick up the join key automatically; LAN phones get it from the QR code.

---

## 5. Phone: ☰ door menu

A ☰ sheet over the counting screen, **open to any phone with the join key**. Nothing here is on the counting screen itself. ([Event setup and phone menu](issues/09-event-setup-and-phone-menu.md), [Sound design](issues/07-sound-design.md), [Quiet stretches and end of night](issues/10-quiet-stretches-and-end-of-night.md))

- **Soundboard:** 6 buttons that play on the TV straight away, with a **3 s cooldown across all buttons**.
- **TV volume** slider and three mutes: **Ambience**, **Kid bloops**, **Everything**.
- **"Release remaining tickets"**, shown from **7:45pm event time** (Clock shift applied), with a confirmation.
- **"Add a helper"**: a QR code with the **LAN URL plus the join key**. **Never shown on the TV.**
- **"🌙 End the night"** (with a confirmation), or **"Resume the night"** once ended. If golden tickets remain, the confirmation reads "🎫 2 golden tickets never found. Release them to the next 2 kids instead?" with three choices:
  - **Release & keep going:** runs Release remaining and doesn't end.
  - **End anyway:** expires them.
  - **Cancel.**
- A link to **Setup**.

---

## 6. Setup page

`/setup`, behind the admin PIN. ([Event setup and phone menu](issues/09-event-setup-and-phone-menu.md), [Failure fallback](issues/11-failure-fallback.md), [Quiet stretches and end of night](issues/10-quiet-stretches-and-end-of-night.md))

**Events**

- **Create:** a name, plus **"Copy costumes from: [event ▾]"**. It copies names, emoji, order, signature sounds and the Visit window, with zero counts.
- **Go live:** asks for confirmation. It freezes the old live event, keeps the join key, and runs the **golden draw**. Phones and the TV switch over SSE without re-scanning.
- **Change join key.**
- **Past events list:** **View recap** (`/tv?event=<id>`), **⬇ Export event**, and **Delete** (typed confirmation).

**Per-event settings**

- **Costume presets:** name, emoji, order, signature sound. Rename any time. Deleting a costume untags its kids, with a confirmation.
- **Golden tickets:** the count (default 5), and **"Add a ticket"** after Go live.
- **Race against:** a past event, or None.
- **Clock shift:** default 0.
- **Expected kids:** used for the golden range when Race against is None.
- **Visit window:** default 15 s, changeable live.

**Night tools**

- **"🖨 Print tally sheet":** a tiny static page with the event name and **15-minute rows from 5:30 to 9:00**, for tally marks only. The header says "Phone blank or dead? Tally here. Write the time you started."
- **"➕ Add missed kids":** a grid with the **same 15-minute rows**. Type a count per row. On save, the server spreads each row's count **evenly across that slot** as untagged `backfill` kids, all in one batch.
  - Rows are in event time (Clock shift applies) and can't be later than the event's "now".
  - Backfilled kids **never celebrate**: they're late taps.
  - Setup lists each batch ("+38 kids, 6:30–7:00 · Remove") so it can be removed as a whole.
  - This is also the rehearsal's bulk add. There is no separate dev route.

**Export CSV:** one row per kid (number, tap timestamp, `received_at`, tag, source, deleted) plus a half-hour count summary. It uses the same shape that next year's ghost seed reads.

---

## 7. TV screen

**Layout A, "Scoreboard"**, checked on the real TV. Reference: branch `prototype/tv-screen` (commit `1d78274`), `prototypes/tv-screen/`. Published copy: <https://claude.ai/artifact/PsgdCkEhU97bSKvRR4thsq>. ([TV screen prototype](issues/06-tv-screen-prototype.md))

### Layout (1080p)

| Region | Content |
|---|---|
| **Top bar** | Title, the "🎫 N golden tickets left" pill, the clock (event time). A small 🔇 appears when any mute is on. |
| **Left third (hero)** | "KIDS TONIGHT", a giant count, and the pace line: "👻 4 ahead of last year's ghost", which becomes "🏆 New record!" after the ghost's total |
| **Right two-thirds (race chart)** | The ghost as a dashed pale line (labelled "2025: 346"), tonight as a thick pumpkin-orange line, a 👻 marker at the ghost's value for now, and an orange dot labelled with tonight's count. The y-axis scales in hundreds (minimum 400). The x-axis runs from 5:30 to 8:30pm event time. |
| **Full-width row (leaderboard)** | The top 5 tags as horizontal bars in tag colours, each showing emoji, name and count. Bars reorder with animation when one overtakes another. Text must stay small enough that 5 rows don't collide (the first draft's 2vw labels did). |
| **Bottom strip (pumpkin patch)** | One pumpkin per kid, coloured by tag (untagged = orange, golden winner = gold). New pumpkins pop in. If time runs short, the fallback is coloured dots that grow into pumpkins. |

**Visual tokens**

- **Tag colours:** assigned by order from six categorical slots: `#3987e5, #199e70, #c98500, #d55181, #9085e9, #e66767`. Untagged is `#ff7a1a`. The 7th tag and later fold to grey `#8a84a8`.
- **Type:** Bungee (numbers, labels), Fredoka (body), Creepster (takeover headlines only).
- **Chart styling:** follows the `dataviz` skill.

### States

- **Start the night:** a full-screen button shown whenever `audioCtx.state !== 'running'`. One click on the laptop unlocks sound for the session. See [§14](#14-laptop-kiosk-setup).
- **Live:** the Scoreboard, with celebrations ([§8](#8-celebration-rules)).
- **Idle teaser:** after **45 s with no taps**, a calm top banner (the new-costume banner, toned down) shows one line, hides, and repeats every ~45 s. It rotates through:
  - "🎫 3 golden tickets still hidden — could be YOU!" (only while tickets remain)
  - "👻 Last year had 212 kids by now — help us catch up!" or "…we're 14 ahead!" (skipped when Race against is None)
  - "Next milestone: kid #150!"

  It's **silent**. Any tap cancels it immediately. It doesn't run on the ended screen or while the TV is disconnected.
- **Disconnected:** the Scoreboard stays frozen, with **no error screen, spinner or red**. After **20 s** a small decorative chip appears in a corner: **"🦇 catching up…"**. On reconnect: the snapshot, **one quiet roll-up** to the new total (about 2 s, one soft tick), the chart and leaderboard update in the same pass, and the chip goes away. Ambience keeps playing.
- **Ended (the recap):** one static screen in the Scoreboard frame:
  - **Top bar:** "🎃 THAT'S A WRAP — <event name>" (no golden pill, no clock)
  - **Hero:** the final count plus a verdict: "🏆 New record! +23 on 2025" or "👻 2025 wins this year by 12"
  - **Right:** the finished race chart
  - **The leaderboard row becomes four stat cards:**
    - **Peak half-hour** ("7:00–7:30 · 104 kids")
    - **Biggest crew** ("9 kids at once · 7:12pm", from Visits)
    - **Costume of the night 👑**
    - **Golden tickets:** winners' numbers. Unclaimed numbers are revealed, greyed. Rolled-forward tickets are marked "rolled forward".
  - **The pumpkin patch** stays as it is.

  A straggler tap plays its pop, then the screen returns to the recap. If Must #9 is switched off, End shows the Scoreboard with a "THAT'S A WRAP" top bar instead. Because it renders from stored data, `/tv?event=<id>` shows any past event's recap.

---

## 8. Celebration rules

### Live celebrations ([TV screen prototype](issues/06-tv-screen-prototype.md))

These are the baseline timings; tune them at the rehearsal.

| Moment | TV | Duration |
|---|---|---|
| **Kid pop** | The hero count pops (a bounce and a gold flash) and throws confetti from the number; nothing covers the chart, which just extends its line (changed Oct 10: the centre chip got in the way) | ~1.5 s |
| **Merged pop** | Kids arriving inside the pop's window merge into "WELCOME, KIDS #N–M!" | capped at ~3 s |
| **Every 50th** | A headstone rises out of a grassy mound with the milestone carved on it ("R.I.P. · MILESTONE · #150"), emoji confetti, then sinks back. *(Replaced the white chip, Oct 10, at the user's request.)* | ~3 s |
| **#100 / #200 / #300** | Full-screen takeover, Creepster headline ("100 trick-or-treaters!"), a giant headstone carved with the number, emoji confetti *(headstone added Oct 10 at the user's request)* | 5–6 s |
| **Beat last year** (Race-against total + 1, i.e. #347) | Full-screen takeover | 5–6 s |
| **Golden ticket** | Full-screen takeover in a gold palette: "KID #N WINS! You found a golden ticket!" | 5–6 s |
| **New costume** | Top banner "NEW COSTUME SPOTTED! 🖤 Wednesday ×3" (N includes catch-up) | ~4 s |
| **Soundboard** | "MWAHAHAHA!" / "AWOOOOOO!" text with bats or wolves flying across. **Doesn't interrupt the queue.** | — |
| **Undo / delete** | The count quietly dips and fades. No chip, no sound. | — |

**Priority queue:** golden ticket > beat last year > every 100th > every 50th > pop. Milestones never merge into a pop. Consecutive takeovers queue without stomping on each other.

**Once per event:** each milestone (#50, #100, #150 …) and Beat last year fires **at most once**, the first time it's crossed live. If an undo drops the count and the next kid re-crosses it, that kid gets an ordinary pop. The hero readout can still flip back and forth while the count dips. ([Kid numbers under undo and late taps](issues/14-kid-numbers-under-undo-and-late-taps.md))

### Late taps ([Failure fallback](issues/11-failure-fallback.md))

Any tap more than 10 s late (an outbox backlog, a straggler on bad Wi-Fi, or a backfill) follows these rules. There's no separate outage mode.

- **No celebration:** the count quietly ticks up, or does one roll-up for a backlog.
- **Milestones** crossed by late taps are **skipped** for good.
- **Beat last year** crossed by late taps fires on the **next live tap** as "WE BEAT LAST YEAR! 🏆", without a kid number.
- **A golden number** that lands on a late tap **rolls forward to the next live kid** (the same mechanism as Release remaining).

---

## 9. Golden tickets

Must #4. ([Kid numbers under undo and late taps](issues/14-kid-numbers-under-undo-and-late-taps.md), [Fun-features shortlist](issues/04-fun-features-shortlist.md), [Event setup and phone menu](issues/09-event-setup-and-phone-menu.md), [Quiet stretches and end of night](issues/10-quiet-stretches-and-end-of-night.md), [Failure fallback](issues/11-failure-fallback.md))

- **Count:** per event, default 5.
- **Draw:** blind and stratified, **at Go live**, over **10–80%** of the Race-against event's total (about #35–#277 against 346), or of **Expected kids** when there's no ghost. The range is split into N equal bands, with one random number per band.
- **Nobody sees the numbers, the family included.** The TV shows only "🎫 N golden tickets left". Phones show only "⭐ NEXT KID IS GOLDEN".
- **Who wins:** the first tap to **reach the server** with the golden number. The winning phone gets the strong buzz and "hand over the prize" flash on the server's confirmation, and the TV shows the gold takeover. The kid gets a gold pumpkin.
- **A win is final.** Undoing or deleting the winner doesn't bring the ticket back. The pill stays down, the next kid to reach that number is ordinary, and the recap still lists it. The gold pumpkin goes with the deleted kid.
- **No hidden ticket ever sits below the count.** Every golden number the count passes is either won live or rolled forward by a late tap, so removing kids or a backfill batch never brings a ticket back into play.
- **"Add a ticket"** (Setup, after Go live) draws one number between (tonight's count + 5) and the top of the range.
- **"Release remaining"** (☰ menu, from 7:45pm event time) makes the next K kids winners, where K is the number of tickets left.
- **Roll forward:** a number that lands on a late tap goes to the next live kid. The recap shows the original number as "rolled forward".
- **End the night:** offers Release & keep going, End anyway (the tickets **expire** and the pill goes away), or Cancel. Resume brings expired tickets back as they were.
- **Recap:** reveals every number. Unclaimed ones are greyed.
- **The rehearsal draws for real.**

---

## 10. Sound

([Sound design](issues/07-sound-design.md), [Laptop kiosk setup](issues/03-laptop-kiosk-setup.md), [Quiet stretches and end of night](issues/10-quiet-stretches-and-end-of-night.md))

**Style: mixed by moment.** Each kid gets a clean, arcade-like bloop, because it plays ~350 times. Big moments get cartoony-spooky stings. Real scares exist **only on the soundboard**.

| Moment | Sound |
|---|---|
| Each kid | A short bloop, one of ~5 pitch variations at random. *Nice-to-have:* signature sounds for ~6 preset costumes |
| Merged pop | A rising scale, one note per merged kid, capped |
| Every 50th | A cartoon organ sting |
| #100/#200/#300, beat last year | A full fanfare plus a spooky flourish |
| Golden ticket | A distinctive "you won" fanfare. **Nothing else plays during it**, soundboard included |
| New costume | A two-tone "ding-ding" |
| Undo / delete | Silence |
| Idle teaser | Silence |
| Late-tap roll-up | One soft tick |
| End the night | One closing sting (e.g. a descending "wah-wah-WOOO" plus an owl), then the ambience **fades out over ~5 s** to the keep-alive. Resume brings the ambience back |
| Ambience | A quiet wind/cricket/owl loop all night, ducking under everything. It keeps the TV's audio path awake. When it's muted, an inaudible keep-alive replaces it |

**Engine**

- **Web Audio, not `<audio>`.** Preload and decode every sound at start. Short one-shots (≲3 s), served same-origin.
- Signal chain: master `GainNode` → `DynamicsCompressorNode`.
- **At most 3–4 voices overlapping.**
- **Kid-bloop volume drops automatically as the arrival rate climbs**, and is full when kids are sparse. Celebrations duck the ambience. The soundboard ducks the automatic sounds.
- Prefer punchy mid-range sounds with normalised loudness.

**Soundboard:** 6 fixed slots, with labels in config:

- 3 homemade (e.g. Dad's evil laugh, "Happy Halloween!", a kid's wolf howl)
- 3 stock (scream, creaky door, thunder plus organ)

It plays **on the TV** straight away, over everything except the golden fanfare, with a **3 s cooldown across all buttons**. Each button has a TV visual.

**Controls** (☰ menu): the master volume slider and the Ambience / Kid bloops / Everything mutes. The TV shows 🔇 when anything is muted. There's no automatic stop. The laptop's system volume is the hard ceiling, set at the rehearsal.

**Fallbacks:** any slot without a file uses a browser-generated sound, so audio never blocks the build.

---

## 11. Failure handling

([Failure fallback](issues/11-failure-fallback.md), [Live-update stack](issues/02-live-update-stack.md))

| Failure | What happens |
|---|---|
| **Wi-Fi blip / phone offline** | The phone keeps counting into the outbox (count, costumes, Undo, Recent all local). After ~5 s the ⏳ pill appears; it shows "✓ sent" once drained. Late-tap rules apply. |
| **Bun process crash** | systemd `Restart=always`, back in seconds. Phones show the ⏳ pill briefly. |
| **LXC or host down** | Phones keep counting with **no time limit**. After ~2 min they add "Server's down — keep tapping, don't reload." The TV freezes calmly, with the 🦇 chip after 20 s and the idle teaser held. On recovery the outboxes flush, the TV does one quiet roll-up, milestones are skipped, Beat last year fires on the next live tap, and golden numbers roll forward. |
| **A phone reloads while the server is down** | It goes blank: no service worker over HTTP. That's the one path to paper. |
| **Every door phone has lost the page** | **Paper tally sheet** taped inside the door, then **➕ Add missed kids** afterwards. |
| **Display crash / TV reload** | Nothing is lost (the data is in the LXC). The kiosk flag restores sound. **Don't reload the TV while the 🦇 chip is up.** |
| **The core fails a rehearsal blocker on Oct 28** | The night runs on **the paper tally sheet plus a Nov 1 backfill**. The TV becomes a bonus, not the count of record. |

**Data safety**

- WAL SQLite on one LXC; no backups during the night.
- The **existing scheduled Proxmox backup job** must include the new LXC: automatic if it backs up all guests, otherwise add its ID.
- **Nov 1:** ⬇ Export "Halloween 2026" and commit the CSV to this repo's `data/` next to `2025-counts.md`.

---

## 12. Build order, cut line and feature switches

([Fun-features shortlist](issues/04-fun-features-shortlist.md), [Quiet stretches and end of night](issues/10-quiet-stretches-and-end-of-night.md), [Dress rehearsal plan](issues/12-dress-rehearsal-plan.md))

**Core: never cut, built first.**

- The server, storage, SSE and join key ([§3](#3-architecture-and-hosting))
- Phones counting with the offline outbox, costumes, Catch-up, Undo and Recent ([§4](#4-phone-counting-screen))
- The live TV count with the **kid pop** (Must #1)
- The **ghost race** (Must #2)
- Setup / Go live, **Add missed kids**, **Export**

**Must 3–9, in build order. Each has an on/off switch in the server config file.**

| # | Feature | Switch off → |
|---|---|---|
| 3 | **Milestones:** every 50th chip; #100/#200/#300 takeovers | Plain pops |
| 4 | **Golden tickets** ([§9](#9-golden-tickets)) | No draw, pill, banner or takeover |
| 5 | **Costume leaderboard** | Row hidden |
| 6 | **New-trend alert** | No banner |
| 7 | **Phone soundboard** | Soundboard hidden in ☰ |
| 8 | **Pumpkin patch** (fallback: coloured dots that grow into pumpkins) | Strip hidden |
| 9 | **End-of-night recap** | End shows the Scoreboard with a "THAT'S A WRAP" top bar |

The rest of [§5–§11](#5-phone--door-menu) (☰ menu, mutes, idle teaser, failure UI, tally sheet) supports these and isn't separately switchable. Sound mutes are runtime controls, not feature switches.

**Nice-to-haves (only if time allows before the freeze):**

- rush meter
- pace prediction ("on pace for ~380")
- signature costume sounds

The biggest-crew and costume-of-the-night nice-to-haves already appear in the recap as numbers, with no live alerts.

**Cut rule**

- **Oct 24 3pm is the feature freeze.** Anything not built by then is cut for 2026. If time runs out before then, unbuilt Musts drop **from the bottom** (#9 first).
- **After the freeze**, a built feature that fails at the rehearsal and isn't fixed by Oct 28 is **switched off, whichever it is**, not strictly from the bottom. It is never debugged on Halloween.

---

## 13. Asset task

Due **before Oct 24**. Browser-generated fallbacks fill any missing slot, so this never blocks the build. ([Sound design](issues/07-sound-design.md))

- **Bloops** (~5 variations): browser-generated, or a **Kenney.nl CC0** pack.
- **Stings:**
  - 50th organ sting
  - takeover fanfare plus spooky flourish
  - golden "you won" fanfare
  - new-costume ding-ding
  - End-of-night closing sting
  - rising-scale notes for merged pops

  Sources: **Freesound or Pixabay, CC0 only.**
- **Ambience loop** (wind, crickets, owl): Freesound or Pixabay CC0.
- **3 stock soundboard clips** (scream, creaky door, thunder plus organ): Freesound or Pixabay CC0.
- **3 homemade soundboard clips**, recorded by the family (e.g. Dad's evil laugh, "Happy Halloween!", a kid's wolf howl).
- *Nice-to-have:* ~6 signature costume sounds (thwip, roar, cackle…).
- **Fonts:** vendor Bungee, Fredoka and Creepster locally.
- **Libraries:** vendor Chart.js, Motion and canvas-confetti locally.

Keep a note of each file's source and licence.

---

## 14. Laptop kiosk setup

([Laptop kiosk setup](issues/03-laptop-kiosk-setup.md); full findings on branch `research/laptop-kiosk-setup`, commit `78ac026`)

**Launch.** Quit any running Chrome first, then confirm the flags at `chrome://version`. On macOS, run the binary inside `Google Chrome.app/Contents/MacOS/`.

```
chrome --user-data-dir=<dedicated dir> --no-first-run --noerrdialogs \
  --autoplay-policy=no-user-gesture-required --kiosk <tv-url>
```

- **Sound:** two layers. The autoplay flag covers reloads, and the **"Start the night"** click covers the flag failing. The `AutoplayAllowed` / `AutoplayAllowlist` enterprise policies are the supported alternative.
- **Keep awake** (OS-level; Wake Lock is only a bonus, on HTTPS):
  - **Linux:** `systemd-inhibit --what=idle:sleep:handle-lid-switch`, plus screen blanking and suspend off in the desktop settings.
  - **macOS:** `caffeinate -dis -w <pid>`.
  - **Windows:** `powercfg /change monitor-timeout-ac 0`, `standby-timeout-ac 0`, and lid action 0.
  - **Every OS:** AC power, lid open with brightness at zero, no screensaver or lock screen, OS updates postponed.
- **Display:** output 1920×1080 @ 60 Hz and let the TV upscale (no 4K). Set the TV input to "Just Scan" / "Screen Fit". Keep key content off the outer ~5%.
- **Audio:** select the TV as the OS output, and check again after any HDMI reconnect.
- **Rule:** don't reload the TV while the 🦇 chip is up.

---

## 15. Rehearsal and the night: runbook

**Dress rehearsal (Oct 24):** the full plan is the printable **[rehearsal-checklist.md](rehearsal-checklist.md)**, covering:

- Part 1 at 3pm (Clock shift +3h, scenarios 0–14)
- Part 2 at 6:30pm (dusk, shift 0)
- the 7 blockers and the polish tier
- the **Wed Oct 28** re-test of failed blockers only, in a fresh "Re-test" event

Results go on the printed copy. Blockers become fix tasks for the week, not tracker tickets. Keep the "Dress rehearsal" and "Re-test" events until after Nov 1. ([Dress rehearsal plan](issues/12-dress-rehearsal-plan.md))

**Fri Oct 30: create the night**

1. In `/setup`, create **"Halloween 2026"** with **Copy costumes from** the rehearsal event.
2. Set **Clock shift 0**, **5 golden tickets** and **Race against "Halloween 2025 (counts)"**.
3. Print the tally sheet.

**Sat Oct 31, afternoon: go live**

1. **Go live** on "Halloween 2026". The golden draw happens now, close to the night.
2. **Pre-flight:**
   - The TV shows "Halloween 2026", and **the event clock reads real time.** A leftover +3h shift would wreck the ghost race.
   - Phones are still joined: the join key carried over.
   - The tally sheet is taped inside the door.
   - Kiosk launched; click "Start the night".

**Sun Nov 1: wrap up**

1. If the night ran on paper, **➕ Add missed kids** from the tally sheet first.
2. **⬇ Export "Halloween 2026"** and commit the CSV to `data/`.
3. **Delete the "Dress rehearsal" and "Re-test" events**, so they never turn up in next year's Copy from or Race-against lists.

---

## 16. Builder's latitude

These were never decided and don't need a decision. Pick something sensible and tune it at the rehearsal.

- URL paths for the phone page and the API, the SSE event names beyond those listed, and column names.
- How a tailnet phone "receives the join key automatically" (e.g. the HTTPS host hands it out on first open).
- A reserved/static LAN IP for the LXC, since the helper QR bakes it in.
- Where the ☰ button sits on the counting screen.
- Whether volume and mute settings persist per event or globally.
- What the hero pace line shows when Race against is None (the ghost line and teaser line are simply absent).
- Chart x-axis behaviour if kids keep coming after 8:30pm.
- The exact merge window, the bloop-ducking curve and the voice cap within 3–4.

---

## 17. Out of scope

From the map:

- Multi-household / neighbourhood leaderboard
- Accounts / sign-up
- A saved or shareable recap image
- Candy meter
- Photo booth / camera
- Kid self-tap tablet
- Weather or other external data
- Counts-entry UI for past years: 2025 is seeded from a file; later years come from their own taps or a CSV

---

## 18. Sources

- **Map:** [map.md](map.md)
- **Tickets:**
  - [Last year's numbers](issues/01-last-years-numbers.md)
  - [Live-update stack](issues/02-live-update-stack.md)
  - [Laptop kiosk setup](issues/03-laptop-kiosk-setup.md)
  - [Fun-features shortlist](issues/04-fun-features-shortlist.md)
  - [Phone controller prototype](issues/05-phone-controller-prototype.md)
  - [TV screen prototype](issues/06-tv-screen-prototype.md)
  - [Sound design](issues/07-sound-design.md)
  - [Hosting and phone access](issues/08-hosting-and-phone-access.md)
  - [Event setup and phone menu](issues/09-event-setup-and-phone-menu.md)
  - [Quiet stretches and end of night](issues/10-quiet-stretches-and-end-of-night.md)
  - [Failure fallback](issues/11-failure-fallback.md)
  - [Dress rehearsal plan](issues/12-dress-rehearsal-plan.md)
  - [Assemble the v1 spec](issues/13-assemble-the-v1-spec.md)
  - [Kid numbers under undo and late taps](issues/14-kid-numbers-under-undo-and-late-taps.md)
- **Data:** [data/2025-counts.md](data/2025-counts.md)
- **Branches:**
  - `research/live-update-stack` (`828a29b`)
  - `research/laptop-kiosk-setup` (`78ac026`)
  - `prototype/phone-controller` (`7aadcef`)
  - `prototype/tv-screen` (`1d78274`)
