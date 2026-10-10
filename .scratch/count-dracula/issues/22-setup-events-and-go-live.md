# Setup: events, Go live, costumes and settings

Type: build (AFK)
Status: ready-for-agent
Blocked by: 18

## What to build

The admin's `/setup` page, behind the admin PIN from the config file (remembered on the phone once entered, and the join key is needed too). See [spec §6](../spec.md#6-setup-page) and [§2 Event](../spec.md#2-domain-model).

**Events**

- **Create** with a name and "Copy costumes from: [event ▾]", which copies names, emoji, order, signature sounds and the Visit window, with zero counts. Creating doesn't make an event live.
- **Go live** (with a confirmation) makes the event live, **freezes** the old live event as read-only, and keeps the join key. Phones and the TV switch over SSE (`event.switched`) without re-scanning. Exactly one event is ever live. (The golden draw is added to Go live in the golden-tickets ticket.)
- **Change join key** cuts off phones that joined with the old key.
- **Past events list** with Delete (typed confirmation). View recap and Export arrive in their own tickets. The counts-only 2025 event can't be raced against itself, and it has no entry UI.

**Per-event settings**

- **Costume presets:** name, emoji, order, signature sound. Rename any time. Deleting a costume that has kids makes them untagged, after a confirmation.
- **Race against** (a past event or None), **Clock shift** (default 0), **Expected kids**, and **Visit window** (default 15 s, changeable live). The golden-ticket count field arrives with golden tickets.

**Modules:** [Ledger](../modules.md#1-ledger-server), [Night maths](../modules.md#3-night-maths-shared).

## Acceptance criteria

- [ ] A wrong PIN is rejected, and once entered the PIN is remembered on that phone
- [ ] Create + Copy costumes from produces the same tags with zero counts
- [ ] Go live freezes the old event (writes to it are rejected), and phones and the TV follow the new event without re-scanning or reloading
- [ ] Change key stops old-key phones from writing until they rejoin
- [ ] Renaming a costume updates phones and the TV live; deleting one untags its kids after a confirmation
- [ ] Changing Race against or Clock shift is reflected on the TV live
- [ ] Deleting a past event needs the typed confirmation, and the live event can't be deleted
- [ ] Tests cover the one-live-event invariant and freezing
