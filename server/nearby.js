// Nearby (v2 spec §11, v2.1 §10): rounded, delayed totals for each Area, and the Site-wide total. Computed every
// 10 minutes over each Household's door's Event, never per tap. Nothing about a single Household leaves this
// module except as part of an Area's or the site's totals. There's no minimum crowd: a Household sees its
// window's figures once one other Active Household is in it (the accepted risk in spec v2.1 §10). The window
// is every Area its cell or the 8 cells around it fall in (1, 2 or 4), so an Area edge doesn't split a town.
const MIN_SITE_HOUSEHOLDS = 5
const MIN_COSTUME_HOUSEHOLDS = 3
const REFRESH_MS = 10 * 60_000

const round5 = (n) => Math.round(n / 5) * 5

// nights: [{ householdId, cell, suspended, live, kids, kids30, costumes: [{ name, emoji, count }] }], one per
// Household: its door's Event (`live`: it's Live, not Ended). Returns { areas: Map(area → { houses, kids30,
// topCostume }), active: Map(area → Set of household ids), site: { houses, kids, topCostume? } | null, live,
// window(areas) }. An Area is in `areas` with one Active Household or more; nearYou() decides who sees it.
// window(areas) adds up a set of Areas (kids summed, then rounded; costume counts merged), cached per set.
// `live` is whether any counted door's Event is Live, and false while the site line is hidden.
// siteTopCostume adds the site line's top costume, under its own switch (spec §14).
export function computeNearby(nights, { isBlocked, siteTopCostume = false }) {
  const counting = nights.filter((n) => !n.suspended)
  const byArea = new Map()
  for (const n of counting) {
    if (!n.cell || n.kids30 < 1) continue // an Active Household: a kid in the last 30 minutes
    const area = n.cell.slice(0, 4)
    if (!byArea.has(area)) byArea.set(area, [])
    byArea.get(area).push(n)
  }
  const areas = new Map()
  const activeIn = new Map()
  const figuresOf = (active) => ({
    houses: active.length,
    kids30: round5(active.reduce((sum, n) => sum + n.kids30, 0)),
    topCostume: topCostume(active, isBlocked),
  })
  for (const [area, active] of byArea) {
    activeIn.set(area, new Set(active.map((n) => n.householdId)))
    areas.set(area, figuresOf(active))
  }
  // A window's figures: its Areas' Active Households together (Areas don't overlap, so each is counted once).
  const windows = new Map() // "area,area" → figures
  const window = (list) => {
    const key = [...list].sort().join(',')
    if (!windows.has(key)) windows.set(key, figuresOf(list.flatMap((a) => byArea.get(a) ?? [])))
    return windows.get(key)
  }
  const site =
    counting.length >= MIN_SITE_HOUSEHOLDS ? { houses: counting.length, kids: round5(counting.reduce((sum, n) => sum + n.kids, 0)) } : null
  if (site && siteTopCostume) site.topCostume = topCostume(counting, isBlocked)
  return { areas, active: activeIn, site, live: !!site && counting.some((n) => n.live), window }
}

// One Household's "near you": its window's figures once at least one Active Household other than itself is in
// it, else null. Its own night is in the figures when it's Active too. Without a Location, null. With edges off
// (the nearbyEdges switch), the window is its own Area alone.
export function nearYou(figures, householdId, cell, { edges = true } = {}) {
  if (!cell) return null
  const list = edges ? windowAreas(cell) : [cell.slice(0, 4)]
  const others = list.some((a) => [...(figures.active.get(a) ?? [])].some((id) => id !== householdId))
  return others ? figures.window(list) : null
}

// Geohash (no dependency). A 5-character cell is 3 longitude bits by 2 latitude bits finer than its Area, so an
// Area holds 8 × 4 cells.
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz'

function decode(hash) {
  const lat = [-90, 90]
  const lon = [-180, 180]
  let even = true // bits alternate, longitude first
  for (const c of hash) {
    const v = BASE32.indexOf(c)
    if (v < 0) throw new Error(`not a geohash: ${hash}`)
    for (let bit = 4; bit >= 0; bit--) {
      const range = even ? lon : lat
      range[(v >> bit) & 1 ? 0 : 1] = (range[0] + range[1]) / 2
      even = !even
    }
  }
  return { lat, lon }
}

