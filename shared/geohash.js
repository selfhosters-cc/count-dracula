// Geohash (v2 spec §10): the Location picker snaps a point to a 5-character cell in the browser, so the
// exact point never leaves it. The server only checks that a cell is a cell.
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz'
const CELL_LENGTH = 5

export function encodeGeohash(lat, lon, length = CELL_LENGTH) {
  const lats = [-90, 90]
  const lons = [-180, 180]
  let hash = ''
  let bits = 0
  let value = 0
  let even = true // bits alternate, longitude first
  while (hash.length < length) {
    const range = even ? lons : lats
    const mid = (range[0] + range[1]) / 2
    const point = even ? lon : lat
    value = value * 2 + (point >= mid ? 1 : 0)
    if (point >= mid) range[0] = mid
    else range[1] = mid
    even = !even
    if (++bits === 5) {
      hash += BASE32[value]
      bits = 0
      value = 0
    }
  }
  return hash
}

// [[south, west], [north, east]]: the cell's box, which the picker shades (Leaflet's bounds order).
export function cellBounds(hash) {
  const lats = [-90, 90]
  const lons = [-180, 180]
  let even = true
  for (const c of hash) {
    const value = BASE32.indexOf(c)
    for (let bit = 4; bit >= 0; bit--) {
      const range = even ? lons : lats
      const mid = (range[0] + range[1]) / 2
      if ((value >> bit) & 1) range[0] = mid
      else range[1] = mid
      even = !even
    }
  }
  return [[lats[0], lons[0]], [lats[1], lons[1]]]
}

export function isCell(text) {
  return typeof text === 'string' && text.length === CELL_LENGTH && [...text].every((c) => BASE32.includes(c))
}
