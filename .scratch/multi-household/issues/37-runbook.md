# RUNBOOK.md and the opening-day checklist

Type: build (AFK)
Status: ready-for-agent
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

- [ ] Every section above is there, with commands that work (each command dry-run where it's safe)
- [ ] The `deletions` re-delete and access-request queries run against a test DB and return what they should
- [ ] No real host name in the file
