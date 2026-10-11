# The TV link

Type: build (AFK)
Status: done
Blocked by: 22

## What to build

Each Household gets one secret TV link that the porch and remote viewers share. The TV page always shows its board. See [spec §9](../spec.md#9-shareable-tv).

**The link**

- One long random token per Household, made at create Household (and by the migration for Household #1). The page is at `/tv/k/<token>`, and its snapshot and stream carry the same token.
- **Rotate TV link** in `/setup` (any Manager, with a confirm) makes a new token, **closes every stream** holding the old one, and those devices fall back to the pairing screen. ([Ticket 24](24-tv-pairing.md) builds that screen. Until then, a plain "This TV link has changed" is fine.)
- In `/setup`: the TV link with **Share** (`navigator.share`), **Copy** and a full-screen **QR**. That QR is never on the TV.
- **Use this screen as the TV** opens the TV link in the current browser.

**What a TV-link holder gets**

- The **live Event only**: board, ghost, idle teaser and recap. It follows Go live.
- **A TV-shaped payload:** the snapshot and deltas **leave out each kid's `phoneName`**. Everything else stays as the TV draws it. The join key is never sent.
- **The Household display name never shows on the TV.** The title stays "Count Dracula", or the Event name once ended.
- **Portrait phones** get a "turn your phone sideways" overlay.
- A refused link shows a neutral **"Not available"**. That's a rotated token, a deleted Household, or (from [ticket 31](31-bare-operator.md)) a Suspended one.

**Sound: the board always shows**

- When audio isn't running, the board renders with a corner pill: **"🔇 Click or press OK for sound"**. **Any click, touch or key** unlocks it.
- The full-screen **Start the night** shows only while no kid has been counted on the live Event **and** audio hasn't been unlocked on this page load.

**Modules:** Accounts, [SSE hub](../../count-dracula/modules.md#2-sse-hub-server), [Live state](../../count-dracula/modules.md#4-live-state-phone--tv).

## Acceptance criteria

- [x] A TV-link snapshot and its deltas have no `phoneName`; a join-key phone's still do
- [x] A TV-link holder can't read a past event, and follows Go live to the new live Event
- [x] Rotate closes every old-link stream at once; the old link then gets "Not available"; the new link works
- [x] Share, Copy and the full-screen QR work in `/setup` (checked in the browser); nothing on the TV shows the link
- [x] With a kid already counted, a reload shows the board with the 🔇 pill, and any key press brings sound back; before the first kid, Start the night shows
- [x] A costume named `<img src=x onerror=alert(1)>` renders as text on the TV
- [x] `bun test` passes

## Notes from the build

- The token is `households.tv_token` (32 random bytes, base64url; migration step 3 gives existing Households one). The page is `/tv/k/<token>`; its snapshot and stream read with `?key=<token>`, the same query shape as a phone's join key, so ticket 35's `?key=` mask covers both. A TV token never works in `X-Join-Key`, so it can't write.
- The hub takes a `shape` per stream; TV-link streams get `kind: 'tvLink'` and deltas without `kid.phoneName`.
- `live.js` tells a refused credential from a dropped link by asking for the snapshot after EventSource gives up (401/403/404), then calls `onRefused` and stops retrying. The TV shows "Not available"; ticket 24 can switch a bare `/tv` to pairing there.
- Sound: any `pointerdown` or `keydown` unlocks it. Start shows only when the live Event has no kids and sound hasn't been unlocked on this load; until the first snapshot the pill shows instead.
- A bare `/tv` still works on a Manager's session until ticket 24 gives it the pairing screen.
- Checked in the browser: costume `<img src=x onerror=…>` shows as text on the TV, no phone names in the page, the pill and a key press, Rotate turns an open TV to "Not available" within seconds, Copy and the full-screen QR in `/setup`, the portrait overlay at 390×800. Share (`navigator.share`) needs a real phone.
