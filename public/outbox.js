// Outbox (modules.md §5): every tap is saved locally first, then sent until the server acknowledges it.
// send, storage and clock are injected: fetch/localStorage/Date in the page, fakes in tests.

const STORAGE_KEY = 'cd.outbox'
const MINE_KEY = 'cd.mine'
const MINE_KEPT = 300 // far more than one phone could need to undo in a night
const RETRY_MS = 2_000
const WAITING_AFTER_MS = 5_000 // the amber "⏳ N waiting to send" pill
const DOWN_AFTER_MS = 120_000 // "Server's down — keep tapping, don't reload."
const SENT_FLASH_MS = 2_000 // "✓ sent"

export function createOutbox({ send, storage, clock, phoneName }) {
  let pending = load(STORAGE_KEY)
  let mine = load(MINE_KEY)
  // Acked by the server but not yet seen in the live state (e.g. while the stream reconnects).
  let unconfirmed = []
  // What the live state showed last, and every kid it has shown: the server publishes a tap's kid.added before it
  // answers the POST, so the stream can show a tap (or drop a removed kid) while its POST is still in flight.
  let shown = new Set()
  const everShown = new Set()
  let sending = false
  let inFlightId = null // the entry being POSTed right now: it may already have reached the server
  let retryTimer = null
  let sentUntil = 0
  // Taps carried over from before a reload count as waiting from the reload, not from their tap.
  const loadedAt = clock.now()

  function load(key) {
    try {
      return JSON.parse(storage.getItem(key)) ?? []
    } catch {
      return []
    }
  }

  function save() {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(pending))
      storage.setItem(MINE_KEY, JSON.stringify(mine))
    } catch {}
  }

  function claim(kidId) {
    mine = [...mine, kidId].slice(-MINE_KEPT)
    save()
  }

  // Sends one entry at a time, oldest first, so the server numbers them in tap order.
  async function flush() {
    if (sending) return
    sending = true
    clock.clearTimeout(retryTimer)
    try {
      while (pending.length) {
        const entry = pending[0]
        inFlightId = entry.id
        await send(entry)
        const wasShowingPill = waitingFor() >= WAITING_AFTER_MS
        pending = pending.filter((e) => e.id !== entry.id)
        if (!settledBy(entry, shown)) unconfirmed = [...unconfirmed, { entry, ackedAt: clock.now() }]
        save()
        if (!pending.length && wasShowingPill) sentUntil = clock.now() + SENT_FLASH_MS
      }
    } catch {
      retryTimer = clock.setTimeout(flush, RETRY_MS)
    } finally {
      sending = false
      inFlightId = null
    }
  }

  // A tap is settled once the state shows its kid; a removal once the state, having shown the kid, stops showing it.
  function settledBy(entry, seen) {
    return entry.type === 'remove' ? everShown.has(entry.kidId) && !seen.has(entry.kidId) : seen.has(entry.id)
  }

  // How long the oldest unacknowledged tap has been waiting.
  function waitingFor() {
    if (!pending.length) return 0
    return clock.now() - Math.max(pending[0].tappedAt ?? pending[0].queuedAt, loadedAt)
  }

  flush()

  return {
    get pending() {
      return pending
    },

    // Ids of the kids this phone added: what Undo walks back through.
    get mine() {
      return new Set(mine)
    },

    // A kid this phone added outside the outbox (the catch-up kid at the door).
    claim,

    get unconfirmed() {
      return unconfirmed.map((u) => u.entry)
    },

    // Feed it every live-state update. A tap is confirmed once the state shows its kid, a removal
    // once the state stops showing it, and anything acked before a snapshot arrived is reflected in it.
    sync({ cause, state }) {
      if (!state) return
      shown = new Set(state.kids.map((k) => k.id))
      for (const id of shown) everShown.add(id)
      const now = clock.now()
      const settled = ({ entry }) => (entry.type === 'remove' ? !shown.has(entry.kidId) : shown.has(entry.id))
      unconfirmed = unconfirmed.filter((u) => !settled(u) && !(cause === 'snapshot' && u.ackedAt < now))
    },

    // 'ok' | { waiting: n } | { down: n } | 'sent'
    get status() {
      const waited = waitingFor()
      if (waited >= DOWN_AFTER_MS) return { down: pending.length }
      if (waited >= WAITING_AFTER_MS) return { waiting: pending.length }
      if (!pending.length && clock.now() < sentUntil) return 'sent'
      return 'ok'
    },

    // { teen: true }: counted, but can't win a golden ticket. night: { eventId, stamp }, the Event the phone
    // shows and its go-live stamp (spec v2.1 §4): the entry keeps them, so it lands there or is refused.
    tap(tagId, { teen = false, night = {} } = {}) {
      const entry = { id: uuid(), tagId: tagId ?? null, tappedAt: clock.now(), phoneName, ...(teen && { teen: true }), ...night }
      pending = [...pending, entry]
      claim(entry.id)
      flush()
      return entry
    },

    // Undo and Recent's ✕. An unsent tap is simply dropped, so it never gets a number;
    // anything the server may have is removed by a queued (idempotent) soft delete.
    remove(kidId, night = {}) {
      const tap = pending.find((e) => e.id === kidId && e.type !== 'remove')
      if (tap && tap.id !== inFlightId) {
        pending = pending.filter((e) => e !== tap)
        save()
        return { local: tap }
      }
      pending = [...pending, { type: 'remove', id: uuid(), kidId, queuedAt: clock.now(), ...night }]
      save()
      flush()
      return { server: kidId }
    },

    // For the page's `online` and `visibilitychange` handlers.
    retryNow() {
      flush()
    },
  }
}

// Plain HTTP on the LAN: no crypto.randomUUID, so build a v4 UUID from getRandomValues.
export function uuid() {
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
