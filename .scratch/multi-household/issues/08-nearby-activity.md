# Nearby activity indicator

Type: prototype (HITL)
Status: resolved
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

## Answer

Resolved 2026-10-10 (HITL). Prototype: branch [`prototype/nearby-activity`](https://github.com/selfhosters-cc/count-dracula/tree/prototype/nearby-activity) (`public/nearby-prototype.js`, mounted on the real `/tv` and `/`; `?variant=A|B|C`, `?area=busy|early|quiet|none`, `?fallback=hide|site`). It showed three takes: A ambient strip, B moments on refresh (a slide-up TV card and a phone toast), C phone only (a "Tonight near you" section with a chart in the door menu, TV unchanged).

**Where and what: A on both, always on.** No public page, no chart, no slide-up moments, no menu section.
- **TV:** a small "🏘️ Near you tonight" box under the hero's rush meter: **kids in the last half hour** (rounded to 5s, "under 5 kids" when it rounds to 0) · **houses counting** · the Area's **top costume**. Kept small so it doesn't push the pumpkin patch off screen. Remote TV-link viewers see the same.
- **Phone:** a one-line strip under the count: "🏘️ Near you: ~90 kids in 30 min · 14 houses".
- Both refresh with the figures, every 10 minutes. No trend line, "you vs the average house" or history chart (C's ideas, not chosen).

**Active Household (for nearby):** a Household with a **live, non-Rehearsal Event that has counted at least one kid in the last 30 minutes**. A live night with no recent taps (someone forgot to 🌙 End the night) doesn't count. The Area's figures cover only active Households.

**Below the 5-Household minimum, or no Location:**
- **TV:** nothing at all; the box doesn't render.
- **Phone:** the strip shows a **site-wide total** instead: "🎃 Count Dracula tonight: 212 houses · ~3,140 kids". *Site-wide* = Households with a live, non-Rehearsal Event right now and the kids counted in those Events, so there's no "tonight" to define across time zones. It follows the same rules: shown only with ≥ 5 such Households, kids rounded to 5s, refreshed every 10 minutes. Below that, the strip is hidden.

**Top costume** (confirmed by the user afterwards): the Area's most-counted costume across its active Households' live Events, **only from costumes counted in at least 3 different Households** (names matched case-insensitively, trimmed). One home's typed-in text never reaches other Households' screens, and a rare costume can't point to a single home. If none qualifies, the clause is left out.

**Handed on**
- User-entered costume names now reach other Households' TVs, but only through the 3-Household rule above → [Public hosting and abuse](11-public-hosting-and-abuse.md) decides whether that's enough.
- The site-wide total exists (phone fallback) → [Multi-household extras shortlist](13-multi-household-extras.md) no longer needs to rank it as an extra, except for showing it elsewhere.
- "Active" for nearby is defined here; the dashboard may reuse it or not → [Operator dashboard](10-operator-dashboard.md).

Glossary: **Active Household** added to [CONTEXT.md](../../../CONTEXT.md).
