# Milestones and Beat last year (Must #3)

Type: build (AFK)
Status: ready-for-agent
Blocked by: 21, 25

## What to build

The big moments on the TV, behind the Must #3 feature switch (off → plain pops). See [spec §8](../spec.md#8-celebration-rules) and [§10](../spec.md#10-sound).

- **Every 50th:** a bigger white chip "MILESTONE #150! 🎉" with emoji confetti (`shapeFromText`), ~3 s, and a cartoon organ sting.
- **#100 / #200 / #300:** a full-screen takeover with a Creepster headline and emoji confetti, 5–6 s, and a full fanfare plus a spooky flourish.
- **Beat last year** (the Race-against total + 1, for example #347): a full-screen takeover with the fanfare. It's absent when Race against is None.
- Milestones go into the priority queue and **never merge into a pop**. Celebrations duck the ambience.
- **Once per event:** a **fired moments** table records each milestone and Beat last year, which fire at most once, the first time they're crossed live. After an undo the re-crossing kid gets an ordinary pop. The hero readout can still flip back and forth.
- **Late taps:** milestones crossed by late taps are **skipped for good**. Beat last year crossed by late taps fires on the **next live tap** as "WE BEAT LAST YEAR! 🏆", without a kid number.

## Acceptance criteria

- [ ] Kid #50 shows the milestone chip, #100 a takeover, #347 (against 2025) the Beat-last-year takeover
- [ ] Undoing #100 and tapping again gives an ordinary pop
- [ ] Backfilling past #150 skips that milestone; backfilling past 346 makes the next live tap fire "WE BEAT LAST YEAR! 🏆"
- [ ] Two takeovers due back to back play one after the other without overlapping
- [ ] With the switch off, every kid gets a plain pop
- [ ] The fired-moment logic (once-only, late skip, deferred beat) is unit-tested on the server
