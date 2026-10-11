// The Race against picker (spec v2.1 §7): a night there's something to race, that is one that's over (Ended or
// Past), imported (counts-only) or estimated, and never the Event itself. A pointer the Event already has is
// kept on offer (a reset Event is Upcoming again, but its racers keep pointing at it, per §6).
export const canRace = (event) => event.state === 'ended' || event.state === 'past' || !!event.countsOnly || !!event.estimated

export function raceChoices(events, editing) {
  return events.filter((e) => e.id !== editing.id && (canRace(e) || e.id === editing.raceAgainstId))
}
