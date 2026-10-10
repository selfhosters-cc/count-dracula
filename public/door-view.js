// doorView (modules.md §5): what the door phone shows, from the server's state plus this phone's outbox.
// Pure. Phone screens read through it, never from the snapshot or localStorage directly.
import { tagColour } from '../shared/night-maths.js'

const RECENT_ROWS = 10

// link: { connected } from the live stream.
export function doorView(liveState, outbox, link = { connected: true }) {
  if (!liveState) {
    return { total: null, untagged: null, tags: [], recent: [], undo: null, goldenBanner: false, catchUp: { max: 0, preview: () => [] } }
  }

  const outgoing = [...outbox.pending, ...outbox.unconfirmed]
  const removed = new Set(outgoing.filter((e) => e.type === 'remove').map((e) => e.kidId))
  const arrived = new Set(liveState.kids.map((k) => k.id))

  // Every kid this phone counts, in arrival order: the server's, then taps it doesn't have yet.
  const serverKids = liveState.kids.filter((k) => !removed.has(k.id))
  const queuedTaps = outgoing.filter((e) => e.type !== 'remove' && !arrived.has(e.id) && !removed.has(e.id))
  const everyKid = [...serverKids, ...queuedTaps]

  const counts = new Map(liveState.tags.map((t) => [t.id, 0]))
  let untagged = 0
  for (const k of everyKid) {
    if (counts.has(k.tagId)) counts.set(k.tagId, counts.get(k.tagId) + 1)
    else untagged++ // untagged, or a costume deleted while the tap was queued
  }

  const tags = [...liveState.tags]
    .sort((a, b) => a.order - b.order)
    .map((t) => ({ id: t.id, name: t.name, emoji: t.emoji, colour: tagColour(t.order), count: counts.get(t.id) }))

  const tagsById = new Map(liveState.tags.map((t) => [t.id, t]))
  const unsent = new Set(outbox.pending.map((e) => e.id))
  const row = (k) => {
    const tag = tagsById.get(k.tagId)
    return {
      id: k.id,
      number: k.number ?? null, // a tap the server hasn't numbered yet
      tag: tag ? { emoji: tag.emoji, name: tag.name } : null,
      phoneName: k.phoneName,
      tappedAt: k.tappedAt,
      teen: k.teen === true,
      queued: unsent.has(k.id),
      mine: outbox.mine.has(k.id),
    }
  }
  const recent = everyKid.slice(-RECENT_ROWS).reverse().map(row)
  // Undo takes this phone's latest kid that still counts. Phone names can repeat, so go by id.
  const latestMine = everyKid.findLast((k) => outbox.mine.has(k.id))

  return {
    total: everyKid.length,
    untagged,
    tags,
    recent,
    undo: latestMine ? row(latestMine) : null,
    // Only when this phone's count is the server's: connected, and nothing of ours in flight (spec §4).
    goldenBanner: !!(liveState.golden?.nextIsGolden && link.connected && !outbox.pending.length && !outbox.unconfirmed.length),
    catchUp: catchUpPreview(serverKids),
  }
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
