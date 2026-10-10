# TV Scoreboard frame and kid pop (Must #1)

Type: build (AFK)
Status: ready-for-agent
Blocked by: 15

## What to build

The porch TV becomes the real **Layout A "Scoreboard"** at 1080p, celebrating each kid live. See [spec §7](../spec.md#7-tv-screen) and [§8](../spec.md#8-celebration-rules). Use the prototype on branch `prototype/tv-screen` (commit `1d78274`, `prototypes/tv-screen/`) as the visual reference.

- **The frame:** a top bar (title and the event-time clock), a left-third hero ("KIDS TONIGHT" and a giant count), and empty slots for the race chart, leaderboard and pumpkin patch that later tickets fill. Keep key content off the outer ~5%.
- **Vendored locally, no CDN, no build step:** the Bungee, Fredoka and Creepster fonts, Motion and canvas-confetti, as plain ES modules.
- **Kid pop:** an orange "YOU'RE KID #N!" chip with small confetti, ~1.5 s. Kids arriving inside the pop's window **merge** into "WELCOME, KIDS #N–M!", capped at ~3 s.
- **Celebration queue:** a priority queue (golden > beat last year > every 100th > every 50th > pop) that later tickets plug into. Takeovers queue without stomping on each other.
- **Snapshots never celebrate**, only deltas.
- **Late taps** (flagged by the server) never celebrate: the count quietly ticks up, or does one roll-up for a backlog.
- **Disconnected:** the Scoreboard stays frozen with no error screen, spinner or red. After 20 s a small decorative "🦇 catching up…" chip appears in a corner. On reconnect the TV takes the snapshot, does one quiet ~2 s roll-up to the new total, and the chip goes away.

The TV's sound comes in the sound engine ticket; this one is visual only.

**Modules:** [Celebration director](../modules.md#6-celebration-director-tv), [Live state](../modules.md#4-live-state-phone--tv).

## Acceptance criteria

- [ ] At 1920×1080 the layout matches the prototype's Scoreboard frame
- [ ] A single tap shows the pop with the server-assigned number, and a burst of 5 in 3 s shows one merged pop
- [ ] Opening or reloading the TV with kids already stored shows the count with no pop
- [ ] A batch of late taps produces a quiet roll-up and no chips
- [ ] Stopping the server freezes the screen, the 🦇 chip appears after 20 s, and recovery does one quiet roll-up to the exact total
- [ ] Nothing is loaded from a CDN (check in devtools)
- [ ] The queue is unit-tested for priority ordering and merging
