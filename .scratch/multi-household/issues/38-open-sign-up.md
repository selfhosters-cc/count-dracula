# Open sign-up

Type: task (HITL)
Status: in-progress
Blocked by: 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37

## What to build

**The opening line.** The user runs the opening-day checklist in [deploy/RUNBOOK.md](../../../deploy/RUNBOOK.md) ([spec §18](../spec.md#18-launch-and-the-night-runbook)). Once step 7 is done, sign-up is open, and every later deploy is fix-forward.

## Acceptance criteria

- [x] 1. `v1-final` tag confirmed (from [ticket 17](17-households-and-migration.md)) and a timestamped copy of the SQLite file taken
- [ ] 2. v2 deployed and the migration ran; the public host switched on ([ticket 35](35-public-host-on-caddy.md)); signed in with `HOUSEHOLD1_MANAGER_EMAIL`; "Halloween 2025 (counts)", the Rehearsal and Race against survived; our TV pairs
- [x] 3. Load check passed, or the caps lowered to what passes and redeployed
- [ ] 4. `/privacy` shows the real contact and a test email arrived; a TV-link token is masked in the Caddy log; OSM tiles load only after the tap
- [ ] 5. Test Household (second Google account, still in Testing, a phone that never opened the site): first-run; TV paired by code and by QR; Goes live at 10 minutes ahead went live with its TV following; next morning it had ended at 3 am and `/setup` showed "Your night ended automatically" (and its summary opened, if [ticket 43](43-night-summary-slides.md) is already deployed); then deleted
- [ ] 6. Google consent screen: production redirect URI, app name and `/privacy` link set, then **Published**
- [ ] 7. Pause sign-ups off: **sign-up is open**
- [ ] After the first stranger signs up: `v1-final` retired (the tag and DB copy kept, never used)

## Notes from opening day (2026-10-11)

- Step 1: `deploy/v1-final.sh` (the runbook's `cp` gave an empty 4 KB file: the rows were in the `-wal`). 88 KB copy; migrated to Household #1 with the live Rehearsal (314 kids) racing "Halloween 2025 (counts)".
- Step 2: deployed `8d2d139`; `deploy/caddy-add-site.sh` switched the public host on (`/healthz` 200, `/api/snapshot` 403 through Caddy). `OPERATOR_EMAILS` in `local.env` had the example's pattern, so `/operator` said Not here until it was set to the real Google account and redeployed.
- Step 3, LXC 118 (2 cores, 1 GB): fan-out to 200 viewers median 3.8 ms, worst 7.8 ms; 3,000 streams at 64 MB RSS. Caps unchanged.
- Step 4: nothing of ours in the shared `public-access.log`; `key=` logged as `REDACTED`.
