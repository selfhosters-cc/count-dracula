# Public hosting and abuse

Type: grilling (HITL)
Status: claimed
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
