# Nearby across Area edges

Type: build (AFK)
Status: ready-for-agent
Blocked by: 56, 62

## What to build

"Near you" stops at no Area edge. See [v2.1 §10](../spec-v2.1.md#10-nearby-the-site-wide-total-and-the-operator). Deploys after the opening line. **Switch-off-able:** `nearbyEdges` in `config.json` (off = the Household's own Area, still with no minimum).

- **A geohash neighbour function** in `server/nearby.js`, with no dependency: the 8 cells around a 5-character cell, wrapping at the antimeridian, nothing beyond the poles.
- **A Household's window:** the set of 4-character Areas its cell and those 8 neighbours fall in (1, 2 or 4). Its figures add up those Areas' totals and merge their costume counts, cached per set of Areas. It shows once one other Active Household is in the window.
- **The top costume:** counted in ≥ 3 Households across the window, never blocklisted.
- **The Night summary** freezes the window's figures at End.
- **The seed** (`deploy/seed-nearby.js`) can place 2 houses either side of an edge and at a corner.

## Acceptance criteria

- [ ] Two houses in edge cells either side of an Area edge see the same figures, each counting the other
- [ ] An inside cell sees 1 Area; an edge cell 2; a corner cell 4
- [ ] Neighbours wrap across 180° and stop at the poles
- [ ] `nearbyEdges` off gives the v2.1 single-Area figures
- [ ] `bun test` passes
