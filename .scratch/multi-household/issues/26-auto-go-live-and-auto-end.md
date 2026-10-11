# Goes live at, the 8:30 nudge and the 3 am auto-end

Type: build (AFK)
Status: ready-for-agent
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

- [ ] With a fake clock, a Household in `America/Toronto` and one in `Pacific/Auckland` each go live at their own 4:00 pm, and TVs and phones follow without a reload
- [ ] Signing up after Oct 31, 4:00 pm local makes "Halloween 2026" live at once
- [ ] A changed Goes live at is honoured; a cleared one never fires
- [ ] A tick missed while the server was down fires on the first tick after start
- [ ] "Go live now" in ☰ shows only for a Manager-signed-in phone; a join-key-only request is refused
- [ ] The nudge shows after 8:30 pm with 30 quiet minutes, not on a Rehearsal, and stays hidden for 30 minutes once dismissed
- [ ] Auto-end fires at 3:00 am local, across the **Nov 1 DST change**, expires unclaimed tickets and never touches a Rehearsal
- [ ] `/setup` shows the "ended automatically" message after an auto-end
- [ ] `bun test` passes
