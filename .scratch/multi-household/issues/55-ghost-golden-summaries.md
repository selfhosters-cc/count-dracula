# The Household's estimate, golden tickets and summaries per Event

Type: build (AFK)
Status: done
Blocked by: 50

## What to build

See [v2.1 §7](../spec-v2.1.md#7-ghost-golden-tickets-and-summaries).

- **The estimate is the Household's default Race against.**
  - Setting "About how many kids came last year?" sets Race against on every Upcoming or open Event racing None, and new Events start racing it.
  - Changing it updates the same estimated Event. Clearing it puts its racers back to None.
  - It only ever touches Events racing None or racing the estimate. `comingNight()` and `canEstimateLastYear`'s gate go: the field is always offered behind the `estimatedGhost` switch.
- **Golden tickets:** one rule for every Event, drawn at Go live from its own count. No Rehearsal exemption. Add a ticket, Release remaining, End's choices, the 3 am expiry and Resume act on the Event they name.
- **A Night summary for every Ended or Past Event.** `summary_nearby` is frozen at End from the Household's "near you" figures. Share links stay one per Event.
- **Recap:** shown while the door's Event is Ended. Numbers are revealed once Ended or Past.
- **Tally sheet:** `/tally?event=<id>`, defaulting to the door's Event.
- **The Race against picker** offers only Ended, Past, counts-only or estimated Events, and never the Event itself. A pointer at a reset Event is kept.

## Acceptance criteria

- [x] Entering 120 sets Race against on a test night and Halloween 2026 (both racing None), and a night made afterwards races it; one racing "Halloween 2025 (counts)" is untouched
- [x] The field is offered after the Household has a Past Event of its own
- [x] Clearing the estimate puts its racers back to None
- [x] Two open Events each draw, add, release and expire their own tickets
- [x] An Ended test night has a Night summary and a share link
- [x] `/tally?event=` prints the named Event; bare `/tally` prints the door's Event
- [x] The picker never offers an Upcoming or Live Event, or the Event itself
- [x] `bun test` passes

## Notes from the build

- **The estimate (`setLastYear`):** entering it creates "Halloween 2025 (estimated)" and sets it on every Upcoming, Live or Ended Event racing None (never Past or counts-only); `createEvent` starts new Events on it. Clearing deletes it and its racers go to None (`removeEvent`). Deltas: `event.updated` for each **open** Event racing it, not just the door's. `comingNight()` is gone, and `canEstimateLastYear()` is now just the `estimatedGhost` switch (the name is kept for `/api/household`).
- **Judgment calls (conservative):**
  - **Changing** the total only reshapes the same Event. It doesn't re-sweep, so a night the Manager set back to None stays None.
  - With the switch **off**, new Events start at None, and Events already racing it keep it.
  - The server enforces the picker too: `settings` refuses a **new** `raceAgainstId` at an Upcoming or Live Event (`"X" isn't over yet…`). The pointer an Event already has passes unchanged (Setup's form sends it back), so one at a reset Event is kept. Four older tests that raced a Live night now End it first.
- **Picker:** `shared/race-against.js` (`canRace`, `raceChoices`), shared by the Ledger and `/setup`.
- **Golden tickets, summaries and recap:** these already acted per Event since tickets 50–54 (draw at Go live, add, release, End, the 3 am tick, Resume, `summary_nearby` at End through `/api/end` and the tick, `recapOf` once Ended or Past, the TV recap while the door's Event is Ended). Here I added tests for them only. The Test night is still created with `golden_count` 0, until ticket 58 reshapes it.
- **Tally:** `public/tally-view.js` `tallySnapshotUrl(search)`. `/tally?event=<id>` reads `/api/snapshot?event=<id>` (Manager), and a bare `/tally` reads the door's Event.
- **`/setup` (minimal, until ticket 57):**
  - The estimate's label drops "No past night of your own?". The field stays in the event editor and in checklist item 3.
  - "Live now" lists each open Event as a row, the door's first, with ✨ Night summary (and Stop sharing) when Ended, 🖨 Tally sheet, ⬇ Export and ↺ Reset. This replaces the door-only summary link and the Reset buttons.
  - Upcoming rows get 🖨 Tally sheet. Past rows keep summary, recap and Export.
- **Tests:** new `server/ghost-golden-summaries.test.js`. `estimated.test.js`'s gate test is flipped. 569 pass.
- **Checked in the browser** on a throwaway server (fresh database, fake Google, a Manager cookie), at 390 px with no horizontal scroll:
  - Entering 120 set Race against on the Test night and Halloween 2026, and the picker offered only None and the estimate.
  - The TV link showed "last year (estimated)" with "5 ahead of last year's ghost".
  - Ending the test night from a phone gave its row ✨ Night summary, which opened on `/summary?event=1`, with the summary's ghost "last year (estimated)" at 120.
  - `/tally?event=2` was titled "Halloween 2026: tally", and a bare `/tally` was titled "Test night: tally".
- **For tickets 56+:** ticket 57 should put the per-Event links (summary, tally, CSV, Reset) on each Event's card and move the estimate under Household → Last year (estimated), keeping `raceChoices` for the picker. The estimate never races, since it's counts-only and Past.
