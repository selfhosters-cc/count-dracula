import { describe, expect, test } from 'bun:test'
import { cellBounds, encodeGeohash, isCell } from './geohash.js'

describe('geohash', () => {
  test('encodes the reference point from the geohash definition', () => {
    // Wikipedia's worked example: 57.64911, 10.40744 → u4pruydqqvj
    expect(encodeGeohash(57.64911, 10.40744, 11)).toBe('u4pruydqqvj')
    expect(encodeGeohash(57.64911, 10.40744)).toBe('u4pru')
  })

  test('works worldwide: each point lies in its own cell, in every quadrant, and at the edges', () => {
    const cities = [[43.6532, -79.3832], [-33.8688, 151.2093], [-34.6037, -58.3816], [35.6762, 139.6503], [64.1466, -21.9426]]
    for (const [lat, lon] of cities) {
      const [[south, west], [north, east]] = cellBounds(encodeGeohash(lat, lon))
      expect(lat >= south && lat <= north && lon >= west && lon <= east).toBe(true)
    }
    expect(encodeGeohash(90, 180)).toBe('zzzzz')
    expect(encodeGeohash(-90, -180)).toBe('00000')
  })

  test("a cell's bounds hold its points and are about 4.9 × 4.9 km of degrees (0.0439°)", () => {
    const [[south, west], [north, east]] = cellBounds('u4pru')

    expect(south).toBeLessThanOrEqual(57.64911)
    expect(north).toBeGreaterThanOrEqual(57.64911)
    expect(west).toBeLessThanOrEqual(10.40744)
    expect(east).toBeGreaterThanOrEqual(10.40744)
    expect(north - south).toBeCloseTo(180 / 4096, 10)
    expect(east - west).toBeCloseTo(360 / 8192, 10)
  })

  test('only a 5-character geohash is a cell', () => {
    expect(isCell('dpz88')).toBe(true)
    for (const bad of ['dpz8', 'dpz88a', 'DPZ88', 'dpz8a', 'dpzi8', '43.65,-79.38', '', null, 12345, { cell: 'dpz88' }]) {
      expect(isCell(bad)).toBe(false)
    }
  })
})
