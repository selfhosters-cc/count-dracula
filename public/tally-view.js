// The print tally sheet's read (spec v2.1 §7): /tally?event=<id> names its Event; a bare /tally is the door's.
export function tallySnapshotUrl(search) {
  const id = new URLSearchParams(search).get('event')
  return id ? `/api/snapshot?event=${encodeURIComponent(id)}` : '/api/snapshot'
}
