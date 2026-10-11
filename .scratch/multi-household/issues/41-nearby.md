# Nearby: the TV box, the phone strip and the site-wide fallback

Type: build (AFK)
Status: done
Blocked by: 19, 25, 29, 31

## What to build

Households with a Location see rounded, delayed totals for their Area. Without them, the phone falls back to the Site-wide total. See [spec §11](../spec.md#11-nearby-activity). Prototype: branch `prototype/nearby-activity` (`74e6187`), `public/nearby-prototype.js`, variant A.

**The figures** (a Nearby module; a pure function over the live Events, plus a timer)

- **Area** = the cell's 4-character parent.
- **Active Household:** a live, **non-Rehearsal**, non-Suspended Event with a kid in the **last 30 minutes**.
- **Per Area, with ≥ 5 active Households:**
  - kids in the last 30 minutes, **rounded to 5s**
  - houses counting
  - **top costume**: the most-counted name counted in **≥ 3 different Households**, case-insensitive and trimmed, and **not blocklisted** ([ticket 29](29-blocklist.md))
- **Site-wide:** Households with a live, non-Rehearsal Event right now, and their kids, rounded to 5s, shown only with ≥ 5 Households.
- **Refreshed every 10 minutes**, not per tap. Nothing about a single Household ever leaves the module.

**The surfaces**

- **TV:** a small **"🏘️ Near you tonight"** box under the rush meter: kids in the last half hour ("under 5 kids" when it rounds to 0) · houses counting · top costume. It doesn't render below the minimum or without a Location. TV-link viewers see the same. The pumpkin patch stays on screen.
- **Phone:** one line under the count, *"🏘️ Near you: ~90 kids in 30 min · 14 houses"*. Below the minimum, or without a Location, it shows *"🎃 Count Dracula tonight: 212 houses · ~3,140 kids"*. Below the site minimum, it's hidden.
- **Switch:** one Operator-wide switch in `config.json` turns nearby and the Site-wide total off everywhere (including [ticket 46](46-site-total-on-sign-up.md)'s line).

- **`/privacy` (from [ticket 33](33-privacy-page.md)):** add, under *What's public*: the Area figures (rounded, at least 5 Households) and the Site-wide total, never pointing at one Household. Left out until they exist.

## Acceptance criteria

- [x] 4 active Households in an Area show nothing; 5 show figures
- [x] Rehearsals, Suspended Households and live nights with no kid in 30 minutes don't count
- [x] Kid counts are multiples of 5; "under 5 kids" when the figure rounds to 0
- [x] A costume counted in only 2 Households is never the top costume; nor is a blocklisted one; with none qualifying, the clause is left out
- [x] Two Households in neighbouring cells across a 4-char boundary land in different Areas
- [x] Figures change only on the 10-minute refresh (fake clock)
- [x] The TV box and phone strip render the figures; below the minimum the TV shows nothing and the phone shows the site line (checked with the seed from [ticket 42](42-nearby-seed.md), or test data)
- [x] The switch hides it everywhere
- [x] A top costume of `<img src=x onerror=alert(1)>` (in 3 Households) renders as text
- [x] `bun test` passes

## Notes from the build

- **Nearby** (`server/nearby.js`): `computeNearby(nights, { isBlocked })` is the pure rule set (Active = live, non-Rehearsal, not Suspended, with a Location and a kid tapped in the last 30 minutes; ≥ 5 per Area; kids rounded to 5s; top costume from ≥ 3 Households, case-insensitive and trimmed, not blocklisted, shown in its most-counted spelling; the Site-wide total over every live non-Rehearsal, non-Suspended night, ≥ 5). `createNearby` holds the figures between refreshes.
- `ledger.nearbyNights(at)` gives each live night with its cell, kids, kids in the last 30 minutes, and costume counts.
- **Delivery:** the server refreshes at start and every 10 minutes, then sends each open channel a named `nearby` SSE event (no `id`, so live state's seq check ignores it). Snapshots carry `nearby: { area, site }` as of the last refresh, or `null` when switched off. A Household's own figures never leave the module: screens get only their Area's totals and the site's.
- **Words** in `public/nearby-text.js` (shared by TV and phone, tested). The TV box sits under the rush meter and only shows Area figures; the phone strip falls back to the site line. Both set `textContent`.
- **Switch:** `switches.nearby` (default on) turns off the figures and the Site-wide total everywhere; ticket 46's sign-up line should read the same switch.
- `/privacy` gained the line about Area figures and the site's totals under *What's public*.
- Checked in the browser with ticket 42's seed: the TV box ("~155 kids in the last half hour · 6 houses counting · 🧙 Witch on top") and the phone strip; Bluey (2 Households) and the blocklisted name never shown as top. Screenshots taken on the dev box (`.playwright-mcp/nearby-tv.png`, `nearby-phone.png`, not committed).
