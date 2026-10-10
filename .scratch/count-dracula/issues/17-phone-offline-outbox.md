# Phone offline outbox and phone name

Type: build (AFK)
Status: done
Blocked by: 15

## What to build

Phones keep counting with no time limit when the Wi-Fi or server drops, and nothing is lost or doubled when it comes back. See [spec §3 "Taps: idempotent and offline-tolerant"](../spec.md#3-architecture-and-hosting), [§4](../spec.md#4-phone-counting-screen) and [§11](../spec.md#11-failure-handling).

- **First open:** "Who's tapping?" (Dad / Mom / Grandma / custom), stored on the phone and sent with every tap.
- **Outbox:** each tap generates a UUID built from `crypto.getRandomValues` (no `crypto.randomUUID`, service workers or Background Sync, because LAN phones use plain HTTP). The tap is saved to a localStorage outbox, the count updates optimistically, and the phone POSTs. It retries on a timer, on `online` and on `visibilitychange`, and drops entries once acknowledged.
- **Offline pill:** after ~5 s of failed sends, an amber "⏳ N waiting to send" pill appears and then clears with a brief "✓ sent". After ~2 minutes it adds "Server's down — keep tapping, don't reload."
- **Late taps:** the server flags any kid whose `received_at − tapped_at > 10 s` as a **late tap** and includes the flag in the delta, so the TV can treat it quietly later. Late kids are numbered when they land.
- The phone's local count stays right across the outbox and the SSE snapshot: it doesn't double-count its own queued kids once they arrive.

**Modules:** [Ledger](../modules.md#1-ledger-server), [Live state](../modules.md#4-live-state-phone--tv), [Outbox and door view](../modules.md#5-outbox-and-door-view-phone).

## Acceptance criteria

- [x] The phone name is asked once, persists across reloads and shows on stored kids
- [x] In airplane mode the phone keeps counting; the pill appears after ~5 s and the "Server's down" line after ~2 min
- [x] On reconnect the outbox drains, "✓ sent" shows, and the server count rises by exactly the number tapped
- [x] Killing the server mid-burst and restarting it loses and doubles nothing (the retries are idempotent)
- [x] Kids that arrive more than 10 s after being tapped are flagged late in storage and in the delta
- [x] Works over plain HTTP with no secure-context APIs
- [x] Tests cover outbox retry/ack and late-tap flagging
