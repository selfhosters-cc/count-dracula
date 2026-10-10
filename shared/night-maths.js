// Night maths (modules.md §3): pure functions shared by the server, the phones and the TV. No build step.

const TAG_SLOTS = ['#3987e5', '#199e70', '#c98500', '#d55181', '#9085e9', '#e66767']
const UNTAGGED = '#ff7a1a'
const OVERFLOW = '#8a84a8'

// A costume's colour comes from its order (1-based); null means untagged (spec §7).
export function tagColour(order) {
  if (order == null) return UNTAGGED
  return TAG_SLOTS[order - 1] ?? OVERFLOW
}
