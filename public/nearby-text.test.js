import { describe, expect, test } from 'bun:test'
import { phoneNearby, tvNearby } from './nearby-text.js'

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
})
