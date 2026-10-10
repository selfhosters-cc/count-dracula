# Deploy to the LXC on both routes

Type: task (HITL)
Status: ready-for-agent
Blocked by: 15

## What to build

Get the walking skeleton running where it will run on the night, so **rehearsal blocker #2 ("both routes write")** is de-risked early. See [spec §3](../spec.md#3-architecture-and-hosting) and [§11 Data safety](../spec.md#11-failure-handling).

- A **new Proxmox LXC** from the debian-12 template, running the Bun process under systemd with `Restart=always`. The SQLite file lives inside the LXC.
- A **reserved/static LAN IP** for the LXC, since the helper QR code bakes it in.
- The Caddy route: `/opt/docker-compose/caddy-int/host.sh add count-dracula <LXC-IP>:<port>`, giving `https://count-dracula.example.com`.
- **Tailnet phones receive the join key automatically** on first open (for example, the HTTPS host hands it out). LAN phones still need the key from the QR code, which comes later in the ☰ door menu ticket.
- The existing scheduled **Proxmox backup job includes the new LXC**.
- **The LXC's timezone must be the household's** (e.g. `timedatectl set-timezone America/Toronto`, or `Environment=TZ=…` in the unit). Debian LXCs default to UTC, and the server buckets a 2026-style ghost (and later the CSV summary) by local time of day (added while building ticket 21).
- A repeatable deploy step (script or documented commands) for pushing new builds during the next two weeks.

Needs the homelab owner for Proxmox, Caddy and the backup job.

## Acceptance criteria

- [x] `systemctl` shows the service enabled, and killing the process brings it back within seconds *(back and answering in 1.5 s)*
- [x] A tailnet phone opens the HTTPS URL, gets the join key without scanning anything, and its taps count *(checked with curl via https://count-dracula.example.com; worth one real phone too)*
- [x] A phone that isn't on Tailscale opens `http://<LXC LAN IP>:<port>` and, once given the key, its taps count *(http://192.168.5.31:3131)*
- [x] The SSE stream stays open through Caddy for more than 2 minutes *(140 s, 9 pings)*
- [x] The LXC's IP is reserved and survives a reboot *(static in the LXC config, back on .31 after `pct reboot`; also reserve it on the router)*
- [ ] The Proxmox backup job lists the LXC *(the daily job does; the Tuesday job still needs 118 added)*
- [x] The deploy step is written down and has been used at least once *(deploy/README.md, deploy/deploy.sh)*
