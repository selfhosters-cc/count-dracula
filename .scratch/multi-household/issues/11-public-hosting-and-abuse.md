# Public hosting and abuse

Type: grilling (HITL)
Status: open
Blocked by: 03, 04, 06

## Question

How does the app run on the open internet without one bad actor ruining a porch TV or the site?

- **Hosting**: the same Proxmox LXC behind Caddy on a public hostname (the real name only in `deploy/local.env`), or elsewhere. Do LAN phones keep a LAN route on the night if the internet drops? (Dogfooding means our porch now depends on our upstream link.)
- **Capacity**: the ceiling on SSE viewers per household and site-wide, from [Public exposure: abuse protection and live-connection capacity](03-public-exposure-limits.md).
- **Bot sign-ups and rate limits**: which protections, from the same research. Sign-in is Google-only ([Household identity and sign-up](04-household-identity-and-sign-up.md)), which recommends no Turnstile, just a per-IP limit on creating Households. Also: moderating Household display names (≤ 40 chars, shown on shared screens).
- **User text on shared screens**: household names and live-created costume names show on public TVs, nearby and summaries. A word filter, a review step, an operator "hide", or accept the risk?
- **Backups and incident plan** for a database that now holds other people's nights.
- **Given** ([What becomes per-household](05-what-becomes-per-household.md)): tailnet auto-join (`autoJoinHosts`) is dropped; `lanUrl`, meaning where the helper QR points, is decided here. The rollback plan is a `v1-final` tag plus a timestamped DB copy taken before the v2 deploy.
