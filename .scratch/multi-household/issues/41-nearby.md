# Nearby: the TV box, the phone strip and the site-wide fallback

Type: build (AFK)
Status: ready-for-agent
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

## Acceptance criteria

- [ ] 4 active Households in an Area show nothing; 5 show figures
- [ ] Rehearsals, Suspended Households and live nights with no kid in 30 minutes don't count
- [ ] Kid counts are multiples of 5; "under 5 kids" when the figure rounds to 0
- [ ] A costume counted in only 2 Households is never the top costume; nor is a blocklisted one; with none qualifying, the clause is left out
- [ ] Two Households in neighbouring cells across a 4-char boundary land in different Areas
- [ ] Figures change only on the 10-minute refresh (fake clock)
- [ ] The TV box and phone strip render the figures; below the minimum the TV shows nothing and the phone shows the site line (checked with the seed from [ticket 42](42-nearby-seed.md), or test data)
- [ ] The switch hides it everywhere
- [ ] A top costume of `<img src=x onerror=alert(1)>` (in 3 Households) renders as text
- [ ] `bun test` passes
