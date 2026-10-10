# Dress rehearsal plan

Type: grilling (HITL)
Status: resolved
Blocked by: 09, 10, 11

## Question

What exactly does the Oct 24 dress rehearsal exercise, and what does "pass" mean?

Inputs: the 11-step hardware checklist from Laptop kiosk setup, the rehearsal checks from Hosting and phone access (Wi-Fi at the door for each phone, both routes), celebration timing from the TV screen prototype, and the audio cut-off check from Sound design. Still to decide: the app scenarios to run (e.g. a burst of 10 kids from two phones at once, a phone going offline then reconnecting, a server restart mid-burst, a live costume with catch-up, a golden ticket, undo across phones), who plays which role, and the go/no-go criteria, including which Must features get dropped (from the bottom of the build order) if they aren't ready.

Also from [Failure fallback](11-failure-fallback.md): switch to the paper tally sheet once; backfill 340 kids with "Add missed kids", then tap live to #347 (BEAT LAST YEAR, with a golden roll-forward along the way); export the rehearsal event once to prove the CSV; confirm the Proxmox backup job includes the new LXC; add "don't reload the TV while the 🦇 chip is up" to the checklist. The server-restart-mid-burst scenario should show the phone ⏳ pill, the TV 🦇 chip and the quiet roll-up.

## Answer

Resolved 2026-10-10 by grilling.

**When and who**

- **Saturday Oct 24, in two parts.** **Part 1 at 3pm** with Clock shift +3h runs every app scenario in daylight, with time left to fix things before dark. **Part 2 at 6:30pm (dusk)** with shift 0 checks real conditions.
- **Operator:** runs `/setup` and the laptop, triggers the outages, does the backfills and the export.
- **Two door tappers on Google Pixels:** one on the **tailnet** route and one **LAN-only** on the helper's own phone, so both routes and the helper's real phone get tested. If only two adults are there, the operator also taps the second phone.
- **Porch audience:** the kids. They judge whether the pops, sound and 🦇 chip work from the porch (and from the sidewalk in Part 2), and call out "kid!" to pace the taps.

**Part 1 script (3pm, Clock shift +3h)**

The order matters: each step leaves the count where the next step needs it.

