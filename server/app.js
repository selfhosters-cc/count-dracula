// The HTTP layer stays thin: find the credential's Household, parse the body, call apply on that Household,
// publish the deltas. Every read and write carries a credential (v2 spec §3): a phone's join key, or a
// Manager's session. There's no Household in any URL: the credential carries it.
import { Database } from 'bun:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { loadConfig } from './config.js'
import { BadCommand, DEFAULT_SWITCHES, openLedger } from './ledger.js'
import { NEW_HOUSEHOLD_NAME, openAccounts } from './accounts.js'
import { googleClient } from './google.js'
import { createHub } from './hub.js'
import { createPairing } from './pairing.js'
import { tvCodeFrom } from '../shared/codes.js'
import { LIMITS, createGuard } from './guard.js'
import { createBackups } from './backups.js'
import { STATUSES, healthTiles, householdStatus, siteStats } from './operator.js'
import { createNearby } from './nearby.js'
import { migrateExtension, recordOwns } from './migrations.js'
import { isBlocked } from './blocklist.js'
import { toCsv } from './export.js'
import { isMailAddress, sendMail } from './mail.js'
import { maskEmail, signInEmail } from './email-sign-in.js'
import { clientIpOf, trustedProxies } from './client-ip.js'
import { VISIT_PAGES, createVisits } from './visits.js'

// The release, from package.json: on every page (__VERSION__) and /operator, so a reload shows an update arrived.
export const VERSION = JSON.parse(readFileSync(resolve(import.meta.dir, '../package.json'), 'utf8')).version
const PUBLIC_DIR = resolve(import.meta.dir, '../public')
const SHARED_DIR = resolve(import.meta.dir, '../shared') // served at /shared/ for the browser
const KIOSK_DIR = resolve(import.meta.dir, '../kiosk') // the TV laptop's launchers, downloadable from /kiosk/
const PAGES = { '/': '/home.html', '/door': '/door.html', '/tv': '/tv.html', '/setup': '/setup.html', '/tally': '/tally.html', '/help/tv': '/help-tv.html', '/operator': '/operator.html', '/privacy': '/privacy.html', '/summary': '/summary.html' }
const ADMIN_COMMANDS = new Set(['createEvent', 'goLive', 'settings', 'changeKey', 'deleteEvent', 'createTag', 'updateTag', 'deleteTag', 'addTicket', 'backfill', 'removeBatch', 'rename', 'rotateTvLink', 'setLocation', 'setLastYear', 'checklist', 'close', 'reset'])

// What a TV-link holder gets (spec §9): what the TV draws, without each kid's phone name.
const withoutPhone = ({ phoneName, ...kid }) => kid
const tvSnapshot = (snap) => ({ ...snap, kids: snap.kids.map(withoutPhone) })
const tvDelta = (delta) => (delta.kid ? { ...delta, kid: withoutPhone(delta.kid) } : delta)

const PAUSE_SIGN_UPS = 'pauseSignUps'
const JOIN_QR_MS = 2 * 60_000 // how long the helper QR stays on the TV
// Where "go sign in" lands (spec v2.1 §11): the homepage's Sign in form. The hash keeps the homepage even on a
// phone that remembers a door's key (doorRedirect in public/door-view.js).
const SIGN_IN = '/#sign-in'
const DEFAULT_CONTACT = 'privacy@count-dracula.example.com'
const OPERATOR_ACTIONS = new Set(['rename', 'timeZone', 'suspend', 'unsuspend', 'invite', 'dismissReport'])
const DEVICE_ID = /^[0-9a-f]{32}$/ // what live.js makes: 16 random bytes, hex
const NAME_CLAIM_MS = 24 * 60 * 60_000 // a phone name another phone chose stays taken this long
const BACKFILL_PHONE = 'Add missed kids' // the Ledger's name on kids added from Setup: never a phone's
const EXTENSION_NAME = /^[a-z][a-z0-9]*$/

// The sign-in cookie (spec §3): 90 days, renewed with use; the session itself lives server-side.
const SESSION_COOKIE = 'cd_session'
const sessionCookie = (token, maxAge = 90 * 86_400) => `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`

// The largest request body read, as the Caddy in front allows (64 KB); a bigger one is refused before it's read.
const MAX_BODY_BYTES = 64 * 1024

