# Operator dashboard: health strip and Household table

Type: build (AFK)
Status: done
Blocked by: 28, 31, 32

## What to build

The full `/operator` for Halloween night: a health strip over a sortable Household table. See [spec §13](../spec.md#13-operator).

- **One `/api/operator`** endpoint, polled every **30 s**. No new SSE stream.
- **Health strip** (amber/red rules as in §13):
  - Live nights
  - Connections (phones · TV screens · total, against the site-wide cap)
  - Refused
  - Errors: 5xx responses and uncaught exceptions, plus the last server-generated message and time, never a request body
  - Last tap
  - Backup (amber > 30 min)
  - Server: uptime, RSS against 1 GB (amber > 800 MB), and the switches read-only

  Counters are in memory and reset on restart.
- **Status per Household:** Counting / Stale / Waiting / Rehearsal, by the 30-minute rule. Only a counted kid is activity.
- **Table columns:** Status · Household · Area (4-char or "—") · Kids · Last kid · Phones · TV screens · Managers (count) · Reports (open count; filled by [ticket 44](44-summary-share-links.md)) · Signed up.
  - Sorted Counting → Stale → Waiting → Rehearsal, then most kids first.
  - **Status filter chips** with counts, the **name search** from [ticket 31](31-bare-operator.md), and a flag on Households with an open Report.
- **Detail view:** Managers' emails (only here), the Area (**never the 5-char cell**), current state, and the actions from tickets 31 and 39.

## Acceptance criteria

- [x] Status rules tested: a Rehearsal, a live night with no kids, one quiet for 31 minutes and one counting land in the right status
- [x] Each tile's amber/red rule is tested with fake counters and a fake clock
- [x] The Area column shows 4 characters; the 5-char cell appears nowhere in `/api/operator`
- [x] Emails appear only in the detail view's response
- [x] Sorting, chips and search work on a phone-sized screen (checked in the browser)
- [x] An Errors entry never contains a request body (a test throws with a body in flight)
- [x] A display name of `<img src=x onerror=alert(1)>` renders as text
- [x] `bun test` passes

## Notes from the build

- **Rules** in `server/operator.js` (pure): `householdStatus({ rehearsal, kids, lastKidAt }, now)` and `healthTiles(state, now)` → `[{ key, label, value, detail, level }]` for live · connections · refused · errors · lastTap · backup · server.
- **`GET /api/operator`** → `{ now, pauseSignUps, health, households }`; rows carry status, Area (4 characters or "—"), kids, last kid, phones, TV screens (paired + TV link), Managers (a count), reports (0 until ticket 44), signed up, suspended since. **`GET /api/operator/household?id=`** is the detail, the only response with emails; it carries `reports: []` for ticket 44 to fill (and the page already has a Dismiss button calling an `operator action=dismissReport` that ticket 44 adds). The bare list endpoint from ticket 31 (`/api/operator/households`) is gone.
- `ledger.liveNights()` (every live Event with its kid count and last tap time; ticket 41 can use it) and `ledger.lastTapAt()`.
- **Errors:** thrown errors (answered 500) and 5xx answers other than 503 (a refusal), plus uncaught exceptions and unhandled rejections. The tile keeps only the error's type and the route (`TypeError in POST /api/taps`), never its message; the full error goes to the journal. `app.failNextRequest()` is the test seam.
- `/operator` polls every 30 s; status chips with counts, name search, Counting → Stale → Waiting → Rehearsal then most kids; ⚑ for open Reports.
- Checked in the browser at 390 px: the strip, chips, search and detail; `<img src=x onerror=…>` and `<b>…</b>` names show as text.
- Also in this round: Bun's pooled keep-alive connections were hanging about 1 in 5 full test runs (a stopped test server's port reused by the next); `test/preload.js` turns keep-alive off for test fetches (0 in 15 runs since).
