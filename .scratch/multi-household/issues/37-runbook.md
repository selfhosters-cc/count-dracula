# RUNBOOK.md and the opening-day checklist

Type: build (AFK)
Status: done
Blocked by: 31, 32, 34, 36

## What to build

`deploy/RUNBOOK.md`: everything the user does by hand, from opening day to Nov 1. It's written from [spec §18](../spec.md#18-launch-and-the-night-runbook), with real commands.

- **Opening-day checklist**, the 7 steps in order. Step 2 includes switching on the public host ([ticket 35](35-public-host-on-caddy.md)).
- **Load check:** how to start the scratch instance on LXC 118 on a spare port, run `deploy/loadtest.js`, read the result, and where the cap constants are.
- **Incident plan:** the table from §18, each row with its commands. "Database file damaged" ends with deleting every Household in `deletions` since the backup's time, with the query.
- **Access request:** the SQLite query that pulls one Manager's row, their Household and its Events.
- **Restore drill** (for [ticket 49](49-restore-drill.md)) and the **nearby ≥ 5 check** (for [ticket 42](42-nearby-seed.md)), both on the dev box.
- **Support:** the inbox routine up to Oct 31.
- **Household #1 before Oct 31**, **Oct 31** (the decided-in-advance moves) and **Nov 1**.
- No real host name and no IPs other than the ones already in `deploy/README.md`.

## Acceptance criteria

- [x] Every section above is there, with commands that work (each command dry-run where it's safe)
- [x] The `deletions` re-delete and access-request queries run against a test DB and return what they should
- [x] No real host name in the file

## Notes from the build

- `deploy/RUNBOOK.md`: the 7 opening-day steps with commands, the load check, the incident plan with commands per row, access requests, the restore drill and the nearby ≥ 5 check on the dev box, the support routine, Household #1 before Oct 31, Oct 31 and Nov 1. It uses `$PUBLIC_HOST` from `deploy/local.env` and a small `lxc` shell helper; the LXC's address comes from `deploy/local.env`.
- Two steps became scripts, with tests in `deploy/scripts.test.js`, shipped in the deploy tarball: `deploy/redelete.js` (re-delete Households after a restore, writing `deletions` again) and `deploy/access-request.js` (one email's Manager row, Household without its secrets, and Events with kid counts, phone names and costumes, as JSON).
- Deleting a Household now also logs `household deleted household=<id>`, so a restore can find the ids even when the damaged file won't open.
- Dry-run on the dev box against a copy of the local database: the step 1 practice migration, the breach rotation (tokens unpadded, like the app's), the deletions query, the restore-drill count query, and `access-request.js` for an unknown email.
- Step 4's Caddy log path, and step 2's site block, come from ticket 35.
