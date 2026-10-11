# Bare /operator: Rename, Suspend and Pause sign-ups

Type: build (AFK)
Status: ready-for-agent
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

- [ ] A non-Operator Manager gets 403 on `/operator` and its API
- [ ] Rename and Fix time zone change what the Household's TV and phones show, live
- [ ] Suspend closes the Household's streams, refuses its key, TV link and setup, and shows the contact; Unsuspend restores everything with nothing lost
- [ ] Pause sign-ups stops new Households (a test through the sign-up check) and survives a restart; existing Managers still sign in
- [ ] Each action writes one log line in the stated shape
- [ ] A display name of `<img src=x onerror=alert(1)>` renders as text on `/operator`
- [ ] `bun test` passes