// env: PUBLIC_HOST, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OPERATOR_EMAILS, OPERATOR_CONTACT, SMTP_HOST, SMTP_PORT,
// SMTP_USER, SMTP_PASS, EMAIL_FROM, TRUSTED_PROXIES (deploy/local.env). google, mailer, now, canSignUp, tickMs, limits and log are seams for the tests.
// extensions: the entry modules server/main.js imports from EXTENSIONS (v2.2 §3), or a test's own.
export function startServer({ configPath, port, heartbeatMs, env = process.env, google, mailer, now = Date.now, canSignUp, tickMs = 60_000, limits = LIMITS, log = console.log, extensions = [] }) {
  const config = loadConfig(configPath)
  const guard = createGuard({ now, limits, log })
  const contact = env.OPERATOR_CONTACT || DEFAULT_CONTACT // the one contact address (spec §5)
  const trusted = trustedProxies(env.TRUSTED_PROXIES) // who may say the visitor's address (server/client-ip.js)
  const startedAt = now()
  // /operator's Errors tile: 5xx answers and uncaught exceptions since start. Only the error's type and the
  // route are kept, never its message, which could carry something from a request.
  const errors = { total: 0, lastAt: null, last: null }
  function recordError(what, req) {
    errors.total++
    errors.lastAt = now()
    errors.last = req ? `${what} in ${req.method} ${new URL(req.url).pathname}` : what
  }
  const onUncaught = (err) => {
    recordError(err?.name ?? 'Error')
    console.error('uncaught:', err)
  }
  process.on('uncaughtException', onUncaught)
  process.on('unhandledRejection', onUncaught)
  let failNext = null // tests: the next request throws, to check what the Errors tile keeps
  const db = new Database(config.dbPath, { create: true })
  const ledger = openLedger(db, { ...config, now })
  const visits = createVisits({ db, now }) // the public pages' visits, for /operator (the Ledger's migrations made its tables)
  const accounts = openAccounts(db, {
    ledger,
    google: google ?? googleClient({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }),
    now,
    operatorEmails: (env.OPERATOR_EMAILS ?? '').split(/[\s,]+/).filter(Boolean),
    // A new Household: not while sign-ups are paused (checked first, so it spends no token), then 3 per IP
    // per day and 60 site-wide per hour (spec §15).
    canSignUp: (ctx) =>
      !ledger.siteSwitch(PAUSE_SIGN_UPS) &&
      (canSignUp ?? (({ ip }) => guard.take('householdsPerIp', ip) && guard.take('householdsSite', 'site')))(ctx),
  })
  const hub = createHub({ heartbeatMs })
  const pairing = createPairing({ now, taken: (code) => ledger.isHouseholdCode(code) })
  // Continue with email (spec v2.1 §11): a relay with plain SMTP, or a mail service over TLS with SMTP_USER and
  // SMTP_PASS (implicit TLS on port 465, STARTTLS on any other). Hidden, and its routes refused, until SMTP_HOST,
  // EMAIL_FROM and PUBLIC_HOST are all set: the emailed link names PUBLIC_HOST, never the request's Host header,
  // which whoever asks for the link can set. mailer.send({ to, subject, text, html }) resolves once the server has it.
  const mail = !env.PUBLIC_HOST
    ? null
    : mailer !== undefined
      ? mailer
      : env.SMTP_HOST && env.EMAIL_FROM
        ? { send: (message) => sendMail({ host: env.SMTP_HOST, port: Number(env.SMTP_PORT) || 25, user: env.SMTP_USER || null, pass: env.SMTP_PASS, from: env.EMAIL_FROM, ...message }) }
        : null
  if (env.SMTP_HOST && !env.PUBLIC_HOST) log('Continue with email is off: set PUBLIC_HOST, the host name its emailed links open')

  // The minute tick (spec §7): nights go live and end by themselves. The first runs at start, catching up on
  // anything missed while the server was down.
  function tick() {
    try {
      for (const { householdId, deltas } of ledger.tick({ nearbyFor: nearbyArea })) hub.publish(householdId, deltas)
    } catch (err) {
      console.error('tick failed:', err)
    }
  }

  // Nearby (spec §11): figures every 10 minutes, pushed to every open screen as a `nearby` event.
  const switches = { ...DEFAULT_SWITCHES, ...config.switches }
  const nearby = createNearby({
    nights: () => ledger.nearbyNights(now()),
    isBlocked,
    enabled: switches.nearby,
    siteTopCostume: switches.siteTopCostume,
    edges: switches.nearbyEdges,
  })
  const cellOf = (householdId) => ledger.households().find((h) => h.id === householdId)?.location ?? null
  function refreshNearby() {
    try {
      nearby.refresh()
      hub.sendEach('nearby', (householdId) => nearby.forHousehold(householdId, cellOf(householdId)))
    } catch (err) {
      console.error('nearby failed:', err)
    }
  }
  refreshNearby()
  const nearbyTimer = setInterval(refreshNearby, nearby.REFRESH_MS)
  // The window's figures a night keeps when it ends, for its summary's nearby slide (null with no other house counting).
  function nearbyArea(householdId) {
    return nearby.forHousehold(householdId, cellOf(householdId))?.area ?? null
  }
  // A snapshot carries the figures as they stood at the last refresh.
  const withNearby = (snap, house) => ({ ...snap, nearby: nearby.forHousehold(house.id, cellOf(house.id)) })
  // What a phone or TV with no ?event= reads (spec v2.1 §15): the door's Event, or "no night" with none open.
  const doorSnapshot = (house) => {
    const door = house.doorEvent()
    return door ? house.snapshot(door.id) : house.idleSnapshot()
  }
  // A phone's (or a Manager's) read also names the Household, for Add a helper's wording. A TV's never does:
  // the TV link is watched by remote viewers.
  const phoneSnapshot = (house) => ({ ...doorSnapshot(house), household: house.displayName(), joinQr: joinQrFor(house, 'phone'), watchQr: watchQrFor(house, 'phone') })

  // The helper join QR on the porch TV (spec v2.1 §4): a door phone or /setup shows it for 2 minutes, or until
  // either hides it. Kept in memory per Household (a restart drops it). The join key goes to paired TVs only:
  // the TV link is read-only and watched by remote family. A phone gets only the time left, for its button.
  const joinQrUntil = new Map() // household id → ms
  const joinQrLeft = (house) => Math.max(0, (joinQrUntil.get(house.id) ?? 0) - now())
  // What a stream of this kind gets: null when it's not showing, undefined for nothing at all (a TV-link viewer).
  function joinQrFor(house, kind) {
    if (kind === 'tvLink') return undefined
    const msLeft = joinQrLeft(house)
    if (!msLeft) return null
    return kind === 'paired' ? { key: house.joinKey(), code: house.joinCode(), household: house.displayName(), msLeft } : { msLeft }
  }
  const tvSnapshotFor = (house, kind) => {
    const snap = withNearby(tvSnapshot(doorSnapshot(house)), house)
    return kind === 'paired' ? { ...snap, joinQr: joinQrFor(house, kind), watchQr: watchQrFor(house, kind) } : snap
  }
  const publishJoinQr = (house) => hub.sendByKind(house.id, 'joinQr', (kind) => joinQrFor(house, kind))

  // Phone names chosen in the last day, per Household, in memory (a restart forgets them; the kids' names stay).
  const phoneNames = new Map() // household id → Map(lower-case name → { deviceId, at })

  // The watch QR: the TV link as a QR, with its watch code, so someone at the porch can watch along on their own
  // phone. Shown for 2 minutes on the paired TVs, like the helper QR: it's for the porch, so a TV-link viewer
  // watching from afar never gets it. The TV shows one card at a time, so showing either takes the other down.
  const watchQrUntil = new Map() // household id → ms
  const watchQrLeft = (house) => Math.max(0, (watchQrUntil.get(house.id) ?? 0) - now())
  function watchQrFor(house, kind) {
    if (kind === 'tvLink') return undefined
    const msLeft = watchQrLeft(house)
    if (!msLeft) return null
    return kind === 'phone' ? { msLeft } : { token: house.tvToken(), code: house.watchCode(), msLeft }
  }
  const publishWatchQr = (house) => hub.sendByKind(house.id, 'watchQr', (kind) => watchQrFor(house, kind))

  // The first tick runs now, with nearby ready for any night it ends.
  tick()
  const ticker = setInterval(tick, tickMs)

  // A VACUUM INTO copy every 15 minutes, with the deletions prune on the same timer (spec §15).
  const backups = config.backupDir ? createBackups({ db, dir: config.backupDir, now, log }) : null
  const stopBackups = backups?.start({ also: () => accounts.pruneDeletions() }) ?? (() => {})

  // A Household's /operator status, kids and last kid, from its door's Event (spec v2.1 §10): the table and the
  // detail view both read it, so they agree.
  const doorStatus = (night, at) => {
    const door = night ?? { state: null, kids: 0, lastKidAt: null }
    return { status: householdStatus(door, at), kids: door.kids, lastKidAt: door.lastKidAt }
  }

  const routes = {
    // `/` is the public homepage (spec v2.1 §11). The door phone lives on /door: a helper's ?key= link to / goes
    // there, and the homepage's script sends a phone that remembers a key on too (only the browser knows it).
    'GET /': (req) => {
      const { search, searchParams } = new URL(req.url)
      if (searchParams.get('key')) return new Response(null, { status: 302, headers: { Location: `/door${search}` } })
      return serveStatic('/', req, contact)
    },
    // The TV's pairing screen's short address to type on a phone: Setup's Tonight, with the Your TV box (through
    // sign-in if need be). Not the homepage: a phone that counts goes from there to its door.
    'GET /pair': () => new Response(null, { status: 302, headers: { Location: '/setup#pair-tv' } }),
    // The sign-up page folded into the homepage.
    'GET /signup': () => new Response(null, { status: 302, headers: { Location: '/' } }),
    // What the homepage can't know from the page alone: whether sign-ups are paused (shown before anyone goes to
    // Google), whether Continue with email is on, and a signed-in Manager's Household, for the Welcome back card.
    // Never more than its name.
    // Got a code? on the homepage, 6 characters: a join code (→ { join: the join key }, to count at the door), a
    // watch code (→ { watch: the TV link }), or a TV waiting to be paired (→ { pair }). An old 10-character join key
    // still answers { join }. Per IP, so codes can't be tried by the thousand: the only place a short code is taken.
    'GET /api/code': (req, server) => {
      if (!guard.take('code', clientIp(req, server))) return tooMany()
      const typed = new URL(req.url).searchParams.get('code')
      const code = tvCodeFrom(typed)
      const household = code ? ledger.householdByJoinCode(code) : ledger.householdByJoinKey(typed)
      if (household != null && !ledger.isSuspended(household)) return Response.json({ join: ledger.household(household).joinKey() })
      const tvToken = code && ledger.tvTokenByWatchCode(code)
      if (tvToken) return Response.json({ watch: `/tv/k/${tvToken}` })
      if (code && pairing.isWaiting(code)) return Response.json({ pair: code })
      return new Response('No such code', { status: 404 })
    },
    'GET /api/home': (req) => {
      const session = accounts.session(tokenOf(req))
      const household = session ? (ledger.households().find((h) => h.id === session.householdId)?.displayName ?? null) : null
      return Response.json({ signUpsPaused: ledger.siteSwitch(PAUSE_SIGN_UPS), household, emailSignIn: mail != null })
    },
    // The door's Event, for a phone, a TV or a Manager; ?event=<id> reads one of the Household's events (a past
    // night's recap on /tv?event=<id>), for a Manager only.
    'GET /api/snapshot': async (req, server) => {
      const id = new URL(req.url).searchParams.get('event')
      if (id == null) return read((req, house, credential) => Response.json(credential.kind === 'tv' ? tvSnapshotFor(house, credential.paired ? 'paired' : 'tvLink') : withNearby(phoneSnapshot(house), house)))(req, server)
      return manager((req, house) => {
        const snap = house.snapshot(Number(id))
        return snap ? Response.json(snap) : notFound()
      })(req, server)
    },
    // EventSource can't send headers, so a phone's key or the TV link's token comes as ?key= (masked in the
    // Caddy log). A TV gets the door's Event TV-shaped; each reconnect reads the door afresh.
    'GET /api/stream': read((req, house, credential, server) => {
      const kind = credential.kind !== 'tv' ? 'phone' : credential.paired ? 'paired' : 'tvLink'
      const ip = clientIp(req, server)
      const counts = hub.counts()
      const refusal = guard.admitStream({ kind, total: counts.total, fromIp: hub.streamsFrom(ip), household: counts.households[house.id] ?? { phone: 0, paired: 0, tvLink: 0 } })
      // A full TV gets 503, which the TV page shows as "This TV is full, try again soon" and retries.
      if (refusal) return new Response(refusal === 'tvFull' ? 'This TV is full, try again soon' : 'Too many connections', { status: refusal === 'tvFull' ? 503 : 429 })
      // The browser's own random id (live.js), so /operator can count the devices that joined each night.
      const deviceId = new URL(req.url).searchParams.get('deviceId')
      if (DEVICE_ID.test(deviceId ?? '')) ledger.countDevice(house.id, deviceId, kind === 'phone' ? 'phone' : 'tv')
      return kind === 'phone'
        ? hub.attach(req, server, { householdId: house.id, kind, ip, credential: credential.token, snapshot: () => withNearby(phoneSnapshot(house), house) })
        : hub.attach(req, server, { householdId: house.id, kind, ip, credential: credential.token, snapshot: () => tvSnapshotFor(house, kind), shape: tvDelta })
    }),

    // ---- Pairing a TV (spec §9): the bare /tv asks for a code and waits; a Manager redeems it in /setup.
    // The waiting secret travels in the body, never the address.
    'POST /api/pair/code': (req, server) => (guard.take('pairCode', clientIp(req, server)) ? Response.json(pairing.newCode()) : tooMany()),
    'POST /api/pair/wait': async (req) => {
      const { waitToken } = await req.json().catch(() => ({}))
      const answer = pairing.wait(waitToken)
      const house = answer?.paired ? ledger.household(answer.householdId) : null
      if (!answer || (answer.paired && !house)) return new Response('That code has expired: get a new one', { status: 410 })
      if (!answer.paired) return Response.json({ paired: false })
      return Response.json({ paired: true, tvToken: house.tvToken(), deviceToken: house.pairDevice() })
    },
    // "Use this screen as the TV" in /setup: a signed-in Manager on the screen itself pairs it, no code needed. It's
    // then the Household's own TV, like one paired by code, so it can show the helper QR; a TV link never can.
    'POST /api/pair/here': manager((req, house, session) => {
      if (!guard.take('redeem', session.manager.id)) return tooMany()
      return Response.json({ tvToken: house.tvToken(), deviceToken: house.pairDevice() })
    }),
    'POST /api/pair/redeem': manager(async (req, house, session) => {
      if (!guard.take('redeem', session.manager.id)) return tooMany()
      const { code } = await req.json()
      if (!pairing.redeem(code, house.id)) return new Response('That code has expired: your TV shows a new one now. Scan it again, or type the new one.', { status: 404 })
      return Response.json({ paired: true })
    }),
    'POST /api/taps': write(async (req, house) => {
      if (!guard.take('taps', house.id)) return tooMany()
      const { id, tagId, tappedAt, phoneName, teen, eventId, stamp } = await req.json()
      hub.publish(house.id, house.apply({ type: 'tap', id, tagId, tappedAt, phoneName, teen, eventId, stamp }))
    }),
    'POST /api/remove': write(async (req, house) => {
      const { kidId, eventId, stamp } = await req.json()
      hub.publish(house.id, house.apply({ type: 'remove', kidId, eventId, stamp }))
    }),
    // The deploy's health check: the server is up and its database answers. Needs no credential.
    'GET /healthz': () => {
      ledger.households()
      return new Response('ok')
    },

    // ---- The Operator (spec §13): a Manager on OPERATOR_EMAILS.
    'GET /operator': async (req) => {
      const session = accounts.session(tokenOf(req))
      if (!session) return redirect('/?next=operator#sign-in') // the homepage notes it, so sign-in comes back here
      if (!session.operator) return page('Not here', '<p>This page is for the Operator.</p><p><a href="/setup">‹ Back to Setup</a></p>', 403)
      return renew(await serveStatic('/operator', req), session, req)
    },
    // The whole dashboard in one answer, polled every 30 s (spec §13). No emails and no Location cells here.
    'GET /api/operator': operator(() => {
      const at = now()
      const nights = new Map(ledger.doorNights().map((n) => [n.householdId, n])) // one per Household: its door's Event
      const streams = hub.counts()
      const reportCounts = new Map()
      for (const h of ledger.households()) reportCounts.set(h.id, ledger.reports(h.id).length)
      const households = ledger.households().map((h) => {
        const s = streams.households[h.id] ?? { phone: 0, paired: 0, tvLink: 0 }
        return {
          id: h.id,
          displayName: h.displayName,
          ...doorStatus(nights.get(h.id), at),
          area: h.location ? h.location.slice(0, 4) : '—',
          phones: s.phone,
          tvScreens: s.paired + s.tvLink, // the porch TV and remote viewers share the link: one number
          managers: accounts.managers(h.id).length,
          reports: reportCounts.get(h.id) ?? 0,
          signedUpAt: h.signedUpAt,
          suspendedSince: h.suspendedSince,
        }
      })
      const statusCounts = Object.fromEntries(STATUSES.map((st) => [st, households.filter((h) => h.status === st).length]))
      const phones = households.reduce((n, h) => n + h.phones, 0)
      const health = healthTiles(
        {
          statusCounts,
          connections: { phones, tvScreens: streams.total - phones, total: streams.total },
          cap: limits.siteStreams,
          refusals: guard.refusals(),
          errors,
          lastTapAt: ledger.lastTapAt(),
          backups: !!backups,
          backupAt: backups?.lastAt() ?? null,
          rssBytes: process.memoryUsage().rss,
          startedAt,
          version: VERSION,
          switches: { ...DEFAULT_SWITCHES, ...config.switches }, // as the Ledger runs them
        },
        at,
      )
      return Response.json({ now: at, pauseSignUps: ledger.siteSwitch(PAUSE_SIGN_UPS), health, households })
    }),
    // One Household's detail: the only place Managers' emails appear (recovery needs them), and still the Area, not the cell.
    'GET /api/operator/household': operator((req) => {
      const id = Number(new URL(req.url).searchParams.get('id'))
      const h = ledger.households().find((x) => x.id === id)
      if (!h) return notFound()
      return Response.json({
        id,
        displayName: h.displayName,
        timeZone: h.timeZone,
        area: h.location ? h.location.slice(0, 4) : '—',
        ...doorStatus(ledger.doorNights().find((n) => n.householdId === id), now()),
        signedUpAt: h.signedUpAt,
        suspendedSince: h.suspendedSince,
        managers: accounts.managerEmails(id),
        reports: ledger.reports(id),
        nights: ledger.nights(id),
      })
    }),
    // The Stats section: sign-ups, nights and devices across the site, from what's stored (no names, no emails).
    'GET /api/operator/stats': operator(() => {
      const at = now()
      return Response.json({ now: at, ...siteStats({ households: ledger.households(), nights: ledger.nights(), pairedTvs: ledger.pairedTvs() }, at), visits: visits.summary(30) })
    }),
    'POST /api/operator/action': operator(async (req, session) => {
      const { householdId, action, value } = await req.json()
      const house = ledger.household(householdId)
      if (!house || !OPERATOR_ACTIONS.has(action)) return new Response('No such household or action', { status: 400 })
      if (action === 'invite') {
        // The recovery path for a locked-out Manager: the Operator copies the link and sends it themselves.
        const url = inviteUrl(req, accounts.makeInvite(house.id, null))
        log(`operator action=invite household=${house.id} by=${session.manager.email}`)
        return Response.json({ url })
      }
      if (action === 'dismissReport') ledger.dismissReport(house.id, value)
      if (action === 'rename') house.apply({ type: 'rename', displayName: value })
      if (action === 'timeZone') hub.publish(house.id, house.apply({ type: 'setTimeZone', timeZone: value }))
      if (action === 'suspend' || action === 'unsuspend') {
        ledger.setSuspended(house.id, action === 'suspend')
        if (action === 'suspend') hub.close({ householdId: house.id }) // its phones and TVs, at once
      }
      log(`operator action=${action} household=${house.id} by=${session.manager.email}`)
      return new Response('OK')
    }),
    'POST /api/operator/pause': operator(async (req, session) => {
      const { on } = await req.json()
      ledger.setSiteSwitch(PAUSE_SIGN_UPS, on === true)
      log(`operator action=${on === true ? 'pause-sign-ups' : 'resume-sign-ups'} by=${session.manager.email}`)
      return new Response('OK')
    }),

    // ---- Signing in (spec §3, v2.1 §11). The homepage's Continue with Google posts here; Google sends the person
    // back to the callback. An unknown account gets a new Household (unless sign-ups are paused).
    'POST /auth/google/start': async (req, server) => {
      if (!guard.take('signIn', clientIp(req, server))) return slowDown()
      const form = await req.formData()
      try {
        return redirect(accounts.beginSignIn({ displayName: form.get('displayName'), timeZone: form.get('timeZone'), invite: form.get('invite'), pair: form.get('pair'), redirectUri: callbackUrl(req) }))
      } catch (err) {
        if (err instanceof BadCommand) return page('Pick another name', `<p>${esc(err.message)}.</p><p><a href="${SIGN_IN}">Back</a></p>`, 400)
        throw err
      }
    },
    'GET /auth/google/callback': async (req, server) => {
      const params = new URL(req.url).searchParams
      if (params.has('error')) return redirect('/') // they backed out at Google
      let result
      try {
        result = await accounts.finishSignIn({ code: params.get('code'), state: params.get('state'), redirectUri: callbackUrl(req), ip: clientIp(req, server) })
      } catch (err) {
        console.error('google sign-in failed:', err.message)
        return page('Sign-in didn\'t work', `<p>Google sign-in didn't work. <a href="${SIGN_IN}">Try again</a>.</p>`, 502)
      }
      return signedIn(result)
    },

    // Continue with email: a link to the address, whatever it is. The answer is the same whether or not the
    // address has an account, and whether or not its 3 links per 15 minutes are spent. The send runs after it.
    'POST /auth/email/start': async (req, server) => {
      if (!mail) return notFound()
      const ip = clientIp(req, server)
      if (!guard.take('emailLinkIp', ip)) return slowDown()
      const form = await req.formData()
      const email = String(form.get('email') ?? '').trim()
      if (!isMailAddress(email)) return page('Check the address', `<p>That doesn't look like an email address. <a href="${SIGN_IN}">Back</a></p>`, 400)
      // An invite that's no good says so now, not after the email.
      const invite = String(form.get('invite') ?? '') || null
      const why = invite && accounts.inviteStatus(invite).status
      if (invite && why !== 'ok') return REFUSALS.invite({ why })
      if (guard.take('emailLink', hashOf(email.toLowerCase()))) {
        const { token, code, householdId } = accounts.beginEmailSignIn({ email, timeZone: form.get('timeZone'), pair: form.get('pair'), invite })
        const message = signInEmail({ link: `https://${env.PUBLIC_HOST}/auth/email?token=${token}`, code, to: email, ip, at: now(), timeZone: form.get('timeZone') })
        Promise.resolve()
          .then(() => mail.send({ to: email, ...message }))
          .then(
            () => log(`email-link sent to=${maskEmail(email)} household=${householdId ?? 'new'}`),
            (err) => console.error(`email-link failed to=${maskEmail(email)}: ${err?.message ?? err}`),
          )
      }
      return checkEmail({ email, timeZone: form.get('timeZone'), pair: form.get('pair'), invite }, 200)
    },
    // The code from the email, typed on Check your email (sign-in-simplify 04). 10 tries per address a day, right or
    // wrong, so 6 digits are never worth guessing; a wrong one shows the page again, saying so.
    'POST /auth/email/code': async (req, server) => {
      if (!mail) return notFound()
      const ip = clientIp(req, server)
      if (!guard.take('signIn', ip)) return slowDown()
      const form = await req.formData()
      const email = String(form.get('email') ?? '').trim()
      const asked = { email, timeZone: form.get('timeZone'), pair: form.get('pair'), invite: String(form.get('invite') ?? '') || null }
      if (!guard.take('emailCode', hashOf(email.toLowerCase()))) {
        return page('Too many tries', `<p>Too many codes were tried for this address today. Open the link in the email instead, or try again tomorrow.</p>`, 429)
      }
      const result = accounts.finishEmailCode({ email, code: form.get('code'), ip })
      if (result.refused === 'code') return checkEmail({ ...asked, problem: "That code isn't right. Check the email, or send a new code." }, 400)
      if (result.refused === 'link') return checkEmail({ ...asked, problem: 'That code has expired or was already used. Send a new code.' }, 400)
      return signedIn(result)
    },
    // The link in the email: /auth/email?token=<token>, a shape the Caddy log masks. Opening it uses nothing up,
    // so a mail scanner that fetches links can't spend it: the Sign in button POSTs.
    'GET /auth/email': (req) => {
      if (!mail) return notFound()
      const token = new URL(req.url).searchParams.get('token') ?? ''
      if (accounts.emailLinkStatus(token) !== 'ok') return REFUSALS.link()
      const res = page('Sign in', `<p>Press Sign in to finish signing in to Count Dracula.</p>
<form method="post" action="/auth/email"><input type="hidden" name="token" value="${esc(token)}"><button style="font:inherit;font-weight:700;padding:12px 16px;border:0;border-radius:10px;background:#ff7a1a;color:#1a0d00">Sign in</button></form>`, 200)
      res.headers.set('Cache-Control', 'no-store')
      return res
    },
    'POST /auth/email': async (req, server) => {
      if (!mail) return notFound()
      const ip = clientIp(req, server)
      if (!guard.take('signIn', ip)) return slowDown()
      const form = await req.formData()
      return signedIn(accounts.finishEmailSignIn({ token: String(form.get('token') ?? ''), ip }))
    },
    // Sign out of Count Dracula only: our session goes, the Google account is never touched. It lands on the
    // homepage's sign-in (#sign-in), so a phone that also counts at a door isn't bounced on to /door.
    'POST /auth/signout': (req) => {
      accounts.signOut(tokenOf(req))
      return redirect('/?signed-out=1#sign-in', { 'Set-Cookie': sessionCookie('', 0) })
    },

    // ---- Invite links (spec §3). The link is /invite?key=<token>, a shape the Caddy log masks.
    'GET /invite': (req) => {
      const key = new URL(req.url).searchParams.get('key') ?? ''
      const invite = accounts.inviteStatus(key)
      if (invite.status !== 'ok') return page('Invite link', `<p>${INVITE_PROBLEMS[invite.status]}</p>`, 410)
      return page(
        'You\'re invited',
        `<p>Help run ${invite.displayName ? `<b>${esc(invite.displayName)}</b>'s` : 'a'} trick-or-treat night on Count Dracula, as one of its Managers.</p>
<form method="post" action="/auth/google/start"><input type="hidden" name="invite" value="${esc(key)}">${GOOGLE_BUTTON}</form>
${mail ? emailForm(`<input type="hidden" name="invite" value="${esc(key)}">`) : ''}
<p style="color:#a99cbc;font-size:13px">By continuing you agree to the <a href="/privacy">Privacy notice and House rules</a>.</p>`,
        200,
      )
    },
    'GET /api/managers': manager((req, house, session) =>
      Response.json({
        me: session.manager.id,
        managers: accounts.managers(house.id),
        invites: accounts.unusedInvites(house.id).map(({ token, ...invite }) => ({ ...invite, key: token, url: inviteUrl(req, token) })),
      })),
    'POST /api/invites': manager((req, house, session) => {
      if (!guard.take('invite', house.id)) return tooMany()
      return Response.json({ url: inviteUrl(req, accounts.makeInvite(house.id, session.manager.id)) })
    }),
    'POST /api/invites/revoke': manager(async (req, house) => {
      accounts.revokeInvite(house.id, (await req.json()).key)
    }),
    'POST /api/managers/remove': manager(async (req, house) => {
      accounts.removeManager(house.id, (await req.json()).managerId)
    }),
    // Leave: you go, with your account details; the Household stays with the others.
    'POST /api/managers/leave': manager((req, house, session) => {
      accounts.removeManager(house.id, session.manager.id)
      return new Response('Left', { headers: { 'Set-Cookie': sessionCookie('', 0) } })
    }),

    // ---- Setup (spec §6): a signed-in Manager of the Household.
    'GET /setup': managerPage('/setup'),
    // The print tally sheet, opened from /setup.
    'GET /tally': managerPage('/tally'),
    'GET /api/household': manager((req, house, session) => {
      const { displayName, timeZone, location } = ledger.households().find((h) => h.id === house.id)
      const streams = hub.counts().households[house.id]
      // The ready checklist ticks itself from these (spec v2.1 §8); /setup polls for them.
      // named: renamed from sign-up's "Our household", for the checklist's Also line (sign-in-simplify 05). The
      // marks are the Household's (06); a kid seen here is remembered, so a Reset doesn't untick "Count a test kid".
      const anyKids = house.anyKids()
      if (anyKids > 0 && !house.checklistMarks().kid) house.apply({ type: 'checklist', item: 'kid' })
      const checklist = { tvWatching: (streams?.tvLink ?? 0) + (streams?.paired ?? 0) > 0, anyKids, named: displayName !== NEW_HOUSEHOLD_NAME, ...house.checklistMarks() }
      // The door's Event is what the TV shows: first-run's tick names it (spec v2.1 §8).
      const door = house.doorEvent()
      return Response.json({ id: house.id, displayName, timeZone, location, checklist, testNightEventId: house.testNightId(), door: door && { id: door.id, name: door.name }, lastYear: house.lastYear(), canEstimateLastYear: house.canEstimateLastYear(), screens: { paired: streams?.paired ?? 0, tvLink: streams?.tvLink ?? 0 }, joinKey: house.joinKey(), joinCode: house.joinCode(), joinQrMsLeft: joinQrLeft(house), tvToken: house.tvToken(), watchCode: house.watchCode(), watchQrMsLeft: watchQrLeft(house), manager: { email: session.manager.email, name: session.manager.name }, operator: session.operator })
    }),
    // Delete my Household: typed name to confirm; everything goes at once, and its streams close.
    'POST /api/household/delete': manager(async (req, house) => {
      const { confirm } = await req.json()
      accounts.deleteHousehold(house.id, confirm)
      hub.close({ householdId: house.id })
      joinQrUntil.delete(house.id)
      watchQrUntil.delete(house.id)
      log(`household deleted household=${house.id}`) // with the deletions table, what a restore re-deletes
      return new Response('Deleted', { headers: { 'Set-Cookie': sessionCookie('', 0) } })
    }),
    'GET /api/events': manager((req, house) => Response.json(house.events())),
    // The Night summary's data (spec §12), for a Manager; /summary?event=<id> draws it.
    'GET /api/summary': manager((req, house) => {
      const summary = house.summary(Number(new URL(req.url).searchParams.get('event')))
      return summary ? Response.json(summary) : new Response('No summary: the night is still on, or there is no such night', { status: 404 })
    }),
    'GET /summary': managerPage('/summary'),

    // The Site-wide total for the homepage (spec §14, v2.1 §11): only the rounded line, from the last refresh,
    // and `live` (spec v2.1 §10): whether any counted door's Event is Live, for the homepage's wording.
    'GET /api/site': () => Response.json(nearby.site()),

    // ---- Share links (spec §12): /share?key=<token>, a shape the Caddy log masks. Public: no sign-in.
    'POST /api/share': manager(async (req, house) => {
      const { eventId, hideName } = await req.json()
      const token = shareLinksOn() ? house.share(eventId, hideName === true) : null
      return token ? Response.json({ url: shareUrl(req, token), hideName: hideName === true }) : new Response('No summary to share', { status: 404 })
    }),
    'POST /api/share/off': manager(async (req, house) => {
      house.unshare((await req.json()).eventId)
    }),
    'GET /api/shares': manager((req, house) => Response.json(house.shares().map(({ token, ...s }) => ({ ...s, url: shareUrl(req, token) })))),
    'GET /share': (req) => serveStatic('/summary', req, contact),
    'GET /api/share': (req) => {
      const shared = sharedNight(new URL(req.url).searchParams.get('key'))
      if (!shared) return new Response('Not available', { status: 404 })
      const summary = ledger.household(shared.householdId).summary(shared.eventId)
      if (!summary) return new Response('Not available', { status: 404 })
      return Response.json({ ...summary, displayName: shared.hideName ? '' : summary.displayName })
    },
    // "Report this page", from a share page: 5 per IP per day; no email, the Operator sees it on /operator.
    'POST /api/report': async (req, server) => {
      if (!guard.take('report', clientIp(req, server))) return tooMany()
      const { key, reason } = await req.json().catch(() => ({}))
      const shared = sharedNight(key)
      if (!shared) return new Response('Not available', { status: 404 })
      ledger.addReport({ householdId: shared.householdId, eventId: shared.eventId, reason })
      return new Response('Thanks: the Operator will take a look.')
    },
    // ⬇ Export event (spec §6): a CSV download.
    'GET /api/export': manager((req, house) => {
      const night = house.exportEvent(Number(new URL(req.url).searchParams.get('event')))
      if (!night) return notFound()
      const filename = night.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'event'
      return new Response(toCsv(night), {
        headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}.csv"` },
      })
    }),
    // ?event=<id>, or the door's Event's.
    'GET /api/batches': manager((req, house) => {
      const id = new URL(req.url).searchParams.get('event')
      return Response.json(house.batches(id == null ? null : Number(id)))
    }),
    'POST /api/admin': manager(async (req, house) => {
      const command = await req.json()
      if (!ADMIN_COMMANDS.has(command?.type)) throw new BadCommand(`Not a Setup command: ${command?.type}`)
      const [oldKey, oldTv] = [house.joinKey(), house.tvToken()]
      const deltas = house.apply(command)
      hub.publish(house.id, deltas)
      // Change join key and Rotate TV link cut off the old credential's streams at once.
      if (house.joinKey() !== oldKey) {
        hub.close({ householdId: house.id, credential: oldKey })
        // A QR on the TV now shows a dead key: take it down.
        if (joinQrUntil.delete(house.id)) publishJoinQr(house)
      }
      if (house.tvToken() !== oldTv) {
        hub.close({ householdId: house.id, credential: oldTv })
        if (watchQrUntil.delete(house.id)) publishWatchQr(house) // its QR and code are dead now
      }
      return Response.json({ deltas, joinKey: house.joinKey() })
    }),
    // ☰ "🌙 End the night" / "Resume the night": any phone with the join key. Every night write names its
    // Event and the go-live stamp the phone saw (spec v2.1 §4).
    'POST /api/end': write(async (req, house) => {
      const { eventId, stamp } = await req.json()
      hub.publish(house.id, house.apply({ type: 'end', eventId, stamp, nearby: nearbyArea(house.id) }))
    }),
    'POST /api/resume': write(async (req, house) => {
      const { eventId, stamp } = await req.json()
      hub.publish(house.id, house.apply({ type: 'resume', eventId, stamp }))
    }),
    // ☰ "Release remaining tickets": any phone with the join key (the phone shows it from 7:45pm event time).
    'POST /api/release': write(async (req, house) => {
      const { eventId, stamp } = await req.json()
      hub.publish(house.id, house.apply({ type: 'release', eventId, stamp }))
    }),
    // ☰ soundboard: any phone with the key; the answer says whether it played or hit the cooldown.
    'POST /api/soundboard': write(async (req, house) => {
      const { slot, eventId, stamp } = await req.json()
      const deltas = house.apply({ type: 'soundboard', slot, eventId, stamp })
      hub.publish(house.id, deltas)
      return Response.json({ played: deltas.length > 0 })
    }),
    'POST /api/mix': write(async (req, house) => {
      const { volume, mutes } = await req.json()
      hub.publish(house.id, house.apply({ type: 'mix', volume, mutes }))
    }),
    // ☰ Add a helper's "📺 Show on the TV", and /setup's: the helper QR on the paired TVs for 2 minutes, or
    // { show: false } to take it down. The answer counts the paired TVs on now, so 0 is said, not pretended.
    'POST /api/tv/join-qr': write(async (req, house) => {
      const { show } = await req.json()
      if (show && !guard.take('joinQr', house.id)) return tooMany()
      const tvs = hub.counts().households[house.id]?.paired ?? 0
      // With no paired TV on, nothing is held: the phone says so rather than offer to hide it from no TV.
      if (show && tvs) {
        joinQrUntil.set(house.id, now() + JOIN_QR_MS)
        if (watchQrUntil.delete(house.id)) publishWatchQr(house)
      } else joinQrUntil.delete(house.id)
      publishJoinQr(house)
      const viewers = hub.counts().households[house.id]?.tvLink ?? 0 // screens on the TV link, which never get it
      return Response.json({ shown: joinQrLeft(house) > 0, msLeft: joinQrLeft(house), tvs, viewers })
    }),
    // ☰ "📺 Show the watch QR on the TV", and /setup's: the watch QR on the paired TVs for 2 minutes, or
    // { show: false } to take it down. The answer counts the paired TVs on now, and the TV-link screens, which
    // never get it, so the phone can say why.
    'POST /api/tv/watch-qr': write(async (req, house) => {
      const { show } = await req.json()
      if (show && !guard.take('joinQr', house.id)) return tooMany()
      const streams = hub.counts().households[house.id]
      const [tvs, viewers] = [streams?.paired ?? 0, streams?.tvLink ?? 0]
      if (show && tvs) {
        watchQrUntil.set(house.id, now() + JOIN_QR_MS)
        if (joinQrUntil.delete(house.id)) publishJoinQr(house)
      } else watchQrUntil.delete(house.id)
      publishWatchQr(house)
      return Response.json({ shown: watchQrLeft(house) > 0, msLeft: watchQrLeft(house), tvs, viewers })
    }),
    // The ☰ menu's codes: the join code, the watch code and the TV link it stands for, read when the menu opens, so
    // a Change join key or Rotate TV link in /setup shows at once. A door phone may hand them on: a counter can
    // already see more.
    'GET /api/codes': write((req, house) => Response.json({ joinCode: house.joinCode(), watchCode: house.watchCode(), tvToken: house.tvToken() })),
    // A new phone's name, typed on its first screen: refused if another phone has it, so the Recent list and the
    // night's helpers never mix two people up. Taken means it counted a kid on an open night, or another phone
    // chose it in the last day; the same phone (by its device id) may choose its own again.
    'POST /api/phone-name': write(async (req, house) => {
      const { name, deviceId } = await req.json()
      const clean = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
      if (!clean) return new Response('Type your name first', { status: 400 })
      const key = clean.toLowerCase()
      const claims = phoneNames.get(house.id) ?? new Map()
      for (const [k, claim] of claims) if (now() - claim.at > NAME_CLAIM_MS) claims.delete(k)
      const claim = claims.get(key)
      const mine = claim != null && DEVICE_ID.test(deviceId ?? '') && claim.deviceId === deviceId
      const counted = [BACKFILL_PHONE, ...house.phoneNamesTonight()].some((n) => n.toLowerCase() === key)
      if (!mine && (claim || counted)) return new Response(`Someone's already counting as ${clean}. Add something to tell you apart, like ${clean} B.`, { status: 409 })
      claims.set(key, { deviceId: DEVICE_ID.test(deviceId ?? '') ? deviceId : null, at: now() })
      phoneNames.set(house.id, claims)
      return Response.json({ name: clean })
    }),
    'POST /api/catch-up': write(async (req, house) => {
      if (!guard.take('taps', house.id)) return tooMany()
      const { tag, n, kid, eventId, stamp } = await req.json()
      hub.publish(house.id, house.apply({ type: 'catchUp', tag, n, kid, eventId, stamp }))
    }),
  }

  // A phone's join key (X-Join-Key, or ?key=), the TV link's token (?key=), or a Manager's session
  // cookie, and its Household: { householdId, kind: 'key' | 'tv' | 'session', token }, or null.
  function credentialOf(req) {
    const header = req.headers.get('X-Join-Key')
    const key = header ?? new URL(req.url).searchParams.get('key')
    if (key) {
      // A Suspended Household's phones and TVs are refused, like a wrong key (spec §13).
      const householdId = ledger.householdByJoinKey(key)
      if (householdId != null) return ledger.isSuspended(householdId) ? null : { householdId, kind: 'key', token: key }
      const tvHousehold = header ? null : ledger.householdByTvToken(key)
      if (tvHousehold == null || ledger.isSuspended(tvHousehold)) return null
      // A TV paired by code also carries its device token (?device=): the Household's own TV, not a viewer.
      const paired = ledger.isPairedDevice(tvHousehold, new URL(req.url).searchParams.get('device'))
      return { householdId: tvHousehold, kind: 'tv', token: key, paired }
    }
    const token = tokenOf(req)
    const session = accounts.session(token)
    return session ? { householdId: session.householdId, kind: 'session', token, session } : null
  }

  // The door's Event's reads: a join key, a TV link or a Manager's session.
  function read(handler) {
    return async (req, server) => {
      const credential = credentialOf(req)
      if (!credential) {
        // A Suspended Household's key or TV link isn't dead (Unsuspend restores everything), so the door
        // phone is told, and keeps its key; any other refused key is one to forget (spec v2.1 §4).
        const key = req.headers.get('X-Join-Key') ?? new URL(req.url).searchParams.get('key')
        const owner = key ? (ledger.householdByJoinKey(key) ?? ledger.householdByTvToken(key)) : null
        if (owner != null && ledger.isSuspended(owner)) return new Response('This Household is suspended by the Operator', { status: 403, headers: { 'X-Refused': 'suspended' } })
        return new Response('Join with a helper code, or sign in', { status: 403 })
      }
      const res = await handler(req, ledger.household(credential.householdId), credential, server)
      return credential.session ? renew(res, credential.session, req) : res
    }
  }

  // Check your email (sign-in-simplify 04): the box for the code, Send a new code (the same ask again) and Use a
  // different email. The same page whether or not the address has an account, or was sent anything.
  function checkEmail({ email, timeZone, pair, invite, problem = null }, status) {
    const hidden = (name, value) => (value ? `<input type="hidden" name="${name}" value="${esc(value)}">` : '')
    const asked = hidden('email', email) + hidden('timeZone', timeZone) + hidden('pair', tvCodeFrom(pair)) + hidden('invite', invite)
    const back = invite ? `/invite?key=${encodeURIComponent(invite)}` : SIGN_IN
    const res = page('Check your email', `<p>We've sent a sign-in code to <b>${esc(email)}</b>. Type it here, or open the link in the email.</p>
<form method="post" action="/auth/email/code">${asked}<label for="code">The 6-digit code</label>
<input id="code" name="code" class="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required autofocus>
${problem ? `<p class="problem" role="alert">${esc(problem)}</p>` : ''}<button class="plain primary" type="submit">Sign in</button></form>
<p style="color:#a99cbc;font-size:13px">It works once, for 15 minutes. Nothing after a few minutes? Check your spam folder.</p>
<form method="post" action="/auth/email/start" class="links">${asked}<button class="link" type="submit">Send a new code</button> · <a href="${esc(back)}">Use a different email</a></form>`, status)
    res.headers.set('Cache-Control', 'no-store')
    return res
  }

  // Where a sign-in ends: /setup with the session cookie, carrying a TV's code on as /setup?pair= (spec v2.1
  // §11), or the page that says why not.
  function signedIn(result) {
    if (result.refused) return REFUSALS[result.refused](result)
    return redirect(result.pair ? `/setup?pair=${result.pair}` : '/setup', { 'Set-Cookie': sessionCookie(result.token) })
  }

  // A page only a signed-in Manager opens; anyone else goes to sign-in. A Suspended Household's Managers see
  // the notice and the contact instead.
  function managerPage(pathname) {
    return async (req) => {
      const session = accounts.session(tokenOf(req))
      if (!session) {
        // A TV's scan-to-pair QR on a signed-out phone: the code waits on the homepage's Sign in (spec v2.1 §11).
        const pair = tvCodeFrom(new URL(req.url).searchParams.get('pair'))
        return redirect(pair ? `/?pair=${pair}#sign-in` : SIGN_IN)
      }
      if (ledger.isSuspended(session.householdId)) return page('Suspended', `<p>This Household is suspended by the Operator.</p><p>Questions: <a href="mailto:${esc(contact)}">${esc(contact)}</a></p>`, 403)
      return renew(await serveStatic(pathname, req, contact), session, req)
    }
  }

  // Every write carries its Household's join key.
  function write(handler) {
    return async (req) => {
      const id = ledger.householdByJoinKey(req.headers.get('X-Join-Key'))
      if (id == null || ledger.isSuspended(id)) return new Response('Wrong join key', { status: 403 })
      try {
        const res = await handler(req, ledger.household(id))
        if (res) return res
      } catch (err) {
        if (err instanceof BadCommand || err instanceof SyntaxError) {
          return new Response(err.message, { status: 400 })
        }
        throw err
      }
      return new Response('OK')
    }
  }

  // Setup's reads and commands: the session leads to the Manager's one Household (not while it's Suspended).
  function manager(handler) {
    return async (req, server) => {
      const session = accounts.session(tokenOf(req))
      if (!session) return new Response('Sign in first', { status: 401 })
      if (ledger.isSuspended(session.householdId)) return new Response(`This Household is suspended by the Operator. Contact: ${contact}`, { status: 403 })
      let res
      try {
        res = (await handler(req, ledger.household(session.householdId), session, server)) ?? new Response('OK')
      } catch (err) {
        if (err instanceof BadCommand || err instanceof SyntaxError) return new Response(err.message, { status: 400 })
        throw err
      }
      return renew(res, session, req)
    }
  }

  // The Operator's pages and API: a signed-in Manager on OPERATOR_EMAILS.
  function operator(handler) {
    return async (req, server) => {
      const session = accounts.session(tokenOf(req))
      if (!session) return new Response('Sign in first', { status: 401 })
      if (!session.operator) return new Response('Not for you', { status: 403 })
      try {
        return renew((await handler(req, session, server)) ?? new Response('OK'), session, req)
      } catch (err) {
        if (err instanceof BadCommand || err instanceof SyntaxError) return new Response(err.message, { status: 400 })
        throw err
      }
    }
  }

  // A session that was just renewed sends its cookie again, with a fresh 90 days.
  function renew(res, session, req) {
    if (session.renewed && !res.headers.has('Set-Cookie')) res.headers.append('Set-Cookie', sessionCookie(tokenOf(req)))
    return res
  }

  // This site's address: the public one in production, the request's own in development.
  function publicOrigin(req) {
    return env.PUBLIC_HOST ? `https://${env.PUBLIC_HOST}` : originOf(req)
  }

  // Google's callback on this host.
  function callbackUrl(req) {
    return `${publicOrigin(req)}/auth/google/callback`
  }

  function shareUrl(req, token) {
    return `${publicOrigin(req)}/share?key=${token}`
  }

  const shareLinksOn = () => ({ ...DEFAULT_SWITCHES, ...config.switches }).shareLinks

  // A share link's night, unless sharing is switched off or its Household is Suspended: then "Not available".
  function sharedNight(token) {
    const shared = shareLinksOn() ? ledger.byShareToken(token) : null
    return shared && !ledger.isSuspended(shared.householdId) ? shared : null
  }

  function inviteUrl(req, token) {
    return `${publicOrigin(req)}/invite?key=${token}`
  }

  // Behind a proxy, the visitor's address (server/client-ip.js).
  // A public page served to someone not signed in (a Manager is counted already): server/visits.js keeps the counts.
  function countVisit(req, server) {
    const { pathname } = new URL(req.url)
    if (!VISIT_PAGES.has(pathname) || accounts.session(tokenOf(req))) return
    visits.record({
      page: pathname,
      ip: clientIp(req, server),
      userAgent: req.headers.get('User-Agent') ?? '',
      referer: req.headers.get('Referer'),
      url: req.url,
      host: new URL(originOf(req)).hostname,
    })
  }

  function clientIp(req, server) {
    return clientIpOf(req.headers.get('CF-Connecting-IP'), server?.requestIP(req)?.address, trusted)
  }

  function route(req, server) {
    const { pathname } = new URL(req.url)
    if (req.method !== 'GET' && req.method !== 'HEAD' && crossSite(req, env.PUBLIC_HOST)) return new Response('Refused: this came from another site', { status: 403 })
    const extension = extensionAt(pathname)
    if (extension) return extensionRoute(extension, req, new URL(req.url))
    const handler = routes[`${req.method} ${pathname}`]
    if (handler) return handler(req, server)
    // The TV link's page: the same TV page; it reads its token from the address.
    if (req.method === 'GET' && pathname.startsWith('/tv/k/')) return serveStatic('/tv', req, contact, 'watch')
    if (req.method === 'GET') return serveStatic(pathname, req, contact)
    return notFound()
  }

  // Extensions (v2.2 §3, ADR 0001), in list order, once the core's migrations have run and before the server
  // listens: its own steps, then its owns recorded (v2.2 §5–6), then start. A throw here (a bad name, a taken one,
  // a step that touched a core table, owns naming a table or column it lacks, a throw in start) stops the server,
  // so /healthz never answers and the deploy rolls back. An entry module: { name, dir, owns, migrations, start(core) → { handle(req, url),
  // stop() } }, where dir is its own folder (import.meta.dir), whose public/ is served at /<name>/.
  const loaded = [] // { name, publicDir, handle, stop }
  try {
    const taken = coreNames(routes)
    for (const ext of extensions) {
      if (!EXTENSION_NAME.test(ext.name ?? '')) throw new Error(`An Extension's name is lower-case letters and digits, not ${JSON.stringify(ext.name)}`)
      if (taken.has(ext.name)) throw new Error(`The Extension name ${ext.name} is taken`)
      taken.add(ext.name)
      migrateExtension(db, ext, { now })
      recordOwns(db, ext)
      const publicDir = ext.dir ? resolve(ext.dir, 'public') : null
      const { handle, stop } = ext.start(coreFor(ext.name, publicDir))
      if (typeof handle !== 'function') throw new Error(`The Extension ${ext.name} started with no handle`)
      loaded.push({ name: ext.name, publicDir, handle, stop })
    }
  } catch (err) {
    stopCore()
    for (const ext of loaded) ext.stop?.()
    throw err
  }

  // What an Extension's start gets (v2.2 §3), and nothing more: its own env keys and site switches, the core's
  // guards as they are (bound to this server, since handle has none), and its public/ folder templated like ours.
  function coreFor(name, publicDir) {
    const envPrefix = `${name.toUpperCase()}_`
    const own = (key) => {
      if (!String(key).startsWith(`${name}.`)) throw new Error(`The Extension ${name} has only the site switches under ${name}., not ${key}`)
      return key
    }
    return Object.freeze({
      db,
      ledger,
      guard: Object.freeze({
        read: (handler) => (req) => read(handler)(req, server),
        manager: (handler) => (req) => manager(handler)(req, server),
        operator: (handler) => (req) => operator(handler)(req, server),
        take: (rule, key) => guard.take(rule, key),
      }),
      clientIp: (req) => clientIp(req, server),
      serve: (req, path) => (publicDir ? serveFile(publicDir, `/${path}`, req, contact) : notFound()),
      now,
      log,
      env: Object.freeze(Object.fromEntries(Object.entries(env).filter(([key]) => key.startsWith(envPrefix)))),
      switches: Object.freeze({ ...switches }),
      siteSwitch: (key) => ledger.siteSwitch(own(key)),
      setSiteSwitch: (key, on) => ledger.setSiteSwitch(own(key), on),
    })
  }

  // The Extension whose name starts this address: /<name>, /<name>/…, /api/<name> or /api/<name>/….
  function extensionAt(pathname) {
    const [, first, second] = pathname.split('/')
    const api = first === 'api'
    const ext = loaded.find((e) => e.name === (api ? second : first))
    return ext ? { ext, api } : null
  }

  // Its handle's answer, or else its public/ folder at /<name>/… (/<name> is its index.html).
  async function extensionRoute({ ext, api }, req, url) {
    const res = await ext.handle(req, url)
    if (res) return res
    if (api || req.method !== 'GET' || !ext.publicDir) return notFound()
    const rest = url.pathname.slice(ext.name.length + 1)
    return serveFile(ext.publicDir, rest === '' || rest === '/' ? '/index.html' : rest, req, contact)
  }

  // The core's own timers and streams: stopped before any Extension's, and if an Extension fails to start.
  function stopCore() {
    clearInterval(nearbyTimer)
    process.off('uncaughtException', onUncaught)
    process.off('unhandledRejection', onUncaught)
    clearInterval(ticker)
    stopBackups()
    hub.shutdown()
  }

  const server = Bun.serve({
    port: port ?? config.port,
    maxRequestBodySize: MAX_BODY_BYTES,
    async fetch(req, server) {
      let res
      try {
        if (failNext) {
          const message = failNext
          failNext = null
          throw new Error(message)
        }
        res = await route(req, server)
        if (req.method === 'GET' && res.status === 200) countVisit(req, server)
        if (res.status >= 500 && res.status !== 503) recordError(`HTTP ${res.status}`, req) // 503 is a refusal (a full TV, paused sign-ups)
      } catch (err) {
        recordError(err?.name ?? 'Error', req)
        console.error(`error in ${req.method} ${new URL(req.url).pathname}:`, err)
        res = new Response('Something went wrong', { status: 500 })
      }
      return withSecurityHeaders(res)
    },
  })

  return {
    url: server.url.origin,
    ledger,
    hub,
    guard,
    backups,
    failNextRequest(message) {
      failNext = message
    },
    refreshNearby,
    tick,
    stop() {
      stopCore()
      for (const ext of loaded) ext.stop?.()
      server.stop(true)
    },
  }
}

