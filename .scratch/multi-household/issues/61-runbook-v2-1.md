# RUNBOOK for v2.1

Type: build (AFK)
Status: done
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

- [x] The RUNBOOK's opening line is the redone one, with each step checkable
- [x] No step mentions the Rehearsal, `HOUSEHOLD1_MANAGER_EMAIL`, `/signup` or creating Halloween 2026 by hand
- [x] The Nov 1 checks match v2.1 §10's Operator statuses

## Notes from the build

- **Section 1, the opening line redone** (what ticket 62 follows), each step with commands and a **Check:**
  1. **Copy the v2 database:** `deploy/copy-db.js` pushed in on stdin (as `deploy/v1-final.sh` does), a `VACUUM INTO` copy into `/var/lib/count-dracula/v2-final/`, pulled to `~/count-dracula-backups/v2-final-<stamp>.sqlite`, then a read-only query of its Events and kid counts. **Named `v2-final-*`, not `count-dracula-*`:** `deploy/pull-backup.sh` prunes `count-dracula-*.sqlite` older than 14 days in that directory. The `cp`-of-a-WAL gotcha from opening day is kept in the text.
  2. **Fresh database:** stop, move `count-dracula.sqlite` and any `-wal` / `-shm` into `/var/lib/count-dracula/v2-aside/` (`mkdir` refuses a second run), `deploy/deploy.sh` (checks: "no database yet (first deploy)", then `user_version` 15 and 0 Households). Sign up at `/` with the main account (the consent screen in Testing is the gate; Pause sign-ups starts off), first-run with the OSM network check done on its Location screen, pair the TV ("✓ Your TV is showing *Test night*"), read the Household's id and zone, run `deploy/import-past-counts.js … 1` from `/opt/count-dracula`, set Race against by hand, then the checks: Test night Live on the door, Halloween 2026 Upcoming at Oct 31 4:00 pm racing "Halloween 2025 (counts)", `curl`'s `302 …/door?key=…` for `/?key=`, our helper phones' "link no longer works" and joining again, `/operator`'s switch reading **Pause sign-ups**. An undo for step 2 (swap the databases back, then `--rollback`; never the build alone).
  3. **Load check again,** with the Oct 11 LXC 118 figures added to section 2 for comparison.
  4. **Privacy, only the new parts:** a `curl` of `/door?key=runbook-secret-1`, then the Caddy log shows `/door?key=REDACTED` and 0 hits for the secret; OSM is step 2's. The Oct 11 parts stand as done.
  - Steps 5–7 through `/`: the test Household's live Test night and Halloween 2026, first-run and the checklist (item 2 ticked by Count on this device), Goes live at 10 minutes ahead with the TV and phone following, both nights ended at 3 am with the auto-end note, both Past after noon (the Test night's summary, since it holds the kid), then Delete. Step 7 checks the switch rather than pressing it, since a fresh database starts open.
- **Section 7, Household #1 before Oct 31:** nothing to create. Check Halloween 2026's Race against and costumes; test the porch on the Test night while it's Live, or on a made night (Go live, then End and Close now, Reset or Delete), keeping under the 3-Live cap; print Halloween 2026's tally sheet.
- **Sections 8 and 9:** Oct 31 gains a before-3-pm look at our `/setup` and the cap's "waiting" note as decided-in-advance (nothing to do). Nov 1: every Live Event ends at 3 am; the morning check is "no Counting, Stale or Waiting rows" (only Ended and No night); after noon everything is Past (only No night). The freeze line is unchanged.
- **Section 5, nearby:** the check is now 2 houses in one Area (`seed-nearby.js … 2`) first, then the 6-house one. Ticket 63's edge and corner check is written as a pointer to that ticket's seed options, since they don't exist yet, with `nearbyEdges` off as the fallback.
- **Gone:** every "Rehearsal", `HOUSEHOLD1_MANAGER_EMAIL` (step 2 only says to delete any key the example no longer lists, so no step names it), creating Halloween 2026 by hand, and `/signup`. `git grep HOUSEHOLD1_MANAGER_EMAIL` outside `.scratch/` is now empty.
- **Judgment calls (conservative):**
  - **Add missed kids on Nov 1 is "before noon"**: at noon an Ended night goes Past, and a Past night refuses a backfill (ticket 50's `openNight`). The old runbook had no deadline.
  - Item 3 of our checklist: Expected kids or Skip, never "Race it" (the decision says leave the estimate empty).
  - The import is run as root with the service up (WAL, `busy_timeout`), followed by a `chown countdracula:` of the database files, the way the restore steps do it, in case root made one.
  - The "chart says 2025" check reads the Race against setting and the label rule (the year in the name). Halloween 2026 isn't Live before Oct 31, and pointing the Test night at it to see the label is optional in the decision, so it isn't a step.
- Dry-run on the dev box against a scratch database: the copy query, the `user_version` / Households query, the import and its refusal, the move-aside loop (and its `mkdir` refusal) and the copy's name. Nothing was run against LXC 118. `bun test`: 652 pass.
