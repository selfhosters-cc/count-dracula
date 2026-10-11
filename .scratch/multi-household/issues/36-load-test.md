# Load test script

Type: build (AFK)
Status: done
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

- [x] On the dev box, it starts a scratch instance (or takes its port), runs 200-on-one and 3,000-site-wide, and prints the timings, RSS and pass/fail
- [x] It refuses the production DB path and the public host
- [x] It leaves the scratch DB and instance cleaned up

## Notes from the build

- `bun deploy/loadtest.js [--port 3191] [--viewers 200] [--site 3000] [--taps 20]`. It makes its Households straight in a temp database, starts `server/main.js` on it as a separate process (RSS from `/proc/<pid>/status`), opens TV-link viewers each with its own `CF-Connecting-IP`, and times each tap from the POST to the last viewer's delta. It re-runs itself with `BUN_CONFIG_MAX_HTTP_REQUESTS` raised, since Bun's fetch otherwise holds at most 256 requests open.
- It refuses `--port 3131`, `--db /var/lib/count-dracula/count-dracula.sqlite`, and any `--url`/`--host`; it only ever talks to the scratch server on 127.0.0.1. It deletes the temp directory and stops the server on the way out, pass or fail.
- `deploy.sh` now ships it in the app tarball (`/opt/count-dracula/deploy/loadtest.js`), for the runbook (ticket 37).
- **Dev box, 2026-10-11** (a much faster machine than LXC 118's 2 cores): 200 viewers on one Household, median fan-out 5.2 ms (p90 7.4, worst 8.5); 3,000 streams site-wide at 79 MB RSS, a tap still reaching 200 viewers in 5.8 ms. PASS. The number that matters is the run on LXC 118 on opening day.
