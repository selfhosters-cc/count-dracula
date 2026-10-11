# Per-Household live channels

Type: build (AFK)
Status: done
Blocked by: 17

## What to build

The SSE hub stops being global. That's required before any cap means anything, and it stops every TV getting every Household's kids. See [spec §15 Live connections](../spec.md#15-hosting-capacity-and-abuse) and the [Public exposure findings](03-public-exposure-limits.md).

- **One channel per Household, each with its own `seq`.** A delta goes only to its Household's streams. Live state's seq-gap resync keeps working per channel.
- **Drop viewers that stop reading** (`desiredSize` < 0). EventSource reconnects them to a fresh snapshot.
- Each stream records its **Household** and its **credential kind** (phone, paired TV, TV link). [Ticket 23](23-tv-link.md) uses the kind for the payload shape, and [ticket 28](28-caps-and-rate-limits.md) uses it for the caps.
- **Close streams by credential**, for Rotate TV link, Change join key and Suspend.
- **Count streams** per Household and kind, for `/operator`.
- Clients wait a random **0–5 s before reconnecting** (`public/live.js`), so a restart isn't one storm.
- The 15 s named `ping` stays.

**Modules:** [SSE hub](../../count-dracula/modules.md#2-sse-hub-server), [Live state](../../count-dracula/modules.md#4-live-state-phone--tv).

## Acceptance criteria

- [x] Household A's taps never reach Household B's streams
- [x] Each Household's `seq` runs 1, 2, 3 … with no gaps caused by other Households
- [x] A stream that stops reading is dropped, not buffered without limit (a test with a stalled reader)
- [x] Closing by credential closes exactly those streams
- [x] Per-Household, per-kind stream counts are right as streams open and close
- [x] Reconnects wait 0–5 s at random
- [x] `bun test` passes

## Notes from the build

- Hub interface: `attach(req, server, { householdId, kind, credential, snapshot })` with kind `phone` / `paired` / `tvLink`; `publish(householdId, deltas)`; `close({ householdId, credential? })` (no credential = the whole Household, for Suspend); `counts()` → `{ total, households: { id: { phone, paired, tvLink } } }`; `shutdown()`.
- Per-Household `seq` lives in the Ledger (ticket 17). A stream is dropped once 256 KB of frames sit unread.
- The snapshot frame carries `retry: <0–4999>`, which EventSource uses for its own reconnects; `live.js` also waits a random 0–5 s when the server answered with an error.
- Until ticket 22, every stream is attached as `phone` with its Household's join key as the credential (Household #1's without a key).
