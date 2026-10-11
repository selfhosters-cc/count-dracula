# Retire HOUSEHOLD1_MANAGER_EMAIL; import the 2025 counts

Type: build (AFK)
Status: done
Blocked by: 58

## What to build

Household #1 is rebuilt by sign-up. See [v2.1 §12](../spec-v2.1.md#12-household-1-and-the-opening-line).

- **Retire the claim:** remove `claimsHousehold1` and `HOUSEHOLD1_MANAGER_EMAIL` from:
  - `server/accounts.js` and `server/app.js`
  - `deploy.sh` `ENV_KEYS`
  - `deploy/local.env.example` and `deploy/README.md` ("all six" → five)
  - the README
  - The RUNBOOK is [ticket 61](61-runbook-v2-1.md)'s.
- **`deploy/import-past-counts.js <householdId>`**, run with Bun on LXC 118 like `deploy/copy-db.js`. It calls `addPastCounts` with the five 2025 buckets: 17:42–18:00 · 14, 18:00–18:30 · 72, 18:30–19:00 · 107, 19:00–19:30 · 119, 19:30–20:00 · 34. That makes **"Halloween 2025 (counts)"** and prints its id. It refuses if the Household already has an Event of that name.
- v2's 0 → 1 migration step (a v1 database becomes Household #1) stays as written.

## Acceptance criteria

- [x] With `HOUSEHOLD1_MANAGER_EMAIL` absent, that account can sign up on a fresh database
- [x] No reference to `HOUSEHOLD1_MANAGER_EMAIL` remains outside git history and the v2 spec
- [x] A `deploy/scripts.test.js` case: the import makes a Past counts-only Event of 346 kids in those buckets, and a second run refuses
- [x] `bun test` passes

## Notes from the build

- **The claim is gone:** `claimsHousehold1` and the `household1Email` option are out of `server/accounts.js`, and `server/app.js` no longer reads the key (its env comment now lists `OPERATOR_CONTACT` instead). A sign-in with no Manager row for its `sub`, no invite and no display name is `noHousehold`, whatever its email. Household #1 is now just the first Household a fresh database makes.
- **Deploy:** `deploy.sh`'s `ENV_KEYS` is five keys, so `/etc/count-dracula/env` gets five. A leftover `HOUSEHOLD1_MANAGER_EMAIL` line in `deploy/local.env` does nothing (deploy.sh writes only `ENV_KEYS`) until ticket 62 removes it. Also out of `deploy/local.env.example`, `deploy/README.md` ("all five"; it now also says other `local.env` lines stay on the dev machine) and the comment in `deploy/count-dracula.service`. The top-level `README.md` never named it, so nothing changed there. `deploy/RUNBOOK.md`'s one mention is ticket 61's, so until that commit it's the only one outside `.scratch/` (the v2 spec, its tickets and the decision record keep theirs as history).
- **`deploy/import-past-counts.js <database> <household id>`:** takes the database path first, like `redelete.js` and `access-request.js` (the ticket wrote only `<householdId>`; a path keeps it testable and says which file it writes). It opens the Ledger, refuses a missing Household or an existing Event named "Halloween 2025 (counts)" (exit 2, nothing written), calls `addPastCounts` with the five buckets and prints `imported "Halloween 2025 (counts)" (346 kids) for household N as event M`, then the Race against step. It sets `busy_timeout` 5 s, so it's safe with the service running (WAL). It's in the deploy tarball, so on LXC 118 it's `/opt/count-dracula/deploy/import-past-counts.js`, run the way the RUNBOOK runs `redelete.js`. It never sets Race against: that stays by hand in `/setup` (the decision's "the script doesn't guess which Event is Halloween 2026").
- **Tests:** `server/sign-in.test.js`: the claim test became two, a Manager-less Household #1 is claimed by nobody (our account signing up gets a new Household; red before the change, with the key set), and on a fresh database our account signs up as Household 1 with a live Test night and Halloween 2026. `start()` there takes `fresh`. `server/app.test.js` gives Household #1 its Manager (`g-us`) as a row instead of by the key. `deploy/scripts.test.js`: the import (Past, counts-only, the five buckets, 346, the other Household untouched), a second run refused with nothing added, an unknown Household refused. 652 pass.
