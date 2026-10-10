# Deploying Count Dracula

One Bun process in its own Proxmox LXC, under systemd (`Restart=always`), with the SQLite file inside the
LXC (spec §3, §11). Everything runs from the dev machine through `ssh proxmox` + `pct`; the LXC needs no
SSH keys of its own.

| | |
|---|---|
| LXC | **118** `count-dracula`, Debian 12, 1 core / 512 MB / 4 GB on `zstorage2`, starts on boot |
| LAN | **http://192.168.5.31:3131** (static; the helper QR code bakes it in) |
| Tailnet | **https://count-dracula.example.com** via Caddy (LXC 117) |
| App | `/opt/count-dracula` (previous build kept in `/opt/count-dracula.prev`) |
| Config | `/etc/count-dracula/config.json` (admin PIN, switches, soundboard; never overwritten by a deploy) |
| Data | `/var/lib/count-dracula/count-dracula.sqlite` (WAL) |
| Logs | `ssh proxmox pct exec 118 -- journalctl -u count-dracula -f` |
| Time zone | America/Toronto (LXC and service): ghosts and the CSV summary bucket by local time |

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

The first deploy writes `/etc/count-dracula/config.json` from `deploy/config.production.json` with a
random 4-digit admin PIN and prints it. Later deploys leave the config and the database alone. Bun is
copied from the dev machine, so the LXC runs the version the tests ran with.

Tailnet phones that open the HTTPS address get the join key automatically (`/api/join`, only on the
`autoJoinHosts` name). LAN phones join by scanning "Add a helper" in the ☰ menu.
