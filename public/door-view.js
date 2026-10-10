// doorView (modules.md §5): what the door phone shows, from the server's state plus this phone's outbox.
// Pure. Phone screens read through it, never from the snapshot or localStorage directly.
import { tagColour } from '../shared/night-maths.js'

export function doorView(liveState, outbox) {
  if (!liveState) return { total: null, untagged: null, tags: [], catchUp: { max: 0, preview: () => [] } }

  const arrived = new Set(liveState.kids.map((k) => k.id))
  const queued = [...outbox.pending, ...outbox.unconfirmed].filter((e) => !arrived.has(e.id))
  const everyKid = [...liveState.kids, ...queued]

  const counts = new Map(liveState.tags.map((t) => [t.id, 0]))
  let untagged = 0
  for (const k of everyKid) {
    if (counts.has(k.tagId)) counts.set(k.tagId, counts.get(k.tagId) + 1)
    else untagged++ // untagged, or a costume deleted while the tap was queued
  }

  const tags = [...liveState.tags]
    .sort((a, b) => a.order - b.order)
    .map((t) => ({ id: t.id, name: t.name, emoji: t.emoji, colour: tagColour(t.order), count: counts.get(t.id) }))

  return { total: everyKid.length, untagged, tags, catchUp: catchUpPreview(liveState.kids) }
}

// Picks the kids the server will re-tag: the most recently *tapped* untagged ones it has
// (ties go to the later arrival). Queued taps aren't candidates: "+ New" needs an empty outbox.
function catchUpPreview(serverKids) {
  const candidates = serverKids
    .map((k, arrival) => ({ ...k, arrival }))
    .filter((k) => k.tagId == null)
    .sort((a, b) => b.tappedAt - a.tappedAt || b.arrival - a.arrival)
  return {
    max: candidates.length,
    preview: (n) =>
      candidates
        .slice(0, n)
        .map((k) => k.number)
        .sort((a, b) => a - b),
  }
}
