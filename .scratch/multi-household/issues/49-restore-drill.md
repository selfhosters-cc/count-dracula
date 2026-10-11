# Restore drill on the dev box

Type: task (HITL)
Status: ready-for-agent
Blocked by: 32

## What to build

Prove a pulled backup brings the site back, once, before Oct 31, **without touching production**. See [spec §18 Checked off production](../spec.md#18-launch-and-the-night-runbook).

1. Take the newest daily pull from the dev box (from `deploy/pull-backup.sh`). This also checks that the off-box pull works.
2. Start a local instance on it: stop, copy into place, start.
3. Check: the Household count, our Household's events and kid counts, and that a TV link from the copy shows its board.
4. Write down how long it took, and anything the RUNBOOK's "Database file damaged" steps got wrong. Fix the RUNBOOK.

## Acceptance criteria

- [ ] The pulled copy is at most a day old and opens
- [ ] The restored instance shows the same Households and counts as the copy's time
- [ ] The RUNBOOK's restore steps match what was done