| # | Scenario | Proves |
|---|---|---|
| 0 | **Pre-flight:** [Laptop kiosk setup](03-laptop-kiosk-setup.md) checklist steps 1–5 (real laptop, cable, TV and spot on AC power; 1080p60 with the border fully visible; sound to the TV at OS volume 100%; launch command checked in `chrome://version`; "Start the night" leaves the AudioContext `running`). Print the tally sheet from `/setup` and tape it inside the door. Both phones join by QR and set their names. Check Wi-Fi strength at the door for each phone, with the door shut. | The Oct 31 setup works from cold |
| 1 | **The real setup flow:** create "Dress rehearsal", Copy costumes from, Clock shift +3h, 5 golden tickets, **Go live**. Phones and TV switch over without re-scanning. | Go live, frozen old event, join key carries over |
| 2 | **A few single kids.** | Kid pop (~1.5 s), bloop, number |
| 3 | **Burst:** 5 kids in 3 s from both phones (checklist step 6), FPS meter on (step 11). | Merged "WELCOME, KIDS #N–M!", rising bloops, no clipping or stutter |
| 4 | **Costumes:** tag taps, then "+ New" with catch-up of 3. | Leaderboard overtakes; "NEW COSTUME SPOTTED ×4"; total +1 |
| 5 | **Undo on phone A**, then **delete one of phone B's kids from Recent**. | Quiet tick-down; phone names in Recent |
| 6 | **One phone in airplane mode** taps an announced number of kids, then reconnects. | ⏳ pill, "✓ sent", one quiet roll-up |
| 7 | **Restart the service mid-burst.** Then **stop the LXC for 3 minutes** while both phones tap announced numbers. | systemd recovery; ⏳ pill plus "don't reload" line after 2 min; 🦇 chip after 20 s; idle teaser held; one quiet roll-up |
| 8 | **Paper fallback:** with the LXC down, close one phone's tab (it goes blank) and tally on paper for one slot. Bring the LXC back and enter the slot in **➕ Add missed kids**. Remove the batch once, then re-add it. | Tally sheet, backfill, batch removal |
| 9a | **Backfill to 30**, then tap live until a phone warns "NEXT KID IS GOLDEN" (first band is about #35–#83). | A normal golden win |
| 9b | **Backfill to ~200.** Usually tickets 2 and 3 roll forward, so the next live kids win back to back (any number of 1 or more still tests it). | Roll-forward; consecutive takeovers queue without stomping on each other |
| 9c | **Raise Clock shift** so the event's clock passes 7:45, press **Release remaining**, and the next kids win the rest. | Release remaining |
| 9d | **Backfill to 340**, then **tap live to #347**. | Skipped milestones, "BEAT LAST YEAR", ghost readout; recap golden cards show "rolled forward" |
| 10 | **Soundboard** (including the 3 s cooldown), then each mute toggle. | Cooldown, 🔇 chip |
| 11 | **Hands off for 45 s.** | Idle teaser |
| 12 | **🌙 End the night**, check the recap, undo it, then End again. | Recap; End is reversible |
| 13 | **⬇ Export event** and open the CSV. Check that the Proxmox backup job includes the new LXC. | Data safety |
| 14 | **Reload the TV** (step 8: sound recovers), then **unplug and replug HDMI** (step 10). | Display recovery |

**Part 2 (6:30pm, Clock shift 0)**

- Read the count, the pops and the leaderboard **from the sidewalk** at dusk.
- **Set porch volume** and the laptop's **system-volume ceiling**. Judge the ambience level.
- **10-minute idle, then one kid:** the sound plays in full, with no TV cut-off (checklist step 7, [Sound design](07-sound-design.md)).
- **Re-check Wi-Fi at the door with it shut**, in the evening.
- **Start the 60-minute idle test** (step 9: no dimming, screensaver, sleep or lock) and check it at about 7:50.
- Add to the kiosk checklist: **don't reload the TV while the 🦇 chip is up.**

**Pass criteria: two tiers**

**Blockers** must be fixed and that scenario re-run before Oct 31:

1. **No lost or doubled kids.** In steps 6–8 each tapper taps an **exact announced number**, and the TV rises by exactly that much. At the end, the TV count = the CSV's non-deleted rows = the recap total.
2. **Both routes write**: the tailnet Pixel and the LAN-only Pixel, from the porch with the door shut.
3. **Outages recover without a reload**: phones keep counting, the TV rolls up, and nothing needs a refresh.
4. **The Go live flow works cold**, with no manual database or terminal fixes.
5. **Readable and audible:** the count and the pop read from the sidewalk at dusk, and the bloop is heard on the porch.
6. **The 60-minute idle test passes.**
7. **The export opens, and the backup job includes the LXC.**

**Polish** gets tuned during the week without a re-run: pop and chip timing, volume and ambience level, sound choices, minor frame drops, wording.

**Re-test: Wed Oct 28, evening.** Only for failed blockers, and only their scenarios, in a fresh "Re-test" event (Copy from, then Go live, which runs the setup flow again).

**Cut rule**

- **Oct 24 at 3pm is the feature freeze.** Anything not built by then is cut for 2026. The week after is for fixes and polish only.
- **Core, never cut:** phones counting with the offline outbox, the live TV count with the kid pop (Must 1), the ghost race (Must 2), Add missed kids, Export, and Setup / Go live. **If the core still fails a blocker on Oct 28**, the night runs on **the paper tally sheet plus a Nov 1 backfill**. The TV becomes a bonus, not the count of record.
- **Must 3–9 each get an on/off switch in the server config file**, read at startup with no UI. A built feature that fails on Oct 24 and isn't fixed by Oct 28 is switched off, not debugged on Halloween.
- **Switch off whatever is broken, not strictly from the bottom.** "Drop from the bottom" ([Fun-features shortlist](04-fun-features-shortlist.md)) applies only to what's left unbuilt when time runs out before Oct 24.

**After the rehearsal**

- **Keep the "Dress rehearsal" and "Re-test" events until after Nov 1.**
- **Oct 30:** create "Halloween 2026" with Copy from, **Clock shift 0** and 5 golden tickets. **Go live on Oct 31 afternoon**, so the golden draw happens close to the night. Oct 31 pre-flight: the TV shows "Halloween 2026" and the event clock reads real time, since a leftover +3h shift would wreck the ghost race.
- **After the Nov 1 export, delete the rehearsal events**, so they never turn up in next year's Copy from or Race-against lists.
- **Results are recorded on a printed copy of this checklist:** one line per scenario with ☐ pass ☐ polish ☐ blocker and a notes column. Blockers become fix tasks for the week, not tracker tickets, since they're past the edge of the map.

**Handed on to [Assemble the v1 spec](13-assemble-the-v1-spec.md):** the rehearsal plan above, written as a printable checklist page; the config switches for Must 3–9 (in the build order and architecture sections); the Oct 30 / Oct 31 setup steps.

