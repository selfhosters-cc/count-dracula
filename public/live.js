// Live state (modules.md §4): one SSE stream, the snapshot, then deltas.
// The TV's "never celebrate a snapshot" rule is one check: cause === 'delta'.

const RETRY_MS = 2_000
const RESYNC = new Set(['event.switched', 'event.updated'])

export function connectLive(url = '/api/stream') {
  const listeners = new Set()
  let source
  let disconnectedAt = Date.now()

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
  }

  function emit(cause, delta) {
    for (const listener of listeners) listener({ state: live.state, cause, delta })
  }

  function open() {
    source = new EventSource(url)

    source.addEventListener('snapshot', (e) => {
      live.state = JSON.parse(e.data)
      live.connected = true
      emit('snapshot')
    })

    source.addEventListener('delta', (e) => {
      const delta = JSON.parse(e.data)
      if (!live.state || delta.seq <= live.state.seq) return
      if (delta.seq !== live.state.seq + 1) return reopen() // missed one: the new snapshot resyncs us
      if (RESYNC.has(delta.type)) return reopen() // Go live or new settings: take a fresh snapshot
      live.state = applyDelta(live.state, delta)
      emit('delta', delta)
    })

    source.addEventListener('error', () => {
      if (live.connected) disconnectedAt = Date.now()
      live.connected = false
      emit('disconnected')
      // EventSource retries by itself unless the server answered with an error status.
      if (source.readyState === EventSource.CLOSED) setTimeout(reopen, RETRY_MS)
    })
  }

  function reopen() {
    source.close()
    open()
  }

  open()
  return live
}

function applyDelta(state, delta) {
  switch (delta.type) {
    case 'kid.added':
      return { ...state, seq: delta.seq, kids: [...state.kids, delta.kid] }
    case 'kid.removed':
      return { ...state, seq: delta.seq, kids: state.kids.filter((k) => k.id !== delta.kidId) }
    case 'kid.retagged': {
      const ids = new Set(delta.kidIds)
      const kids = state.kids.map((k) => (ids.has(k.id) ? { ...k, tagId: delta.tagId } : k))
      return { ...state, seq: delta.seq, kids }
    }
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
