# Load test script

Type: build (AFK)
Status: ready-for-agent
Blocked by: 19, 28

## What to build

`deploy/loadtest.js` measures what one tap costs with many viewers on the v2 hub, so the caps can be set from a real number. See [spec §18 Load check](../spec.md#18-launch-and-the-night-runbook). It re-does the [Public exposure](03-public-exposure-limits.md) appendix method, whose scripts were never committed.

- It runs against **a second instance on a spare port with a scratch DB**. It **refuses** to run against the real DB path or the public host. It goes straight to the port, never through Cloudflare or Caddy.
- It makes its own Households directly in the scratch DB (no Google).
- It opens **N TV-link viewers on one Household** plus a few on others. It sets a different `CF-Connecting-IP` per viewer so the per-IP cap doesn't stop it.
- It taps, and reports:
  - **fan-out time per tap**: from the POST to the last viewer receiving the delta
  - **server RSS**
- It prints pass/fail against the thresholds: **< ~100 ms to 200 viewers** on one Household, and **3,000 site-wide streams under ~800 MB RSS**.
- How to run it on LXC 118 goes in `deploy/RUNBOOK.md` ([ticket 37](37-runbook.md)).

## Acceptance criteria

- [ ] On the dev box, it starts a scratch instance (or takes its port), runs 200-on-one and 3,000-site-wide, and prints the timings, RSS and pass/fail
- [ ] It refuses the production DB path and the public host
- [ ] It leaves the scratch DB and instance cleaned up
