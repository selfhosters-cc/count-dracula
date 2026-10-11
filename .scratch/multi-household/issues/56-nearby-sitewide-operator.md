# Nearby, the Site-wide total and the Operator through the door's Event

Type: build (AFK)
Status: done
Blocked by: 50

## What to build

One house per Household, judged on its door's Event, and **no minimum crowd**. See [v2.1 §10](../spec-v2.1.md#10-nearby-the-site-wide-total-and-the-operator). The edge window is [ticket 63](63-nearby-across-edges.md). Here "near you" stays the Household's own Area.

- **`nearbyNights` / `computeNearby`:** one row per Household from `doorEvent`, not one per live Event. Active means its door's Event counted a kid in the last 30 minutes, and it isn't Suspended. No Rehearsal filter.
- **No minimum:** an Area's figures show to a Household once **one other** Active Household is in it. With none, the phone falls back to the Site-wide total and the TV box hides. Rounding, the 10-minute refresh and the ≥ 3-Household top costume are unchanged.
- **The Site-wide total:** Households with an open Event and the whole-night kids of their door's Events; hidden below 5 (unchanged). `/api/site` gains **`live`** (any counted door's Event is Live).
- **The Operator:** statuses **Counting, Stale, Waiting, Ended, No night** on the door's Event, sorted in that order with most kids first. Rows and the detail view both key by Household from the door's Event. Filter chips follow. `deploy/access-request.js` drops `rehearsal`.
- `deploy/seed-nearby.js` (ticket 42's seed) works without the Rehearsal and can seed 2 houses.

## Acceptance criteria

- [x] A Household with two open Events counts as one house, with only its door's Event's kids
- [x] A test night started at 2 pm drops out of the figures once Halloween goes live
- [x] Two Active Households in an Area each see "near you"; one alone sees the Site-wide fallback
- [x] `/api/site` reports `live: true` during a night and `false` once all are Ended
- [x] Operator rows show Ended for a night ended at 10 pm, and No night with nothing open; table and detail agree
- [x] `bun test` passes

## Notes from the build

- **Most of "one house per Household" was already in place** from ticket 50: `nearbyNights()` returns one row per Household (its door's Event, `DOOR_ROW`) with no Rehearsal filter, and `deploy/access-request.js` had already lost `rehearsal`. This ticket adds tests for it (two open Events count as one house with only the door's kids; a 2 pm Test night drops out once Halloween goes live at 4 pm) and a check in the access-request test.
- **No minimum (`server/nearby.js`):** `computeNearby` now keeps figures for every Area with at least one Active Household, plus `active: Map(area → Set of household ids)`. The new pure `nearYou(figures, householdId, cell)` gives a Household its Area's figures when at least one Active Household **other than itself** is in it (its own night is in the figures if it's Active too), else null. `forHousehold` uses it, so the phone falls back to the Site-wide total and the TV box hides as before. A Household that isn't counting (or has nothing open) still sees its Area once one other house is counting there, so an Area can show "1 house"; `public/nearby-text.js` now says "1 house" / "1 house counting", and the summary's nearby slide "1 house was counting". Rounding, the 10-minute refresh and the ≥ 3-Household top costume are unchanged. **Ticket 63** replaces the Area lookup in `nearYou` with the window (the `active` sets are per Area, so the window is a union of them).
- **The Site-wide total:** unchanged rule (open door's Events, not Suspended, hidden below 5). `nearbyNights()` rows gain `live` (the door's Event is Live, not Ended), `computeNearby` returns `live`, and `nearby.site()` answers **`GET /api/site` → `{ site, live }`**. **Judgment call (conservative):** `live` is false whenever `site` is null (below 5 or switched off), so the public endpoint says nothing about fewer than 5 Households. `live` sits beside `site`, not inside it, so the phone's `nearby.site` is unchanged.
- **The Operator (`server/operator.js`):** `householdStatus({ state, kids, lastKidAt }, now)`: no door's Event → **No night**; a kid in the last 30 minutes (Live or Ended) → **Counting**; Ended → **Ended**; Live with kids → **Stale**; else **Waiting**. `STATUSES` is all five in sort order. `ledger.liveNights()` became **`ledger.doorNights()`** (`state` instead of `ended`). `/api/operator` rows and `/api/operator/household` both go through one `doorStatus()` in `app.js`, and the detail now carries `kids` and `lastKidAt` too (shown in its state line). The health tile is labelled "Households" and lists all five counts. `/operator`'s chips and sort follow; "No night" gets a dim pill (class `No-night`). **Judgment call:** a Suspended Household's status ignores the suspension (the row already shows a Suspended tag), so Counting there means "a kid in 30 minutes" rather than the nearby Active Household.
- **Seed:** `deploy/seed-nearby.js <db> [houses]` (1–6, default 6) prints `/door?key=` phone links; with 2 houses both show "2 houses" and no top costume. Tested in `deploy/scripts.test.js`. RUNBOOK §5's section is "Nearby's view (tickets 42, 56)" and Nov 1's check is "no Counting, Stale or Waiting".
- **Wording:** `/privacy` now says an area's figures show once another house near you is counting, spells out the one-other-house risk, and keeps the site's minimum of 5. There was no "5 houses" in the help pages. `help-tv.html`'s Rehearsal wording is still ticket 58's.
- **Not changed, noted:** a night's `summary_nearby` (kept at End, shown on public share links) now follows the same no-minimum rule, so a share page can show "2 houses were counting near you". No place name goes with it.
- Checked in the browser on a throwaway server (seed with 2 houses, plus an Ended house, a house with nothing open and the Operator's own Waiting one): `/operator` at 390 px showed chips "Counting 2 · Stale 0 · Waiting 1 · Ended 1 · No night 1" in that order, no horizontal scroll, and the Ended and No night detail views matched their rows (kids, last kid); a seed house's door phone showed "🏘️ Near you: ~110 kids in 30 min · 2 houses" and the other's TV "~110 kids in the last half hour · 2 houses counting".
- **Tests:** new cases in `server/nearby.test.js` (no minimum, `live`, the door's Event over HTTP), `server/operator-dashboard.test.js` (five statuses, Ended at 10 pm / No night / a non-door Event with more kids, table and detail agree), `public/nearby-text.test.js` and `deploy/scripts.test.js`. 582 pass.

