// doorView (modules.md §5): what the door phone shows, from the server's state plus this phone's outbox.
// Pure. Phone screens read through it, never from the snapshot or localStorage directly.

export function doorView(liveState, outbox) {
  if (!liveState) return { total: null }
  const arrived = new Set(liveState.kids.map((k) => k.id))
  const queued = [...outbox.pending, ...outbox.unconfirmed].filter((e) => !arrived.has(e.id))
  return { total: liveState.kids.length + queued.length }
}
