# Rebuild production and redo the opening line

Type: task (HITL)
Status: done
Blocked by: 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61

## What to build

**The opening line, redone.** The user runs the RUNBOOK's redone steps 1–4 ([v2.1 §12](../spec-v2.1.md#12-household-1-and-the-opening-line)). Then [Open sign-up](38-open-sign-up.md)'s steps 5–7 open sign-up.

## Acceptance criteria

- [x] 1. A `VACUUM INTO` copy of the v2 database in `~/count-dracula-backups/`
- [x] 2. v2.1 deployed on a fresh database; Household #1 signed up at `/`; first-run done and our TV paired; `deploy/import-past-counts.js` run and Halloween 2026 racing "Halloween 2025 (counts)"; the Test night live, Halloween 2026 going live Oct 31 at 4 pm, `/?key=` landing on `/door`
- [x] 3. Load check passed, or the caps lowered to what passes and redeployed
- [x] 4. `/door?key=` shows `key=REDACTED` in the Caddy log; OSM tiles load only after the tap
- [x] `HOUSEHOLD1_MANAGER_EMAIL` removed from `deploy/local.env`

## Notes from the rebuild (2026-10-11)

- Step 1: `v2-final-20261011-192948.sqlite` (180 KB), kept on LXC 118 and in `~/count-dracula-backups/`. It held Household 1's Rehearsal (frozen, 178 kids) and "Halloween 2026", **live with 38 test taps**: someone had pressed Go live on it after opening day. All test data, dropped from production, kept in the copy.
- Step 2: deployed `771958d` on a fresh database (`user_version` 15). Household #1 signed up again as id 1, `America/Toronto`, with the Test night (event 1, live) and Halloween 2026 (event 2, Oct 31 4 pm). The import made "Halloween 2025 (counts)" as event 3 (346); a second run refused. The first Race against save landed on the Test night (saved from its screen, reached through Tonight); set again from Nights → Halloween 2026. The Test night still races 2025 too, which is harmless. Helper phones rejoined; journald keeps 30 days. `HOUSEHOLD1_MANAGER_EMAIL` was already gone from `local.env`.
- Step 3, LXC 118: 200 viewers median 4.1 ms, worst 6.2 ms; 3,000 streams at 67 MB RSS. Caps unchanged.
- Step 4 found a leak: the `/?key=` → `/door?key=` 302 logged the key in `resp_headers.Location`, unmasked. Only the runbook's own fake key had leaked. Fixed in `a793147` (the site block masks `Location`; `caddy-add-site.sh` updates in place and takes `-y`), applied to the shared Caddy, and checked: `/door?key=REDACTED`. The RUNBOOK's step 4 now checks it (`1cd3061`).
- Next: [Open sign-up](38-open-sign-up.md)'s steps 5–7.

