// A Household set up the way a v1 first install was: the counts-only ghost (when config.ghostSeed is
// given) and a live "Rehearsal" racing it, with golden tickets drawn and no costumes. The v1 Ledger
// tests start here. Set up through one Ledger and handed back from a fresh one, so seq starts at 0.
import { openLedger } from '../server/ledger.js'

export function setUpV1Night(ledger, { ghostSeed } = {}) {
  const id = ledger.createHousehold({ displayName: 'Test house', timeZone: 'America/Toronto' })
  const house = ledger.household(id)
  const starter = house.snapshot().event.id
  const raceAgainstId = ghostSeed ? house.addPastCounts(ghostSeed) : null
  const [{ event }] = house.apply({ type: 'createEvent', name: 'Rehearsal' })
  house.apply({ type: 'settings', eventId: event.id, raceAgainstId })
  house.apply({ type: 'goLive', eventId: event.id })
  house.apply({ type: 'deleteEvent', eventId: starter, confirm: 'Rehearsal' })
  return id
}

export function openV1Night(db, config = {}) {
  const id = setUpV1Night(openLedger(db, config), config)
  return openLedger(db, config).household(id)
}
