# Undo and Recent

Type: build (AFK)
Status: ready-for-agent
Blocked by: 18

## What to build

Mis-taps can be fixed from any phone. See [spec §2 Undo/Recent](../spec.md#2-domain-model) and [§4](../spec.md#4-phone-counting-screen).

- **"↶ Undo"** removes *this phone's* most recent kid and can be repeated. It's an idempotent soft delete, or, if the kid is still in the outbox unsent, it just removes the outbox entry (that kid never gets a number). Each undo shows a toast: "Removed #N · 🧙 Witch".
- **"🕘 Recent ▴"** is a slide-up panel with the last 10 kids from all phones, **newest-arrived first**. Each row shows the stored number, costume, phone name, *tap* time and a ✕ to delete. A late kid shows at the top with its earlier tap time. Queued (unsent) kids show a faint ⏳. Deleting another phone's kid says so in the toast.
- Numbers are never rewritten, so after an undo the next kid reuses the freed number, and Recent may show two kids with the same number.
- New SSE delta: `kid.removed`. On the TV the count **quietly dips**: no chip, no sound.

**Modules:** [Ledger](../modules.md#1-ledger-server), [Outbox and door view](../modules.md#5-outbox-and-door-view-phone).

## Acceptance criteria

- [ ] Undo on phone A removes A's latest kid, not B's, and repeated undos walk back through A's kids
- [ ] Undoing an unsent kid removes it from the outbox and it never reaches the server
- [ ] Deleting from Recent works for any phone's kid, and the toast names the other phone
- [ ] Recent orders by arrival, shows tap times, and marks queued kids with ⏳
- [ ] After an undo, the next kid gets the freed number and stored numbers are unchanged
- [ ] The TV count dips with no celebration
- [ ] Tests cover soft delete idempotency and the reuse of a freed number
