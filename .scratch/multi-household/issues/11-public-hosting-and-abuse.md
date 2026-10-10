# Public hosting and abuse

Type: grilling (HITL)
Status: open
Blocked by: 03, 04, 06

## Question

How does the app run on the open internet without one bad actor ruining a porch TV or the site?

- **Hosting**: the same Proxmox LXC behind Caddy on a public hostname (the real name only in `deploy/local.env`), or elsewhere. Do LAN phones keep a LAN route on the night if the internet drops? (Dogfooding means our porch now depends on our upstream link.)
- **Capacity**: the ceiling on SSE viewers per household and site-wide, from [Public exposure: abuse protection and live-connection capacity](03-public-exposure-limits.md).
- **Bot sign-ups and rate limits**: which protections, from the same research.
- **User text on shared screens**: household names and live-created costume names show on public TVs, nearby and summaries. A word filter, a review step, an operator "hide", or accept the risk?
- **Backups and incident plan** for a database that now holds other people's nights.
