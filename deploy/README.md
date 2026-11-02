# Deploying Count Dracula

Production is one container on the Docker Host `count-dracula`, a Komodo Stack. Its image is the private
`count-dracula-hosted`: this repo's image with the Showcase added. It's public at one HTTPS host behind
Cloudflare and the shared Caddy (v2 spec §15). The infrastructure repo declares all of it: the Host, the Stack
(`stacks/count-dracula/count-dracula/`), both image Builds, the Caddy site and the monitors. The night-of
commands are in the [RUNBOOK](RUNBOOK.md).

| | |
|---|---|
| Host | `count-dracula`, reached from the dev machine with `ssh count-dracula` and `sudo docker` |
| Public | **https://`$PUBLIC_HOST`** (in `deploy/local.env`; the repo says `count-dracula.example.com`) → Cloudflare → shared Caddy → the Host's 3131, which answers only Caddy: the app trusts the visitor address Caddy sends |
| Container | `count-dracula-count-dracula-1`, image `count-dracula-hosted:<version>` from the homelab registry, `FROM count-dracula:<core version>` |
| Config | `/data/config.json` (switches, soundboard, backup directory), written on the first start only |
| Private settings | the Stack's `secrets.sops.env` in the infrastructure repo (`COUNT_DRACULA_*`); the rest of the env is in its `compose.yaml` |
| Data | `/data` is `/srv/count-dracula` on the Host: `count-dracula.sqlite` (WAL), `backups/` (every 15 min), `showcase/` (the tiles) |
| Logs | `ssh count-dracula "sudo journalctl -t count-dracula -f"`: the Host's journal, across redeploys, kept 30 days as `/privacy` says |

There's no LAN address and no tailnet name: phones, TVs and Setup all use the public host. If the home internet
drops, every TV freezes and phones keep their taps until it's back.

`deploy/local.env` (git-ignored; `deploy/local.env.example` lists the keys) still holds `PUBLIC_HOST` and
`CADDY_IP` for the runbook's commands. Its other keys were `deploy.sh`'s and no longer reach production.

## Every time: release

Two images, in order: the core's, then the hosted one on top of it.

1. **The core.** On `main` with everything committed, `bun test` (nothing else runs the tests: the image build
   doesn't). Then the version, its tag and the push:

   ```bash
   version=$(bun deploy/bump-version.js package.json)
   git commit -qm "v$version" package.json && git tag "v$version" && git push -q origin HEAD "v$version"
   ```

2. **Its image.** In the infrastructure repo, `just release count-dracula <version>`. It builds the image and
   commits its version. Nothing deploys: no Stack runs the core image.
3. **The hosted image**, with `CORE` moved to the new version: the hosted repo's `RUNBOOK.md`, §5. Its
   `just release count-dracula-hosted` builds it and deploys the Stack.

A release with a migration takes a copy of the database first (in the RUNBOOK's shell):
`app "bun deploy/copy-db.js /data/config.json /data/deploy-copies"`. Migrations only add, so the previous image
runs on the newer database: the RUNBOOK's **Bad release** puts it back.

**Change freeze:** Oct 31, 3 pm to midnight (Toronto). No release of either image and no Stack deploy then: each
drops every TV and phone stream on the site. Only release then if the site is down. Nothing checks for it.

## Moving to a new host name

Phones keep their join key in the browser and sign-ins are cookies, both per host: after a move every helper phone
joins again and everyone signs in again. Paired TVs follow the redirect (their token is in the URL). Avoid it close
to Oct 31. In order:

1. Cloudflare: the new name's DNS record (proxied), SSL/TLS **Full (strict)**, and the zone added to the DNS-edit
   token the shared Caddy uses for its certificates.
2. Google Cloud console: add `https://<new host>/auth/google/callback` to the client's redirect URIs.
3. The infrastructure repo: the new name in the Caddy site file (`roles/caddy/files/sites/`), and `just caddy`.
   Check the new host from outside the LAN.
4. `PUBLIC_HOST` (and `EMAIL_FROM`) in the Stack, then deploy it: every new link (invites, share links, sign-in) now
   uses the new name.
5. The old host into the `count-dracula-redirects` service's `public:` (`inventory/host_vars/count-dracula/`), and
   `just caddy`. Each name there 301s to the public host.

## Backups

The server copies its database with `VACUUM INTO` every 15 minutes into `/data/backups/` (`backupDir` in the
config), keeping the last 8 copies plus the newest of each of the last 14 days. `/operator` shows the age of the
last copy.

Off the Host, the nightly Proxmox backup of `count-dracula` holds all of `/data`. The infrastructure repo's
`docs/runbooks/count-dracula.md` has its restore drill.

`create-lxc.sh`, `deploy.sh`, `pack.sh`, `caddy-add-site.sh` and `pull-backup.sh` are the LXC's, from before
Nov 1, 2026. They don't reach the container.
