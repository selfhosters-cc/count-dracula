// Nearby (v2 spec §11): rounded, delayed totals for each Area, and the Site-wide total. Computed every 10
// minutes over the live nights, never per tap, so a figure can't be tied to one door. Nothing about a single
// Household leaves this module.
const MIN_HOUSEHOLDS = 5
const MIN_COSTUME_HOUSEHOLDS = 3
const REFRESH_MS = 10 * 60_000

const round5 = (n) => Math.round(n / 5) * 5

// nights: [{ householdId, cell, suspended, kids, kids30, costumes: [{ name, emoji, count }] }], one per
// Household: its door's Event. Returns { areas: Map(area → { houses, kids30, topCostume }), site: { houses, kids, topCostume? } | null }.
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
  for (const [area, active] of byArea) {
    if (active.length < MIN_HOUSEHOLDS) continue
    areas.set(area, {
      houses: active.length,
      kids30: round5(active.reduce((sum, n) => sum + n.kids30, 0)),
      topCostume: topCostume(active, isBlocked),
    })
  }
  const site =
    counting.length >= MIN_HOUSEHOLDS ? { houses: counting.length, kids: round5(counting.reduce((sum, n) => sum + n.kids, 0)) } : null
  if (site && siteTopCostume) site.topCostume = topCostume(counting, isBlocked)
  return { areas, site }
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
export function createNearby({ nights, isBlocked, enabled = true, siteTopCostume = false }) {
  let figures = { areas: new Map(), site: null }
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
      return { area: (cell && figures.areas.get(cell.slice(0, 4))) || null, site: figures.site }
    },
  }
}
