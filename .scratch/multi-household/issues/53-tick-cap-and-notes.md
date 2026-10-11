# The minute tick: every Live Event auto-ends, room at the cap

Type: build (AFK)
Status: ready-for-agent
Blocked by: 50

## What to build

What the server does by itself, across several open Events. See [v2.1 §5](../spec-v2.1.md#5-going-live-and-ending-by-themselves).

- **Auto-end:** any Event still Live at the first 3:00 am (Household time) after it went live is ended, **naming that Event** (fixes v2's "first live row"). There's no exemption. Unclaimed golden tickets expire, as before.
- **Goes live at:** the tick runs Go live on an Upcoming Event whose time has passed.
  - **At the cap** it closes the **oldest Ended** Event (Past early) and goes live.
  - **If all 3 are Live it waits**, and goes live on the first tick after one is ended or closed.
  - A Manager's Go live at the cap is still refused.
- **Setting Goes live at:** Upcoming only; a time in the past is refused.
- **Notes on the Event the tick touched**, returned with `events()` for [ticket 57](57-setup-tabs.md) to show:
  - **auto-ended** ("Ended automatically at 3:00 am. Late kids still count until noon."): cleared on Resume or at Past
  - **closed to make room** ("Closed at 4:00 pm so Halloween 2026 could go live"): kept 24 hours
  - **waiting at the cap** ("Couldn't go live at 4:00 pm: 3 nights are open. It'll go live as soon as you end or close one."): kept while waiting
- Ended → Past at noon is [ticket 50](50-event-states.md)'s. The tick is where it runs.

**Modules:** [Ledger](../../count-dracula/modules.md#1-ledger-server), [Night maths](../../count-dracula/modules.md#3-night-maths-shared).

## Acceptance criteria

- [ ] Two Live Events with different go-live times each auto-end at their own first 3:00 am, by name, across the Nov 1 DST change
- [ ] With 2 Live and 1 Ended, Halloween's 4 pm closes the Ended one (with its note) and goes live
- [ ] With 3 Live, Halloween waits (with its note) and goes live on the tick after one is ended
- [ ] A missed tick catches up after a restart
- [ ] Goes live at can't be set on an open Event or to a past time
- [ ] `bun test` passes
