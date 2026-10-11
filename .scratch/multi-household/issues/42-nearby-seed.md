# Nearby seed script and the ≥ 5 check

Type: build (AFK)
Status: ready-for-agent
Blocked by: 41

## What to build

A dev-box script that fills one Area with fake Households, so the ≥ 5 view can be seen before Halloween without fake Households on production. See [spec §18 Checked off production](../spec.md#18-launch-and-the-night-runbook).

- **`deploy/seed-nearby.js`** (or under `scripts/`). It **refuses** to run against the production DB path, or when `PUBLIC_HOST` is set in the environment.
- It makes **6 Households in one Area**, each with a live, non-Rehearsal Event, recent taps and costumes. It includes **a costume counted in only 2 Households** and **a blocklisted costume name** in 3.
- It forces a nearby refresh, or says how long to wait.
- The check, written into `deploy/RUNBOOK.md`: open one seeded Household's TV and phone. The box and strip show; the 2-Household costume and the blocklisted one never show as top costume.

## Acceptance criteria

- [ ] The script seeds a scratch DB and refuses the production path
- [ ] With the seed, the TV box and phone strip show Area figures; the two hidden costumes stay hidden (checked in the browser, with a screenshot in the ticket notes)
- [ ] RUNBOOK has the steps
