# Nearby across Area edges

Type: grilling (HITL)
Status: ready-for-human
Blocked by:

## Question

Opening-day feedback: a town split across an Area edge (fixed 4-character geohash parent, ~20 × 25 km) gives two houses a few streets apart different "near you" figures, and neither sees the other. How should nearby stop being cut by grid lines without giving up what fixed Areas bought?

- **Options:** each Household's Area plus its 8 neighbours (what [geocoding research](../../multi-household/issues/02-geocoding-and-fuzzing-options.md) proposed and [Fuzzy location](../../multi-household/issues/07-fuzzy-location.md) turned down for subtraction risk); a window centred on the Household's own cell; two levels; a different grid; Households choosing a named region.
- **Privacy:** overlapping windows let differences be subtracted. With rounding to 5s, the ≥ 5 Active Household minimum, the 10-minute refresh and the 30-minute window, how much can someone learn about one Household? Is that acceptable?
- **The minimum of 5:** counted over the window or the Household's own Area?
- **Cost:** the 10-minute compute over all Households.
- Update **Area** in [CONTEXT.md](../../../CONTEXT.md). Consult `dataviz` for any illustration.

Can be cut: it deploys after the opening line.
