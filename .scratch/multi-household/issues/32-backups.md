# VACUUM INTO backups and the off-box pull

Type: build (AFK)
Status: ready-for-agent
Blocked by: 17

## What to build

The database copies itself every 15 minutes, and the dev box pulls one copy a day. See [spec §15 Backups](../spec.md#15-hosting-capacity-and-abuse) and [§16](../spec.md#16-privacy-and-retention).

- **`VACUUM INTO`** every **15 minutes**, on a timer in the Bun process, into `/var/lib/count-dracula/backups/` (a directory from config; a temp dir in tests). Files are timestamped.
- **Retention:** the last 8 copies plus one per day for **14 days**. The same timer deletes older ones.
- The time of the last good copy is exposed for `/operator`'s Backup tile ([ticket 40](40-operator-dashboard.md)).
- **`deploy/pull-backup.sh`** for the dev box:
  - pulls the newest copy with `ssh proxmox pct pull`
  - keeps **14 days** of pulls, deleting older ones
  - the crontab line goes in the deploy README

  Installing the cron is a step for the user (ask first).
- The `deletions` table's 2-month prune can run on the same timer.

## Acceptance criteria

- [ ] With a fake clock, a copy appears every 15 minutes and opens as a valid database with the same counts
- [ ] Retention keeps exactly the last 8 plus one per day for 14 days
- [ ] The last-copy time is readable for `/operator`
- [ ] `deploy/pull-backup.sh` pulls the newest copy and prunes pulls older than 14 days (checked against LXC 118 or a dry run)
- [ ] The README has the crontab line
- [ ] `bun test` passes
