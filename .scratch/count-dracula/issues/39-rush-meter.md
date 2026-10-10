# Rush meter

Type: build (AFK)
Status: done
Blocked by: 20

## What to build

The spec's first nice-to-have ([§12](../spec.md#12-build-order-cut-line-and-feature-switches)), picked by the user on 2026-10-10 (pace prediction and signature costume sounds were not). The spec only names it, so these are the builder's choices:

- **The rate:** kids per minute over the last **5 minutes**, by tap time (the same clock as the race chart).
- **Three levels:** **Quiet** under 1/min, **Busy** from 1/min, **RUSH!** from 3/min. For scale, 2025's busiest half-hour averaged ~4/min.
- **On the TV:** a small gauge under the hero's pace line, filling up to 6/min, coloured by level. Hidden on the recap.
- **Its own feature switch** (`rushMeter`, default on), so it can be cut after the rehearsal like the Musts.

**Modules:** [Night maths](../modules.md#3-night-maths-shared).

## Acceptance criteria

- [x] The rate and level are unit-tested at the level boundaries
- [x] A burst moves the gauge to RUSH! and it falls back as the 5-minute window empties *(Quiet → Busy 1.2 → RUSH! 3.6 in the browser; the fall-back is the unit-tested window plus the TV's 5-s redraw)*
- [x] With the switch off, the gauge is hidden
