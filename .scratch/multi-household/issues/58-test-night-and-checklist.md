# Sign-up's Test night, first-run and the ready checklist

Type: build (AFK)
Status: ready-for-agent
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

- [ ] Sign-ups (fake clock) on Oct 20, Oct 31 6 pm and Nov 2 create exactly what the table says, in `America/Toronto` and `Pacific/Auckland`
- [ ] `test_night_event_id` survives renaming the Test night; is null for the Oct 31 evening sign-up
- [ ] First-run's tick names the Event the TV shows
- [ ] Checklist item 2 ticks from a kid on Halloween; item 3 hides for a November sign-up
- [ ] No user-facing "Rehearsal" remains
- [ ] `bun test` passes
