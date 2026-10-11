# Nearby, the Site-wide total and the Operator through the door's Event

Type: build (AFK)
Status: ready-for-agent
Blocked by: 50

## What to build

One house per Household, judged on its door's Event, and **no minimum crowd**. See [v2.1 §10](../spec-v2.1.md#10-nearby-the-site-wide-total-and-the-operator). The edge window is [ticket 63](63-nearby-across-edges.md). Here "near you" stays the Household's own Area.

- **`nearbyNights` / `computeNearby`:** one row per Household from `doorEvent`, not one per live Event. Active means its door's Event counted a kid in the last 30 minutes, and it isn't Suspended. No Rehearsal filter.
- **No minimum:** an Area's figures show to a Household once **one other** Active Household is in it. With none, the phone falls back to the Site-wide total and the TV box hides. Rounding, the 10-minute refresh and the ≥ 3-Household top costume are unchanged.
- **The Site-wide total:** Households with an open Event and the whole-night kids of their door's Events; hidden below 5 (unchanged). `/api/site` gains **`live`** (any counted door's Event is Live).
- **The Operator:** statuses **Counting, Stale, Waiting, Ended, No night** on the door's Event, sorted in that order with most kids first. Rows and the detail view both key by Household from the door's Event. Filter chips follow. `deploy/access-request.js` drops `rehearsal`.
- `deploy/seed-nearby.js` (ticket 42's seed) works without the Rehearsal and can seed 2 houses.

## Acceptance criteria

- [ ] A Household with two open Events counts as one house, with only its door's Event's kids
- [ ] A test night started at 2 pm drops out of the figures once Halloween goes live
- [ ] Two Active Households in an Area each see "near you"; one alone sees the Site-wide fallback
- [ ] `/api/site` reports `live: true` during a night and `false` once all are Ended
- [ ] Operator rows show Ended for a night ended at 10 pm, and No night with nothing open; table and detail agree
- [ ] `bun test` passes
