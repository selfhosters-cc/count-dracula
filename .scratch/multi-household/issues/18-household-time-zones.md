# Household time zones in the night maths

Type: build (AFK)
Status: done
Blocked by: 17

## What to build

Every time of night is read in the **Household's** IANA zone, never the device's or the server's. See [spec §8](../spec.md#8-time-zones).

- `minuteOfDay`, `atEventTime` and `toBuckets` in `shared/night-maths.js` take a zone and convert with `Intl`. The rest of night maths follows. It's still the only place Clock shift is applied.
- The snapshot carries `timeZone`, and the TV and phones use it.
- Covers:
  - the ghost line and the chart's x-axis
  - the 7:45 pm Release remaining gate
  - the backfill rows and the tally sheet
  - the CSV export (`server/export.js`)
  - the peak half-hour, the recap and the rush meter
- `/setup` shows the zone read-only.
- The server's `TZ` stops mattering.

**Modules:** [Night maths](../../count-dracula/modules.md#3-night-maths-shared).

## Acceptance criteria

- [x] With the process in `TZ=UTC`, a Household in `America/Vancouver` gets its ghost, release gate, backfill rows, tally sheet and CSV half-hours at its own local times
- [x] A TV in another zone draws the Household's evening, not its own
- [x] A night that runs past the **Nov 1, 2026 DST change** buckets correctly
- [x] Clock shift still works on top of the zone
- [x] The v1 night-maths tests still pass with the zone passed in
- [x] `bun test` passes

## Notes from the build

- `shared/night-maths.js`: `minuteOfDay`, `toBuckets`, `atEventTime`, `releaseOpen` and `peakHalfHour` take the zone as their last argument; new `clockTime(ms, zone)` and `stamp(ms, zone)`. The zone's UTC offset is looked up with `Intl` once per quarter-hour and cached.
- `bun test` runs in UTC, so the v1 tests' `new Date(y, m, d, …)` times were always UTC. They now use explicit offsets in a zone that isn't the machine's (Vancouver PDT, Toronto EDT).
- Checked in the browser: a Household set to Asia/Tokyo shows Tokyo's clock, chart and backfill rows on a Toronto device. `/setup` shows the zone beside the join key.
- After-midnight taps still sort before the evening's in `toBuckets` (v1's minutes-of-day behaviour); not changed here.
