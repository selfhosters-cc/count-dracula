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
- A repeatable deploy step (script or documented commands) for pushing new builds during the next two weeks.

Needs the homelab owner for Proxmox, Caddy and the backup job.

## Acceptance criteria

- [ ] `systemctl` shows the service enabled, and killing the process brings it back within seconds
- [ ] A tailnet phone opens the HTTPS URL, gets the join key without scanning anything, and its taps count
- [ ] A phone that isn't on Tailscale opens `http://<LXC LAN IP>:<port>` and, once given the key, its taps count
- [ ] The SSE stream stays open through Caddy for more than 2 minutes
- [ ] The LXC's IP is reserved and survives a reboot
- [ ] The Proxmox backup job lists the LXC
- [ ] The deploy step is written down and has been used at least once
