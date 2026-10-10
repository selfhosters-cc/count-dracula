# Ghost race (Must #2)

Type: build (AFK)
Status: ready-for-agent
Blocked by: 20

## What to build

Tonight's count races last year's ghost on the TV. See [spec §2 Ghost line / Clock shift](../spec.md#2-domain-model) and [§7 Layout](../spec.md#7-tv-screen).

- **The race chart** fills the right two-thirds, using vendored **Chart.js**: the ghost is a dashed pale line labelled "2025: 346", tonight is a thick pumpkin-orange line plotted by `tapped_at`, there's a 👻 marker at the ghost's value for now, and an orange dot labelled with tonight's count. The y-axis scales in hundreds (minimum 400) and the x-axis runs 5:30–8:30pm event time. Style it with the `dataviz` skill.
- **Ghost line:** the **Race against** event's cumulative count by time of day, interpolated linearly within each bucket and flat after its last bucket. Counts-only events use their stored buckets. Events from 2026 on produce a ghost from their own (non-deleted) taps.
- **Race against** can be None: no ghost line and no pace line. Pick something sensible for the hero (see [§16](../spec.md#16-builders-latitude)). The seeded "Rehearsal" event races the 2025 counts by default. The Setup ticket adds the UI to change it.
- **Clock shift** (per event, default 0) moves "now" for the ghost position and the x-axis. Timestamps stay stored in real time; the shift is applied only on display and comparison.
- **Pace line** under the hero count: "👻 4 ahead of last year's ghost" / "behind", becoming "🏆 New record!" once tonight passes the ghost's total.
- Undo, delete and late taps update the chart quietly, in the same pass as the count.

**Modules:** [Night maths](../modules.md#3-night-maths-shared).

## Acceptance criteria

- [ ] The ghost line matches the 2025 buckets (for example 86 at 6:00, 193 at 7:00, flat at 346 after 8:00)
- [ ] With Clock shift +3h at 3pm real time, the 👻 marker and x-axis behave as if it's 6pm
- [ ] The pace line reads right ahead of, behind and past the ghost total
- [ ] Race against None hides the ghost and pace line without errors
- [ ] A past 2026-style event used as Race against produces a ghost from its taps
- [ ] Chart.js is vendored, and the chart redraws smoothly during a 5-kid burst
- [ ] Ghost interpolation and the clock-shift maths are unit-tested
