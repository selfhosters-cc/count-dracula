# Multi-household extras shortlist

Type: grilling (HITL)
Status: resolved
Blocked by: 08

## Question

Which extra ideas, beyond the four must-haves, earn a place, and which of them are cheap enough to make the Oct 24 freeze?

Candidates to rank (add more): **typed-in half-hour counts** from last year (a form that creates a counts-only event to race); a **site-wide live total** ("12,408 kids counted tonight"); site-wide or area **costume trends** ("Wednesday is #1 near you"); a neighbourhood **leaderboard** (opt-in); a public **"tonight" map**; "first house to 100" style moments across households.

For each: value, build cost, privacy cost, and whether it needs density we may not have in year one. Output a ranked list with a cut line; everything below it goes to Out of scope "after Halloween".

A neighbourhood-average ghost was ruled out in [What becomes per-household](05-what-becomes-per-household.md): before Oct 31 no other Household has a past night.

**Given** ([Nearby activity indicator](08-nearby-activity.md)): nearby is a small always-on box on the TV and a one-line strip on the phone (kids in the last half hour, houses counting, the Area's top costume). Below the minimum or with no Location, the phone strip shows a **site-wide total** (live, non-Rehearsal Events right now), so that candidate already exists on the phone. The trend line, "you vs the average house" and a history chart were prototyped and not chosen.

## Answer

Resolved 2026-10-10 (HITL grilling). The user accepted every recommendation and locked the list without adding candidates.

**Above the cut line**, in build order (about ¾ of a build day in total; build them after the four must-haves, cut from the bottom if the build slips):

1. **Last year's total, shaped into a ghost** (about ½ day). Checklist item 3 ("Your Halloween night", from [From sign-up to a TV on the porch](12-sign-up-to-porch-tv.md)) asks an optional **"About how many kids came last year?"**, also editable in `/setup`. The number becomes a **counts-only past event**, "Halloween 2025 (estimated)", using v1's existing `counts_only` + stored-buckets path in `server/ledger.js`. It's set as the "Halloween 2026" Event's **Race against**.
   - **Shape:** the total is spread over a fixed typical curve in code: our own 2025 night's five half-hour buckets ([2025-counts.md](../../count-dracula/data/2025-counts.md), 17:42–20:00) normalised to fractions, so no counts are revealed. They are read at the same local times in the Household's zone. Rounding goes to the biggest bucket so the total is exact.
   - **Labels:** the race chart and the "vs last year" lines say **"last year (estimated)"**, and so does the Night summary's vs-ghost slide.
   - **Golden range:** it's an ordinary Race against, so v1's draw uses its total. Expected kids stays the fallback when the field is skipped. Item 3 ticks when either is set, or skipped.
   - A Manager can change or clear it; clearing sets Race against back to None. Only offered while the Household has no past Event of its own (Household #1 keeps "Halloween 2025 (counts)").
   - No density needed, no new privacy cost.
2. **Site-wide total on the public sign-up page** (1–2 h). The signed-out landing / sign-up page shows the same line as the phone fallback from [Nearby activity indicator](08-nearby-activity.md), "🎃 Count Dracula tonight: 212 houses · ~3,140 kids". The same rules apply: live non-Rehearsal Events right now, ≥ 5 Households, kids rounded to 5s, refreshed every 10 minutes, hidden below the minimum. Not on the TV (the TV stays nearby-only) and not in `/setup`.
3. **Site-wide top costume clause** (about 1 h). The site line gains "· top costume: 🧙 Witch" wherever it shows (phone fallback and sign-up page). It uses the Area's rule: the most-counted costume across live non-Rehearsal Events, only from names counted in ≥ 3 different Households (case-insensitive, trimmed), never a blocklisted name ([Public hosting and abuse](11-public-hosting-and-abuse.md)); left out if none qualifies. No top-N list, no trend over time. First to drop if the build slips.

**Below the cut line → after Halloween**
- **Half-hour grid entry** for last year's counts (and a CSV upload). Almost nobody has these numbers, and the total covers the race.
- A **top-3 costume list** on the sign-up page: more user-typed text on a public page, and starter Tags will dominate in year one anyway.
- **Neighbourhood leaderboard**, named or opt-in, and the no-names **"busier than ~70% of houses near you"** percentile. Both break [Fuzzy location](07-fuzzy-location.md)'s "only Area totals, never anything about one Household", and need ≥ 5 opted-in Households per Area, which year one won't have.
- **Cross-household moments** ("first house to 100") and **site-wide milestones** ("just passed 10,000 kids", as a toast or TV takeover). The first singles out a Household. Both need a cross-channel broadcast on top of the per-Household SSE channels, in the hot path during the freeze window.
- Already out before this ticket: a **public "tonight" map** (Fuzzy location ruled out any map on the night) and a **neighbourhood-average ghost** ([What becomes per-household](05-what-becomes-per-household.md)).

**Handed on**
- The sign-up page now shows live aggregate figures and a user-typed costume name (via the ≥ 3-Household rule and the blocklist) → [Privacy notice and retention](15-privacy-notice-and-retention.md) can mention it among what's public.
- The ranked list and cut line → [Assemble the v2 spec and build tickets](14-assemble-the-v2-spec.md).

Glossary: **Site-wide total** and **Estimated past event** added to [CONTEXT.md](../../../CONTEXT.md).
