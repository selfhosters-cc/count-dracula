# Sign-up's Test night, first-run and the ready checklist

Type: build (AFK)
Status: done
Blocked by: 57

## What to build

See [v2.1 §8](../spec-v2.1.md#8-sign-up-first-run-and-the-ready-checklist).

- **`createHousehold`, by when (Household zone):**
  - **before Oct 31 4:00 pm:** a live **Test night** (starter costumes, 0 golden tickets) and Upcoming **"Halloween 2026"** going live Oct 31 4:00 pm (starter costumes, 5 tickets)
  - **Oct 31 4:00 pm – Nov 1 3:00 am:** only Halloween 2026, live now
  - **after:** only a live Test night
  - Race against is the Household default.
- **`households.test_night_event_id`** remembers the Test night by id (null when none was made).
- **First-run screen 3:** "✓ Your TV is showing *<the door's Event's name>*".
- **The checklist** at the top of Tonight:
  1. TV watching
  2. a kid on **any** Event, with Count on this device and Add a helper, and the line "Test night ends by itself at 3 am. Your TV switches to Halloween 2026 when it goes live." when both are true
  3. Your Halloween night (the next Event with Goes live at, else an open Event that isn't the Test night), with Expected kids and the Household estimate; hidden when there's no such night
  - `/api/household`'s `checklist.rehearsalKids` becomes `anyKids`.
- **Wording:**
  - `/help/tv`: "test it on your Test night (or Go live on any night)"; "Set the volume at your Rehearsal" → "on your Test night"
  - `/privacy`: Abandoned sign-up reads "never counted a kid on any Event but its Test night"
  - grep for "Rehearsal" in `public/` and `server/` leaves nothing user-facing

## Acceptance criteria

- [x] Sign-ups (fake clock) on Oct 20, Oct 31 6 pm and Nov 2 create exactly what the table says, in `America/Toronto` and `Pacific/Auckland`
- [x] `test_night_event_id` survives renaming the Test night; is null for the Oct 31 evening sign-up
- [x] First-run's tick names the Event the TV shows
- [x] Checklist item 2 ticks from a kid on Halloween; item 3 hides for a November sign-up
- [x] No user-facing "Rehearsal" remains
- [x] `bun test` passes

## Notes from the build

- **Schema (migration step 15, adds only):** `households.test_night_event_id INTEGER`, no backfill: Households from before (Household #1, dev sign-ups) have none, and nothing is ever looked up by name. Deleting the Test night nulls it (`removeEvent`), since SQLite can reuse a deleted id.
- **`createHousehold`** follows spec §8's table, in the Household's zone: before Oct 31 4:00 pm a live Test night (8 starter costumes, 0 golden tickets) and Upcoming "Halloween 2026" (8, 5, Goes live at 4:00 pm); from 4:00 pm until Nov 1 3:00 am only Halloween, live now; from 3:00 am on only a live Test night. `house.testNightId()` reads it. Tests: `server/test-night.test.js` (fake clocks in `America/Toronto` and `Pacific/Auckland`, including both boundaries); `schedule.test.js`'s late sign-up now expects no Test night.
- **`/api/household`** adds `testNightEventId` and `door: { id, name } | null` (the door's Event, what the TV shows), so first-run's tick and the checklist follow the 3 s poll. `checklist` is `{ tvWatching, anyKids }`.
- **First-run screen 3:** "✓ Your TV is showing *<door's name>*" (`tvTick()` in `setup-view.js`); with nothing open, "✓ Your TV is watching. No night is on right now."
- **The checklist** is `checklist()` / `checklistNight()` in `setup-view.js` (tested in `setup-view.test.js`), drawn by `renderChecklist()`. Item 2 carries the helper box (Count on this device, Add a helper) until ticked. Item 3 hides when there's no night to follow, and the checklist then hides once items 1 and 2 are done.
- **Judgment calls (conservative):**
  - Item 2's line says only what's true: "<Test night's name> ends by itself at 3 am." only while the Test night is Live, and "Your TV switches to <item 3's night> when it goes live." only while that night is Upcoming. In the usual case it's exactly the spec's sentence; a Halloween-evening sign-up gets no line, a November one only the first half, and a renamed Test night is named by its new name.
  - Item 3 ticks with Expected kids, last year's estimate, or Skip, as spec §8 says; a Race against no longer ticks it (v2 counted it).
  - Item 3's "else an open Event" picks the most recently live one that isn't the Test night. Its line reads "<name> goes live Sat, Oct 31, 4:00 PM", "<name> is live" or "<name> has ended".
  - `/privacy` uses the ticket's words, "never counted a kid on any Event but its Test night". `/help/tv`'s Test night section drops Reset: the Test night ends by itself and the TV switches to Halloween; "to test again later, Go live on any night".
  - `deploy/seed-nearby.js` makes "Halloween 2026" itself when a seed house signed up after Nov 1, 3 am has none.
- **Rehearsal:** none left in `public/` (a test scans every page and script) or `server/` outside migration steps 1 and 12 (SQL on the old column). Test files still read v1 fixture nights named "Rehearsal": that's data. **`deploy/RUNBOOK.md` still says Rehearsal four times: ticket 61's.**
- **For ticket 59:** nothing changed in sign-up's HTTP flow; `/api/household`'s new fields are there if the homepage needs them. **For ticket 60:** Household #1 has `test_night_event_id` null.
- **Tests:** 631 pass.
- **Checked in the browser** at 390 px (no horizontal scroll) on three throwaway servers (fresh databases, fake Google, a Manager cookie): a fresh Oct 11 sign-up went through first-run (name, Location skipped, a second tab's `/tv` code paired) to "✓ Your TV is showing *Test night*"; the checklist showed item 1 ticked, item 2 with Count on this device and Add a helper, and "Halloween 2026 goes live Sat, Oct 31, 4:00 PM". After Go live on Halloween, Count on this device → `/door` → +1 Kid counted on Halloween and ticked item 2 (line: "Test night ends by itself at 3 am."). A second sign-up with a TV link open and a kid on the Test night showed the spec's full line, and saving Expected kids hid the checklist. A Nov 2 sign-up (fake clock) had only "Test night", Live, and no item 3.
