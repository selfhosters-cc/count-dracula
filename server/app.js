// The HTTP layer stays thin: find the credential's Household, parse the body, call apply on that Household,
// publish the deltas. Every read and write carries a credential (v2 spec §3): a phone's join key, or a
// Manager's session. There's no Household in any URL: the credential carries it.
import { Database } from 'bun:sqlite'
import { resolve, sep } from 'node:path'
import { loadConfig } from './config.js'
import { BadCommand, DEFAULT_SWITCHES, openLedger } from './ledger.js'
import { openAccounts } from './accounts.js'
import { googleClient } from './google.js'
import { createHub } from './hub.js'
import { createPairing } from './pairing.js'
import { LIMITS, createGuard } from './guard.js'
import { createBackups } from './backups.js'
import { STATUSES, healthTiles, householdStatus } from './operator.js'
import { createNearby } from './nearby.js'
import { isBlocked } from './blocklist.js'
import { toCsv } from './export.js'

const PUBLIC_DIR = resolve(import.meta.dir, '../public')
const SHARED_DIR = resolve(import.meta.dir, '../shared') // served at /shared/ for the browser
const KIOSK_DIR = resolve(import.meta.dir, '../kiosk') // the TV laptop's launchers, downloadable from /kiosk/
const PAGES = { '/': '/home.html', '/door': '/door.html', '/tv': '/tv.html', '/setup': '/setup.html', '/tally': '/tally.html', '/help/tv': '/help-tv.html', '/operator': '/operator.html', '/privacy': '/privacy.html', '/summary': '/summary.html' }
const ADMIN_COMMANDS = new Set(['createEvent', 'goLive', 'settings', 'changeKey', 'deleteEvent', 'createTag', 'updateTag', 'deleteTag', 'addTicket', 'backfill', 'removeBatch', 'rename', 'rotateTvLink', 'setLocation', 'passFirstRun', 'setLastYear', 'close', 'reset'])

// What a TV-link holder gets (spec §9): what the TV draws, without each kid's phone name.
const withoutPhone = ({ phoneName, ...kid }) => kid
const tvSnapshot = (snap) => ({ ...snap, kids: snap.kids.map(withoutPhone) })
const tvDelta = (delta) => (delta.kid ? { ...delta, kid: withoutPhone(delta.kid) } : delta)

const PAUSE_SIGN_UPS = 'pauseSignUps'
// Where "go sign in" lands (spec v2.1 §11): the homepage's Sign in form. The hash keeps the homepage even on a
// phone that remembers a door's key (doorRedirect in public/door-view.js).
const SIGN_IN = '/#sign-in'
const DEFAULT_CONTACT = 'privacy@count-dracula.example.com'
const OPERATOR_ACTIONS = new Set(['rename', 'timeZone', 'suspend', 'unsuspend', 'invite', 'dismissReport'])

// The sign-in cookie (spec §3): 90 days, renewed with use; the session itself lives server-side.
const SESSION_COOKIE = 'cd_session'
const sessionCookie = (token, maxAge = 90 * 86_400) => `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`

