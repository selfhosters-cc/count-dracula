// Live state (modules.md §4): one SSE stream, the snapshot, then deltas.
// The TV's "never celebrate a snapshot" rule is one check: cause === 'delta'.

const MAX_RETRY_MS = 5_000 // a random 0–5 s, so a server restart isn't met by every device at once
const STALE_MS = 35_000 // the server pings every 15 s: two missed means the link is dead, even if still "open"
const RESYNC = new Set(['event.switched', 'event.updated'])

// The server refusing the credential outright (a rotated TV link, a changed join key, a deleted or suspended
// Household) is told apart from a dropped link by asking for the snapshot: onRefused hears it, and the
// stream stops trying.
const REFUSED = new Set([401, 403, 404])

export function connectLive(url = '/api/stream') {
  const listeners = new Set()
  const refusedListeners = new Set()
  let source
  let disconnectedAt = Date.now()
  let lastHeard = Date.now()

  const live = {
    state: null,
    connected: false,
    get disconnectedFor() {
      return live.connected ? 0 : Date.now() - disconnectedAt
    },
    on(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    onRefused(listener) {
      refusedListeners.add(listener)
    },
  }

  function emit(cause, delta) {
    for (const listener of listeners) listener({ state: live.state, cause, delta })
  }

  function open() {
    source = new EventSource(url)
    lastHeard = Date.now()
    source.addEventListener('ping', () => (lastHeard = Date.now()))

    source.addEventListener('snapshot', (e) => {
      lastHeard = Date.now()
      live.state = JSON.parse(e.data)
      live.connected = true
      emit('snapshot')
    })

    source.addEventListener('delta', (e) => {
      lastHeard = Date.now()
      const delta = JSON.parse(e.data)
      if (!live.state || delta.seq <= live.state.seq) return
      if (delta.seq !== live.state.seq + 1) return reopen() // missed one: the new snapshot resyncs us
      if (RESYNC.has(delta.type)) return reopen() // Go live or new settings: take a fresh snapshot
      live.state = applyDelta(live.state, delta)
      if ('golden' in delta) live.state = { ...live.state, golden: delta.golden } // just the count and the banner flag
      emit('delta', delta)
    })

    source.addEventListener('error', async () => {
      if (live.connected) disconnectedAt = Date.now()
      live.connected = false
      emit('disconnected')
      // EventSource retries by itself (after the server's random `retry:`) unless the server answered with an error status.
      if (source.readyState !== EventSource.CLOSED) return
      if (await refused()) {
        live.refused = true
        for (const listener of refusedListeners) listener()
        return
      }
      setTimeout(reopen, Math.random() * MAX_RETRY_MS)
    })
  }

  async function refused() {
    try {
      return REFUSED.has((await fetch(url.replace('/api/stream', '/api/snapshot'))).status)
    } catch {
      return false // the server's unreachable: that's a dropped link, keep trying
    }
  }

  function reopen() {
    if (live.refused) return
    source.close()
    open()
  }

  // A Wi-Fi drop can leave the socket open but silent: treat that as disconnected and dial again.
  setInterval(() => {
    if (!live.connected || Date.now() - lastHeard < STALE_MS) return
    live.connected = false
    disconnectedAt = lastHeard
    emit('disconnected')
    reopen()
  }, 5_000)

  open()
  return live
}

function applyDelta(state, delta) {
  switch (delta.type) {
    case 'kid.added':
      return { ...state, seq: delta.seq, kids: [...state.kids, delta.kid] }
    case 'kid.removed':
      return { ...state, seq: delta.seq, kids: state.kids.filter((k) => k.id !== delta.kidId) }
    case 'kids.removed': {
      const ids = new Set(delta.kidIds)
      return { ...state, seq: delta.seq, kids: state.kids.filter((k) => !ids.has(k.id)) }
    }
    case 'kid.retagged': {
      const ids = new Set(delta.kidIds)
      const kids = state.kids.map((k) => (ids.has(k.id) ? { ...k, tagId: delta.tagId } : k))
      return { ...state, seq: delta.seq, kids }
    }
    case 'event.ended':
      return { ...state, seq: delta.seq, event: { ...state.event, ended: delta.ended }, recap: delta.recap }
    case 'mix.changed':
      return { ...state, seq: delta.seq, settings: { ...state.settings, mix: delta.mix } }
    case 'tag.added':
      return { ...state, seq: delta.seq, tags: [...state.tags, delta.tag] }
    case 'tag.updated':
      return { ...state, seq: delta.seq, tags: state.tags.map((t) => (t.id === delta.tag.id ? delta.tag : t)) }
    case 'tag.removed':
      return { ...state, seq: delta.seq, tags: state.tags.filter((t) => t.id !== delta.tagId) }
    default:
      return { ...state, seq: delta.seq }
  }
}
