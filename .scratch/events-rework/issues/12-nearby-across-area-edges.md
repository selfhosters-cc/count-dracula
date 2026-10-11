# Nearby across Area edges

Type: grilling (HITL)
Status: resolved
Blocked by:

## Question

Opening-day feedback: a town split across an Area edge (fixed 4-character geohash parent, ~20 × 25 km) gives two houses a few streets apart different "near you" figures, and neither sees the other. How should nearby stop being cut by grid lines without giving up what fixed Areas bought?

- **Options:** each Household's Area plus its 8 neighbours (what [geocoding research](../../multi-household/issues/02-geocoding-and-fuzzing-options.md) proposed and [Fuzzy location](../../multi-household/issues/07-fuzzy-location.md) turned down for subtraction risk); a window centred on the Household's own cell; two levels; a different grid; Households choosing a named region.
- **Privacy:** overlapping windows let differences be subtracted. With rounding to 5s, the ≥ 5 Active Household minimum, the 10-minute refresh and the 30-minute window, how much can someone learn about one Household? Is that acceptable?
- **The minimum of 5:** counted over the window or the Household's own Area?
- **Cost:** the 10-minute compute over all Households.
- Update **Area** in [CONTEXT.md](../../../CONTEXT.md). Consult `dataviz` for any illustration.

Can be cut: it deploys after the opening line.

## Answer

Resolved 2026-10-11 (agent draft, revised with the user). **No minimum crowd. "Near you" shows as soon as one other house nearby is counting. Its window is the Household's cell and the 8 cells around it, rounded out to whole Areas, so an Area edge no longer splits a town.**

**The window**
- **Areas don't change.** An Area is still the 4-character geohash parent (about 20 × 25 km), the unit totals are added up in and the Operator sees.
- **A Household's "near you"** covers every Area that its own 5-character cell, or any of the 8 cells around it, falls in. An Area holds 8 × 4 cells, so:
  - **12 of the 32 cells** are inside the Area and see **1 Area** (v2's view);
  - **16 cells** along one edge see **2 Areas**, their own and the one across that edge;
  - **4 corner cells** see **4 Areas**.
- **The feedback case.** Two houses a few streets apart on opposite sides of an edge both sit in edge cells, so they **see the same figures**, their two Areas together. Near a corner, one house may see 4 Areas and the other 2, but each always counts the other.
- Neighbouring cells wrap across the 180° meridian. There's nothing beyond the poles.

**No minimum crowd**
- **The minimum of 5 Active Households is dropped.** "Near you" shows once **at least one Active Household other than this one** is in the window. On its own, a house's own count tells it nothing new, so with no other house there's nothing to show.
- **The figures are v2's**, added up over the window, own house included:
  - kids in the last half hour, rounded to 5s ("under 5 kids" when that's 0)
  - houses counting
  - the top costume. It still needs to be counted in **at least 3 Households** across the window, and never a blocklisted name; otherwise the clause is left out.
- **The fallback is unchanged.** With no Location, or no other house counting nearby, the phone strip shows the Site-wide total (which keeps its own minimum of 5) and the TV box doesn't render.
- **Unchanged from v2:** computed every 10 minutes, rounding to 5s, the 30-minute Active window, totals only (never anything about one Household), and no place names.
- **The Night summary** freezes the window's figures when the night ends, as it froze the Area's in v2.

**Privacy: the accepted risk, restated**
- **With one other house counting**, a Household can subtract its own count and learn that house's kids in the last half hour, rounded to 5s and up to 10 minutes old. That house could be anywhere in a 20–50 km stretch, and nothing says which one it is.
- **A stranger** can place a Household with a pin near a target to read the same thing. v2's attack needed 4 fake Households; this one needs 1. **Accepted:** a trick-or-treat count, rounded, delayed and unplaced, is low-value. The per-IP limit on creating Households stays.
- **Windows still can't be subtracted below an Area.** Every figure is a sum of whole Areas, so subtracting one window from another only recovers whole-Area figures. That's why windows centred on each Household's own cell stay ruled out: subtracting those isolates a single 5 km cell.
- Spec §11's **Accepted risk** paragraph is rewritten to say this.

**Options not chosen**
- **A window centred on the Household's own cell:** it isolates single cells, as above ([Fuzzy location](../../multi-household/issues/07-fuzzy-location.md) turned it down for this).
- **Own Area plus all 8 neighbouring Areas:** no edges at all, but about 60 × 75 km is no longer "near you".
- **Two levels, an offset grid, named regions:** the first two still have edges and can be subtracted; the third needs a gazetteer or typed place names, which v2 ruled out.
- **Keeping a smaller minimum (2–4):** it still leaves most Areas dark at launch, and a single stranger's fake Household gets around it anyway.

**Cost**
- Every 10 minutes: totals per Area, once, as today. Then each Household's window adds up 1, 2 or 4 Area totals and merges their costume counts, cached by its set of Areas. That's a few thousand small sums at most.
- New code: a geohash neighbour function in `server/nearby.js` (no dependency, about 30 lines), with tests for edges, corners, the antimeridian, a single other house, and their own house alone. About ½ day. It can be cut, but the dropped minimum ships either way (a one-line change).
- The screens show the same things: "🏘️ Near you", the TV box and the phone strip.
- The dev-box "nearby ≥ 5 check" ([ticket 42](../../multi-household/issues/42-nearby-seed.md)'s seed) becomes a check with 2 houses, at an edge and at a corner.

Glossary ([CONTEXT.md](../../../CONTEXT.md)): **Area** reworded. **Near you** added. **Active Household** loses "an Area's minimum of 5".
