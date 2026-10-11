# Goes live at, the 8:30 nudge and the 3 am auto-end

Type: build (AFK)
Status: done
Blocked by: 18, 21

## What to build

Every Household's night starts and ends by itself, in its own time zone. See [spec §7](../spec.md#7-going-live-and-ending-by-themselves) and [§6 What sign-up creates](../spec.md#6-sign-up-first-run-and-the-rehearsal).

**Halloween 2026 by default**

- Create Household also makes **"Halloween 2026"**: not live, with the starter costumes, 5 golden tickets, Race against None, and **Goes live at Oct 31, 2026, 4:00 pm in the Household's zone**.
- Signing up **after** that moment makes "Halloween 2026" live straight away, and the Rehearsal is created but not live.

**Goes live at**

- It's a field on any not-yet-live Event in the event editor, and a Manager can change or clear it.
- **Go live** early from `/setup`, as in v1.
- **"Go live on Halloween 2026 now"** appears in the door phone's ☰ menu only where a Manager is signed in. Helpers never see it, and the server refuses it from a join key alone.
- **A server minute tick** goes live (v1 Go live: freeze the old Event, run the golden draw, `event.switched`) for every Event whose time has passed. After a restart, the first tick catches up on anything it missed.

**End of the night**

- **Nudge:** on a live, non-Rehearsal Event, after **8:30 pm** local with **no tap for 30 minutes**, the door phone shows **"Quiet out there? 🌙 End the night"**. It goes through the usual confirm, with the golden-ticket choices. Dismissing it hides it for 30 minutes.
- **Auto-end:** the minute tick ends any live, non-Rehearsal Event still unended at **3:00 am** local the next morning. Unclaimed golden tickets expire, as with "End anyway". The Event is marked as ended automatically.
- `/setup` then says *"Your night ended automatically at 3:00 am. Your summary is ready"*. The summary link arrives with [ticket 43](43-night-summary-slides.md).

**Modules:** [Ledger](../../count-dracula/modules.md#1-ledger-server), [Night maths](../../count-dracula/modules.md#3-night-maths-shared).

## Acceptance criteria

- [x] With a fake clock, a Household in `America/Toronto` and one in `Pacific/Auckland` each go live at their own 4:00 pm, and TVs and phones follow without a reload
- [x] Signing up after Oct 31, 4:00 pm local makes "Halloween 2026" live at once
- [x] A changed Goes live at is honoured; a cleared one never fires
- [x] A tick missed while the server was down fires on the first tick after start
- [x] "Go live now" in ☰ shows only for a Manager-signed-in phone; a join-key-only request is refused
- [x] The nudge shows after 8:30 pm with 30 quiet minutes, not on a Rehearsal, and stays hidden for 30 minutes once dismissed
- [x] Auto-end fires at 3:00 am local, across the **Nov 1 DST change**, expires unclaimed tickets and never touches a Rehearsal
- [x] `/setup` shows the "ended automatically" message after an auto-end
- [x] `bun test` passes

## Notes from the build

- `events` gains `goes_live_at`, `went_live_at` and `ended_automatically` (migration step 5; live events get `went_live_at` = now). Going live, by hand or by the tick, clears `goes_live_at`.
- **The tick** is `ledger.tick()` → `[{ householdId, deltas }]`; the server runs it at start (catching up) and every minute, and publishes what it did. Auto-end fires at the first 3:00 am local after the night went live (`nextWallTime` in night maths), so a night that went live in the afternoon ends the next morning.
- New night maths: `zonedTime(date, "HH:MM", zone)` and `nextWallTime(ms, "HH:MM", zone)`; `atEventTime` shares their DST-safe conversion.
- Signing up after Oct 31 4:00 pm local makes "Halloween 2026" live at once. With no ghost and no Expected kids yet, there are no golden tickets to draw.
- "Go live on … now" in the door ☰ shows when `/api/household` (the session cookie) answers with this phone's join key; it sends the Setup `goLive` command, which a join key alone can't reach.
- The nudge is `quietNudge(state, now, dismissedAt)` in `public/door-view.js`; "after 8:30 pm" runs on through the small hours (until 6 am). Its End opens the usual ☰ End the night, golden-ticket choices included.
- `/setup`: "Goes live by itself at" in the event editor, typed as a wall time in the Household's zone; upcoming nights show when they go live; the "ended automatically" card shows while the live night is auto-ended. Its summary link comes with ticket 43.
- Household #1 was migrated, not signed up, so it has no "Halloween 2026"; the runbook (spec §18) creates it by hand.
- Checked in the browser: Goes live at shows Oct 31 4:00 PM and saves a change; ☰ Go live now on a Manager's phone; the nudge after 8:30 pm and its ✕; the auto-ended card.
