# Nearby seed script and the ≥ 5 check

Type: build (AFK)
Status: done
Blocked by: 41

## What to build

A dev-box script that fills one Area with fake Households, so the ≥ 5 view can be seen before Halloween without fake Households on production. See [spec §18 Checked off production](../spec.md#18-launch-and-the-night-runbook).

- **`deploy/seed-nearby.js`** (or under `scripts/`). It **refuses** to run against the production DB path, or when `PUBLIC_HOST` is set in the environment.
- It makes **6 Households in one Area**, each with a live, non-Rehearsal Event, recent taps and costumes. It includes **a costume counted in only 2 Households** and **a blocklisted costume name** in 3.
- It forces a nearby refresh, or says how long to wait.
- The check, written into `deploy/RUNBOOK.md`: open one seeded Household's TV and phone. The box and strip show; the 2-Household costume and the blocklisted one never show as top costume.

## Acceptance criteria

- [x] The script seeds a scratch DB and refuses the production path
- [x] With the seed, the TV box and phone strip show Area figures; the two hidden costumes stay hidden (checked in the browser, with a screenshot in the ticket notes)
- [x] RUNBOOK has the steps

## Notes from the build

- `deploy/seed-nearby.js <scratch database>`: 6 Households in Area dpz8 (cells dpz83, dpz86, dpz8d, dpz89, dpz8f, dpz8g), each live on "Halloween 2026" with taps from the last 25 minutes. Witch is counted in all 6 (4 each), Bluey in 2 (20 each), and "Sh1t head" in 3 (30 each), written straight into `tags` since the app refuses it. It prints each house's TV link and phone link. It refuses `/var/lib/count-dracula/count-dracula.sqlite` and any run with `PUBLIC_HOST` set (both checked).
- The server refreshes nearby as it starts, so starting it on the seeded database is enough.
- **The check, 2026-10-11 (dev box):** house 1's TV showed "🏘️ NEAR YOU TONIGHT · ~155 kids in the last half hour · 6 houses counting · 🧙 Witch on top" under the rush meter, with the pumpkin patch still on screen; its phone showed "🏘️ Near you: ~155 kids in 30 min · 6 houses". Bluey and the blocklisted name never showed as top costume (they're in that house's own leaderboard, as they should be).
- `deploy/RUNBOOK.md` §5 has the steps.
