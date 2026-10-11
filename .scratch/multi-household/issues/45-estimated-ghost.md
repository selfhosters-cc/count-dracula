# Estimated ghost from last year's total

Type: build (AFK)
Status: done
Blocked by: 18, 27

## What to build

A Household with no past night types in about how many kids came last year and gets a ghost to race. See [spec §14 item 1](../spec.md#14-extras-above-the-cut-line). About ½ day.

- **"About how many kids came last year?"**: optional, in checklist item 3 and in `/setup`. It's **offered only while the Household has no past Event of its own**, so Household #1 never sees it.
- Saving it creates (or updates) a **counts-only past event**, "Halloween 2025 (estimated)", through v1's `counts_only` + stored-buckets path. It's set as "Halloween 2026"'s **Race against**.
- **Shape:** our 2025 night's five half-hour buckets ([2025-counts.md](../../count-dracula/data/2025-counts.md), 17:42–20:00), normalised to fractions in code. **No 2025 counts are in the code or the data**, only fractions. Read at the same local times in the Household's zone. The rounding remainder goes to the biggest bucket, so the total is exact.
- **Labels:** "last year (estimated)" on the race chart, the pace and teaser lines, the recap verdict and the Night summary.
- The golden draw uses its total, like any Race against. Expected kids stays the fallback.
- **Change** reshapes it. **Clear** removes it and sets Race against back to None.
- Checklist item 3 ticks when either this or Expected kids is set, or skipped.
- **Switch:** an Operator-wide switch hides the field (an already-made estimated event keeps racing).

## Acceptance criteria

- [x] A total of 200 gives five buckets that sum to exactly 200, in the 2025 shape, at the Household's local times
- [x] It becomes Halloween 2026's Race against, and the TV shows the ghost with "last year (estimated)"
- [x] The golden range uses it
- [x] Clearing it sets Race against back to None and removes the event
- [x] A Household with its own past Event isn't offered the field
- [x] The switch hides the field
- [x] `bun test` passes

## Notes from the build

- **Ledger:** the Setup command `setLastYear({ total })` (1 to 100,000; `null` clears) makes or reshapes the counts-only "Halloween 2025 (estimated)" (`events.estimated`, migration step 11) and sets it as the coming night's Race against: the live non-Rehearsal night, or else the next to go live. Clearing deletes it, and anything racing it goes to None. `house.lastYear()` and `house.canEstimateLastYear()` (no frozen or counts-only night of its own other than Rehearsals and estimates, and the switch on) feed `/api/household`.
- **Shape:** `LAST_YEAR_SHAPE` holds the five 2025 half-hours as decimal fractions only (0.040462, 0.208092, 0.309249, 0.343931, 0.098266); 200 → 8, 41, 61, 71, 19 with the remainder on the biggest bucket. The buckets are local times, so they read in each Household's zone like any ghost.
- **Labels:** the ghost carries `estimated: true` and `label: 'last year (estimated)'`, so the chart legend, the recap verdict and the Night summary say so; the pace and teaser lines already say "last year". The chart's end label says just "last year: N" for an estimate, since the full label didn't fit.
- **Switch:** `switches.estimatedGhost` (default on) hides the field and refuses the command; a night already racing an estimate keeps it.
- **`/setup`:** the field is in checklist item 3 (it ticks the item) and in the event editor (Save / Clear), only when offered.
- Checked in the browser: a new Household typed 200 in the checklist, the item ticked, "Halloween 2026" raced it, and its TV showed "last year (estimated)" in the legend with 5 golden tickets drawn from the 200.
