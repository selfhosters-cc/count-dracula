# Fuzzy location

Type: grilling (HITL)
Status: resolved
Blocked by: 02

## Question

How does a household set its location, how fuzzy is it, and who sees what?

- **Input**: postal code, address, "use my location", or a map pin. Choose from what [Geocoding and location-fuzzing options](02-geocoding-and-fuzzing-options.md) shows is free and allowed.
- **Fuzz**: method and size (e.g. a ~1 km grid cell, a postal-area centroid). Do we ever store the precise point, or fuzz before saving?
- **Opt-in**: is location required at sign-up, optional, or only needed to appear in nearby?
- **Who sees it**: other households, shared-TV viewers, the operator dashboard, the public. With a minimum number of households per area before anything shows.
- **The live signal**: "kids at this door right now" plus an area could tell someone a home is busy (or that its people are at the door). Is anything live shown per household, or only area totals, or delayed?
- Settle **Location** / **Area** in [CONTEXT.md](../../../CONTEXT.md).

## Answer

Resolved 2026-10-10 (HITL grilling). The user asked for **worldwide support**, which overrode the research's postal-code route. The user accepted every other recommendation, including fixed Areas instead of the research's "cell + 8 neighbours".

**Setting it**
- **Optional.** First-run asks once, with **Skip**. Any Manager can add, change or remove it later in `/setup`. Having a Location *is* taking part in nearby; there's no separate switch. A Household without one runs its night normally, sees no nearby figures and isn't counted in anyone's.
- **Location picker:** a Leaflet 1.9.4 map (vendored in `public/vendor/`, BSD-2 notice kept) with a **Use my location** button (browser geolocation, HTTPS). Pan and zoom by hand is the fallback for a refused permission or a laptop located wrongly by IP. It works worldwide.
- **No postal codes** (no GeoNames or Census tables) and **no typed addresses** (Nominatim's policy forbids sending personal data).
- OpenStreetMap tiles load **only in the picker**, with the OSM credit visible. Nothing on the night (TV, phones, nearby) depends on them.

**How fuzzy**
- The browser snaps the point to a **5-character geohash cell** (about 4.9 × 3.1–3.5 km at 45–50°) and sends only the cell id. The exact point never reaches the server. The picker shows the shaded cell, never a pin.
- **The cell is all we store.** Changing it replaces it with no history kept. Removing it or deleting the Household erases it.

**Area: fixed, not centred on each home**
- A Household's **Area** is the **4-character geohash parent** of its cell (about 19.5 × 25–28 km). Every Household in an Area sees the same figures.
- **Why not the research's cell + 8 neighbours:** each Household's 3×3 block would be centred on itself, so neighbours' blocks overlap differently. With a map picker, anyone can place fake Households in nearby cells and subtract one block's figures from another's to isolate a single cell, possibly a single home. Fixed, non-overlapping Areas leave nothing to subtract. They also reach the minimum crowd sooner at launch. The cost: a Household just across a boundary counts in the next Area.
- **One level only:** no wider or narrower area is ever shown alongside, so nested figures can't be subtracted either.

**Who sees what**
- **Only Area totals, never anything about one Household.** No place names (we don't reverse-geocode), only "near you", which matches the [Shareable night summary](09-shareable-night-summary.md).
- **Minimum crowd:** an Area shows **nothing** until **at least 5 Households** in it are active. Kid counts are rounded to multiples of 5. **Rehearsals don't count.**
- **The live signal is delayed:** figures cover the **last 30 minutes** and refresh **every 10 minutes**, not on every tap. So "kids at this door right now" can't be tied to a home.
- **Each Household** sees its own Area, on whichever surfaces [Nearby activity indicator](08-nearby-activity.md) picks. **TV-link holders** see the same if a TV strip is chosen. There's **no public page** unless Nearby activity indicator adds one under these same rules.
- **Operator:** how many Households are in each Area, with no map. The rest is for [Operator dashboard](10-operator-dashboard.md).
- **Night summary:** the nearby slide's Area figures are **frozen when the night ends**, so a later change of Location doesn't rewrite it.

**Accepted risk**
- Someone could create 4 fake Households (one Google account each) in a target's Area to get past the 5-Household minimum and learn the target's rounded, 30-minute kid count. Rounding, the delay and the per-IP limit on creating Households keep this low-value. Fully preventing it isn't worth the time before the freeze.

**Handed on**
- What nearby shows and where, the rule for "active", and what shows below the minimum crowd (nothing, or a site-wide total; never a wider Area) → [Nearby activity indicator](08-nearby-activity.md).
- Per-Area counts on the dashboard → [Operator dashboard](10-operator-dashboard.md).
- Any CSP must allow the OSM tile host and keep the `Referer` header in the picker → [Public hosting and abuse](11-public-hosting-and-abuse.md).
- The optional location step in first-run → [From sign-up to a TV on the porch](12-sign-up-to-porch-tv.md).

Glossary: Location and Area added to [CONTEXT.md](../../../CONTEXT.md).
