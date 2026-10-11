# Nearby across Area edges

Type: build (AFK)
Status: done
Blocked by: 56, 62

## What to build

"Near you" stops at no Area edge. See [v2.1 §10](../spec-v2.1.md#10-nearby-the-site-wide-total-and-the-operator). Deploys after the opening line. **Switch-off-able:** `nearbyEdges` in `config.json` (off = the Household's own Area, still with no minimum).

- **A geohash neighbour function** in `server/nearby.js`, with no dependency: the 8 cells around a 5-character cell, wrapping at the antimeridian, nothing beyond the poles.
- **A Household's window:** the set of 4-character Areas its cell and those 8 neighbours fall in (1, 2 or 4). Its figures add up those Areas' totals and merge their costume counts, cached per set of Areas. It shows once one other Active Household is in the window.
- **The top costume:** counted in ≥ 3 Households across the window, never blocklisted.
- **The Night summary** freezes the window's figures at End.
- **The seed** (`deploy/seed-nearby.js`) can place 2 houses either side of an edge and at a corner.

## Acceptance criteria

- [x] Two houses in edge cells either side of an Area edge see the same figures, each counting the other
- [x] An inside cell sees 1 Area; an edge cell 2; a corner cell 4
- [x] Neighbours wrap across 180° and stop at the poles
- [x] `nearbyEdges` off gives the v2.1 single-Area figures
- [x] `bun test` passes

## Notes from the build

- **Built before 62**, at the user's request, though this ticket was planned to deploy after the opening line. It ships behind `nearbyEdges` (default on), so it can still be switched off for the opening if wanted.
- **Geohash (`server/nearby.js`, no dependency):** `geohashNeighbours(cell)` decodes the cell to its box, steps one cell-width and one cell-height each way from its centre, and re-encodes: longitude wraps across 180°, and a step past ±90° is dropped (a polar cell has 5 neighbours). `windowAreas(cell)` is the sorted set of 4-character parents of the cell and its neighbours. Tested against the classic `ezs42` neighbours, `xbpbp` ↔ `80000` across 180°, `00000` at the South Pole, and all 32 cells of dpz8 (12 see 1 Area, 16 see 2, 4 see 4).
- **The window:** `computeNearby` now also returns `window(areas)`, which adds up a set of Areas' Active Households (kids in 30 minutes summed, then rounded to 5s; houses; the top costume over all of them, so the ≥ 3-Household rule and the blocklist apply across the window), cached per set of Areas for that refresh. `nearYou(figures, householdId, cell, { edges })` shows the window once any Active Household other than this one is in any of its Areas. **Judgment call:** the kids are rounded once over the window's sum, not as a sum of rounded Area figures (Areas never overlap, so each house counts once).
- **The switch:** `nearbyEdges` in `DEFAULT_SWITCHES` (so it shows in snapshots' `settings.switches` like the others); `createNearby({ edges })` passes it to `nearYou`. Off, the window is the Household's own Area, still with no minimum.
- **The Night summary** needed no change: End (and the 3 am auto-end) already keeps `nearby.forHousehold(...).area`, which is now the window. Tested over `/api/end` with houses either side of an edge.
- **Seed:** `deploy/seed-nearby.js <db> [houses | edge | corner]`: `edge` puts 2 houses in dpz8r and dpzb2 (side by side across the dpz8 / dpzb edge), `corner` in dpz8z and dpzc0 (diagonally across the corner of dpz8, dpz9, dpzb, dpzc, both seeing all 4). Note the default seed's dpz8f and dpz8g are north-edge cells, which changes nothing for its checks. RUNBOOK §5's nearby check now runs `edge` and `corner` after the one-Area ones, with `nearbyEdges` off as the fallback.
- **Wording:** `/privacy` now says near you adds the next area's figures close to its edge (all four at a corner). The screens are unchanged.
- **Checked in the browser** on throwaway servers (ports 3197 and 3201, scratch databases): with `edge`, both door phones showed "🏘️ Near you: ~110 kids in 30 min · 2 houses" and house 2's TV "~110 kids in the last half hour · 2 houses counting"; with `corner`, both phones the same "· 2 houses". Restarted with `nearbyEdges: false`, both edge houses' snapshots had `area: null`.
- **Tests:** new cases in `server/nearby.test.js` (neighbours, antimeridian, poles, window sizes, edge/corner/180° pairs, top costume over the window, the cache, edges off, both phones and the summary over HTTP), `deploy/scripts.test.js` (the `edge` and `corner` seeds, and bad options) and the switch list in `server/ledger.test.js`. 669 pass.

