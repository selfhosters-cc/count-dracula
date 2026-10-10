# Hosting and phone access

Type: grilling (HITL)
Status: open
Blocked by: 02

## Question

Where does the server run and how do phones reach it? Decide: homelab LXC vs the laptop itself, LAN-only vs Tailscale / Caddy `*.int.home.example.com`, and how a helper's phone joins (a QR code on the TV? a shared link? any lightweight secret so a passing teen can't spam taps).

Also decide **plain HTTP vs HTTPS**. Plain LAN HTTP loses `crypto.randomUUID`, service workers and Background Sync, which the stack works around. HTTPS via Caddy `*.int` would restore them (see [Live-update stack](02-live-update-stack.md)).