// env: PUBLIC_HOST, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OPERATOR_EMAILS, HOUSEHOLD1_MANAGER_EMAIL (deploy/local.env).
// google, now, canSignUp, tickMs, limits and log are seams for the tests.
export function startServer({ configPath, port, heartbeatMs, env = process.env, google, now = Date.now, canSignUp, tickMs = 60_000, limits = LIMITS, log = console.log }) {
  const config = loadConfig(configPath)
  const guard = createGuard({ now, limits, log })
  const contact = env.OPERATOR_CONTACT || DEFAULT_CONTACT // the one contact address (spec §5)
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
  const accounts = openAccounts(db, {
    ledger,
    google: google ?? googleClient({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }),
    now,
    household1Email: env.HOUSEHOLD1_MANAGER_EMAIL ?? '',
    operatorEmails: (env.OPERATOR_EMAILS ?? '').split(/[\s,]+/).filter(Boolean),
    // A new Household: not while sign-ups are paused (checked first, so it spends no token), then 3 per IP
    // per day and 60 site-wide per hour (spec §15).
    canSignUp: (ctx) =>
      !ledger.siteSwitch(PAUSE_SIGN_UPS) &&
      (canSignUp ?? (({ ip }) => guard.take('householdsPerIp', ip) && guard.take('householdsSite', 'site')))(ctx),
  })
  const hub = createHub({ heartbeatMs })
  const pairing = createPairing({ now })

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
  const nearby = createNearby({ nights: () => ledger.nearbyNights(now()), isBlocked, enabled: switches.nearby, siteTopCostume: switches.siteTopCostume })
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
  // The Area figures a night keeps when it ends, for its summary's nearby slide (null with no other house counting).
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
  const phoneSnapshot = (house) => ({ ...doorSnapshot(house), household: house.displayName() })

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
    // The sign-up page folded into the homepage.
    'GET /signup': () => new Response(null, { status: 302, headers: { Location: '/' } }),
    // What the homepage can't know from the page alone: whether sign-ups are paused (shown before anyone goes to
    // Google), and a signed-in Manager's Household, for the Welcome back card. Never more than its name.
    'GET /api/home': (req) => {
      const session = accounts.session(tokenOf(req))
      const household = session ? (ledger.households().find((h) => h.id === session.householdId)?.displayName ?? null) : null
      return Response.json({ signUpsPaused: ledger.siteSwitch(PAUSE_SIGN_UPS), household })
    },
    // The door's Event, for a phone, a TV or a Manager; ?event=<id> reads one of the Household's events (a past
    // night's recap on /tv?event=<id>), for a Manager only.
    'GET /api/snapshot': async (req, server) => {
      const id = new URL(req.url).searchParams.get('event')
      if (id == null) return read((req, house, credential) => Response.json(withNearby(credential.kind === 'tv' ? tvSnapshot(doorSnapshot(house)) : phoneSnapshot(house), house)))(req, server)
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
      return kind === 'phone'
        ? hub.attach(req, server, { householdId: house.id, kind, ip, credential: credential.token, snapshot: () => withNearby(phoneSnapshot(house), house) })
        : hub.attach(req, server, { householdId: house.id, kind, ip, credential: credential.token, snapshot: () => withNearby(tvSnapshot(doorSnapshot(house)), house), shape: tvDelta })
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
    'POST /api/pair/redeem': manager(async (req, house, session) => {
      if (!guard.take('redeem', session.manager.id)) return tooMany()
      const { code } = await req.json()
      if (!pairing.redeem(code, house.id)) return new Response("That code isn't on any TV right now. Check it, or wait for the TV's next one.", { status: 404 })
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
      if (!session) return redirect(SIGN_IN)
      if (!session.operator) return page('Not here', '<p>This page is for the Operator.</p>', 403)
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
      })
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

    // ---- Signing in (spec §3). The homepage's Start and Sign in forms post here; Google sends the person back to the callback.
    'POST /auth/google/start': async (req, server) => {
      if (!guard.take('signIn', clientIp(req, server))) return page('Slow down', '<p>Too many sign-ins from here. Try again in a while.</p>', 429)
      const form = await req.formData()
      try {
        return redirect(accounts.beginSignIn({ displayName: form.get('displayName'), timeZone: form.get('timeZone'), invite: form.get('invite'), redirectUri: callbackUrl(req) }))
      } catch (err) {
        if (err instanceof BadCommand) return page('Pick another name', `<p>${esc(err.message)}.</p><p><a href="/#start">Back</a></p>`, 400)
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
        return page('Sign-in didn\'t work', '<p>Google sign-in didn\'t work. <a href="/#start">Try again</a>.</p>', 502)
      }
      if (result.refused) return REFUSALS[result.refused](result)
      return redirect('/setup', { 'Set-Cookie': sessionCookie(result.token) })
    },
    'POST /auth/signout': (req) => {
      accounts.signOut(tokenOf(req))
      return redirect('/', { 'Set-Cookie': sessionCookie('', 0) })
    },

    // ---- Invite links (spec §3). The link is /invite?key=<token>, a shape the Caddy log masks.
    'GET /invite': (req) => {
      const key = new URL(req.url).searchParams.get('key') ?? ''
      const invite = accounts.inviteStatus(key)
      if (invite.status !== 'ok') return page('Invite link', `<p>${INVITE_PROBLEMS[invite.status]}</p>`, 410)
      return page(
        'You\'re invited',
        `<p>Help run ${invite.displayName ? `<b>${esc(invite.displayName)}</b>'s` : 'a'} trick-or-treat night on Count Dracula, as one of its Managers.</p>
<form method="post" action="/auth/google/start"><input type="hidden" name="invite" value="${esc(key)}"><button style="font:inherit;font-weight:700;padding:12px 16px;border:0;border-radius:10px;background:#ff7a1a;color:#1a0d00">Continue with Google</button></form>
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
      const { displayName, timeZone, location, firstRunPassed } = ledger.households().find((h) => h.id === house.id)
      const streams = hub.counts().households[house.id]
      // The ready checklist ticks itself from these (spec v2.1 §8); /setup polls for them.
      const checklist = { tvWatching: (streams?.tvLink ?? 0) + (streams?.paired ?? 0) > 0, anyKids: house.anyKids() }
      // The door's Event is what the TV shows: first-run's tick names it (spec v2.1 §8).
      const door = house.doorEvent()
      return Response.json({ id: house.id, displayName, timeZone, location, firstRunPassed, checklist, testNightEventId: house.testNightId(), door: door && { id: door.id, name: door.name }, lastYear: house.lastYear(), canEstimateLastYear: house.canEstimateLastYear(), joinKey: house.joinKey(), tvToken: house.tvToken(), manager: { email: session.manager.email, name: session.manager.name }, operator: session.operator })
    }),
    // Delete my Household: typed name to confirm; everything goes at once, and its streams close.
    'POST /api/household/delete': manager(async (req, house) => {
      const { confirm } = await req.json()
      accounts.deleteHousehold(house.id, confirm)
      hub.close({ householdId: house.id })
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
      if (house.joinKey() !== oldKey) hub.close({ householdId: house.id, credential: oldKey })
      if (house.tvToken() !== oldTv) hub.close({ householdId: house.id, credential: oldTv })
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

  // A page only a signed-in Manager opens; anyone else goes to sign-in. A Suspended Household's Managers see
  // the notice and the contact instead.
  function managerPage(pathname) {
    return async (req) => {
      const session = accounts.session(tokenOf(req))
      if (!session) return redirect(SIGN_IN)
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

  function route(req, server) {
    const { pathname } = new URL(req.url)
    const handler = routes[`${req.method} ${pathname}`]
    if (handler) return handler(req, server)
    // The TV link's page: the same TV page; it reads its token from the address.
    if (req.method === 'GET' && pathname.startsWith('/tv/k/')) return serveStatic('/tv', req)
    if (req.method === 'GET') return serveStatic(pathname, req, contact)
    return notFound()
  }

  const server = Bun.serve({
    port: port ?? config.port,
    async fetch(req, server) {
      let res
      try {
        if (failNext) {
          const message = failNext
          failNext = null
          throw new Error(message)
        }
        res = await route(req, server)
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
      clearInterval(nearbyTimer)
      process.off('uncaughtException', onUncaught)
      process.off('unhandledRejection', onUncaught)
      clearInterval(ticker)
      stopBackups()
      hub.shutdown()
      server.stop(true)
    },
  }
}

async function serveStatic(pathname, req, contact = DEFAULT_CONTACT) {
  const [dir, rest] = pathname.startsWith('/shared/')
    ? [SHARED_DIR, pathname.slice('/shared'.length)]
    : pathname.startsWith('/kiosk/')
      ? [KIOSK_DIR, pathname.slice('/kiosk'.length)]
      : [PUBLIC_DIR, PAGES[pathname] ?? pathname]
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
  if (dir === KIOSK_DIR) return new Response((await file.text()).replaceAll('__ORIGIN__', originOf(req)), { headers: { 'Content-Type': file.type } })
  // Pages that offer help or the privacy contact say __CONTACT__: filled in with OPERATOR_CONTACT, never committed.
  // __ORIGIN__ is this site's address, for the share page's link-preview tags, which want absolute URLs.
  if (path.endsWith('.html')) return new Response((await file.text()).replaceAll('__CONTACT__', esc(contact)).replaceAll('__ORIGIN__', esc(originOf(req))), { headers: { 'Content-Type': file.type } })
  return new Response(file)
}

function originOf(req) {
  const proto = req.headers.get('X-Forwarded-Proto') ?? new URL(req.url).protocol.slice(0, -1)
  return `${proto}://${req.headers.get('Host') ?? new URL(req.url).host}`
}

function tokenOf(req) {
  const cookies = req.headers.get('Cookie') ?? ''
  return cookies.split(/;\s*/).find((c) => c.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1) ?? null
}

// Behind Cloudflare, the visitor's address is in CF-Connecting-IP (spec §15).
function clientIp(req, server) {
  return req.headers.get('CF-Connecting-IP') ?? server?.requestIP(req)?.address ?? null
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

function tooMany() {
  return new Response('Too many: slow down and try again', { status: 429 })
}

function redirect(location, headers = {}) {
  return new Response(null, { status: 303, headers: { Location: location, ...headers } })
}

const esc = (text) => String(text ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

// A small plain page for the sign-in outcomes that aren't /setup.
function page(title, bodyHtml, status) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<style>body{margin:0;padding:24px 16px;background:#14101c;color:#f5efe6;font:17px/1.5 system-ui,sans-serif;max-width:560px;margin-inline:auto}a{color:#ff7a1a}</style></head>
<body><h1>🧛 ${esc(title)}</h1>${bodyHtml}</body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}

// Why a sign-in didn't end in /setup (Accounts' finishSignIn refusals).
const REFUSALS = {
  state: () => page('Start again', '<p>That sign-in link has expired or was already used. <a href="/#start">Start again</a>.</p>', 400),
  unverified: () => page('Email not verified', '<p>Google hasn\'t verified this account\'s email yet, so it can\'t sign in.</p>', 403),
  noHousehold: () => page('No household yet', '<p>This Google account doesn\'t run a household here yet. <a href="/#start">Sign up</a> to start one.</p>', 404),
  paused: () => page('Sign-ups are paused', '<p>Sign-ups are paused, try again later.</p>', 503),
  alreadyManager: () => page('One household each', "<p>You already manage a household here, and a Google account can only manage one. To help this one, use another Google account.</p><p><a href=\"/setup\">Go to your household</a></p>", 409),
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
