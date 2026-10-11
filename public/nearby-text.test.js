import { describe, expect, test } from 'bun:test'
import { homeSiteLine, phoneNearby, tvNearby } from './nearby-text.js'

const area = { houses: 14, kids30: 90, topCostume: { name: 'Witch', emoji: '🧙' } }
const site = { houses: 212, kids: 3140 }

describe('nearby words', () => {
  test('the TV box: the Area, or nothing at all', () => {
    expect(tvNearby({ area, site })).toBe('~90 kids in the last half hour · 14 houses counting · 🧙 Witch on top')
    expect(tvNearby({ area: { ...area, kids30: 0, topCostume: null }, site })).toBe('under 5 kids in the last half hour · 14 houses counting')
    expect(tvNearby({ area: null, site })).toBeNull()
    expect(tvNearby(null)).toBeNull()
  })

  test('the phone strip: the Area, else the Site-wide total, else hidden', () => {
    expect(phoneNearby({ area, site })).toBe('🏘️ Near you: ~90 kids in 30 min · 14 houses')
    expect(phoneNearby({ area: null, site })).toBe('🎃 Count Dracula tonight: 212 houses · ~3,140 kids')
    expect(phoneNearby({ area: null, site: { ...site, topCostume: { name: 'Witch', emoji: '🧙' } } })).toBe('🎃 Count Dracula tonight: 212 houses · ~3,140 kids · top costume: 🧙 Witch')
    expect(phoneNearby({ area: null, site: null })).toBeNull()
    expect(phoneNearby(null)).toBeNull()
  })

  test('with no minimum crowd, one house is one house', () => {
    const one = { houses: 1, kids30: 5, topCostume: null }
    expect(tvNearby({ area: one, site })).toBe('~5 kids in the last half hour · 1 house counting')
    expect(phoneNearby({ area: one, site })).toBe('🏘️ Near you: ~5 kids in 30 min · 1 house')
    expect(phoneNearby({ area: { ...one, houses: 2 }, site })).toBe('🏘️ Near you: ~5 kids in 30 min · 2 houses')
  })
})

describe("the homepage's site-wide line (spec v2.1 §11)", () => {
  const witch = { ...site, topCostume: { name: 'Witch', emoji: '🧙' } }

  test('"Counting now" while a counted night is Live', () => {
    expect(homeSiteLine({ site: witch, live: true })).toEqual({ lead: '🎃 Counting now', rest: ' on Count Dracula: 212 houses · ~3,140 kids · top costume: 🧙 Witch' })
    expect(homeSiteLine({ site, live: true })).toEqual({ lead: '🎃 Counting now', rest: ' on Count Dracula: 212 houses · ~3,140 kids' })
  })

  test('"Last night" once every counted night has Ended', () => {
    expect(homeSiteLine({ site: witch, live: false })).toEqual({ lead: '🌙 Last night', rest: ' on Count Dracula: 212 houses · ~3,140 kids · top costume: 🧙 Witch' })
  })

  test('nothing below 5 Households, with the switch off, or with no answer', () => {
    expect(homeSiteLine({ site: null, live: false })).toBeNull()
    expect(homeSiteLine(null)).toBeNull()
  })
})
