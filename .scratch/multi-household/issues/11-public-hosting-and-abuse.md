# Public hosting and abuse

Type: grilling (HITL)
Status: resolved
Blocked by: 03, 04, 06

## Question

How does the app run on the open internet without one bad actor ruining a porch TV or the site?

- **Hosting**: the same Proxmox LXC behind Caddy on a public hostname (the real name only in `deploy/local.env`), or elsewhere. Do LAN phones keep a LAN route on the night if the internet drops? (Dogfooding means our porch now depends on our upstream link.)
- **Capacity**: the ceiling on SSE viewers per household and site-wide, from [Public exposure: abuse protection and live-connection capacity](03-public-exposure-limits.md).
- **Bot sign-ups and rate limits**: which protections, from the same research. Sign-in is Google-only ([Household identity and sign-up](04-household-identity-and-sign-up.md)), which recommends no Turnstile, just a per-IP limit on creating Households. Also: moderating Household display names (≤ 40 chars, shown on shared screens).
- **User text on shared screens**: household names and live-created costume names show on public TVs, nearby and summaries. A word filter, a review step, an operator "hide", or accept the risk?
- **Backups and incident plan** for a database that now holds other people's nights.
- **Given** ([What becomes per-household](05-what-becomes-per-household.md)): tailnet auto-join (`autoJoinHosts`) is dropped; `lanUrl`, meaning where the helper QR points, is decided here. The rollback plan is a `v1-final` tag plus a timestamped DB copy taken before the v2 deploy.
- **Given** ([Shareable TV: link, code and QR](06-shareable-tv.md)): one secret TV link per Household, shared by the porch TV and every viewer, read-only, live Event only, no expiry, Rotate in `/setup`. The viewer cap per TV link is decided here. TV pairing codes need a rate limit on redeeming (per Manager).
- **Given** ([Fuzzy location](07-fuzzy-location.md)): the `/setup` location picker loads OpenStreetMap tiles (`tile.openstreetmap.org`). Any CSP must allow that host for images and must not block the `Referer` header. The per-IP limit on creating Households is also what keeps fake Households from getting past nearby's 5-Household minimum.
- **Given** ([Nearby activity indicator](08-nearby-activity.md)): each Household's TV and phone show its Area's top costume, taken only from costume names counted in at least 3 different Households. Decide whether that's enough moderation for costume text on other Households' screens.
- **Given** ([Operator dashboard](10-operator-dashboard.md)): `/operator` has a health strip that reads the caps decided here (amber at 80 %), counts refused connections and sign-ups, and shows the age of the last `VACUUM INTO` backup (amber past 2× its interval). So decide the backup interval, and make every cap and rate limit count its refusals. The Operator can **Rename** a Household and **Suspend** it (reversible: refuses its phones, TV link and summary links, and drops it from nearby). Decide the moderation policy those actions serve.

## Answer

Resolved 2026-10-10 (HITL grilling).

**Hosting**
- **LXC 118 stays the home, raised to 2 cores / 1 GB** (`pct set 118 --cores 2 --memory 1024`). The research found CPU is the limit, and it measured on a much faster box.
- Public at **`count-dracula.example.com`** in the repo; the real name is `PUBLIC_HOST` in the git-ignored `deploy/local.env`. It's a new subdomain under an existing wildcard on the shared Caddy (`host-public.sh add`), so there's no DNS or certificate work.
- That zone is **Cloudflare-proxied**: visitors reach Cloudflare, never the home IP. Caddy already trusts `CF-Connecting-IP` from Cloudflare's ranges; the app takes the client IP from it. SSE survives Cloudflare's ~100 s idle cut because `hub.js` pings every 15 s.
- **No LAN route and no local DNS override.** If the home internet drops, every TV freezes, ours included; taps wait in the phones' outbox (`public/outbox.js`) and nothing is lost.
- **The helper QR always points at the public URL.** `lanUrl`, the `lanAddress()` fallback, `autoJoinHosts` and `TAILNET_HOST` are removed.

