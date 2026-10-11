# Estimated ghost from last year's total

Type: build (AFK)
Status: ready-for-agent
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

- [ ] A total of 200 gives five buckets that sum to exactly 200, in the 2025 shape, at the Household's local times
- [ ] It becomes Halloween 2026's Race against, and the TV shows the ghost with "last year (estimated)"
- [ ] The golden range uses it
- [ ] Clearing it sets Race against back to None and removes the event
- [ ] A Household with its own past Event isn't offered the field
- [ ] The switch hides the field
- [ ] `bun test` passes
