# Count Dracula: dress rehearsal checklist

**Sat Oct 24, 2026.** Print this page and mark each line as you go. Full context: [Dress rehearsal plan](issues/12-dress-rehearsal-plan.md) and the [v1 spec](spec.md).

**Feature freeze: 3pm today.** Anything not built now is cut for 2026.

**Roles:**

- **Operator:** `/setup`, the laptop, outages, backfills, export.
- **Tapper A:** Pixel on the **tailnet** route.
- **Tapper B:** Pixel on the **LAN-only** route, using the helper's own phone. With only two adults, the operator taps phone B.
- **Porch audience:** the kids. They judge from the porch, call out "kid!", and watch from the sidewalk in Part 2.

**Mark each line:** **P** = pass, **Po** = polish (tune this week, no re-run), **B** = blocker (fix, then re-run on Wed Oct 28).

---

## Part 1: 3pm, Clock shift +3h

Run the steps in order: each leaves the count where the next needs it.

| # | Scenario | Look for | P | Po | B | Notes |
|---|---|---|---|---|---|---|
| 0a | Pre-flight hardware: the real laptop, cable, TV input and porch spot, on AC power | | ☐ | ☐ | ☐ | |
| 0b | 1080p @ 60 Hz; a test border is fully visible (TV on "Just Scan") | No overscan | ☐ | ☐ | ☐ | |
| 0c | Sound goes to the TV, OS volume 100%, audible on the porch | | ☐ | ☐ | ☐ | |
| 0d | Launch with the kiosk command; check `chrome://version` | Flags present | ☐ | ☐ | ☐ | |
| 0e | Click "Start the night" | AudioContext `running` | ☐ | ☐ | ☐ | |
| 0f | Print the tally sheet from `/setup` and tape it inside the door | | ☐ | ☐ | ☐ | |
| 0g | Both phones join by QR and set their names | | ☐ | ☐ | ☐ | |
| 0h | Wi-Fi strength at the door for each phone, **door shut** | | ☐ | ☐ | ☐ | |
| 1 | Create "Dress rehearsal": Copy costumes from, Clock shift +3h, 5 golden tickets, **Go live** | Phones and TV switch over without re-scanning; old event frozen | ☐ | ☐ | ☐ | |
| 2 | A few single kids | Pop ~1.5 s, bloop, number | ☐ | ☐ | ☐ | |
| 3 | **Burst:** 5 kids in 3 s from both phones, FPS meter on | "WELCOME, KIDS #N–M!", rising bloops, no clipping or stutter | ☐ | ☐ | ☐ | FPS: |
| 4 | Tag taps, then "+ New" with catch-up of 3 | Leaderboard overtakes; "NEW COSTUME SPOTTED ×4"; total +1 | ☐ | ☐ | ☐ | |
| 5 | Undo on phone A; delete one of phone B's kids from Recent | Quiet tick-down; phone names in Recent | ☐ | ☐ | ☐ | |
| 6 | Phone in airplane mode taps an **announced number** of kids, then reconnects | ⏳ pill, "✓ sent", one quiet roll-up; TV rises by exactly that number | ☐ | ☐ | ☐ | Tapped: ___ TV +___ |
| 7a | **Restart the service mid-burst** | systemd recovery, nothing lost | ☐ | ☐ | ☐ | |
| 7b | **Stop the LXC for 3 min**; both phones tap announced numbers | ⏳ pill, then "don't reload" after 2 min; 🦇 chip after 20 s; idle teaser held; one quiet roll-up; exact count | ☐ | ☐ | ☐ | A: ___ B: ___ TV +___ |
| 8 | **Paper fallback:** with the LXC down, close one phone's tab (blank) and tally one slot on paper. LXC back, then enter it in ➕ Add missed kids. Remove the batch, then re-add it | Exact count; batch removal works | ☐ | ☐ | ☐ | Tallied: ___ |
| 9a | Backfill to 30, then tap live until "NEXT KID IS GOLDEN" (first band ≈ #35–#83) | Normal golden win: phone buzz, gold takeover, gold pumpkin | ☐ | ☐ | ☐ | Won at # |
| 9b | Backfill to ~200 | Roll-forward: the next live kids win; takeovers queue without stomping | ☐ | ☐ | ☐ | Rolled: |
| 9c | Raise Clock shift past 7:45; ☰ **Release remaining** | The next kids win the rest | ☐ | ☐ | ☐ | |
| 9d | Backfill to 340, then **tap live to #347** | Skipped milestones; "BEAT LAST YEAR"; ghost readout; recap golden card shows "rolled forward" | ☐ | ☐ | ☐ | |
| 10 | Soundboard (try to beat the 3 s cooldown), then each mute toggle | Cooldown holds; 🔇 chip | ☐ | ☐ | ☐ | |
| 11 | Hands off for 45 s | Idle teaser, silent | ☐ | ☐ | ☐ | |
| 12 | 🌙 End the night, check the recap, Resume, End again | Recap correct; End is reversible | ☐ | ☐ | ☐ | |
| 13 | ⬇ Export event and open the CSV. Check the Proxmox backup job includes the new LXC | TV count = CSV non-deleted rows = recap total | ☐ | ☐ | ☐ | TV ___ CSV ___ Recap ___ |
| 14a | Reload the TV page | Sound recovers | ☐ | ☐ | ☐ | |
| 14b | Unplug and replug HDMI | Picture and audio route return | ☐ | ☐ | ☐ | |

---

## Part 2: 6:30pm dusk, Clock shift 0

| # | Check | Look for | P | Po | B | Notes |
|---|---|---|---|---|---|---|
| D1 | Read the count, pops and leaderboard **from the sidewalk** | Readable at dusk | ☐ | ☐ | ☐ | |
| D2 | Set porch volume and the laptop's **system-volume ceiling**; judge ambience level | | ☐ | ☐ | ☐ | Vol: |
| D3 | 10-minute idle, then one kid | Sound plays in full, no TV cut-off | ☐ | ☐ | ☐ | |
| D4 | Wi-Fi at the door, **door shut**, both phones | Both routes write | ☐ | ☐ | ☐ | |
| D5 | Start the **60-minute idle test**; check at ~7:50 | No dimming, screensaver, sleep or lock | ☐ | ☐ | ☐ | Started: |

---

## Blockers: fix and re-run before Oct 31

| # | Blocker | Scenarios | Met? |
|---|---|---|---|
| 1 | **No lost or doubled kids:** each announced number lands exactly; TV = CSV = recap | 6, 7, 8, 13 | ☐ |
| 2 | **Both routes write** (tailnet and LAN-only Pixels), porch, door shut | 0h, D4 | ☐ |
| 3 | **Outages recover without a reload** | 6, 7 | ☐ |
| 4 | **Go live works cold**, no manual database or terminal fixes | 1 | ☐ |
| 5 | **Readable and audible** from the sidewalk at dusk / on the porch | D1–D3 | ☐ |
| 6 | **60-minute idle test passes** | D5 | ☐ |
| 7 | **Export opens; backup job includes the LXC** | 13 | ☐ |

**Polish** (tune during the week, no re-run): pop and chip timing, volume and ambience, sound choices, minor frame drops, wording.

---

## After today

- **Wed Oct 28, evening:** re-test **failed blockers only**, and only their scenarios, in a fresh "Re-test" event (Copy from, then Go live).
- **A Must 3–9 feature that fails and isn't fixed by Oct 28 gets switched off** in the server config file, whichever one it is.
- **If the core still fails a blocker on Oct 28:** the night runs on the paper tally sheet plus a Nov 1 backfill. The TV is a bonus.
- **Kiosk rule:** don't reload the TV while the 🦇 chip is up.
- **Fri Oct 30:** create "Halloween 2026" (Copy from, **Clock shift 0**, 5 golden tickets, Race against 2025). Print a fresh tally sheet.
- **Sat Oct 31, afternoon:** Go live, then pre-flight: TV shows "Halloween 2026", **event clock = real time**, tally sheet taped up, "Start the night" clicked.
- **Keep the rehearsal events until after the Nov 1 export**, then delete them.

| Fix tasks from today | Owner | Done |
|---|---|---|
| | | ☐ |
| | | ☐ |
| | | ☐ |
| | | ☐ |
