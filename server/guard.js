// The Guard (v2 spec §15, §20): stream caps that keep each Household's own phones and TVs in first, and
// in-memory token-bucket rate limits. Every refusal is counted for /operator and logged once.
const SECOND = 1_000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// Every number in one place. A rule lets `count` through at once, then refills at count per `perMs`.
// The stream caps are starting numbers: the load check (ticket 36) adjusts them.
export const LIMITS = {
  householdViewers: 200, // TV-link viewers per Household; its phones and paired TVs are never refused by it
  streamsPerIp: 20,
  siteStreams: 3_000, // past this, new TV-link viewers are refused first
  siteCeiling: 3_500, // past this, nothing gets in
  householdsPerIp: { count: 3, perMs: DAY },
  householdsSite: { count: 60, perMs: HOUR },
  signIn: { count: 30, perMs: HOUR }, // per IP
  emailLink: { count: 3, perMs: 15 * MINUTE }, // per address (a hash of it): sign-in links sent
  emailLinkIp: { count: 10, perMs: HOUR }, // per IP: sign-in links asked for
  emailCode: { count: 10, perMs: DAY }, // per address (a hash of it): sign-in codes entered
  pairCode: { count: 30, perMs: HOUR }, // per IP
  redeem: { count: 10, perMs: 10 * MINUTE }, // per Manager
  invite: { count: 20, perMs: DAY }, // per Household
  taps: { count: 30, perMs: 3 * SECOND }, // per Household: bursts of 30, then 10 a second
  report: { count: 5, perMs: DAY }, // per IP
  joinQr: { count: 10, perMs: MINUTE }, // per Household: showing the helper or watch QR on the TV
  code: { count: 30, perMs: HOUR }, // per IP: codes typed under Got a code?
}

const MAX_BUCKETS = 50_000 // past this, full (idle) buckets are dropped

export function createGuard({ now = Date.now, limits = LIMITS, log = console.log } = {}) {
  const buckets = new Map() // `${rule}|${key}` → { tokens, at }
  const counts = { total: 0, lastAt: null, byReason: {} }

  function refuse(reason, key) {
    counts.total++
    counts.lastAt = now()
    counts.byReason[reason] = (counts.byReason[reason] ?? 0) + 1
    log(`refused reason=${reason}${key == null ? '' : ` key=${key}`}`)
  }

  function prune() {
    if (buckets.size < MAX_BUCKETS) return
    const at = now()
    for (const [id, bucket] of buckets) {
      const [rule] = id.split('|')
      const { count, perMs } = limits[rule]
      if (bucket.tokens + ((at - bucket.at) * count) / perMs >= count) buckets.delete(id)
    }
  }

  return {
    // One go at a rate-limited thing: true if allowed (and counted against the key), false if refused.
    take(rule, key) {
      const { count, perMs } = limits[rule]
      const id = `${rule}|${key}`
      const at = now()
      const bucket = buckets.get(id) ?? { tokens: count, at }
      bucket.tokens = Math.min(count, bucket.tokens + ((at - bucket.at) * count) / perMs)
      bucket.at = at
      if (!buckets.has(id)) {
        prune()
        buckets.set(id, bucket)
      }
      if (bucket.tokens < 1) {
        refuse(rule, key)
        return false
      }
      bucket.tokens -= 1
      return true
    },

    // May a new stream open? kind: 'phone' | 'paired' | 'tvLink'. total: open streams site-wide; fromIp: open
    // from this client; household: the Household's open streams by kind. Returns null, or the refusal:
    // 'tvFull' (a TV-link viewer: the TV page says so and retries), 'ipFull' or 'siteFull' (429).
    admitStream({ kind, total, fromIp, household }) {
      let refusal = null
      if (total >= limits.siteCeiling) refusal = 'siteFull'
      else if (fromIp >= limits.streamsPerIp) refusal = 'ipFull'
      else if (kind === 'tvLink' && (total >= limits.siteStreams || household.tvLink >= limits.householdViewers)) refusal = 'tvFull'
      if (refusal) refuse(refusal)
      return refusal
    },

    // For /operator's Refused tile: since the server started.
    refusals() {
      return { total: counts.total, lastAt: counts.lastAt, byReason: { ...counts.byReason } }
    },
  }
}
