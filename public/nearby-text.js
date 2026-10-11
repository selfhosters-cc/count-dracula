// Nearby's words (v2 spec §11), the same on the TV and the phone. Figures arrive rounded to 5s.
const fmt = (n) => n.toLocaleString('en-US')

export const kidsText = (n) => (n === 0 ? 'under 5 kids' : `~${fmt(n)} kids`)

// The TV's box: "~90 kids in the last half hour · 14 houses counting · 🧙 Witch on top", or null to draw nothing.
export function tvNearby(nearby) {
  const area = nearby?.area
  if (!area) return null
  const top = area.topCostume ? ` · ${area.topCostume.emoji ?? ''} ${area.topCostume.name} on top`.replace('  ', ' ') : ''
  return `${kidsText(area.kids30)} in the last half hour · ${fmt(area.houses)} houses counting${top}`
}

// The phone's strip: the Area, or else the Site-wide total, or null to hide it.
export function phoneNearby(nearby) {
  if (nearby?.area) return `🏘️ Near you: ${kidsText(nearby.area.kids30)} in 30 min · ${fmt(nearby.area.houses)} houses`
  if (nearby?.site) return `🎃 Count Dracula tonight: ${fmt(nearby.site.houses)} houses · ${kidsText(nearby.site.kids)}`
  return null
}
