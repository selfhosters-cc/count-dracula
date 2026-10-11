# RUNBOOK for v2.1

Type: build (AFK)
Status: ready-for-agent
Blocked by: 58, 59, 60

## What to build

Bring `deploy/RUNBOOK.md` up to v2.1. See [v2.1 §12](../spec-v2.1.md#12-household-1-and-the-opening-line) and [§13](../spec-v2.1.md#13-build-order-and-the-opening-line).

- **The opening line, redone:**
  1. copy the v2 database
  2. deploy on a fresh database, sign up Household #1 at `/`, first-run and pair, run `deploy/import-past-counts.js`, and set Halloween 2026's Race against; check the Test night is live, Halloween 2026 goes live Oct 31 at 4 pm racing "2025", and `/?key=` lands on `/door`
  3. the load check again
  4. the new privacy checks (`/door?key=` masked; OSM tiles only after the tap)
  - then steps 5–7 through `/`, with the test Household's new check (a live Test night and Halloween 2026, first-run and the checklist, Goes live at 10 minutes ahead, the 3 am end and noon Past, then Delete)
- **Household #1 before Oct 31:** check Halloween 2026's Race against and costumes, test on our Test night, the v1 hardware checks, and print the tally sheet.
- **Oct 31 / Nov 1:**
  - every Live Event auto-ends at 3 am; the Nov 1 check is "no Counting, Stale or Waiting rows on `/operator`"
  - Ended Events go Past at noon
  - the freeze is unchanged
- **The dev-box nearby check:** 2 houses in one Area show "near you"; after [ticket 63](63-nearby-across-edges.md), also 2 houses either side of an edge and at a corner.
- Every "Rehearsal" in the RUNBOOK goes.

## Acceptance criteria

- [ ] The RUNBOOK's opening line is the redone one, with each step checkable
- [ ] No step mentions the Rehearsal, `HOUSEHOLD1_MANAGER_EMAIL`, `/signup` or creating Halloween 2026 by hand
- [ ] The Nov 1 checks match v2.1 §10's Operator statuses
