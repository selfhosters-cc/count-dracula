// A Household set up the way a v1 first install was: the counts-only ghost (when config.ghostSeed is
// given) and a live night named "Rehearsal" racing it, with golden tickets drawn and no costumes. The v1
// Ledger tests start here. Set up through one Ledger and handed back from a fresh one, so seq starts at 0.
// Every command names its Event (spec v2.1 §4): the Ledger handed back names that night for the test.
import { openLedger } from '../server/ledger.js'

export function setUpV1Night(ledger, { ghostSeed } = {}) {
  const id = ledger.createHousehold({ displayName: 'Test house', timeZone: 'America/Toronto' })
  const house = ledger.household(id)
  const starters = house.events() // sign-up's Test night and "Halloween 2026"
  const raceAgainstId = ghostSeed ? house.addPastCounts(ghostSeed) : null
  const [{ event }] = house.apply({ type: 'createEvent', name: 'Rehearsal' })
  house.apply({ type: 'settings', eventId: event.id, raceAgainstId })
  house.apply({ type: 'goLive', eventId: event.id })
  for (const starter of starters) {
    if (starter.state === 'live') house.apply({ type: 'end', eventId: starter.id, stamp: starter.wentLiveAt }) // a Live Event can't be deleted
    house.apply({ type: 'deleteEvent', eventId: starter.id, confirm: starter.name })
  }
  return id
}

export function openV1Night(db, config = {}) {
  const id = setUpV1Night(openLedger(db, config), config)
  return namingTheDoor(openLedger(db, config).household(id))
}

// A Household's Ledger whose commands name the door's Event for the test, as a door phone would: a command
// that doesn't name its own Event carries the door's Event's id and go-live stamp at that moment, and
// snapshot() and tickets() with no id read the door's Event.
export function namingTheDoor(house) {
  const door = () => house.doorEvent()
  return Object.assign(Object.create(house), {
    apply: (command) => house.apply({ eventId: door()?.id, stamp: door()?.wentLiveAt, ...command }),
    snapshot: (id = door()?.id) => house.snapshot(id),
    tickets: (id = door()?.id) => house.tickets(id),
  })
}

// What a door phone sends with every write: the Event it shows and the go-live stamp it saw.
export function named(house, eventId) {
  return { eventId, stamp: house.events().find((e) => e.id === eventId)?.wentLiveAt ?? null }
}

// The door's Event's board, as a phone or TV with no ?event= reads it.
export function doorSnapshot(house) {
  const door = house.doorEvent()
  return door ? house.snapshot(door.id) : house.idleSnapshot()
}

// What a Household's door phone names on every write right now: its door's Event and go-live stamp.
export function doorNamed(ledger, householdId) {
  const door = ledger.doorEvent(householdId)
  return { eventId: door?.id, stamp: door?.wentLiveAt }
}
