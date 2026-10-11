// TV pairing codes (v2 spec §9): a bare /tv asks for a short code, a signed-in Manager redeems it, and the
// waiting screen learns which Household it now shows. Codes live in memory: a restart only means a new code.
import { randomToken } from './migrations.js'

// No lookalikes: no 0/O, 1/I/L, 2/Z, 5/S, 8/B or G/6.
const ALPHABET = 'ACDEFHJKMNPQRTUVWXY34679'
const CODE_LENGTH = 6
const CODE_MS = 10 * 60_000

export function createPairing({ now = Date.now } = {}) {
  const byCode = new Map() // code → { waitToken, expiresAt, householdId }
  const byWait = new Map() // waitToken → the same entry

  function prune() {
    const at = now()
    for (const [code, entry] of byCode) {
      if (entry.expiresAt >= at) continue
      byCode.delete(code)
      if (entry.householdId == null) byWait.delete(entry.waitToken) // a paired one is kept until it's collected
    }
  }

  return {
    // A new code for a waiting screen: { code, waitToken, expiresAt }.
    newCode() {
      prune()
      let code
      do code = Array.from(crypto.getRandomValues(new Uint8Array(CODE_LENGTH)), (b) => ALPHABET[b % ALPHABET.length]).join('')
      while (byCode.has(code))
      const entry = { code, waitToken: randomToken(), expiresAt: now() + CODE_MS, householdId: null }
      byCode.set(code, entry)
      byWait.set(entry.waitToken, entry)
      return { code, waitToken: entry.waitToken, expiresAt: entry.expiresAt }
    },

    // A Manager's redeem: true if the code was live, and it now belongs to their Household. Works once.
    redeem(typed, householdId) {
      prune()
      const code = String(typed ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
      const entry = byCode.get(code)
      if (!entry || entry.householdId != null) return false
      entry.householdId = householdId
      byCode.delete(code)
      return true
    },

    // The waiting screen's question: null once the code has expired unpaired (or was collected),
    // { paired: false } while it waits, or { paired: true, householdId } once, to collect.
    wait(waitToken) {
      const entry = byWait.get(waitToken)
      if (!entry) return null
      if (entry.householdId != null) {
        byWait.delete(waitToken)
        return { paired: true, householdId: entry.householdId }
      }
      if (entry.expiresAt < now()) {
        byWait.delete(waitToken)
        byCode.delete(entry.code)
        return null
      }
      return { paired: false }
    },
  }
}
