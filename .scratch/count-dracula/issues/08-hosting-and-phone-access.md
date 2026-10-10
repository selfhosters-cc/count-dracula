# Hosting and phone access

Type: grilling (HITL)
Status: resolved
Blocked by: 02

## Question

Where does the server run and how do phones reach it? Decide: homelab LXC vs the laptop itself, LAN-only vs Tailscale / Caddy `*.int.home.example.com`, and how a helper's phone joins (a QR code on the TV? a shared link? any lightweight secret so a passing teen can't spam taps).

Also decide **plain HTTP vs HTTPS**. Plain LAN HTTP loses `crypto.randomUUID`, service workers and Background Sync, which the stack works around. HTTPS via Caddy `*.int` would restore them (see [Live-update stack](02-live-update-stack.md)).

## Answer

- **Server:** a new Proxmox LXC (Debian, debian-12 template) running one Bun process under systemd, with the SQLite file inside the LXC. The laptop is display-only, so a display-side crash loses nothing.
- **Two ways in, one server, identical app behaviour:**
  - **Tailnet devices:** `https://count-dracula.example.com`, proxied by Caddy (LXC 117) and added with `/opt/docker-compose/caddy-int/host.sh add count-dracula <LXC-IP>:<port>`. `*.int` names resolve to Caddy's Tailscale IP, so this route needs Tailscale on the device.
  - **Helpers on home Wi-Fi without Tailscale:** plain `http://<LXC LAN IP>:<port>`. The live-update stack already works around what plain HTTP lacks (`getRandomValues` IDs, no service worker, no Background Sync).
  - The user chose this over tailnet-only (helpers' phones) and over a local-DNS override (no change to the network).
- **TV laptop:** uses the HTTPS URL if Tailscale is installed (which also lets the browser's Wake Lock work), otherwise the LAN URL. The OS keep-awake from Laptop kiosk setup applies either way.
- **Joining:** "Add a helper" in the phone's secondary menu shows a QR code with the LAN URL plus the event's **join key**. **Never put a QR code on the porch-facing TV**, because every trick-or-treater could scan it. Tailnet phones receive the key automatically on first open.
- **Join key:** random per event. The server requires it on every write (taps, undo, tags, soundboard, settings). Reading, including the TV page, needs no key. The key can be changed, which cuts off phones that joined with the old one.
- **Phone name:** asked on first open ("Who's tapping?": Dad / Mom / Grandma / custom), stored on the phone, sent with every tap and shown in the Recent list ("#57 🧙 · Grandma · 6:42").
- **Rehearsal checks:** Wi-Fi strength at the front door for each tapping phone, and both routes tested end to end (one tailnet phone, one LAN-only helper).
