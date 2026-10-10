// Outbox (modules.md §5): every tap is saved locally first, then sent until the server acknowledges it.
// send, storage and clock are injected: fetch/localStorage/Date in the page, fakes in tests.

const STORAGE_KEY = 'cd.outbox'
const RETRY_MS = 2_000
const WAITING_AFTER_MS = 5_000 // the amber "⏳ N waiting to send" pill
const DOWN_AFTER_MS = 120_000 // "Server's down — keep tapping, don't reload."
const SENT_FLASH_MS = 2_000 // "✓ sent"

export function createOutbox({ send, storage, clock, phoneName }) {
  let pending = load()
  // Acked by the server but not yet seen in the live state (e.g. while the stream reconnects).
  let unconfirmed = []
  let sending = false
  let retryTimer = null
  let sentUntil = 0
  // Taps carried over from before a reload count as waiting from the reload, not from their tap.
  const loadedAt = clock.now()

  function load() {
    try {
      return JSON.parse(storage.getItem(STORAGE_KEY)) ?? []
    } catch {
      return []
    }
  }

  function save() {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(pending))
    } catch {}
  }

  // Sends one entry at a time, oldest first, so the server numbers them in tap order.
  async function flush() {
    if (sending) return
    sending = true
    clock.clearTimeout(retryTimer)
    try {
      while (pending.length) {
        const entry = pending[0]
        await send(entry)
        const wasShowingPill = waitingFor() >= WAITING_AFTER_MS
        pending = pending.filter((e) => e.id !== entry.id)
        unconfirmed = [...unconfirmed, { entry, ackedAt: clock.now() }]
        save()
        if (!pending.length && wasShowingPill) sentUntil = clock.now() + SENT_FLASH_MS
      }
    } catch {
      retryTimer = clock.setTimeout(flush, RETRY_MS)
    } finally {
      sending = false
    }
  }

  // How long the oldest unacknowledged tap has been waiting.
  function waitingFor() {
    if (!pending.length) return 0
    return clock.now() - Math.max(pending[0].tappedAt, loadedAt)
  }

  flush()

  return {
    get pending() {
      return pending
    },

    get unconfirmed() {
      return unconfirmed.map((u) => u.entry)
    },

    // Feed it every live-state update. A kid the state shows is confirmed, and so is any tap
    // acked before a snapshot arrived: that snapshot already reflects it (or its removal).
    sync({ cause, state }) {
      if (!state) return
      const seen = new Set(state.kids.map((k) => k.id))
      const now = clock.now()
      unconfirmed = unconfirmed.filter(
        (u) => !seen.has(u.entry.id) && !(cause === 'snapshot' && u.ackedAt < now),
      )
    },

    // 'ok' | { waiting: n } | { down: n } | 'sent'
    get status() {
      const waited = waitingFor()
      if (waited >= DOWN_AFTER_MS) return { down: pending.length }
      if (waited >= WAITING_AFTER_MS) return { waiting: pending.length }
      if (!pending.length && clock.now() < sentUntil) return 'sent'
      return 'ok'
    },

    tap(tagId) {
      const entry = { id: uuid(), tagId: tagId ?? null, tappedAt: clock.now(), phoneName }
      pending = [...pending, entry]
      save()
      flush()
      return entry
    },

    // For the page's `online` and `visibilitychange` handlers.
    retryNow() {
      flush()
    },
  }
}

// Plain HTTP on the LAN: no crypto.randomUUID, so build a v4 UUID from getRandomValues.
function uuid() {
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