function encode(lat, lon, length) {
  const range = { lat: [-90, 90], lon: [-180, 180] }
  let hash = ''
  let even = true
  for (let i = 0; i < length; i++) {
    let v = 0
    for (let bit = 0; bit < 5; bit++) {
      const [r, x] = even ? [range.lon, lon] : [range.lat, lat]
      const mid = (r[0] + r[1]) / 2
      v = v * 2 + (x >= mid ? 1 : 0)
      r[x >= mid ? 0 : 1] = mid
      even = !even
    }
    hash += BASE32[v]
  }
  return hash
}

// The (up to) 8 cells around a cell, the same length: wrapping across 180°, with nothing beyond the poles.
export function geohashNeighbours(cell) {
  const { lat, lon } = decode(cell)
  const [height, width] = [lat[1] - lat[0], lon[1] - lon[0]]
  const [midLat, midLon] = [(lat[0] + lat[1]) / 2, (lon[0] + lon[1]) / 2]
  const out = []
  for (const dy of [1, 0, -1]) {
    for (const dx of [-1, 0, 1]) {
      if (!dx && !dy) continue
      const y = midLat + dy * height
      if (y <= -90 || y >= 90) continue
      let x = midLon + dx * width
      if (x > 180) x -= 360
      if (x < -180) x += 360
      out.push(encode(y, x, cell.length))
    }
  }
  return out
}

// A Household's window: the Areas (4-character parents) its cell and the cells around it fall in, sorted:
// 1 inside an Area, 2 along an edge, 4 at a corner.
export function windowAreas(cell) {
  return [...new Set([cell, ...geohashNeighbours(cell)].map((c) => c.slice(0, 4)))].sort()
}

// The most-counted costume across these nights, by name (case-insensitive, trimmed), only from names counted
// in at least 3 different Households, never a blocklisted one; null if none qualifies. Shown as its most
// counted spelling.
function topCostume(nights, isBlocked) {
  const byName = new Map() // key → { count, households: Set, spellings: Map(name → { emoji, count }) }
  for (const n of nights) {
    for (const c of n.costumes) {
      const key = c.name.trim().toLowerCase()
      if (!key || c.count < 1) continue
      const entry = byName.get(key) ?? { count: 0, households: new Set(), spellings: new Map() }
      entry.count += c.count
      entry.households.add(n.householdId)
      const spelling = entry.spellings.get(c.name.trim()) ?? { emoji: c.emoji, count: 0 }
      spelling.count += c.count
      entry.spellings.set(c.name.trim(), spelling)
      byName.set(key, entry)
    }
  }
  const qualifying = [...byName.entries()]
    .filter(([key, e]) => e.households.size >= MIN_COSTUME_HOUSEHOLDS && !isBlocked(key))
    .sort(([a, x], [b, y]) => y.count - x.count || a.localeCompare(b))
  if (!qualifying.length) return null
  const [name, { emoji }] = [...qualifying[0][1].spellings.entries()].sort((x, y) => y[1].count - x[1].count)[0]
  return { name, emoji: emoji ?? null }
}

// The figures as they stand, refreshed every 10 minutes. forHousehold(id) is what one Household's screens show.
// edges: the nearbyEdges switch (off: "near you" is the Household's own Area).
export function createNearby({ nights, isBlocked, enabled = true, siteTopCostume = false, edges = true }) {
  let figures = computeNearby([], { isBlocked })
  let cells = new Map() // household id → cell, as of the last refresh

  return {
    REFRESH_MS,
    refresh() {
      const all = enabled ? nights() : []
      figures = computeNearby(all, { isBlocked, siteTopCostume })
      cells = new Map(all.map((n) => [n.householdId, n.cell]))
    },
    // { area: { houses, kids30, topCostume } | null, site: { houses, kids } | null }, or null when switched off.
    forHousehold(householdId, cell = cells.get(householdId)) {
      if (!enabled) return null
      return { area: nearYou(figures, householdId, cell, { edges }), site: figures.site }
    },
    // The public Site-wide line (GET /api/site): { site, live }.
    site() {
      return { site: enabled ? figures.site : null, live: enabled && figures.live }
    },
  }
}
