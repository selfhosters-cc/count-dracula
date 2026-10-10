# Event setup and phone menu

Type: grilling (HITL)
Status: resolved
Blocked by: 

## Question

How does a night get set up before it starts, and where do the phone's non-counting controls live?

- **Event lifecycle:** create an event (name, e.g. "Rehearsal" / "Halloween 2026"), make it live, and what happens to the old live event. Can the rehearsal event be thrown away?
- **Pre-night setup:** preset costumes (name, emoji, which get signature sounds), the golden ticket count and the stratified draw (Fun-features shortlist), entering last year's half-hour counts for the ghost line (`data/2025-counts.md`), and the visit-grouping window (default ~15 s; adjustable live?).
- **The phone's secondary menu** (kept off the counting screen, see Phone controller prototype): soundboard (6 buttons), "release remaining tickets" (offered from 7:45), master volume + the 3 mute toggles (Sound design), "Add a helper" QR + change key (Hosting and phone access), and the event admin above. Is it a menu, a second tab, or an admin-only page, and can any phone use it?

## Answer

Resolved 2026-10-10 by grilling.

**Event lifecycle**

- **Creating an event doesn't make it live.** You create it ahead of time, set it up, then press **Go live**, which asks for confirmation. Going live **freezes the previous live event** as a read-only past event, and phones and the TV switch to the new one right away over SSE.
- **Exactly one event is live, never zero.** The first install creates "Rehearsal" and makes it live.
- **Past events can be deleted** after a typed confirmation. This is how the rehearsal gets thrown away.
- **The join key carries over on Go live**, so helpers don't have to re-scan on the night. "Change key" (in Setup) is the deliberate way to cut phones off.

**Pre-night setup (all per event)**

- **Costumes belong to an event:** counts, colours, the leaderboard and the TV colour slots. Creating an event offers **"Copy costumes from: [event ▾]"**, which copies names, emoji, order and signature-sound assignments with zero counts. Costumes made live with "+ New" stay in their event and can be copied next year. Renaming is allowed any time. Deleting a costume that has kids makes those kids untagged, after a confirmation.
- **Race against:** a past event, or None. The ghost line is that event's cumulative count by time of day, interpolated linearly within each bucket and flat after its last bucket.
- **2025 is seeded on first install** from a config/JSON file holding the five buckets in [`data/2025-counts.md`](../data/2025-counts.md), as the counts-only past event "Halloween 2025 (counts)". There's **no counts-entry UI**. Events from 2026 onwards produce their ghost line from their own taps.
- **Clock shift** (for example +4h, default 0) moves the event's "now" for the ghost-line position, the chart's x-axis and the 7:45 "release remaining" offer. Tap timestamps are stored in real time, and the shift applies only when they're displayed or compared. The rehearsal uses it, so a 2pm rehearsal behaves like 6pm on Halloween.
- **Golden tickets:** the count defaults to 5. A **blind stratified draw at Go live** covers 10–80% of the Race-against event's total (about #35–#277 against 346), or of an **"Expected kids"** setting when there's no ghost. The range is split into N equal bands, with one random number per band. **Nobody sees the numbers, the family included.** Phones only get "NEXT KID IS GOLDEN". **"Add a ticket"** after Go live draws one number between (tonight's count + 5) and the top of the range. **"Release remaining"** makes the next K kids winners, where K is the number of tickets left. The rehearsal draws for real.
- **Visit window:** 15 s by default, copied with the costumes, changeable any time including live (visits are derived, so they just regroup). It's only in Setup, never at the door.

**Phone UI: two tiers**

- **Door menu**, a ☰ sheet over the counting screen, **open to any phone with the join key**:
  - the soundboard (6 buttons, 3 s cooldown)
  - the TV volume slider and the Ambience / Kid bloops / Everything mutes
  - **"Release remaining tickets"** (appears from 7:45 shifted time, with a confirmation; open to any helper)
  - the "Add a helper" QR
  - a link to Setup
- **Setup**, a separate `/setup` page, **behind an admin PIN** (4–6 digits, set in the server config, remembered on the phone once entered):
  - events: create, Go live, delete past events, change join key
  - costume presets: name, emoji, order, signature sound
  - the golden-ticket count and "Add a ticket"
  - Race against, Clock shift, Expected kids and Visit window

**Handed on:** a dev-only "bulk add N kids" route for rehearsing BEAT LAST YEAR without 347 taps. It overlaps with backfill, so it's noted on [Failure fallback](11-failure-fallback.md).
