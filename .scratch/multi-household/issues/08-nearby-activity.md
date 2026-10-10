# Nearby activity indicator

Type: prototype (HITL)
Status: claimed
Blocked by: 07

## Question

What does "what's happening close by" look like, and where does it show?

Prototype two or three takes with fake data (one dense suburb, one sparse town) and react to them:

- **Where**: a strip on the porch TV, a card on the phone's menu, a public "tonight near you" page, or several.
- **What**: households active in your area, kids counted nearby in the last half hour, the area's total vs yours, the area's top costume, a heat map or a plain number.
- **Radius and fallback**: what shows when you're the only household in range (nothing, a wider area, a site-wide total).
- **Privacy**: within the rules settled in [Fuzzy location](07-fuzzy-location.md). Nothing that singles out one home.

Link the prototype branch from the answer. Use `dataviz` for anything chart- or map-shaped.

**Given** ([Shareable TV: link, code and QR](06-shareable-tv.md)): anyone holding a Household's TV link sees the same `/tv` as the porch, so a nearby strip on the TV is also seen by remote viewers. Today the TV shows no Household name and nothing location-related.

**Given** ([Fuzzy location](07-fuzzy-location.md)): Location is optional (a 5-char geohash cell, set with a map picker); figures are per **Area**, the fixed 4-char geohash parent (~20 × 25 km), one level only, never centred on a home. An Area shows nothing until ≥ 5 Households in it are active; kid counts are rounded to 5s; Rehearsals don't count; figures cover the last 30 minutes and refresh every 10. No place names, only "near you". Decide here: what counts as "active", and what shows below the minimum (nothing or a site-wide total, never a wider Area). The Night summary's nearby slide is frozen at night's end. The fake-Household risk was accepted in Fuzzy location.
