# The night-card read

Type: build (AFK)
Status: done
Blocked by: —

## What to build

One batched Ledger read for a page that shows many nights at once. See [v2.2 §7](../spec-v2.2.md#7-reading-core-data-the-night-card-read).

- **`ledger.nightCards(eventIds)`** → one card per Event id that exists (missing ids left out): `eventId`, `householdId`, `state`, `countsOnly`, `kids`, `area` (the current Location's 4-character parent, or null), `date` (the local go-live date, `YYYY-MM-DD`, in the current time zone, or null), `topCostume` (as typed, with its emoji), `peak` (the busiest half-hour, worded as the Night summary words it), `vsLast` (signed gap to the Race against's total, or null when racing None), `name` (current), `suspended`, and `eligible` with `why` (`not-over`, `counts-only`, `no-kids`, `no-location`).
- **Eligible** = Ended or Past, not counts-only, at least one kid, a Location set.
- **About one query per table per call**, never a full `snapshot()` per Event. 500 Events should read in well under 100 ms on the dev box.
- **Never** the cell, an email, a phone name or the Race against's name.

## Acceptance criteria

- [x] For an Ended night, `kids`, `topCostume` and `peak` equal `nightFacts(summary(id))`'s, including a night past midnight and one in another time zone
- [x] `date` is the go-live date in the Household's zone: a night that went live at 11:30 pm Oct 31 in Vancouver is `2026-10-31`
- [x] `vsLast` is the gap to a counts-only, estimated or real Race against; null racing None
- [x] `eligible` is false with each `why`: Upcoming and Live (`not-over`), imported and estimated counts (`counts-only`), no kids (`no-kids`), no Location (`no-location`)
- [x] Changing the name, Location or time zone, or Suspending, shows on the next call
- [x] A card never carries the 5-character cell
- [x] 500 Events in one call stays under 100 ms (a timing test with a generous bound)
- [x] `bun test` passes
