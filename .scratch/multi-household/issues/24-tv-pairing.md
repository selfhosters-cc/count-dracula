# TV pairing code and QR

Type: build (AFK)
Status: ready-for-agent
Blocked by: 23

## What to build

A bare `/tv` shows a short code and a QR. A signed-in Manager redeems it to put their TV link on that screen. See [spec §9 The TV pairing code](../spec.md#9-shareable-tv).

**The TV side**

- A **bare `/tv`** with no stored link shows the pairing screen:
  - a **6-character code** from an alphabet with no lookalikes, shown as `K7Q-M4X`, valid **10 minutes** and then replaced
  - a **scan-to-pair QR** (vendored `public/vendor/qrcode`) that opens `/setup?pair=<code>`
  - *"On your phone, go to count-dracula.example.com/setup → Pair a TV, or scan this"* (with the real host filled in)
- When the code is redeemed, the waiting screen switches to the Household's TV link without a click. How it learns that is the builder's call ([spec §21](../spec.md#21-builders-latitude)).
- **A bare `/tv` remembers the TV link** it was paired to (`localStorage`) and goes straight to it on the next load. If the link has been rotated or the Household is gone, it clears the stored link and shows pairing again.
- **Paired devices are marked as paired** (for example a device token issued at pairing), so [ticket 28](28-caps-and-rate-limits.md) can exempt them from the per-Household viewer cap.

**The Manager side**

- **Pair a TV** in `/setup`: type the code, or arrive from the QR with it filled in. Confirm *"Show our TV here?"*.
- Redeeming needs a Manager session. An unknown or expired code says so and pairs nothing.

**Modules:** Accounts, Guard.

## Acceptance criteria

- [ ] A bare `/tv` shows a code from the no-lookalike alphabet and a QR to `/setup?pair=<code>`; the code changes after 10 minutes
- [ ] Redeeming it as a Manager switches the waiting screen to that Household's live board within a few seconds, without a click
- [ ] Without a session, redeeming fails; an expired or unknown code pairs nothing
- [ ] Reloading a paired `/tv` goes straight to the board; after Rotate, it clears the link and shows a new code
- [ ] A paired device is distinguishable from a TV-link viewer on the server
- [ ] Scanning the QR with a phone's camera app opens `/setup` with the code filled in (checked on a real phone)
- [ ] `bun test` passes
