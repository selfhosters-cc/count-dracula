# /setup with several live Events

Type: prototype (HITL)
Status: resolved
Blocked by: 02, 04

## Question

How should `/setup` look when a Household has any number of Events, several live? Today it's one column: Live now, Your TV, Edit <select>, Costumes, Night tools, Create an event, Past events, Location, Managers, Your account.

- An Event list (live / coming up / ended) with per-Event actions: Go live, Reset, End, Delete, Add missed kids (the way to tap into an Event the TV isn't showing).
- Household-level: the join key, Add a helper's QR, the TV link, Pair a TV and Count on this device (both credentials are per Household, per [Live Events and their credentials](02-live-events-and-credentials.md)); which open Event the TV and doors are on right now (the one that went live most recently, per [TVs and door phones](04-tvs-and-door-phones.md)).
- Where the Household-wide things go (Location, Managers, account).
- Phone width first: `/setup` is used on phones.
- Leave room for the help column ([The /setup help column's content](13-setup-help-column.md)): a sticky right column at ≥ 900 px, a "?" per section heading on phones (decided at charting).

A rough clickable prototype on a `prototype/` branch, linked here.

## Answer

Resolved 2026-10-11 (HITL prototype). **Variant B: three tabs, Tonight · Nights · Household, with a screen per night.** Prototype: branch `prototype/setup-several-live`, `public/setup-prototype.html?variant=B` (stub data; `&scenario=halloween|morning|nothing|cap`). A (one page, a card per night) and C (a night switcher across the top) were not chosen.

**The frame**
- `/setup` opens on **Tonight**, under the Household name. The tabs are sticky at the top: **Tonight**, **Nights** (its label says "(2 open)" when more than one is open) and **Household**. A night's own screen opens from Tonight or Nights, with "‹ All nights" back.

**Tonight: the door's night, large**
- The Event the door and TV are on (the open one that went live most recently, per [TVs and door phones](04-tvs-and-door-phones.md)), labelled "On the door & TV": its kid count large, its name, state, went-live time and golden tickets won, its notes, its state's actions (End the night, Reset; Resume, Close now for Ended), its tools, and "Settings and costumes ›" to its screen.
- **Also open:** every other open Event as a short row with its state, count, End or Close now and Reset, and › to its screen; their notes sit under them.
- An Upcoming Event **waiting at the cap** shows its note on Tonight too, linking to its screen, so closing a night to make room is one tab away.
- **Nothing open:** "No night on right now", the next scheduled Event's name and Goes live at, and "▶ Go live on <Event> now" (the same Event the door ☰ offers, per [Going live and ending by themselves](05-auto-go-live-and-end.md)).
- **Helpers** at the foot: 📱 Count on this device and ➕ Add a helper (the QR and Share join link open in place).

**Nights: every Event**
- Grouped **Open (n of 3)**, newest go-live first, **Coming up**, **Past**. Each row has the name, state, "On the door & TV" if it is, one line of when or how many, and the first line of any note. A row opens the Event's screen.
- **Make a night** (name, copy costumes from) at the foot; a new Event opens its screen.

**A night's screen: everything about one Event**
- Header: name, state, "On the door & TV" if it is, the when line, its notes (Auto-ended with Resume, Close now and the summary; Closed to make room; Waiting at the cap, per ticket 05), then the actions for its state:
  - **Upcoming:** Go live, Delete.
  - **Live:** End the night, Reset.
  - **Ended:** Resume, Close now, Reset, Delete.
  - **Past:** Delete. Imported counts: Delete only.
- **Night tools**, by state: 🎫 Add a golden ticket (Live), ➕ Add missed kids (open: the way to count into a night the door isn't on), ⬇ CSV, 🖨 Tally sheet (`/tally?event=`), ✨ Night summary and its sharing toggle (Ended or Past), per [Ghost, estimated ghost, golden tickets and summaries](07-ghost-golden-summaries.md).
- **Settings:** Name, Race against, Expected kids, Visit window, Advanced (Clock shift, Golden tickets), Goes live at (Upcoming only).
- **Costumes:** that Event's tags.
- v2's "Edit <select>" and the separate Create, Past and Night tools sections go.

**Household: everything not about one night**
- **Helpers and the join key:** the key, "works on every night", Count on this device, Add a helper, Change join key.
- **Your TV:** Pair a TV, the TV link (it "watches whichever night the door is on"), Share / Copy / Show QR, Use this screen as the TV, Rotate TV link.
- **Last year (estimated):** "About how many kids came last year?", the Household's default Race against (ticket 07).
- **Household name**, **Location**, **Managers**, **Your account** (sign out, Delete my household).

**Help**
- The help column fits B as charted: at ≥ 900 px a sticky right column follows the section in view on whichever tab or screen is showing; on phones a "?" on each section heading opens its help in place. Its text → [The /setup help column's content](13-setup-help-column.md).

**Left to other tickets**
- Where the ready checklist and first-run hand-off sit on Tonight, and their wording → [Sign-up and first run](09-sign-up-and-first-run.md). (v2's checklist sits at the top of `/setup`; Tonight's top is the natural place.)
- Whether a phone that lands on a night's screen keeps it in the URL (`/setup?event=`) is a build detail.
