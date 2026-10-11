# Deploying Count Dracula

One Bun process in its own Proxmox LXC, under systemd (`Restart=always`), with the SQLite file inside the
LXC (spec §3, §11). Everything runs from the dev machine through `ssh proxmox` + `pct`; the LXC needs no
SSH keys of its own.

| | |
|---|---|
| LXC | **118** `count-dracula`, Debian 12, 1 core / 512 MB / 4 GB on `zstorage2`, starts on boot |
| LAN | **http://192.168.5.31:3131** (static; the helper QR code bakes it in) |
| Tailnet | **https://`$TAILNET_HOST`** via Caddy (LXC 117); set in `deploy/local.env` |
| App | `/opt/count-dracula` (previous build kept in `/opt/count-dracula.prev`) |
| Config | `/etc/count-dracula/config.json` (switches, soundboard; never overwritten by a deploy) |
| Data | `/var/lib/count-dracula/count-dracula.sqlite` (WAL) |
| Logs | `ssh proxmox pct exec 118 -- journalctl -u count-dracula -f` |
| Time zone | America/Toronto (LXC and service): ghosts and the CSV summary bucket by local time |

## Once: the tailnet hostname

The hostname stays out of the repo. Put it in `deploy/local.env` (git-ignored):

```bash
TAILNET_HOST=count-dracula.example.com   # your own *.int name
```

`deploy.sh` prints it, and the first deploy writes it into the config's `autoJoinHosts`. Without it, the
deploy still works, but phones only join with the QR code.

## Once: create the LXC

```bash
deploy/create-lxc.sh          # VMID=118 IP=192.168.5.31 by default; override with env vars
```

It refuses if the VMID exists or the IP answers ping, creates and starts the LXC, adds the
`countdracula` system user, and adds the LXC to every scheduled Proxmox backup job that lists guests.

Then make it reachable over the tailnet (the `caddy-int` tooling):

```bash
/opt/docker-compose/caddy-int/host.sh add count-dracula 192.168.5.31:3131
```

Reserve 192.168.5.31 on the router (or keep it outside the DHCP range).

## Every time: deploy

```bash
deploy/deploy.sh              # tests, pack, push, swap, restart, health check
deploy/deploy.sh --rollback   # put the previous build back
```

The first deploy writes `/etc/count-dracula/config.json` from `deploy/config.production.json`. Later deploys leave the config and the database alone. Bun is
copied from the dev machine, so the LXC runs the version the tests ran with.

Tailnet phones that open the HTTPS address get the join key automatically (`/api/join`, only on the
`autoJoinHosts` name). LAN phones join by scanning "Add a helper" in the ☰ menu.

## Backups

The server copies its database with `VACUUM INTO` every 15 minutes into `/var/lib/count-dracula/backups/`
(`backupDir` in the config), keeping the last 8 copies plus the newest of each of the last 14 days. `/operator`
shows the age of the last copy.

Off the box, once a day, the dev machine pulls the newest copy into `~/count-dracula-backups/` (or
`BACKUP_PULL_DIR`) and keeps 14 days of pulls:

```bash
deploy/pull-backup.sh             # pull now
deploy/pull-backup.sh --dry-run   # show what it would do
```

The crontab line (`crontab -e` on the dev machine; 4:30 am, after the night's last copies):

```
30 4 * * * cd /code/count-dracula && deploy/pull-backup.sh >> ~/count-dracula-backups/pull.log 2>&1
```

The Proxmox vzdump job on LXC 118 stays as a second layer.
