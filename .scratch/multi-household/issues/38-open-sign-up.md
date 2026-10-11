# Open sign-up

Type: task (HITL)
Status: in-progress
Blocked by: 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37

## What to build

**The opening line.** The user runs the opening-day checklist in [deploy/RUNBOOK.md](../../../deploy/RUNBOOK.md) ([spec §18](../spec.md#18-launch-and-the-night-runbook)). Once step 7 is done, sign-up is open, and every later deploy is fix-forward.

## Acceptance criteria

- [x] 1. `v1-final` tag confirmed (from [ticket 17](17-households-and-migration.md)) and a timestamped copy of the SQLite file taken
- [ ] 2. v2 deployed and the migration ran; the public host switched on ([ticket 35](35-public-host-on-caddy.md)); signed in with `HOUSEHOLD1_MANAGER_EMAIL`; "Halloween 2025 (counts)", the Rehearsal and Race against survived; our TV pairs
- [ ] 3. Load check passed, or the caps lowered to what passes and redeployed
- [ ] 4. `/privacy` shows the real contact and a test email arrived; a TV-link token is masked in the Caddy log; OSM tiles load only after the tap
- [ ] 5. Test Household (second Google account, still in Testing, a phone that never opened the site): first-run; TV paired by code and by QR; Goes live at 10 minutes ahead went live with its TV following; next morning it had ended at 3 am and `/setup` showed "Your night ended automatically" (and its summary opened, if [ticket 43](43-night-summary-slides.md) is already deployed); then deleted
- [ ] 6. Google consent screen: production redirect URI, app name and `/privacy` link set, then **Published**
- [ ] 7. Pause sign-ups off: **sign-up is open**
- [ ] After the first stranger signs up: `v1-final` retired (the tag and DB copy kept, never used)
