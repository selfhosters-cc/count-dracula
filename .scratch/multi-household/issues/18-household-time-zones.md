# Household time zones in the night maths

Type: build (AFK)
Status: ready-for-agent
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

- [ ] With the process in `TZ=UTC`, a Household in `America/Vancouver` gets its ghost, release gate, backfill rows, tally sheet and CSV half-hours at its own local times
- [ ] A TV in another zone draws the Household's evening, not its own
- [ ] A night that runs past the **Nov 1, 2026 DST change** buckets correctly
- [ ] Clock shift still works on top of the zone
- [ ] The v1 night-maths tests still pass with the zone passed in
- [ ] `bun test` passes
