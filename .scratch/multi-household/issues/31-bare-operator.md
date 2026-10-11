# Bare /operator: Rename, Suspend and Pause sign-ups

Type: build (AFK)
Status: done
Blocked by: 19, 21, 23

## What to build

The smallest `/operator` that's safe to open sign-up with. See [spec §13](../spec.md#13-operator). The health strip and full table come after opening ([ticket 40](40-operator-dashboard.md)).

- **`/operator`** is open only to a signed-in Manager whose email is in `OPERATOR_EMAILS`. Anyone else gets 403.
- **A plain Household list** with a **name search**. Tapping one opens its **detail view**.
- **Actions** in the detail view:
  1. **Rename** the display name.
  2. **Fix time zone** (pick from the IANA zones).
  3. **Suspend / Unsuspend**:
     - Managers see *"This Household is suspended by the Operator"* plus `OPERATOR_CONTACT`, in place of `/setup`.
     - Join-key phones, the TV link (and later Night summary share links) are refused with a neutral **"Not available"**, and **open streams close**.
     - It drops out of nearby and site-wide figures (honoured by [ticket 41](41-nearby.md)).
     - Nothing is deleted. The detail view shows "Suspended since <time>".
- **Pause sign-ups:** a switch on `/operator`, **stored in the DB** so it needs no redeploy. While it's on, sign-ups get "Sign-ups are paused, try again later". Existing Households, Managers and invites keep working.
- **Audit:** one structured log line per action, e.g. `operator action=suspend household=37 by=<operator email>`. No audit table.

## Acceptance criteria

- [x] A non-Operator Manager gets 403 on `/operator` and its API
- [x] Rename and Fix time zone change what the Household's TV and phones show, live
- [x] Suspend closes the Household's streams, refuses its key, TV link and setup, and shows the contact; Unsuspend restores everything with nothing lost
- [x] Pause sign-ups stops new Households (a test through the sign-up check) and survives a restart; existing Managers still sign in
- [x] Each action writes one log line in the stated shape
- [x] A display name of `<img src=x onerror=alert(1)>` renders as text on `/operator`
- [x] `bun test` passes

## Notes from the build

- **Routes:** `GET /operator` (page), `GET /api/operator/households` (`{ pauseSignUps, households: [{ id, displayName, timeZone, suspendedSince, signedUpAt, managers }] }`; `?q=` filters, though the page filters itself so a renamed Household stays open), `POST /api/operator/action` (`{ householdId, action: rename | timeZone | suspend | unsuspend, value }`), `POST /api/operator/pause` (`{ on }`). A non-Operator session gets 403; no session, 401 (or `/signup` for the page).
- **Suspend** sets `households.suspended_since`. Its join key and TV link are refused like wrong ones (so TVs show "Not available" and phones stop), its streams close at once, and its Managers get a 403 page with `OPERATOR_CONTACT` instead of `/setup` and the tally, and 403 from Setup's API. Nothing is deleted. Nearby (ticket 41) and share links (ticket 44) must check `ledger.isSuspended`.
- **Fix time zone** is the Household command `setTimeZone`, which sends `event.updated` so every screen resyncs in the new zone. Rename goes through the blocklist like any rename.
- **Pause sign-ups** is the site switch `pauseSignUps` in the new `site_switches` table (migration step 7). It's checked before the Guard's sign-up limits, so a paused sign-up spends no token.
- **Audit:** `operator action=<rename|timeZone|suspend|unsuspend> household=<id> by=<email>`, and `operator action=pause-sign-ups|resume-sign-ups by=<email>`.
- `OPERATOR_CONTACT` falls back to `privacy@count-dracula.example.com`.
- Checked in the browser: the list and search, Rename to `<b>Bold</b> <img src=x onerror=…>` showing as text, Fix time zone, Suspend showing "Suspended since …" and Unsuspend; one log line each.
