# Nearby activity indicator

Type: prototype (HITL)
Status: open
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