// The link previews a page fills in (__PREVIEW_TITLE__, __PREVIEW_TEXT__, __PREVIEW_IMAGE__) when one file serves
// two kinds of link: the TV page is a bare /tv (a screen to pair) or a TV link (watch along).
const PREVIEWS = {
  '/tv': {
    title: 'Make this screen your porch TV',
    text: 'Open this on the computer by your porch TV: it shows a code to pair it with your household, then your count, live.',
    image: 'og-home.png',
  },
  watch: {
    title: 'Watch our trick-or-treat count, live',
    text: 'See every trick-or-treater as our porch TV counts them: the total, the costumes and the race against last year. Just watching: no app and no sign-in.',
    image: 'og-watch.png',
  },
}

async function serveStatic(pathname, req, contact = DEFAULT_CONTACT, preview = pathname) {
  const [dir, rest] = pathname.startsWith('/shared/')
    ? [SHARED_DIR, pathname.slice('/shared'.length)]
    : pathname.startsWith('/kiosk/')
      ? [KIOSK_DIR, pathname.slice('/kiosk'.length)]
      : [PUBLIC_DIR, PAGES[pathname] ?? pathname]
  return serveFile(dir, rest, req, contact, preview)
}

// One file of a folder the core serves (public/, shared/, kiosk/ or an Extension's public/): `rest` is its path
// in the folder, still URL-encoded. Nothing outside the folder, and never a test file.
async function serveFile(dir, rest, req, contact = DEFAULT_CONTACT, preview) {
  let path
  try {
    path = resolve(dir, '.' + decodeURIComponent(rest))
  } catch {
    return notFound()
  }
  if (!path.startsWith(dir + sep) || path.endsWith('.test.js')) return notFound()
  const file = Bun.file(path)
  if (!(await file.exists())) return notFound()
  // The launchers say __ORIGIN__ wherever they need the server's address: filled in with the address
  // they were downloaded from (https via Caddy on the tailnet, or the LAN address).
  const cache = { 'Cache-Control': cacheControlOf(path) }
  if (dir === KIOSK_DIR) return new Response((await file.text()).replaceAll('__ORIGIN__', originOf(req)), { headers: { 'Content-Type': file.type, ...cache } })
  // Pages that offer help or the privacy contact say __CONTACT__: filled in with OPERATOR_CONTACT, never committed.
  // __ORIGIN__ is this site's address, for the share page's link-preview tags, which want absolute URLs.
  if (path.endsWith('.html')) {
    const card = PREVIEWS[preview]
    let html = (await file.text()).replaceAll('__CONTACT__', esc(contact)).replaceAll('__ORIGIN__', esc(originOf(req))).replaceAll('__VERSION__', VERSION)
    if (card) html = html.replaceAll('__PREVIEW_TITLE__', esc(card.title)).replaceAll('__PREVIEW_TEXT__', esc(card.text)).replaceAll('__PREVIEW_IMAGE__', card.image)
    return new Response(stampScripts(html), { headers: { 'Content-Type': file.type, ...cache } })
  }
  if (path.endsWith('.js')) return new Response(stampImports(await file.text()), { headers: { 'Content-Type': file.type, ...cache } })
  // Plain files revalidate cheaply: Last-Modified, and a 304 when the browser's copy is current.
  const modified = new Date(Math.floor(file.lastModified / 1000) * 1000)
  const since = Date.parse(req.headers.get('If-Modified-Since') ?? '')
  if (!Number.isNaN(since) && since >= modified.getTime()) return new Response(null, { status: 304, headers: cache })
  return new Response(file, { headers: { ...cache, 'Last-Modified': modified.toUTCString() } })
}

