# Rebuild production and redo the opening line

Type: task (HITL)
Status: ready-for-human
Blocked by: 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61

## What to build

**The opening line, redone.** The user runs the RUNBOOK's redone steps 1–4 ([v2.1 §12](../spec-v2.1.md#12-household-1-and-the-opening-line)). Then [Open sign-up](38-open-sign-up.md)'s steps 5–7 open sign-up.

## Acceptance criteria

- [ ] 1. A `VACUUM INTO` copy of the v2 database in `~/count-dracula-backups/`
- [ ] 2. v2.1 deployed on a fresh database; Household #1 signed up at `/`; first-run done and our TV paired; `deploy/import-past-counts.js` run and Halloween 2026 racing "Halloween 2025 (counts)"; the Test night live, Halloween 2026 going live Oct 31 at 4 pm, `/?key=` landing on `/door`
- [ ] 3. Load check passed, or the caps lowered to what passes and redeployed
- [ ] 4. `/door?key=` shows `key=REDACTED` in the Caddy log; OSM tiles load only after the tap
- [ ] `HOUSEHOLD1_MANAGER_EMAIL` removed from `deploy/local.env`