**Live connections**
- Required before any cap means anything (from [Public exposure](03-public-exposure-limits.md)): **per-Household SSE channels, each with its own `seq`**, and **dropping viewers that stop reading** (`desiredSize` < 0; EventSource reconnects them to a fresh snapshot).
- **Caps** (starting numbers; re-run the research's appendix scripts on LXC 118 before Oct 24 and adjust):

| Cap | Number | When full |
|---|---|---|
| TV-link viewers per Household | **200** | Viewer 201 gets "This TV is full, try again soon", retrying with backoff |
| Open streams per IP | **20** | 429 |
| Site-wide | **3,000** streams | New TV-link viewers refused first; phones keep getting in up to a hard ceiling of **3,500** |

- **Never refused by the per-Household cap:** the Household's own phones (Managers and Helpers) and TVs paired by code. They still count site-wide.
- Every refusal is counted for the `/operator` Refused tile.
- With the LXC at 1 GB, the `/operator` Server tile reads RSS against 1 GB (amber > 800 MB) rather than 512 MB.

**Database:** SQLite stays, with **`PRAGMA synchronous = NORMAL`** in WAL mode. Multi-second stalls drop to tens of ms; the cost is that the last commits can roll back on a power loss or kernel crash. Postgres was weighed and moved to after Halloween: the sync → async ledger rewrite would cost 2–3 build days and block every other ticket.

**Rate limits:** in-process token buckets in Bun keyed on `CF-Connecting-IP`, all numbers in one constants block. Each refusal returns 429, counts on `/operator`, and writes one log line.

| What | Limit |
|---|---|
| Create a Household | **3 per IP per day**, and **60 site-wide per hour** |
| Google sign-in attempts | 30 per IP per hour |
| Request a TV pairing code (bare `/tv`) | 30 per IP per hour |
| Redeem a TV pairing code | 10 per Manager per 10 min |
| Make an Invite link | 20 per Household per day |
| Taps | 10/s with bursts up to 30, per Household |
| Report this page | 5 per IP per day |
| Request bodies | 64 KB max (Caddy's built-in `request_body`) |

**No Turnstile** (Google-only sign-in already filters bots) and **no Cloudflare Bot Fight Mode or "Under Attack" mode**: their challenges break API calls and SSE.

**User text on shared screens**
- A **vendored blocklist** (slurs and obvious obscenities, a few hundred entries; matched on normalised words with leetspeak folded) runs when a **Household display name** or **costume name** is saved. A match is refused with "Pick another name", never silently starred out.
- The Area's **top costume** in nearby also passes the blocklist, on top of the ≥ 3-Households rule from [Nearby activity indicator](08-nearby-activity.md).
- No review queue and no pre-moderation. The filter is leaky by design; what gets through is handled by Rename and Suspend.

**Moderation**
- **"Report this page"** link on public Night summary share pages only (not on the TV link, which is a passive porch display). It stores a **Report**: Household, page, time, an optional short reason. No email.
- `/operator` gets a **Reports** column (open count) and flags Households with an open Report; the detail view lists them and lets the Operator dismiss them.
- **Policy:** a bad display name or costume name → **Rename**. A deliberate pattern (renaming back, a Household built for abuse, fake Households padding an Area) → **Suspend**. No warning step.
- A Suspended Household's Managers see "This Household is suspended by the Operator" plus a contact address (`OPERATOR_CONTACT` in `deploy/local.env`). Its TV link and summary links show a neutral "Not available".
- **Pause sign-ups:** a switch on `/operator`. While on, new sign-ups see "Sign-ups are paused, try again later"; existing Households, Managers and invites keep working. It's the emergency move that needs no redeploy during a freeze.

**Backups**
- **`VACUUM INTO` every 15 minutes**, run by the Bun process on a timer, into `/var/lib/count-dracula/backups/`. That's also the interval the `/operator` Backup tile checks (amber past 30 min).
- **Retention:** the last 8 copies (2 hours) plus one per day for **14 days**; the same timer deletes older ones.
- **Off-box:** a daily cron on the dev box pulls the newest copy through `ssh proxmox pct pull` (the route `deploy.sh` uses). The Proxmox vzdump job stays as a second layer.
- A deleted Household can live on in backups for up to 14 days → [Privacy notice and retention](15-privacy-notice-and-retention.md).

**Things that drop every connection**
- **`stream_close_delay 10m`** on the count-dracula block in the shared Caddyfile, so other projects' reloads don't cut our streams.
- **0–5 s random jitter** before a client reconnects, so a restart doesn't arrive as one storm.
- **Change freeze from 3 pm to midnight** on Oct 24 (rehearsal) and Oct 31: no app deploys and no Caddy changes unless the site is down. `deploy.sh` prints a warning (not a block) when run inside the Oct 31 window.

**Browser security headers**, the same set on every app response:
- `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://tile.openstreetmap.org; connect-src 'self'; form-action 'self' https://accounts.google.com; frame-ancestors 'none'`. The three inline `<script type="module">` blocks in `index.html`, `setup.html` and `tally.html` move to `.js` files. **No embedding**: nobody can iframe a TV link or `/setup`.
- `Referrer-Policy: strict-origin-when-cross-origin`: OSM gets the origin it requires, and a TV link's secret path never leaks in a Referer.
- `X-Content-Type-Options: nosniff`. HSTS already comes from Caddy.
- **Standing build rule:** user text never reaches `innerHTML` unescaped (today's code already uses `esc()` / `textContent`). Every build ticket that renders user text has a test with `<img src=x onerror=…>` as a costume or display name.

**Incident plan:** a short `deploy/RUNBOOK.md`, written during the build and rehearsed on Oct 24.

| Scenario | First move |
|---|---|
| Site down | systemd restarts it; `journalctl -u count-dracula` on LXC 118; `/operator` health strip |
| Bad deploy | `deploy/deploy.sh --rollback` |
| Database file damaged | Stop the service, copy the newest `VACUUM INTO` copy into place, start (≤ 15 min lost) |
| Overload | Lower the caps and redeploy (outside the freeze unless the site is down); phones keep priority by design |
| Abuse | Rename or Suspend from `/operator` |
| Suspected breach | Wipe the sessions table (every Manager signs in again), rotate every TV link and join key, rotate the Google client secret in `local.env` |
| Sign-up flood | Pause sign-ups on `/operator` |

The v1 rollback plan stands: a `v1-final` tag plus a timestamped DB copy before the v2 deploy.

**Handed on**
- Backups keep deleted Households for up to 14 days, server logs hold IPs, Reports hold an optional reason, Cloudflare now sees every visitor's IP, and there is an Operator contact address → [Privacy notice and retention](15-privacy-notice-and-retention.md).
- Support channel, status page and on-call for Oct 25–31 → the map's rehearsal and launch-day fog.
- Postgres, a local DNS override for the porch, and Cloudflare-level rate limiting → after Halloween (map: Out of scope).

Glossary: **Report** and **Pause sign-ups** added to [CONTEXT.md](../../../CONTEXT.md).
