// Accounts (v2 spec §3, §20; v2.1 §11): Managers signing in with Google or an email link, their sessions,
// sign-up, and deleting a Household. Google is the one outside call and sits behind a seam (server/google.js;
// a fake in tests). Sending the email link is the caller's: Accounts makes the token and checks it.
import { BadCommand, displayNameOf, isTimeZone } from './ledger.js'
import { tvCodeFrom } from '../shared/codes.js'
import { randomToken } from './migrations.js'

const SESSION_MS = 90 * 86_400_000
const RENEW_AFTER_MS = 86_400_000 // a used session is pushed out to 90 days again at most once a day
const STATE_MS = 10 * 60_000 // a sign-in has 10 minutes to come back from Google
const DELETIONS_KEPT_MS = 61 * 86_400_000 // "gone within 2 months" (spec §16)
const INVITE_MS = 7 * 86_400_000
const EMAIL_LINK_MS = 15 * 60_000 // a sign-in link works once, for 15 minutes
const CODE_TRIES = 5 // wrong codes before a link's code stops working (the link still works)
export const NEW_HOUSEHOLD_NAME = 'Our household' // until first-run's "Name your household"
const EMAIL_SUB = 'email:' // google_sub of a Manager who has only signed in by email (migration 16)

export function openAccounts(db, { ledger, google, now = Date.now, operatorEmails = [], canSignUp = () => true }) {
  const pending = new Map() // state → { nonce, displayName, timeZone, expiresAt }
  const operators = new Set(operatorEmails.map(normalEmail))

  function managerBySub(sub) {
    return db.query('SELECT * FROM managers WHERE google_sub = ?').get(sub)
  }

  // Same address, same person: the Manager with this verified email, in any case.
  function managerByEmail(email) {
    return db.query('SELECT * FROM managers WHERE lower(email) = lower(?) ORDER BY id LIMIT 1').get(String(email ?? '').trim())
  }

  function startSession(managerId) {
    const token = randomToken()
    db.query('INSERT INTO sessions (token, manager_id, expires_at) VALUES (?, ?, ?)').run(token, managerId, now() + SESSION_MS)
    return token
  }

  return {
    // Continue with Google: remembers what to do when Google sends the person back, and returns Google's
    // address to send them to. timeZone is the browser's, for a new Household. displayName names a new Household
    // (the homepage no longer asks; "Our household" until first-run). pair: a TV's code that sent a signed-out
    // phone here (spec v2.1 §11), kept so the callback can carry it on.
    beginSignIn({ displayName, timeZone, invite = null, pair = null, redirectUri }) {
      const name = invite || displayName == null || String(displayName).trim() === '' ? null : displayNameOf(displayName)
      const at = now()
      for (const [state, p] of pending) if (p.expiresAt < at) pending.delete(state)
      const state = randomToken()
      const nonce = randomToken()
      pending.set(state, { nonce, displayName: name, invite: invite || null, pair: tvCodeFrom(pair), timeZone: isTimeZone(timeZone) ? timeZone : 'UTC', expiresAt: at + STATE_MS })
      return google.authUrl({ state, nonce, redirectUri })
    },

    // Google's callback. Returns { token, householdId, created, pair } or { refused } with one of
    // 'state' | 'unverified' | 'paused' | 'alreadyManager' | 'invite' (with `why`). A state works once.
    async finishSignIn({ code, state, redirectUri, ip }) {
      const started = pending.get(state)
      pending.delete(state)
      if (!started || started.expiresAt < now() || typeof code !== 'string') return { refused: 'state' }
      const identity = await google.exchange({ code, redirectUri })
      if (identity.nonce !== started.nonce) return { refused: 'state' }
      if (!identity.emailVerified) return { refused: 'unverified' }
      return land(identity, started, ip)
    },

    // Continue with email: a link for this address, as a token to send, and the Household it would sign in
    // to (null: a new one, or the invite's), for the log. Only the token's hash is kept. Expired links are pruned
    // here. invite: an Invite link's key, carried as Google's state carries it. code: the same link as 6 digits,
    // to type where they asked (sign-in-simplify 04).
    beginEmailSignIn({ email, timeZone, pair = null, invite = null }) {
      const at = now()
      db.query('DELETE FROM email_links WHERE expires_at <= ?').run(at)
      const token = randomToken()
      const code = sixDigits()
      db.query('INSERT INTO email_links (token_hash, email, time_zone, pair, invite, code_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
        hashOf(token), String(email).trim(), isTimeZone(timeZone) ? timeZone : 'UTC', tvCodeFrom(pair), invite || null, codeHashOf(hashOf(token), code), at, at + EMAIL_LINK_MS)
      return { token, code, householdId: managerByEmail(email)?.household_id ?? (invite ? inviteStatus(invite).householdId : null) }
    },

    // What an email link says before its button is pressed: 'ok', or 'gone' (made up, used or expired). Uses nothing.
    emailLinkStatus(token) {
      const link = db.query('SELECT used_at, expires_at FROM email_links WHERE token_hash = ?').get(hashOf(token))
      return link && link.used_at == null && link.expires_at > now() ? 'ok' : 'gone'
    },

    // The email link's Sign in button: the link is used up, then it signs in like Google with the address as
    // a verified identity. Returns what finishSignIn does; a made-up, used or expired link is { refused: 'link' }.
    finishEmailSignIn({ token, ip }) {
      return useLink(hashOf(token), ip)
    },

    // The code from the email, typed where they asked: it matches one of the address's live links (each of the
    // last few emails has its own), and signs in as that link would. A wrong one is { refused: 'code' } and counts
    // against every live code for the address; { refused: 'link' }: no live code left (used, expired or 5 wrong).
    finishEmailCode({ email, code, ip }) {
      const digits = String(code ?? '').replace(/\D/g, '')
      const live = 'lower(email) = lower(?) AND used_at IS NULL AND expires_at > ? AND tries < ? AND code_hash IS NOT NULL'
      const args = [String(email ?? '').trim(), now(), CODE_TRIES]
      const links = db.query(`SELECT token_hash, code_hash FROM email_links WHERE ${live}`).all(...args)
      if (!links.length) return { refused: 'link' }
      const hit = digits.length === 6 && links.find((l) => l.code_hash === codeHashOf(l.token_hash, digits))
      if (hit) return useLink(hit.token_hash, ip)
      db.query(`UPDATE email_links SET tries = tries + 1 WHERE ${live}`).run(...args)
      return { refused: 'code' }
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

    pruneDeletions,

    // The Managers' Google emails, for the Operator's detail view (spec §13) and nowhere else.
    managerEmails(householdId) {
      return db.query('SELECT email FROM managers WHERE household_id = ? ORDER BY id').all(householdId).map((r) => r.email)
    },

    // ---- Invite links (spec §3): single use, 7 days. madeBy is a Manager's id, or null for the Operator's.
    makeInvite(householdId, madeBy = null) {
      const token = randomToken()
      db.query('INSERT INTO invites (token, household_id, made_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?)').run(token, householdId, madeBy, now(), now() + INVITE_MS)
      return token
    },

    // What a link says before anyone signs in: { status: 'ok' | 'used' | 'expired' | 'revoked' | 'unknown', householdId, displayName }.
    inviteStatus,

    unusedInvites(householdId) {
      return db
        .query(`
          SELECT i.token, i.created_at AS createdAt, i.expires_at AS expiresAt, m.name AS madeByName, m.email AS madeByEmail
          FROM invites i LEFT JOIN managers m ON m.id = i.made_by
          WHERE i.household_id = ? AND i.used_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > ?
          ORDER BY i.created_at
        `)
        .all(householdId, now())
    },

    revokeInvite(householdId, token) {
      const { changes } = db.query('UPDATE invites SET revoked_at = ? WHERE token = ? AND household_id = ? AND used_at IS NULL').run(now(), token, householdId)
      if (!changes) throw new BadCommand('No such invite')
    },

    // ---- Managers (spec §3): all equal. Leaving or being removed hard-deletes the Manager at once.
    managers(householdId) {
      return db.query('SELECT id, email, name FROM managers WHERE household_id = ? ORDER BY id').all(householdId)
    },

    removeManager(householdId, managerId) {
      const manager = db.query('SELECT id FROM managers WHERE id = ? AND household_id = ?').get(managerId, householdId)
      if (!manager) throw new BadCommand('No such Manager in your household')
      if (db.query('SELECT COUNT(*) AS n FROM managers WHERE household_id = ?').get(householdId).n < 2) {
        throw new BadCommand("The last Manager can't go: Delete my household instead")
      }
      deleteManager(managerId)
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
        db.query('DELETE FROM invites WHERE household_id = ?').run(householdId)
        db.query('DELETE FROM managers WHERE household_id = ?').run(householdId)
        ledger.deleteHousehold(householdId)
        db.query('INSERT INTO deletions (household_id, deleted_at) VALUES (?, ?)').run(householdId, now())
      })()
      pruneDeletions()
    },
  }

  function inviteStatus(token) {
    const invite = db.query('SELECT i.*, h.display_name FROM invites i JOIN households h ON h.id = i.household_id WHERE i.token = ?').get(token)
    if (!invite) return { status: 'unknown', householdId: null, displayName: null }
    const status = invite.used_at ? 'used' : invite.revoked_at ? 'revoked' : invite.expires_at <= now() ? 'expired' : 'ok'
    return { status, householdId: invite.household_id, displayName: invite.display_name }
  }

  // Their Google id, email, name and sessions go; invites they made stay, made by nobody.
  function deleteManager(managerId) {
    db.transaction(() => {
      db.query('DELETE FROM sessions WHERE manager_id = ?').run(managerId)
      db.query('UPDATE invites SET made_by = NULL WHERE made_by = ?').run(managerId)
      db.query('DELETE FROM managers WHERE id = ?').run(managerId)
    })()
  }

  // The deletions log keeps a row 2 months (spec §16): long enough to re-delete after restoring a backup.
  function pruneDeletions() {
    db.query('DELETE FROM deletions WHERE deleted_at < ?').run(now() - DELETIONS_KEPT_MS)
  }

  // An email link or its code: used up, then it signs in like Google with the address as a verified identity.
  function useLink(tokenHash, ip) {
    const at = now()
    const link = db
      .query('UPDATE email_links SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING email, time_zone, pair, invite')
      .get(at, tokenHash, at)
    if (!link) return { refused: 'link' }
    return land({ sub: null, email: link.email, name: null }, { displayName: null, invite: link.invite, pair: link.pair, timeZone: link.time_zone }, ip)
  }

  // A verified identity, from Google ({ sub, email, name }) or an email link (sub null), signs in: as the Manager
  // with that Google id, or else with that address; or by an invite; or as a new Household's first Manager.
  function land(identity, started, ip) {
    const bySub = identity.sub == null ? null : managerBySub(identity.sub)
    const known = bySub ?? managerByEmail(identity.email)
    const invited = started.invite ? inviteStatus(started.invite) : null
    if (known) {
      // One Household per Manager: an invite to another one is refused, and left unused.
      if (invited && invited.householdId !== known.household_id) return { refused: 'alreadyManager' }
      if (identity.sub != null) {
        // A Manager who had only used email gets Google's id as their key, the first time they use Google.
        const sub = bySub || !known.google_sub.startsWith(EMAIL_SUB) ? known.google_sub : identity.sub
        db.query('UPDATE managers SET google_sub = ?, email = ?, name = ?, last_sign_in_at = ? WHERE id = ?').run(sub, identity.email, identity.name ?? known.name ?? null, now(), known.id)
      } else {
        db.query('UPDATE managers SET last_sign_in_at = ? WHERE id = ?').run(now(), known.id)
      }
      return { token: startSession(known.id), householdId: known.household_id, created: false, pair: started.pair }
    }
    if (invited) {
      if (invited.status !== 'ok') return { refused: 'invite', why: invited.status }
      return db.transaction(() => {
        db.query('UPDATE invites SET used_at = ? WHERE token = ?').run(now(), started.invite)
        return { ...join(invited.householdId, identity), created: false, pair: started.pair }
      })()
    }
    if (!canSignUp({ ip })) return { refused: 'paused' }
    return db.transaction(() => {
      const householdId = ledger.createHousehold({ displayName: started.displayName ?? NEW_HOUSEHOLD_NAME, timeZone: started.timeZone })
      return { ...join(householdId, identity), created: true, pair: started.pair }
    })()
  }

  function join(householdId, identity) {
    const sub = identity.sub ?? `${EMAIL_SUB}${normalEmail(identity.email)}`
    const { id } = db
      .query('INSERT INTO managers (google_sub, email, name, household_id, last_sign_in_at) VALUES (?, ?, ?, ?, ?) RETURNING id')
      .get(sub, identity.email, identity.name ?? null, householdId, now())
    return { token: startSession(id), householdId }
  }
}

function hashOf(token) {
  return new Bun.CryptoHasher('sha256').update(String(token ?? '')).digest('hex')
}

// A code's hash belongs to its link: the same 6 digits on two links never match each other's.
function codeHashOf(tokenHash, code) {
  return hashOf(`${tokenHash}:${code}`)
}

// 000000–999999, evenly: a 32-bit draw past the last whole million is drawn again.
function sixDigits() {
  const limit = 2 ** 32 - (2 ** 32 % 1_000_000)
  let n
  do n = crypto.getRandomValues(new Uint32Array(1))[0]
  while (n >= limit)
  return String(n % 1_000_000).padStart(6, '0')
}

function normalEmail(email) {
  return String(email ?? '').trim().toLowerCase()
}
