# Deploy scripts, config and logs for v2

Type: build (AFK)
Status: ready-for-agent
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
- [ ] `/etc/count-dracula/env` holds the six keys from `local.env`, mode 640, and nothing secret is in the repo
- [ ] The freeze warning appears for a faked date inside the window, and not outside it
- [ ] `journalctl` on LXC 118 reports a 30-day retention
- [ ] `grep -r` finds no real host name, PIN or `TAILNET_HOST` in `deploy/` or `config/`
- [ ] `bun test` passes
