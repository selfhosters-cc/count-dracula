# VACUUM INTO backups and the off-box pull

Type: build (AFK)
Status: done
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

- [x] With a fake clock, a copy appears every 15 minutes and opens as a valid database with the same counts
- [x] Retention keeps exactly the last 8 plus one per day for 14 days
- [x] The last-copy time is readable for `/operator`
- [x] `deploy/pull-backup.sh` pulls the newest copy and prunes pulls older than 14 days (checked against LXC 118 or a dry run)
  - Checked with stand-in `ssh`/`scp` on the dev box (a 20-day-old pull deleted, a 13-day-old one kept), not against LXC 118: there are no v2 backups there until v2 is deployed.
- [x] The README has the crontab line
- [x] `bun test` passes

## Notes from the build

- `server/backups.js`: `createBackups({ db, dir, now })` → `run()` (one copy now, then prune), `lastAt()` (for `/operator`, ticket 40: `app.backups?.lastAt()`), `start()` (every 15 minutes, then the deletions prune). Files are `count-dracula-YYYYMMDD-HHMMSS.sqlite` in UTC; "per day" is per UTC day.
- The server only backs up when `backupDir` is in the config. It's set in `deploy/config.production.json`; dev and tests have none.
- The deletions log's 2-month prune moved to `accounts.pruneDeletions()`, run on every deletion and every backup tick.
- **For the user:** installing the cron on the dev box (the line is in `deploy/README.md`) is yours to do, once v2 is deployed and making copies.
- Noticed for ticket 34: `deploy.sh`'s health check reads `/api/snapshot` without a credential, which v2 refuses (403); it needs another check.
