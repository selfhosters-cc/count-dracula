# Deploy scripts, config and logs for v2

Type: build (AFK)
Status: done
Blocked by: 21, 32

## What to build

`deploy/` ships v2: no PIN, no tailnet, private settings from `local.env`, a DB copy before every deploy, 30-day logs and the Oct 31 freeze warning. See [spec §5](../spec.md#5-config-split), [§15](../spec.md#15-hosting-capacity-and-abuse) and [§16](../spec.md#16-privacy-and-retention).

**Config**

- `deploy/config.production.json` and `config/config.example.json` lose `adminPin`, `ghostSeed`, `lanUrl` and `autoJoinHosts`, and gain the new switches as later tickets add them.
- The **soundboard slots are stock or shout-text only**.
- The first deploy no longer makes or prints a PIN.
- On a server that already has a v1 `/etc/count-dracula/config.json`, the deploy removes the dead keys (a one-time edit; tell the user what changed).

**Private settings**

- `deploy.sh` writes the private keys from `deploy/local.env` into a root-owned **`/etc/count-dracula/env`** (mode 640, group `countdracula`). The service reads it with `EnvironmentFile=`. The keys are `PUBLIC_HOST`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OPERATOR_EMAILS`, `HOUSEHOLD1_MANAGER_EMAIL` and `OPERATOR_CONTACT`.
- A committed **`deploy/local.env.example`** lists them with `count-dracula.example.com` values. Remove `TAILNET_HOST`.

**Every deploy**

- **A timestamped copy of the SQLite file first** (`VACUUM INTO`, or a copy with the service stopped), before the swap.
- The health check uses an endpoint that needs no credential (e.g. `/healthz`), since `/api/snapshot` now refuses.
- **Freeze warning:** inside **Oct 31, 3 pm–midnight America/Toronto**, `deploy.sh` prints a loud warning and asks to continue. It never blocks.

**Service and logs**

- Remove `Environment=TZ=America/Toronto` from the unit; it no longer matters (keeping it is harmless).
- The backups directory exists and belongs to the service user.
- **journald on LXC 118: `MaxRetentionSec=30day`**, as a drop-in written by the deploy.

**`deploy/README.md`:** rewrite for one public host behind Cloudflare and the shared Caddy. No LAN URL, no tailnet name, no PIN. Never a real host name.

## Acceptance criteria

- [ ] A deploy to LXC 118 (only after [Open sign-up](38-open-sign-up.md) step 1, or to a scratch LXC) takes a DB copy, ships, and answers its health check
  - **Opening day ([ticket 38](38-open-sign-up.md) step 2).** Not run here: LXC 118 isn't deployed before Open sign-up. `copy-db.js` and `upgrade-config.js` were run locally on a copy of a v1 database and a v1-shaped config.
- [ ] `/etc/count-dracula/env` holds the six keys from `local.env`, mode 640, and nothing secret is in the repo
  - Nothing secret is in the repo (checked). The file itself is checked on opening day.
- [x] The freeze warning appears for a faked date inside the window, and not outside it
- [ ] `journalctl` on LXC 118 reports a 30-day retention
  - Opening day: the deploy installs the drop-in; check with `journalctl -u systemd-journald | grep -i retention` or `systemd-analyze cat-config systemd/journald.conf`.
- [x] `grep -r` finds no real host name, PIN or `TAILNET_HOST` in `deploy/` or `config/`
- [x] `bun test` passes

## Notes from the build

- `deploy.sh` now: checks the freeze (also for `--rollback`; `--check-freeze` just answers; `DEPLOY_NOW` fakes the time), refuses without all six keys in `deploy/local.env`, writes `/etc/count-dracula/env` from only those keys, copies the database with `deploy/copy-db.js` before the swap (14 days kept in `/var/lib/count-dracula/deploy-copies/`; no copy, no deploy), upgrades a v1 config once with `deploy/upgrade-config.js` and reports the change, installs `deploy/journald-count-dracula.conf`, and checks the new `GET /healthz`.
- The unit reads `EnvironmentFile=/etc/count-dracula/env` and drops `TZ`. The tarball no longer ships `config/2025-counts.json`.
- `create-lxc.sh` makes 2 cores / 1 GB; the README has the one-off `pct set 118 --cores 2 --memory 1024` for the existing LXC (an opening-day step for the runbook, ticket 37).
- **For the user:** your git-ignored `deploy/local.env` still has `TAILNET_HOST` and only `PUBLIC_HOST` of the six keys. `deploy/local.env.example` lists them all; ticket 20 fills in the Google ones.