// Every script's address carries this build (?v=), in the pages' <script> tags and in every import, so no cache
// can hand a new page last deploy's code: Cloudflare forces browsers to keep .js for 4 hours whatever we send.
// Both spellings of an import ('/x.js', './x.js') get the same stamp, so each module still loads once.
const BUILD = Date.now().toString(36)
const stampScripts = (html) => html.replace(/(<script\b[^>]*\ssrc=")(\/(?!\/)[^"?#]+\.js)"/g, `$1$2?v=${BUILD}"`)
const stampImports = (js) =>
  js.replace(/(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])((?:\.{1,2}\/|\/(?!\/))[^'"?#\s]+\.js)\2/g, `$1$2$3?v=${BUILD}$2`)

// Told nothing, Cloudflare keeps .js and .css at its edge and in browsers for 4 hours, so a deploy's new page would
// run last deploy's scripts. Pages, scripts, styles and data revalidate on every load; pictures, fonts and sounds,
// which never change under the same name in practice, keep a day.
function cacheControlOf(path) {
  return /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|mp3|ogg|wav|m4a)$/i.test(path) ? 'public, max-age=86400' : 'no-cache'
}

// The names no Extension can take (v2.2 §3): the first part of every core address, the second of every /api/ one,
// and public/'s folders.
function coreNames(routes) {
  const names = new Set(['shared', 'kiosk'])
  for (const path of [...Object.keys(routes).map((key) => key.split(' ')[1]), ...Object.keys(PAGES)]) {
    const [, first, second] = path.split('/')
    names.add(first)
    if (first === 'api' && second) names.add(second)
  }
  for (const entry of readdirSync(PUBLIC_DIR, { withFileTypes: true })) if (entry.isDirectory()) names.add(entry.name)
  return names
}

function originOf(req) {
  const proto = req.headers.get('X-Forwarded-Proto') ?? new URL(req.url).protocol.slice(0, -1)
  return `${proto}://${req.headers.get('Host') ?? new URL(req.url).host}`
}

function tokenOf(req) {
  const cookies = req.headers.get('Cookie') ?? ''
  return cookies.split(/;\s*/).find((c) => c.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1) ?? null
}

// A browser's write from another site, sibling subdomains included: they're the same site to SameSite=Lax, so the
// session cookie goes along (the check Go's CrossOriginProtection makes). Sec-Fetch-Site says so; a browser too old
// to send it is judged by its Origin against this host. A request with neither isn't a browser's, so it carries
// nobody's cookie by accident.
function crossSite(req, publicHost) {
  const site = req.headers.get('Sec-Fetch-Site')
  if (site) return site !== 'same-origin' && site !== 'none'
  const origin = req.headers.get('Origin')
  if (origin == null) return false
  const host = URL.canParse(origin) ? new URL(origin).host : null
  return !host || (host !== req.headers.get('Host') && host !== publicHost)
}

// The same browser security headers on every response (spec §15): no inline script, nothing from elsewhere
// but OSM's tiles, Google as the only place a form goes, and no framing. HSTS comes from Caddy.
const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://tile.openstreetmap.org; " +
    "connect-src 'self'; form-action 'self' https://accounts.google.com; frame-ancestors 'none'",
  'Referrer-Policy': 'strict-origin-when-cross-origin', // OSM gets the origin it asks for; a TV link's path goes nowhere
  'X-Content-Type-Options': 'nosniff',
}

function withSecurityHeaders(res) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.headers.set(name, value)
  return res
}

function slowDown() {
  return page('Slow down', '<p>Too many sign-ins from here. Try again in a while.</p>', 429)
}

function hashOf(text) {
  return new Bun.CryptoHasher('sha256').update(text).digest('hex').slice(0, 16)
}

function tooMany() {
  return new Response('Too many: slow down and try again', { status: 429 })
}

function redirect(location, headers = {}) {
  return new Response(null, { status: 303, headers: { Location: location, ...headers } })
}

const esc = (text) => String(text ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

// A small plain page for the sign-in outcomes that aren't /setup.
// Continue with Google as Google's own button (its branding guidelines), as on the homepage; page() styles it.
const GOOGLE_BUTTON = '<button class="google" type="submit"><img src="/google-g.svg" alt="" width="20" height="20">Continue with Google</button>'

// Continue with email, as on the homepage, for a server page; `hidden` is the form's extra hidden inputs.
// /time-zone.js fills in the browser's time zone (inline scripts are refused by the CSP).
function emailForm(hidden = '') {
  return `<form method="post" action="/auth/email/start">${hidden}<input type="hidden" name="timeZone">
<p class="or">or</p><label for="email">Your email</label>
<input id="email" name="email" type="email" autocomplete="email" required maxlength="254" placeholder="you@example.com">
<button class="plain" type="submit">Continue with email</button></form>
<script src="/time-zone.js" defer></script>`
}

function page(title, bodyHtml, status) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><link rel="icon" href="/favicon.ico" sizes="any"><link rel="apple-touch-icon" href="/icon.png">
<style>body{margin:0;padding:24px 16px;background:#14101c;color:#f5efe6;font:17px/1.5 system-ui,sans-serif;max-width:560px;margin-inline:auto}a{color:#ff7a1a}
.google{display:flex;align-items:center;justify-content:center;gap:12px;width:100%;max-width:400px;font:inherit;font-weight:600;padding:12px 16px;border-radius:10px;cursor:pointer;background:#fff;color:#1f1f1f;border:1px solid #747775}.google img{width:20px;height:20px}.google:focus-visible{outline:3px solid #ff7a1a;outline-offset:2px}
form{max-width:400px}label{display:block;color:#a99cbc;font-size:13px;margin:0 0 4px}input{box-sizing:border-box;width:100%;font:inherit;color:inherit;padding:12px;border-radius:10px;border:1px solid #ffffff30;background:#14101c}
.plain{display:block;width:100%;margin-top:10px;font:inherit;font-weight:700;padding:12px 16px;border:0;border-radius:10px;cursor:pointer;background:#2d2340;color:#f5efe6}
.or{display:flex;align-items:center;gap:10px;color:#a99cbc;font-size:13px;margin:16px 0 10px}.or::before,.or::after{content:"";flex:1;border-top:1px solid #ffffff20}
.primary{background:#ff7a1a;color:#1a0d00}input.code{font:600 28px/1 ui-monospace,Menlo,monospace;letter-spacing:8px;text-align:center}.problem{color:#ff8a8a;margin:8px 0 0}
.links{margin-top:16px;color:#a99cbc}.link{font:inherit;color:#ff7a1a;background:none;border:0;padding:0;text-decoration:underline;cursor:pointer}</style></head>
<body><h1>🧛 ${esc(title)}</h1>${bodyHtml}</body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}

// Why a sign-in didn't end in /setup (Accounts' finishSignIn refusals).
const REFUSALS = {
  state: () => page('Start again', `<p>That sign-in link has expired or was already used. <a href="${SIGN_IN}">Start again</a>.</p>`, 400),
  link: () => page('Start again', `<p>That sign-in link has expired or was already used: each one works once, for 15 minutes. <a href="${SIGN_IN}">Get a new one</a>.</p>`, 400),
  unverified: () => page('Email not verified', '<p>Google hasn\'t verified this account\'s email yet, so it can\'t sign in.</p>', 403),
  paused: () => page('Sign-ups are paused', '<p>Sign-ups are paused, try again later.</p>', 503),
  alreadyManager: () => page('One household each', "<p>You already manage a household here, and each email address can manage one. To help this one, sign in with another address.</p><p><a href=\"/setup\">Go to your household</a></p>", 409),
  invite: ({ why }) => page('Invite link', `<p>${INVITE_PROBLEMS[why] ?? INVITE_PROBLEMS.unknown}</p>`, 410),
}

// Why an Invite link didn't work, in the words the invited person sees.
const INVITE_PROBLEMS = {
  used: 'This invite link has already been used. Ask a Manager for a new one.',
  expired: 'This invite link has expired: they last 7 days. Ask a Manager for a new one.',
  revoked: 'This invite link was cancelled. Ask a Manager for a new one.',
  unknown: "This invite link doesn't work. Check it was copied whole, or ask a Manager for a new one.",
}

function notFound() {
  return new Response('Not found', { status: 404 })
}
