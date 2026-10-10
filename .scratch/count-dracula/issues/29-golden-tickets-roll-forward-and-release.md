# Golden tickets: roll forward, Add a ticket, Release remaining

Type: build (AFK)
Status: ready-for-agent
Blocked by: 26, 28

## What to build

The paths that keep golden tickets in play when the night doesn't go to plan. See [spec §9](../spec.md#9-golden-tickets) and [§8 Late taps](../spec.md#8-celebration-rules).

- **Roll forward:** a golden number that lands on a **late tap** (an outbox backlog or a backfill) goes to the **next live kid**. The ticket keeps its original number for the recap, in state "rolled forward".
- **Invariant:** no hidden ticket ever sits below the count. Every golden number the count passes is either won live or rolled forward, so removing kids or a backfill batch never brings a ticket back into play.
- **"Add a ticket"** in Setup, after Go live, draws one number between (tonight's count + 5) and the top of the range.
- **"Release remaining tickets"** in the ☰ menu, shown from **7:45pm event time** (Clock shift applied), with a confirmation, makes the next K kids winners, where K is the number of tickets left.
- Several winners in a row queue their takeovers without stomping on each other.

**Modules:** [Ledger](../modules.md#1-ledger-server), [Night maths](../modules.md#3-night-maths-shared), [Celebration director](../modules.md#6-celebration-director-tv).

## Acceptance criteria

- [x] Backfilling past a golden number makes the next live tap win it, and the stored ticket remembers the original number
- [x] Removing the backfill batch afterwards doesn't bring any ticket back
- [x] Add a ticket draws a number in the stated range and the pill goes up by one
- [x] Release remaining is hidden before 7:45 event time, then makes the next K live kids win, one takeover each
- [x] The rehearsal scenarios 9a–9c run on a test database without manual fixes *(run with late taps standing in for backfill, which arrives in ticket 23; re-run 9a–9c with real backfill there)*
- [x] Roll-forward and release are unit-tested on the server
