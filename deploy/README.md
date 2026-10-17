# Deploying Count Dracula

One Bun process in its own Proxmox LXC, under systemd (`Restart=always`), with the SQLite file inside the
LXC. It's public at one HTTPS host behind Cloudflare and the shared Caddy (v2 spec §15). Everything runs from
the dev machine through `ssh proxmox` + `pct`; the LXC needs no SSH keys of its own.

| | |
|---|---|
| LXC | **118** `count-dracula`, Debian 12, 2 cores / 1 GB / 4 GB on `zstorage2`, starts on boot |
| Public | **https://`$PUBLIC_HOST`** (in `deploy/local.env`; the repo says `count-dracula.example.com`) → Cloudflare → shared Caddy (LXC 117, `$CADDY_IP`) → the LXC at `$LXC_IP:3131` |
| App | `/opt/count-dracula` (previous build kept in `/opt/count-dracula.prev`) |
| Config | `/etc/count-dracula/config.json` (switches, soundboard, backup directory; never overwritten by a deploy) |
| Private settings | `/etc/count-dracula/env` (mode 640), written by every deploy from `deploy/local.env` |
| Data | `/var/lib/count-dracula/count-dracula.sqlite` (WAL), `backups/` (every 15 min), `deploy-copies/` (one per deploy, 14 days) |
| Logs | `ssh proxmox pct exec 118 -- journalctl -u count-dracula -f` (journald keeps 30 days) |

There's no LAN address and no tailnet name any more: phones, TVs and Setup all use the public host. If the
home internet drops, every TV freezes and phones keep their taps until it's back.

## Once: the private settings

Never commit a real host name or secret. Copy the example and fill it in (git-ignored):

```bash
cp deploy/local.env.example deploy/local.env
```

It needs `PUBLIC_HOST`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (v2 ticket 20), `OPERATOR_EMAILS` and
`OPERATOR_CONTACT`. `deploy.sh` refuses without all five. `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and
`EMAIL_FROM` are optional: Continue with email (sign-in links through a mail service over TLS with a login, or a LAN
relay with neither) stays hidden until `SMTP_HOST`, `EMAIL_FROM` and `PUBLIC_HOST` are set. `deploy.sh` sends only these keys to the server: any other line in `local.env` stays on the dev machine.

## Once: create the LXC

```bash
deploy/create-lxc.sh          # VMID=118, at LXC_IP / LXC_GATEWAY from deploy/local.env
```

It refuses if the VMID exists or the IP answers ping, creates and starts the LXC (2 cores, 1 GB), adds the
`countdracula` system user, and adds the LXC to every scheduled Proxmox backup job that lists guests.
Reserve `LXC_IP` on the router (or keep it outside the DHCP range).

An LXC made before v2 has 1 core / 512 MB. Raise it once:

```bash
ssh proxmox pct set 118 --cores 2 --memory 1024
```

The public host on the shared Caddy, with its own masked access log, is v2 ticket 35: `deploy/caddy-add-site.sh`
puts `deploy/caddy-site.caddy` in as its own site, before the wildcard it falls under or at the end for a domain
of its own. Each name in `REDIRECT_HOSTS` (www, a host the site moved from) gets a site that 301s to
`PUBLIC_HOST` with the path and query kept, and no access log.

## Moving to a new host name

Phones keep their join key in the browser and sign-ins are cookies, both per host: after a move every helper phone
joins again and everyone signs in again. Paired TVs follow the redirect (their token is in the URL). Avoid it close
to Oct 31. In order:

1. Cloudflare: the new name's DNS record (proxied), SSL/TLS **Full (strict)**, and the zone added to the DNS-edit
   token the shared Caddy uses for its certificates.
2. Google Cloud console: add `https://<new host>/auth/google/callback` to the client's redirect URIs.
3. `deploy/local.env`: the new `PUBLIC_HOST` (and `EMAIL_FROM`); `REDIRECT_HOSTS` with only www for now.
   `deploy/caddy-add-site.sh`, then check the new host from outside the LAN.
4. `deploy/deploy.sh`: every new link (invites, share links, sign-in) now uses the new name.
5. Add the old host to `REDIRECT_HOSTS` and run `deploy/caddy-add-site.sh` again.

## Every time: deploy

```bash
deploy/deploy.sh                # tests, pack, push, copy the database, swap, restart, health check
deploy/deploy.sh --rollback     # put the previous build back
deploy/deploy.sh --check-freeze # is it the Oct 31 change freeze right now?
```

Each deploy:

- refuses if a key is missing from `deploy/local.env`, or if the tests fail
- takes a timestamped `VACUUM INTO` copy of the database into `/var/lib/count-dracula/deploy-copies/` first, and
  stops if it can't
- writes `/etc/count-dracula/env` (the five private keys, mode 640, group `countdracula`)
- writes `/etc/count-dracula/config.json` from `deploy/config.production.json` on the first deploy only; on a
  v1 server it removes the dead keys once (`adminPin`, `ghostSeed`, `lanUrl`, `autoJoinHosts`), adds
  `backupDir`, and says what it changed
- installs the journald drop-in that keeps logs 30 days
- checks `/healthz`, which needs no credential

**Change freeze:** Oct 31, 3 pm to midnight (Toronto). Inside it, `deploy.sh` and `--rollback` print a loud
warning and ask before going on: a deploy drops every TV and phone stream on the site. Only deploy then if
the site is down.

Bun is copied from the dev machine, so the LXC runs the version the tests ran with.

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
