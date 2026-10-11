// Nearby's words (v2 spec §11, v2.1 §10), the same on the TV and the phone. Figures arrive rounded to 5s. With
// no minimum crowd an Area can show 1 house (a Household that isn't counting, with one other that is).
const fmt = (n) => n.toLocaleString('en-US')
const houses = (n) => `${fmt(n)} house${n === 1 ? '' : 's'}`

export const kidsText = (n) => (n === 0 ? 'under 5 kids' : `~${fmt(n)} kids`)

// The TV's box: "~90 kids in the last half hour · 14 houses counting · 🧙 Witch on top", or null to draw nothing.
export function tvNearby(nearby) {
  const area = nearby?.area
  if (!area) return null
  const top = area.topCostume ? ` · ${area.topCostume.emoji ?? ''} ${area.topCostume.name} on top`.replace('  ', ' ') : ''
  return `${kidsText(area.kids30)} in the last half hour · ${houses(area.houses)} counting${top}`
}

// The phone's strip: the Area, or else the Site-wide total, or null to hide it.
export function phoneNearby(nearby) {
  if (nearby?.area) return `🏘️ Near you: ${kidsText(nearby.area.kids30)} in 30 min · ${houses(nearby.area.houses)}`
  if (nearby?.site) return `🎃 Count Dracula tonight: ${siteFigures(nearby.site)}`
  return null
}

// "212 houses · ~3,140 kids · top costume: 🧙 Witch": the Site-wide total's figures, on the phone and the homepage.
function siteFigures(site) {
  const top = site.topCostume ? ` · top costume: ${site.topCostume.emoji ? `${site.topCostume.emoji} ` : ''}${site.topCostume.name}` : ''
  return `${fmt(site.houses)} houses · ${kidsText(site.kids)}${top}`
}

// The homepage's line (spec v2.1 §11), from GET /api/site: "🎃 Counting now" while any counted door's Event is
// Live, "🌙 Last night" once every one has Ended (until they go Past at noon). The lead is drawn bold. Null hides
// it: below 5 Households, or with nearby switched off.
export function homeSiteLine(answer) {
  if (!answer?.site) return null
  return { lead: answer.live ? '🎃 Counting now' : '🌙 Last night', rest: ` on Count Dracula: ${siteFigures(answer.site)}` }
}
