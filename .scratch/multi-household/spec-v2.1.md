# Count Dracula — v2.1 addendum: several nights, and a front door

v2.1 changes three things in [v2](spec.md), after opening-day feedback:

- A Household has **any number of Events**, up to 3 open at once, and **any of them can be reset**. A test night is just another Event. The Rehearsal is retired.
- `/` becomes a **public homepage**. The door phone moves to **`/door`**.
- **Nearby** no longer stops at Area edges and has no minimum crowd. `/setup` gets a **help column**.

About this addendum:
- **Assembled:** 2026-10-11 from the [events-rework map](../events-rework/map.md) and its resolved tickets. It makes **no new decisions**. Each section links the ticket that holds the reasoning.
- **How to read it:** as changes on top of [v2](spec.md). **Anything not mentioned here behaves as in v2.** §14 lists every v2 rule this replaces.
- **Glossary:** [CONTEXT.md](../../CONTEXT.md) is already updated. §2 summarises the changes.
- **Build tickets:** [issues/50–64](#13-build-order-and-the-opening-line), in build order. Sign-up stays paused until ticket 62 is done. [Open sign-up](issues/38-open-sign-up.md)'s steps 5–7 follow it.
- **Open questions:** none.

## Contents

1. [Dates](#1-dates)
2. [Domain model changes](#2-domain-model-changes)
3. [Events and their states](#3-events-and-their-states)
4. [Credentials, TVs and door phones](#4-credentials-tvs-and-door-phones)
5. [Going live and ending, by themselves](#5-going-live-and-ending-by-themselves)
6. [Reset](#6-reset)
7. [Ghost, golden tickets and summaries](#7-ghost-golden-tickets-and-summaries)
8. [Sign-up, first-run and the ready checklist](#8-sign-up-first-run-and-the-ready-checklist)
9. [`/setup`](#9-setup)
10. [Nearby, the Site-wide total and the Operator](#10-nearby-the-site-wide-total-and-the-operator)
11. [The homepage](#11-the-homepage)
12. [Household #1 and the opening line](#12-household-1-and-the-opening-line)
13. [Build order and the opening line](#13-build-order-and-the-opening-line)
14. [What changes from v2](#14-what-changes-from-v2)
15. [Where it lands in the code, and builder's latitude](#15-where-it-lands-in-the-code-and-builders-latitude)
16. [Out of scope](#16-out-of-scope)
17. [Sources](#17-sources)

---

## 1. Dates

| When | What happens |
|---|---|
| Oct 11 | Decisions (done) |
| From Oct 12 | Build tickets 50–61, in [build order](#13-build-order-and-the-opening-line) |
| **When 50–61 are deployed** | **Ticket 62:** rebuild production and redo the opening line's steps 1–4 ([§12](#12-household-1-and-the-opening-line)). Then [Open sign-up](issues/38-open-sign-up.md)'s steps 5–7 open sign-up. Aim: Oct 16–18 |
| Opening → Oct 31, 3 pm | Tickets 63–64 deploy **fix-forward** and can be cut |
| **Sat Oct 31, 3 pm–midnight** | **The only change freeze**, as in v2 |
| Sat Oct 31, 4:00 pm local | Every Household's "Halloween 2026" goes live by itself (or waits at the 3-open cap, [§5](#5-going-live-and-ending-by-themselves)) |
| Sun Nov 1, 3:00 am local | **Every** Event still Live is ended by itself |
| Sun Nov 1, noon local | Every Ended Event goes Past |

---

## 2. Domain model changes

([CONTEXT.md](../../CONTEXT.md) holds the full definitions.)

| Term | v2.1 |
|---|---|
| **Event** | Moves through **Upcoming → Live → Ended → Past**. Live or Ended is **open**. At most **3 open** per Household, possibly none. Replaces v1's "exactly one live, never zero". |
| **The door's Event** | A Household's open Event that went live most recently. The TV link, door phones, the nudge, nearby and the Operator all follow it. |
| **Reset** | New. Puts a Live or Ended Event back to Upcoming. |
| **Test night** | New. The ordinary Event that sign-up makes live. |
| **Rehearsal** | **Retired**: no flag, no chip, no "Reset the Rehearsal". |
| **Join key**, **TV link** | Still one per Household. A join key writes to any open Event, naming it. A TV link shows the door's Event. |
| **Goes live at** | Also makes room at the cap, or waits ([§5](#5-going-live-and-ending-by-themselves)). |
| **Estimated past event** | The Household's **default Race against**, offered always. |
| **Area** | The unit totals are added up in. |
| **Near you** | New. One, two or four Areas around a Household, with **no minimum crowd**. |
| **Active Household**, **Site-wide total** | Counted through the door's Event, with no "non-Rehearsal" rule. |
| **Abandoned sign-up** | "No kid on any Event but its Test night". |

---

## 3. Events and their states

([Live Events and their credentials](../events-rework/issues/02-live-events-and-credentials.md), [Going live and ending by themselves](../events-rework/issues/05-auto-go-live-and-end.md))

- **Upcoming** (made or scheduled) → **Live** (Go live, by hand or at Goes live at) → **Ended** (End the night, by hand or by the 3 am auto-end; late kids still count; **Resume** makes it Live again) → **Past** (read-only).
- **Ended → Past** happens by itself at **noon the next day** in the Household's zone, or earlier when a Manager presses **Close now**. Past replaces v1's `frozen`: summaries, the TV's "over" state, the Past list and the ghost picker key off it.
- **Go live never changes another Event.** Nothing is frozen by it. The one exception is the tick making room at the cap ([§5](#5-going-live-and-ending-by-themselves)).
- **Open = Live or Ended.** Zero open is a normal state that every route and screen handles: never a 500.
- **At most 3 open.** At the cap, a Manager's Go live is refused with "End or close one of your live nights first". Upcoming and Past Events are uncapped.
- **Go-live stamp:** each Go live stamps the Event with its went-live time. **The door's Event** is the open Event with the latest stamp. Resume doesn't restamp.
- **Delete** is refused while Live ("End the night first"). Upcoming, Ended and Past Events can be deleted: with a typed name when the Event has kids, a plain confirm otherwise. A Race against pointing at a deleted Event falls back to None. Devices on it behave as when it goes Past.

---

## 4. Credentials, TVs and door phones

([Live Events and their credentials](../events-rework/issues/02-live-events-and-credentials.md), [TVs and door phones](../events-rework/issues/04-tvs-and-door-phones.md))

### The join key and every write

- **One join key per Household**, kept across Events, so a phone set up for a test night works on the real one. Change join key still cuts off every phone.
- **Every write names its Event and the go-live stamp it was tapped under.** That covers taps, remove, the outbox, End, Resume, Release, Add a ticket, the soundboard and catch-up. A write to an Upcoming or Past Event, or with a stale stamp, gets a **400**, which the outbox already drops silently.
- **The outbox:** a queued tap keeps its Event and stamp and is never re-pointed. It lands if that Event is still open under that stamp, even after the phone has moved on. Otherwise it's dropped. The seconds-long race at a switch is accepted.

### Which Event a device shows

- **The TV link and `/door` show the door's Event.** There's no pin, no "On the TV" setting and no switch-night control on the phone. Tapping into another open Event is `/setup`'s **Add missed kids**.
- **Switching is quiet:** the TV reconnects to the new board with no banner. A freshly Live Event's "Start the night" screen is the announcement. A takeover or sound playing at the switch is cut off.
- When the door's Event is reset, deleted or goes Past, devices drop to the next one the rule picks, or to **"No night on right now"**.
- **Sound and takeovers:** moments still fire and are recorded on their own Event. Only a TV showing that Event plays them, and one reached off screen never replays. A soundboard press names the on-screen Event and is dropped if the TV has switched. The 3 s cooldown and the TV mix stay per Household.

### Nothing open

- **TV:** "No night on right now", with the next Upcoming Event's name and a countdown when it has Goes live at. The just-ended recap stays up until that Event is Past.
- **`/door`:** the same, with no board and no tap buttons. It stays connected and moves onto the board at Go live. ☰ keeps its device items, plus "Go live on <next Event> now" for a signed-in Manager ([§5](#5-going-live-and-ending-by-themselves)). There's no nudge, End, Resume or Release.

### URLs and keys

- The door phone lives on **`/door`**. `/` with a remembered key redirects to `/door`, and `/?key=…` redirects to `/door?key=…`. The homepage never checks the key.
- A key only dies by Change join key, or by the Household going. `/door` with a refused key **forgets it** and says *"This phone's link no longer works. Ask your host for a new link or QR code."*, with one button to the homepage.
- **Add a helper** (door ☰ and `/setup`) builds `/door?key=<key>`, and its wording names the Household, never an Event. **Count on this device** stores the key and opens `/door`.
- **`/door?key=`** joins the Caddy log-masking shapes.
- **The TV link** stays live-only: open Events only, including an Ended Event's recap. Past recaps are Manager-only (`/tv?event=`). Pairing, paired devices, the kiosk scripts and Rotate TV link don't change.

---

## 5. Going live and ending, by themselves

([Going live and ending by themselves](../events-rework/issues/05-auto-go-live-and-end.md))

- **The 3 am auto-end: every Live Event.** Any Event still Live at the first 3:00 am (Household time) after it went live is ended by the tick, **naming that Event**. That fixes v2's "ends the first live row". There's no exemption and no opt-out. It goes Past at noon. The first tick after a restart catches up.
- **Goes live at:** the tick runs Go live on an Upcoming Event whose time has passed. It never ends a Live Event.
  - **At the 3-open cap**, it closes the **oldest Ended** Event (Past early) and then goes live.
  - **If all 3 are Live, it waits.** The Event stays Upcoming and goes live on the first tick after one is ended or closed. This make-room rule is only for the unattended tick.
  - Setting Goes live at is Upcoming-only, and a time in the past is refused.
- **The 8:30 pm nudge:** only for the door's Event, when that one is Live. It shows from 8:30 pm through the small hours, after 30 minutes with no tap, and dismissing it hides it for 30 minutes (as v2). Its End names that Event. Other Live Events are never nudged. If the door switches, the nudge goes.
- **Door ☰ "Go live on <Event> now"** (a signed-in Manager): it's for the Upcoming Event with the **soonest Goes live at**, and it's hidden when none is scheduled. It shows whether or not other Events are open. It keeps v2's confirm. At the cap it's refused like any Manager's Go live.
- **What the tick did is noted on the Event it touched** (`/setup`, [§9](#9-setup)), never as a page banner, email or push:
  - **Auto-ended:** "Ended automatically at 3:00 am. Late kids still count until noon.", with Resume, Close now and the summary link. It goes on Resume or at Past.
  - **Closed to make room:** "Closed at 4:00 pm so Halloween 2026 could go live". It stays for 24 hours.
  - **Waiting at the cap:** "Couldn't go live at 4:00 pm: 3 nights are open. It'll go live as soon as you end or close one." It stays while the Event waits.

---

## 6. Reset

([Resetting any Event](../events-rework/issues/03-resetting-any-event.md), amended by [Going live and ending by themselves](../events-rework/issues/05-auto-go-live-and-end.md))

- **Reset puts a Live or Ended Event back to Upcoming**, as if it never went live. It goes live again by Go live, or at its Goes live at. Past and Upcoming Events can't be reset.
- **Clears:**
  - kids, backfill batches and fired moments
  - ended, auto-ended and the go-live stamp
  - **golden tickets**, which are deleted and redrawn fresh at the next Go live
  - **the Night summary (`summary_nearby`) and its share links**
- **Keeps:**
  - name, Race against, Expected kids, golden-ticket count, Clock shift and time zone
  - costume tags, at 0
  - Reports
  - the join key and TV link
  - **Goes live at, only if it's still in the future.** When it's cleared, the confirm adds: "Halloween 2026 won't go live by itself again. Go live when you're ready."
- **Who:** Managers only, from `/setup` (the night's screen and Tonight's rows). Never from the door ☰. There's no date rule.
- **Guard:** a plain confirm naming the count: "Reset *Halloween 2026*? Its 7 kids are deleted and it goes back to Upcoming." **Above 20 kids**, type the Event's name.
- **Devices** treat a reset as the Event leaving open ([§4](#4-credentials-tvs-and-door-phones)). Queued taps carry the old stamp and are refused, even if Go live is pressed again before the phone reconnects. There's no "taps discarded" notice.
- **No practice marker.** A Race against pointing at a reset Event keeps pointing at it, and its ghost is empty until that Event has kids again.

---

## 7. Ghost, golden tickets and summaries

([Ghost, estimated ghost, golden tickets and summaries](../events-rework/issues/07-ghost-golden-summaries.md))

- **The estimated ghost is the Household's default Race against.** "About how many kids came last year?" is still stored as the estimated past event. Entering it:
  - sets Race against on every Upcoming or open Event that races None;
  - makes every Event created afterwards start out racing it.
  Changing it updates the same Event. Clearing it puts everything racing it back to None. Setting, changing or clearing only touches Events racing None or racing the estimate. It replaces v2's `comingNight()`.
- **No past-Event gate.** The field is always offered in `/setup` (Household → Last year (estimated)), and in checklist item 3 until that item is done. It sits behind the `estimatedGhost` switch.
- **Golden tickets: one rule for every Event.**
  - The draw happens at Go live: blind and stratified over 10–80% of the Race against total, or of Expected kids when there's nothing to race, from the Event's own golden-ticket count.
  - An Event that goes live with neither draws nothing.
  - An Event made in `/setup` defaults to 5.
  - Add a ticket, Release remaining, End's three choices, the 3 am expiry and Resume bringing expired tickets back are v2's, **per Event**.
- **A Night summary for every Ended or Past Event**, test nights included. `summary_nearby` is frozen at End from that moment's "near you" figures. Share links stay one per Event; they last until sharing is turned off, the Event is deleted or it's reset. "Vs the ghost" follows the Event's own Race against.
- **TV recap:** shown while the door's Event is Ended. Golden numbers are revealed once Ended or Past.
- **Tally sheet:** `/tally?event=<id>`, from that Event's screen. It defaults to the door's Event.
- **CSV:** per Event, from its screen.
- **The Race against picker** offers only Ended, Past, imported (counts-only) or estimated Events, and never the Event itself.

---

## 8. Sign-up, first-run and the ready checklist

([Sign-up, first-run and the ready checklist](../events-rework/issues/09-sign-up-and-first-run.md))

### What sign-up creates

All times are in the Household's zone.

| Signing up | Creates |
|---|---|
| Before Oct 31, 4:00 pm | A live **Test night** (starter costumes, **0 golden tickets**), and **"Halloween 2026"**, Upcoming, going live Oct 31 at 4:00 pm (starter costumes, 5 golden tickets) |
| Oct 31, 4:00 pm – Nov 1, 3:00 am | Only "Halloween 2026", **live now**. No golden tickets can be drawn until a Race against or Expected kids exists |
| After Nov 1, 3:00 am | Only a live **Test night** |

- The **Test night is an ordinary Event**: no marker and no chip. It auto-ends at 3 am, goes Past at noon, can be renamed or deleted, and has a Night summary. The server remembers **which Event it was, by id**, never by name: `households.test_night_event_id`. Only Abandoned sign-up and checklist item 3 use that.
- Race against is the Household default, which is None at sign-up.

### First-run

- Screens 1 and 2, and screen 3's pairing and alternatives, are v2's.
- Screen 3's tick names the Event the TV is on: **"✓ Your TV is showing *Test night*"** (or *Halloween 2026*).

### The ready checklist

- It sits at the **top of the Tonight tab**, and only there. It ticks from real state, and hides when done or dismissed. Ticks, skips and the dismissal are remembered per phone, as v2.
1. **A TV is watching:** ticked by a TV-link stream connection.
2. **A phone counted a test kid:** a kid on **any** of the Household's Events. It carries Count on this device and Add a helper. When both are true, it says: *"Test night ends by itself at 3 am. Your TV switches to Halloween 2026 when it goes live."*
3. **Your Halloween night:** *"Halloween 2026 goes live Sat Oct 31, 4:00 pm"*, with that Event's **Expected kids** and the Household's **"About how many kids came last year?"**. It's ticked once either is set, or skipped.
   - It follows the next Event with a Goes live at, else an open Event that isn't the Test night.
   - It's **hidden** when there's no such night.

### Elsewhere

- **Abandoned sign-up:** 60 days without a sign-in, and no kid counted on any Event but the Test night.
- **`/help/tv`:** "test it on your Test night (or Go live on any night)".

---

## 9. `/setup`

([/setup with several live Events](../events-rework/issues/08-setup-with-several-live.md), [The /setup help column's content](../events-rework/issues/13-setup-help-column.md))

Prototype: branch `prototype/setup-several-live`, `public/setup-prototype.html?variant=B`. Phone width first.

- **Three sticky tabs** under the Household name: **Tonight**, **Nights** (its label says "(2 open)" when more than one is open) and **Household**. A **night's screen** opens from Tonight or Nights, with "‹ All nights" to go back.
- **Tonight:**
  - the ready checklist ([§8](#8-sign-up-first-run-and-the-ready-checklist))
  - **the door's Event, large**, labelled "On the door & TV": count, name, state, went-live time, golden tickets won, its notes, its state's actions, its tools, and "Settings and costumes ›"
  - **Also open:** each other open Event as a short row (state, count, End or Close now, Reset, ›), with its notes
  - a **waiting-at-the-cap** note when there is one
  - with **nothing open:** "No night on right now", the next scheduled Event, and "▶ Go live on <Event> now" (the same Event as the door ☰)
  - at the foot: **📱 Count on this device** and **➕ Add a helper** (QR and Share join link in place)
- **Nights:**
  - **Open (n of 3)**, newest go-live first; **Coming up**; **Past**
  - each row shows name, state, "On the door & TV" if it is, a when-or-how-many line and the first line of any note
  - **Make a night** (name, copy costumes from) at the foot; a new Event opens its screen
- **A night's screen:**
  - **Header:** name, state, when, its notes ([§5](#5-going-live-and-ending-by-themselves)), and the actions for its state:
    - **Upcoming:** Go live, Delete
    - **Live:** End the night, Reset
    - **Ended:** Resume, Close now, Reset, Delete
    - **Past:** Delete (imported counts: Delete only)
  - **Night tools:**
    - 🎫 Add a golden ticket (Live)
    - ➕ Add missed kids (open)
    - ⬇ CSV
    - 🖨 Tally sheet
    - ✨ Night summary and its sharing toggle (Ended or Past)
  - **Settings:** Name, Race against, Expected kids, Visit window, Advanced (Clock shift, Golden tickets), Goes live at (Upcoming only)
  - **Costumes**
- **Household:**
  - **Helpers and the join key:** the key, "works on every night", Count on this device, Add a helper, Change join key
  - **Your TV:** Pair a TV, and the TV link ("watches whichever night the door is on"): Share, Copy, Show QR, Use this screen as the TV, Rotate TV link
  - **Last year (estimated)**
  - **Household name**, **Location**, **Managers**, **Your account**
- v2's "Live now" header, "Edit <select>", and the separate Create, Past and Night tools sections go. Keeping `?event=` in the URL is a build detail.

### The help column (after the opening line, can be cut)

Prototype: branch `prototype/setup-help`, `public/setup-help-prototype.html`. Its `HELP` object is the text to ship.

- **One source:** `public/setup-help.js` exports `HELP`, keyed by section: `{ title, p, terms, more }`, plain text, escaped on render. Each help-bearing section carries `data-help="<key>"`. A unit test checks that every key has an entry and every entry is used.
- **At ≥ 900 px:** a sticky right column (320 px), titled **Help**, lists every topic on the screen that's showing, in page order.
  - The section in view is open and highlighted. Clicking a title scrolls to its section.
  - The column never scrolls the page by itself.
  - Its foot always has **TV help · Email us**.
- **On phones:** a round **?** on each section heading opens its help in place. Switching tab or screen closes them all, and nothing is remembered.
- **23 topics:**
  - **Tonight:** `checklist`, `door`, `nothing`, `also`, `waiting`, `helpers`
  - **Nights:** `nights`, `make`
  - **A night's screen:** `night-Upcoming`, `night-Live`, `night-Ended`, `night-Past`, `night-imported`, `tools`, `settings`, `costumes`
  - **Household:** `join`, `tv`, `estimate`, `name`, `location`, `managers`, `account`
- **`location`** says "near you" shows "once another house nearby is counting" ([§10](#10-nearby-the-site-wide-total-and-the-operator)). The word "Rehearsal" appears nowhere.
- `/help/tv` stays its own page. Cut the help whole: `data-help` attributes without the module do nothing.

---

## 10. Nearby, the Site-wide total and the Operator

([Nearby, the Site-wide total and Operator status](../events-rework/issues/06-nearby-sitewide-operator.md), [Nearby across Area edges](../events-rework/issues/12-nearby-across-area-edges.md))

### One house, through the door's Event

- **Any open Event can count**, with no date, schedule or practice filter.
- **Each Household is one house.** Everything it adds comes from **the door's Event**: whether it's Active, its kids in 30 minutes, its whole-night kids and its costume counts. That fixes v2's `computeNearby` counting Event rows as houses.
  - So a 2 pm test night on Halloween drops out once Halloween goes live.
- **Active Household:** its door's Event counted a kid in the last 30 minutes, and it isn't Suspended.

### Near you (replaces v2 §11's Area rule)

- **No minimum crowd.** "Near you" shows once **at least one Active Household other than this one** is in the window.
- **The window is the Household's 5-character cell plus the 8 cells around it, rounded out to whole Areas.**
  - Cells inside an Area see 1 Area.
  - Cells along an edge see 2.
  - Corner cells see 4.
  - Two houses either side of an edge see the same figures. Neighbouring cells wrap at the antimeridian, with nothing beyond the poles.
- **Figures are v2's**, added up over the window, own house included:
  - kids in the last half hour, rounded to 5s ("under 5 kids" at 0)
  - houses counting
  - the top costume, counted in **≥ 3 Households** across the window and never blocklisted
- **Unchanged from v2:** computed every 10 minutes, the 30-minute Active window, totals only, no place names.
- **Below it** (no Location, or no other house counting nearby): the phone strip falls back to the Site-wide total, and the TV box doesn't render.
- **Accepted risk** (replaces v2 §11's): with one other house counting, a Household can learn that house's rounded, up-to-10-minutes-old count, with no idea which house it is. A stranger needs only one fake Household to do the same. The per-IP sign-up limit stays.
  - Windows are always whole Areas, so subtracting windows recovers nothing smaller than an Area.
- **The edge window is switch-off-able** (`nearbyEdges`, [§13](#13-build-order-and-the-opening-line)). Switched off, "near you" is the Household's own Area, still with no minimum.

### The Site-wide total

- v2's rule, through the door's Event: Households with an **open** Event (Active or not) and the whole-night kids of their door's Events, with the top-costume clause. It's rounded to 5s, refreshed every 10 minutes, and **hidden below 5 Households** (its minimum stays).
- It can show an October figure when 5 or more Households test at once. It shows last night's total until noon on Nov 1. The homepage's wording covers both ([§11](#11-the-homepage)).
- `GET /api/site` gains **`live`**: whether any counted door's Event is Live.

### The Operator

| Status | Rule (on the door's Event) |
|---|---|
| **Counting** | An Active Household (an Ended Event with a late kid in 30 minutes counts) |
| **Stale** | Live, has kids, none in the last 30 minutes |
| **Waiting** | Live, no kids yet |
| **Ended** | Ended, no kid in the last 30 minutes |
| **No night** | Nothing open |

- The statuses are sorted in that order, with most kids first within each. **Kids** and **Last kid** come from the door's Event, in both the table and the detail view. Rehearsal is retired.
- **Nov 1, after 3 am:** the auto-end check is "no Counting, Stale or Waiting rows".

---

## 11. The homepage

([The homepage](../events-rework/issues/11-homepage.md), [Sign-up, first-run and the ready checklist](../events-rework/issues/09-sign-up-and-first-run.md))

Prototype: branch `prototype/homepage` (`d414470`), `public/home-prototype.html?scenario=october|halloween|morning|paused|signed-in`.

### Routing

- `/` is the public homepage. `/` with a remembered key, and `/?key=`, go to `/door` ([§4](#4-credentials-tvs-and-door-phones)).
- **`/signup` redirects to `/`.** Every "go sign in" points at `/`:
  - `/setup` and `/operator` without a session
  - sign-out
  - the sign-in error pages' Try again, Start again and Sign up links
- After Google, a new Household lands on `/setup` with first-run, and a returning Manager lands on Tonight.

### The page

- **One phone-width column** (max 560 px), in `/signup`'s dark palette. From the top:
  - 🧛 Count Dracula and *"Count your trick-or-treaters on your phones, while a TV on the porch cheers every kid."*
  - the **site-wide line**, when there is one
  - a compact **Start counting / Sign in** row, which jumps to the forms
  - **How it works**, large, with three panels, each with a full-width screenshot:
    - 📺 Put a TV on the porch (`tv.png`)
    - 📱 Tap a costume at the door (`phone.png`)
    - 🎉 The TV cheers every kid (`tv-milestone.png`, then `tv-golden.png` and `tv-recap.png`)
  - **Start your household** (name, Continue with Google, the privacy line)
  - **Already counting?** Sign in with Google, then *"Helping at someone's door? Scan the QR on their phone, or open the link they sent you."*
  - **Footer:** Privacy and House rules · TV setup help · Help: email us
- **A sticky Start counting / Sign in bar on phones** slides up while neither the top row nor the forms are on screen.
- **Paused sign-ups:** "Sign-ups are paused, try again later." replaces the Continue button, before anyone goes to Google. Sign in still works.
- **A signed-in Manager:** a **Welcome back** card at the top ("Signed in to *<Household>*", **Go to Setup ›**, 📱 Count on this device, Not you? Sign out). It replaces the row, the bar and both forms. There's no redirect.
- **The site-wide line:**
  - "🎃 **Counting now** on Count Dracula: 212 houses · ~3,140 kids · top costume: 🧙 Witch" while `live` is true
  - "🌙 **Last night** on Count Dracula: …" once every counted Event is Ended, until noon
  - "Rounded, updated every 10 minutes." under it
  - hidden below 5 Households
  - The door phone's strip keeps "Count Dracula tonight".
- **Screenshots** are copied from `docs/screenshots/` into `public/` and downscaled to about 800 px wide.
- **Social preview:**
  - `<title>` "Count Dracula — count your trick-or-treaters"
  - `og:title` "Count Dracula"
  - the pitch as `og:description` and the meta description
  - **`og-home.png`**: the existing artwork without "How our Halloween night went"
  - `summary_large_image`
  - `og-image.png` stays for share links.

---

## 12. Household #1 and the opening line

([Household #1: rebuild or migrate](../events-rework/issues/10-household-1.md))

### Rebuild, not migrate

- Production is **wiped** at the rework deploy, after a `VACUUM INTO` copy into `~/count-dracula-backups/`. Household #1 **signs up again** at `/`, like any Household.
- The rework's schema changes are new `user_version` steps. **Until sign-up opens they may rewrite**, not only add; after it, only add again. They don't convert v2 production data. On a dev database, a Rehearsal row just becomes an ordinary Event.
- **Dropped:**
  - the Rehearsal's 314 test kids (they stay in the backup)
  - the old join key, TV link and paired TVs: our TV pairs again, and helper phones forget the dead key and join again
- **`HOUSEHOLD1_MANAGER_EMAIL` is retired.** On a fresh database `claimsHousehold1` would block that account from signing up. Remove the claim path and the key from:
  - `accounts.js` and `app.js`
  - `deploy.sh`'s `ENV_KEYS`
  - `local.env.example` and `deploy/local.env`
  - the README, RUNBOOK and `deploy/README.md` ("all six" becomes five)
- **`v1-final`** (tag and copy) stays, kept and never used. Ticket 38's "retire `v1-final`" item is moot.

### The real 2025 night comes back

- **`deploy/import-past-counts.js`**, a one-off run on LXC 118 with Bun like `deploy/copy-db.js`, calls `addPastCounts` for a given Household id with the five real buckets: 17:42–18:00 · 14, 18:00–18:30 · 72, 18:30–19:00 · 107, 19:00–19:30 · 119, 19:30–20:00 · 34 (**346**). It makes the Past counts-only Event **"Halloween 2025 (counts)"** and prints its id. It refuses a duplicate name.
- Then, in `/setup`, set **Halloween 2026 → Race against "Halloween 2025 (counts)"** by hand. The chart says "2025".
- The "last year (estimated)" field stays offered (no gate) and is **left empty**.

### The opening line, redone

This replaces [Open sign-up](issues/38-open-sign-up.md)'s done steps 1–4. It's ticket 62.

1. **Copy the v2 database.**
2. **Deploy on a fresh database.**
   - Stop the service, move the database and its `-wal`/`-shm` aside, deploy, start.
   - Sign up Household #1 at `/` with the main Google account. The consent screen is still in Testing, which is the real gate: a fresh database has Pause sign-ups off.
   - First-run; pair our TV.
   - Run the import and set the Race against.
   - Check: the Test night is live; Halloween 2026 goes live Oct 31 at 4 pm racing "2025"; `/?key=` lands on `/door`.
3. **Load check again** (15 minutes): the hub changes.
4. **Privacy checks, only the new parts:** `/door?key=…` shows `key=REDACTED` in the Caddy log, and OSM tiles load only after the tap in first-run.

Then ticket 38's **steps 5–7**, through `/`. The test Household's check becomes:
- a live Test night and Halloween 2026, first-run and the checklist
- Goes live at 10 minutes ahead
- the 3 am end and noon Past
- then Delete

### Household #1 before Oct 31 (RUNBOOK §7, shorter)

- "Halloween 2026" now comes from sign-up. Check its Race against and costumes.
- Test our porch on our Test night (or Go live on a fresh test Event): the checklist, `/help/tv`, and v1's hardware checks (overscan, HDMI sound, volume ceiling, kiosk flags).
- Print the tally sheet.

---

## 13. Build order and the opening line

The tickets live in `issues/` beside the v2 spec, in v2's shape. **Build in number order** unless a ticket is blocked.

### Before the opening line: the event rework (e) and the homepage (1)

**Sign-up stays paused until ticket 62 is done.** Nothing here is cut. If it slips, the opening slips.

| # | Ticket | Type | Blocked by |
|---|---|---|---|
| 50 | [Event states, the 3-open cap and commands that name their Event](issues/50-event-states.md) | AFK | — |
| 51 | [Per-Event deltas, the door's Event and the TV](issues/51-per-event-live-and-tv.md) | AFK | 50 |
| 52 | [The door phone on /door](issues/52-door-phone.md) | AFK | 51 |
| 53 | [The minute tick: every Live Event auto-ends, room at the cap](issues/53-tick-cap-and-notes.md) | AFK | 50 |
| 54 | [Reset any Event](issues/54-reset-any-event.md) | AFK | 50, 51 |
| 55 | [The Household's estimate, golden tickets and summaries per Event](issues/55-ghost-golden-summaries.md) | AFK | 50 |
| 56 | [Nearby, the Site-wide total and the Operator through the door's Event](issues/56-nearby-sitewide-operator.md) | AFK | 50 |
| 57 | [/setup: Tonight, Nights, Household and a night's screen](issues/57-setup-tabs.md) | AFK | 51, 53, 54, 55 |
| 58 | [Sign-up's Test night, first-run and the ready checklist](issues/58-test-night-and-checklist.md) | AFK | 57 |
| 59 | [The homepage on /](issues/59-homepage.md) | AFK | 52, 56 |
| 60 | [Retire HOUSEHOLD1_MANAGER_EMAIL; import the 2025 counts](issues/60-household-1-scripts.md) | AFK | 58 |
| 61 | [RUNBOOK for v2.1](issues/61-runbook-v2-1.md) | AFK | 58, 59, 60 |
| **62** | **[Rebuild production and redo the opening line](issues/62-rebuild-production.md)** | **HITL** | **50–61** |
| 38 | [Open sign-up](issues/38-open-sign-up.md), steps 5–7 | HITL | 62 |

### After the opening line: fix-forward until Oct 31, 3 pm

Every deploy from here starts with a timestamped DB copy, and its migrations only add.

| # | Ticket | Type | Switch-off-able |
|---|---|---|---|
| 63 | [Nearby across Area edges](issues/63-nearby-across-edges.md) | AFK | **yes**: `nearbyEdges` |
| 64 | [The /setup help column](issues/64-setup-help-column.md) | AFK | cut by not shipping |

- **The dropped minimum ships before the line**, in ticket 56 (it's one line). Ticket 63 is the edge window only.
- **Cut rule** (v2's, unchanged):
  - A switch-off-able feature still broken at **3 pm on Oct 31** is switched off for the night.
  - If time runs out, the extras drop from the bottom: 64 first.
  - Core-path problems are fixed forward. If strangers would sign up into something broken, **Pause sign-ups**.
- **v2's switches stay.** `nearbyEdges` joins them in `config.json`. Switched off, "near you" is the Household's own Area.

---

## 14. What changes from v2

| v2 | v2.1 |
|---|---|
| §2, v1: exactly one live Event per Household, never zero | Upcoming → Live → Ended → Past; up to 3 open; zero is normal ([§3](#3-events-and-their-states)) |
| Go live freezes the old Event (`frozen`) | Go live touches no other Event; Ended goes Past at noon or by Close now |
| §6: sign-up creates a live **Rehearsal** and "Halloween 2026" | A live **Test night** and "Halloween 2026"; only Halloween, live, on the evening of Oct 31; only a Test night after ([§8](#8-sign-up-first-run-and-the-ready-checklist)) |
| §6: 🎭 Rehearsal chip, "Reset the Rehearsal", a Rehearsal never counts | Retired. **Reset** works on any Live or Ended Event ([§6](#6-reset)); nothing is marked "doesn't count" |
| §6: first-run "showing your Rehearsal"; checklist item 2 suggests Reset | Names the TV's Event; no Reset step ([§8](#8-sign-up-first-run-and-the-ready-checklist)) |
| §7: the auto-end skips Rehearsals and ends "the live Event" | Every Live Event, by name, at 3 am; the cap's make-room and wait ([§5](#5-going-live-and-ending-by-themselves)) |
| §7: the nudge on "the live, non-Rehearsal Event" | Only on the door's Event |
| §9: the TV link follows Go live to "the live Event" | Shows the door's Event; "No night on right now" with none ([§4](#4-credentials-tvs-and-door-phones)) |
| The door phone on `/` | `/door`; `/` is the homepage; `/?key=` redirects ([§11](#11-the-homepage)) |
| Phone writes carry no Event | Every write names its Event and go-live stamp |
| §11: an Area shows nothing below 5 Active Households | No minimum; "near you" is 1, 2 or 4 Areas ([§10](#10-nearby-the-site-wide-total-and-the-operator)) |
| §11: nearby counts live Events as houses | One house per Household, through the door's Event |
| §12: a summary once ended or frozen | Every Ended or Past Event |
| §13: Operator statuses Counting, Stale, Waiting, Rehearsal | Counting, Stale, Waiting, **Ended**, **No night** |
| §14: the estimate races "the coming night"; offered only without a past night | The Household's default Race against; always offered ([§7](#7-ghost-golden-tickets-and-summaries)) |
| `/signup` | Folded into `/` |
| §4, §18: Household #1 migrated; `HOUSEHOLD1_MANAGER_EMAIL` | Rebuilt by sign-up; the real 2025 counts imported; the key retired ([§12](#12-household-1-and-the-opening-line)) |
| `/setup`: one column with "Live now" and "Edit <select>" | Tonight · Nights · Household and a screen per night ([§9](#9-setup)) |
| §16: Abandoned sign-up "outside its starter Rehearsal" | "On any Event but its Test night" |

---

## 15. Where it lands in the code, and builder's latitude

The [code-seams research](../events-rework/research/01-one-live-event-assumptions.md) maps every site.

### The four seams

- **`eventById()` defaulting to the live Event:** it goes. Every Ledger command takes an event id, and a missing or non-open one is a `BadCommand` (400). There are 15 call sites, every phone write route, both read routes, and about 160 test calls. `test/v1-night.js` becomes a fixture that names its Event.
- **`frozen`:** it becomes the Past state. A good shape is one `state` column, or `ended` plus `past_at`; that's the builder's choice. Go live stops freezing.
- **Credentials:** a join key or TV token still resolves to a Household. The route then resolves **the door's Event** (`ledger.doorEvent(householdId)`) for reads, and checks the named Event and stamp for writes.
- **One SSE channel and `seq` per Household:** **builder's latitude.**
  - Keep one channel per Household with every delta carrying `eventId`, the client ignoring other Events' deltas, and a `door.changed` delta that makes devices reopen on the new board.
  - Or open a channel per Event.
  - Either way, `seq` gaps must not come from filtering.

### Elsewhere

- **The tick** names its Event for `end`.
- **`computeNearby`** works on one door's Event per Household.
- **`/api/operator`** keys rows by Household from the door's Event, in both the table and the detail view.
- **`households.test_night_event_id`** (nullable) and the auto-ended, closed-to-make-room and waiting notes are columns or a small notes table: the builder's choice.
- **Caddy:** `/door?key=` is already masked by the `key=` regexp. Ticket 52 adds a test.

### Never

- A new npm dependency.
- A real hostname in the repo: use `count-dracula.example.com`.

---

## 16. Out of scope

- Anything beyond the four items: per-Event or per-Household soundboards and switches, new extras, and everything in [v2's Out of scope](spec.md#22-out-of-scope).
- Making last year's night the default ghost: it first matters in 2027.
- The Location picker's feel: the feedback was about Area edges.
- Knock-on effects on the Operator detail view's actions and on Reports beyond §10: none found while charting. If a build ticket finds one, it's fixed there, or noted for after Halloween.

---

## 17. Sources

The [events-rework map](../events-rework/map.md) and its tickets:
- [01 Where the code assumes one live Event](../events-rework/issues/01-one-live-event-assumptions.md) ([research](../events-rework/research/01-one-live-event-assumptions.md))
- [02 Live Events and their credentials](../events-rework/issues/02-live-events-and-credentials.md)
- [03 Resetting any Event](../events-rework/issues/03-resetting-any-event.md)
- [04 TVs and door phones](../events-rework/issues/04-tvs-and-door-phones.md)
- [05 Going live and ending by themselves](../events-rework/issues/05-auto-go-live-and-end.md)
- [06 Nearby, the site-wide total and Operator status](../events-rework/issues/06-nearby-sitewide-operator.md)
- [07 Ghost, estimated ghost, golden tickets and summaries](../events-rework/issues/07-ghost-golden-summaries.md)
- [08 /setup with several live Events](../events-rework/issues/08-setup-with-several-live.md)
- [09 Sign-up, first-run and the ready checklist](../events-rework/issues/09-sign-up-and-first-run.md)
- [10 Household #1](../events-rework/issues/10-household-1.md)
- [11 The homepage](../events-rework/issues/11-homepage.md)
- [12 Nearby across Area edges](../events-rework/issues/12-nearby-across-area-edges.md)
- [13 The /setup help column's content](../events-rework/issues/13-setup-help-column.md)
