# Operator dashboard: health strip and Household table

Type: build (AFK)
Status: ready-for-agent
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

- [ ] Status rules tested: a Rehearsal, a live night with no kids, one quiet for 31 minutes and one counting land in the right status
- [ ] Each tile's amber/red rule is tested with fake counters and a fake clock
- [ ] The Area column shows 4 characters; the 5-char cell appears nowhere in `/api/operator`
- [ ] Emails appear only in the detail view's response
- [ ] Sorting, chips and search work on a phone-sized screen (checked in the browser)
- [ ] An Errors entry never contains a request body (a test throws with a body in flight)
- [ ] A display name of `<img src=x onerror=alert(1)>` renders as text
- [ ] `bun test` passes
