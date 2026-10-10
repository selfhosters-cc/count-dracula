# Phone soundboard (Must #7)

Type: build (AFK)
Status: ready-for-agent
Blocked by: 26

## What to build

Six scare buttons in the ☰ menu that play on the TV, behind the Must #7 feature switch (off → soundboard hidden in ☰). See [spec §5](../spec.md#5-phone--door-menu), [§8](../spec.md#8-celebration-rules) and [§10 Soundboard](../spec.md#10-sound).

- **6 fixed slots** with labels and sound files from the server config file (3 homemade, 3 stock). Missing files fall back to generated sounds.
- Pressing a button plays it **on the TV straight away**, with a **3 s cooldown across all buttons and all phones**, enforced on the server.
- Each button has a TV visual, such as "MWAHAHAHA!" / "AWOOOOOO!" text with bats or wolves flying across. It **doesn't interrupt the celebration queue**.
- The soundboard **ducks the automatic sounds** and plays over everything **except the golden fanfare**, which nothing interrupts.

**Modules:** [Ledger](../modules.md#1-ledger-server), [Celebration director](../modules.md#6-celebration-director-tv), [Sound engine](../modules.md#7-sound-engine-tv).

## Acceptance criteria

- [x] All 6 buttons show their configured labels and play on the TV within a moment of the press
- [x] Mashing buttons from two phones plays at most one sound per 3 s
- [x] A soundboard press during a pop doesn't cut off or delay the pop
- [x] A press during the golden fanfare doesn't play
- [x] With the switch off, the soundboard is hidden in ☰
