// Accounts (v2 spec §3, §20): Managers signing in with Google, their sessions, sign-up, and deleting a
// Household. Google is the one outside call and sits behind a seam (server/google.js; a fake in tests).
import { BadCommand, displayNameOf, isTimeZone } from './ledger.js'

const SESSION_MS = 90 * 86_400_000
const RENEW_AFTER_MS = 86_400_000 // a used session is pushed out to 90 days again at most once a day
const STATE_MS = 10 * 60_000 // a sign-in has 10 minutes to come back from Google
const DELETIONS_KEPT_MS = 61 * 86_400_000 // "gone within 2 months" (spec §16)

export function openAccounts(db, { ledger, google, now = Date.now, household1Email = '', operatorEmails = [], canSignUp = () => true }) {
  const pending = new Map() // state → { nonce, displayName, timeZone, expiresAt }
  const operators = new Set(operatorEmails.map(normalEmail))

  function managerBySub(sub) {
    return db.query('SELECT * FROM managers WHERE google_sub = ?').get(sub)
  }

  function startSession(managerId) {
    const token = randomToken()
    db.query('INSERT INTO sessions (token, manager_id, expires_at) VALUES (?, ?, ?)').run(token, managerId, now() + SESSION_MS)
    return token
  }

  // Household #1 gets its first Manager from the configured email, once (spec §4).
  function claimsHousehold1(identity) {
    if (!household1Email || normalEmail(identity.email) !== normalEmail(household1Email)) return false
    if (!ledger.household(1)) return false
    return !db.query('SELECT 1 FROM managers WHERE household_id = 1').get()
  }

  return {
    // The sign-up or sign-in button: remembers what to do when Google sends the person back, and
    // returns Google's address to send them to. A sign-up carries the display name and the browser's zone.
    beginSignIn({ displayName, timeZone, redirectUri }) {
      const name = displayName == null || String(displayName).trim() === '' ? null : displayNameOf(displayName)
      const at = now()
      for (const [state, p] of pending) if (p.expiresAt < at) pending.delete(state)
      const state = randomToken()
      const nonce = randomToken()
      pending.set(state, { nonce, displayName: name, timeZone: isTimeZone(timeZone) ? timeZone : 'UTC', expiresAt: at + STATE_MS })
      return google.authUrl({ state, nonce, redirectUri })
    },

    // Google's callback. Returns { token, householdId, created } or { refused } with one of
    // 'state' | 'unverified' | 'noHousehold' | 'paused'. A state works once.
    async finishSignIn({ code, state, redirectUri, ip }) {
      const started = pending.get(state)
      pending.delete(state)
      if (!started || started.expiresAt < now() || typeof code !== 'string') return { refused: 'state' }
      const identity = await google.exchange({ code, redirectUri })
      if (identity.nonce !== started.nonce) return { refused: 'state' }
      if (!identity.emailVerified) return { refused: 'unverified' }

      const known = managerBySub(identity.sub)
      if (known) {
        db.query('UPDATE managers SET email = ?, name = ?, last_sign_in_at = ? WHERE id = ?').run(identity.email, identity.name ?? null, now(), known.id)
        return { token: startSession(known.id), householdId: known.household_id, created: false }
      }
      if (claimsHousehold1(identity)) return { ...join(1, identity), created: false }
      if (!started.displayName) return { refused: 'noHousehold' }
      if (!canSignUp({ ip })) return { refused: 'paused' }
      return db.transaction(() => {
        const householdId = ledger.createHousehold({ displayName: started.displayName, timeZone: started.timeZone })
        return { ...join(householdId, identity), created: true }
      })()
    },

    // The session a cookie's token names: { manager, householdId, operator, renewed }, or null once it's
    // gone or 90 days unused. Using it pushes the 90 days out again.
    session(token) {
      if (typeof token !== 'string' || token === '') return null
      const row = db
        .query('SELECT s.expires_at, m.id, m.email, m.name, m.household_id FROM sessions s JOIN managers m ON m.id = s.manager_id WHERE s.token = ?')
        .get(token)
      if (!row) return null
      const at = now()
      if (row.expires_at <= at) {
        db.query('DELETE FROM sessions WHERE token = ?').run(token)
        return null
      }
      const renewed = row.expires_at - at < SESSION_MS - RENEW_AFTER_MS
      if (renewed) db.query('UPDATE sessions SET expires_at = ? WHERE token = ?').run(at + SESSION_MS, token)
      return {
        manager: { id: row.id, email: row.email, name: row.name },
        householdId: row.household_id,
        operator: operators.has(normalEmail(row.email)),
        renewed,
      }
    },

    signOut(token) {
      db.query('DELETE FROM sessions WHERE token = ?').run(token)
    },

    // Delete my Household (spec §3): confirmed by typing its name; everything it owns goes at once, and
    // one deletions row records that it happened. Later tables must be added here.
    deleteHousehold(householdId, confirm) {
      const house = ledger.households().find((h) => h.id === householdId)
      if (!house) throw new BadCommand('No such household')
      if (confirm !== house.displayName) throw new BadCommand(`Type "${house.displayName}" to delete it`)
      db.transaction(() => {
        db.query('DELETE FROM sessions WHERE manager_id IN (SELECT id FROM managers WHERE household_id = ?)').run(householdId)
        db.query('DELETE FROM managers WHERE household_id = ?').run(householdId)
        ledger.deleteHousehold(householdId)
        db.query('DELETE FROM deletions WHERE deleted_at < ?').run(now() - DELETIONS_KEPT_MS)
        db.query('INSERT INTO deletions (household_id, deleted_at) VALUES (?, ?)').run(householdId, now())
      })()
    },
  }

  function join(householdId, identity) {
    const { id } = db
      .query('INSERT INTO managers (google_sub, email, name, household_id, last_sign_in_at) VALUES (?, ?, ?, ?, ?) RETURNING id')
      .get(identity.sub, identity.email, identity.name ?? null, householdId, now())
    return { token: startSession(id), householdId }
  }
}

function normalEmail(email) {
  return String(email ?? '').trim().toLowerCase()
}

function randomToken() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url')
}
