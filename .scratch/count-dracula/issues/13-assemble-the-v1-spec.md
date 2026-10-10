# Assemble the v1 spec

Type: task (AFK)
Status: resolved
Blocked by: 09, 10, 11, 12

## Question

Roll every resolved ticket into a single build-ready v1 spec at `.scratch/count-dracula/spec.md`: the domain model (map Notes), architecture and hosting, phone and TV behaviour (with links to the prototype branches), the celebration and sound rules, setup, failure handling, the build order with its cut line, the asset task (stock sounds + homemade recordings), and the rehearsal plan. No new decisions. Anything still undecided goes back to the map as a new ticket.

Also from [Dress rehearsal plan](12-dress-rehearsal-plan.md): the rehearsal plan as a **printable checklist page** (pass / polish / blocker per line, plus notes); the **config-file on/off switches for Must 3–9** and the Oct 24 feature freeze, alongside the build order and its cut line; the Oct 30 create and Oct 31 Go live steps, with the Clock shift 0 check.


## Answer

Resolved 2026-10-10 (AFK). No new decisions were made.

- **[spec.md](../spec.md)** holds the whole v1 in 19 sections:
  - dates
  - the domain model, extended with Ended, Clock shift, Late tap, Backfill batch, Join key and Phone name
  - architecture, hosting, the stored data shape and the server config file
  - the phone counting screen, ☰ door menu and `/setup`
  - TV layout and states
  - celebration and late-tap rules
  - golden tickets in one place
  - sound
  - failure handling
  - the build order with the core, the Must 3–9 config switches and the cut rule
  - the asset task
  - kiosk setup
  - the Oct 30 / Oct 31 / Nov 1 runbook
  - a **Builder's latitude** list of details deliberately left to the builder

  It links the prototype and research branches.
- **[rehearsal-checklist.md](../rehearsal-checklist.md)** is the printable rehearsal page. Every scenario has ☐ pass / polish / blocker boxes and a notes column. It also includes the Part 2 dusk checks, the blocker table, the after-rehearsal steps and a fix-task list.
- **One gap went back to the map:** [Kid numbers under undo and late taps](14-kid-numbers-under-undo-and-late-taps.md). The tickets never fixed how "kid #N" is assigned when kids are undone or taps arrive late, or what happens to a golden win that is then undone. It's listed in the spec's §15.
