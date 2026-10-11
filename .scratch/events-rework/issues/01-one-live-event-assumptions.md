# Where the code assumes one live Event or the Rehearsal flag

Type: research (AFK)
Status: resolved
Blocked by:

## Question

Every place in the code, tests, spec and runbook that assumes **exactly one live Event per Household**, a **Household-level join key or TV link that resolves to "the live Event"**, or the **`rehearsal` flag**, so the decisions after this one know what each choice costs.

- **Server:** `server/ledger.js` (Go live freezing the old event, `eventById()` defaulting to the live one, the minute tick, `liveNights()`, Reset the Rehearsal, delete), `server/app.js` routes and credential resolution, `server/hub.js` channels, `server/nearby.js`, `server/operator.js`, the summary and share code, `server/export.js`, `server/migrations.js`.
- **Browser:** `public/index.js` (door), `public/tv.js` + `tv-pairing.js`, `public/setup.js` + `first-run.js`, `public/summary.js`, `public/tally.js`, `public/operator.js`, `/?key=` handling.
- **Shared:** `shared/night-maths.js`, `shared/summary.js`.
- **Docs:** [v2 spec](../../multi-household/spec.md) sections that state the rule, [CONTEXT.md](../../../CONTEXT.md), `deploy/RUNBOOK.md`.

For each site: file:line, what it assumes, and a rough size of change if Events become independently live with their own credentials (S / M / L). Group by the impact areas in [the map](../map.md): TV, phones and join key, ghost, golden tickets, nearby, auto go-live/end, summaries, first-run, Operator, Household #1 migration. Findings in `../research/01-one-live-event-assumptions.md`.

## Answer

Almost everything goes through four seams. `eventById()` with no id means "the live Event" (15 Ledger call sites, every phone write, both read routes, about 160 test calls). Go live is the only thing that sets `frozen`, and summaries, recaps, the Past list and the estimate rules all key off it. A join key or TV token resolves to a Household, never an Event. There's one SSE channel and one `seq` per Household, and deltas carry no event id.
The Rehearsal flag is confined to: nearby and the site line, the Operator's status, the 3 am auto-end, the nudge, the checklist, Reset, sign-up's starters, and wording on the TV, phone and help pages.
Latent bugs once two are live: the tick's auto-end ends the first live row rather than the one it checked, nearby counts live Events as houses, and the Operator keeps only one live Event per Household.
[findings](../research/01-one-live-event-assumptions.md)
