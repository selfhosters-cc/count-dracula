// The HTTP layer stays thin: find the credential's Household, parse the body, call apply on that Household,
// publish the deltas. Every read and write carries a credential (v2 spec §3): a phone's join key, or a
// Manager's session. There's no Household in any URL: the credential carries it.
import { Database } from 'bun:sqlite'
import { resolve, sep } from 'node:path'
import { loadConfig } from './config.js'
import { BadCommand, openLedger } from './ledger.js'
import { openAccounts } from './accounts.js'
import { googleClient } from './google.js'
import { createHub } from './hub.js'
import { toCsv } from './export.js'

const PUBLIC_DIR = resolve(import.meta.dir, '../public')
const SHARED_DIR = resolve(import.meta.dir, '../shared') // served at /shared/ for the browser
const KIOSK_DIR = resolve(import.meta.dir, '../kiosk') // the TV laptop's launchers, downloadable from /kiosk/
const PAGES = { '/': '/index.html', '/tv': '/tv.html', '/setup': '/setup.html', '/tally': '/tally.html', '/signup': '/signup.html' }
const ADMIN_COMMANDS = new Set(['createEvent', 'goLive', 'settings', 'changeKey', 'deleteEvent', 'createTag', 'updateTag', 'deleteTag', 'addTicket', 'backfill', 'removeBatch', 'rename', 'rotateTvLink'])

// What a TV-link holder gets (spec §9): what the TV draws, without each kid's phone name.
const withoutPhone = ({ phoneName, ...kid }) => kid
const tvSnapshot = (snap) => ({ ...snap, kids: snap.kids.map(withoutPhone) })
const tvDelta = (delta) => (delta.kid ? { ...delta, kid: withoutPhone(delta.kid) } : delta)

// The sign-in cookie (spec §3): 90 days, renewed with use; the session itself lives server-side.
const SESSION_COOKIE = 'cd_session'
const sessionCookie = (token, maxAge = 90 * 86_400) => `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`

// env: PUBLIC_HOST, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OPERATOR_EMAILS, HOUSEHOLD1_MANAGER_EMAIL (deploy/local.env).
// google, now and canSignUp are seams for the tests.
export function startServer({ configPath, port, heartbeatMs, env = process.env, google, now = Date.now, canSignUp }) {
  const config = loadConfig(configPath)
  const db = new Database(config.dbPath, { create: true })
  const ledger = openLedger(db, { ...config, now })
  const accounts = openAccounts(db, {
    ledger,
    google: google ?? googleClient({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }),
    now,
    household1Email: env.HOUSEHOLD1_MANAGER_EMAIL ?? '',
    operatorEmails: (env.OPERATOR_EMAILS ?? '').split(/[\s,]+/).filter(Boolean),
    canSignUp,
  })
  const hub = createHub({ heartbeatMs })

  const routes = {
    // The live event, for a phone or a Manager; ?event=<id> reads one of the Household's events (a past
    // night's recap on /tv?event=<id>), for a Manager only.
    'GET /api/snapshot': async (req, server) => {
      const id = new URL(req.url).searchParams.get('event')
      if (id == null) return read((req, house, credential) => Response.json(credential.kind === 'tv' ? tvSnapshot(house.snapshot()) : house.snapshot()))(req, server)
      return manager((req, house) => {
        const snap = house.snapshot(Number(id))
        return snap ? Response.json(snap) : notFound()
      })(req, server)
    },
    // EventSource can't send headers, so a phone's key or the TV link's token comes as ?key= (masked in the
    // Caddy log). A TV gets the live night TV-shaped.
    'GET /api/stream': read((req, house, credential, server) =>
      credential.kind === 'tv'
        ? hub.attach(req, server, { householdId: house.id, kind: 'tvLink', credential: credential.token, snapshot: () => tvSnapshot(house.snapshot()), shape: tvDelta })
        : hub.attach(req, server, { householdId: house.id, kind: 'phone', credential: credential.token, snapshot: () => house.snapshot() })),
    'POST /api/taps': write(async (req, house) => {
      const { id, tagId, tappedAt, phoneName, teen } = await req.json()
      hub.publish(house.id, house.apply({ type: 'tap', id, tagId, tappedAt, phoneName, teen }))
    }),
    'POST /api/remove': write(async (req, house) => {
      const { kidId } = await req.json()
      hub.publish(house.id, house.apply({ type: 'remove', kidId }))
    }),
    // ---- Signing in (spec §3). The sign-up page posts here; Google sends the person back to the callback.
    'POST /auth/google/start': async (req) => {
      const form = await req.formData()
      try {
        return redirect(accounts.beginSignIn({ displayName: form.get('displayName'), timeZone: form.get('timeZone'), redirectUri: callbackUrl(req) }))
      } catch (err) {
        if (err instanceof BadCommand) return page('Pick another name', `<p>${esc(err.message)}.</p><p><a href="/signup">Back</a></p>`, 400)
        throw err
      }
    },
    'GET /auth/google/callback': async (req, server) => {
      const params = new URL(req.url).searchParams
      if (params.has('error')) return redirect('/signup') // they backed out at Google
      let result
      try {
        result = await accounts.finishSignIn({ code: params.get('code'), state: params.get('state'), redirectUri: callbackUrl(req), ip: clientIp(req, server) })
      } catch (err) {
        console.error('google sign-in failed:', err.message)
        return page('Sign-in didn\'t work', '<p>Google sign-in didn\'t work. <a href="/signup">Try again</a>.</p>', 502)
      }
      if (result.refused) return REFUSALS[result.refused]()
      return redirect('/setup', { 'Set-Cookie': sessionCookie(result.token) })
    },
    'POST /auth/signout': (req) => {
      accounts.signOut(tokenOf(req))
      return redirect('/signup', { 'Set-Cookie': sessionCookie('', 0) })
    },

    // ---- Setup (spec §6): a signed-in Manager of the Household.
    'GET /setup': managerPage('/setup'),
    // The print tally sheet, opened from /setup.
    'GET /tally': managerPage('/tally'),
    'GET /api/household': manager((req, house, session) => {
      const { displayName, timeZone } = ledger.households().find((h) => h.id === house.id)
      return Response.json({ id: house.id, displayName, timeZone, joinKey: house.joinKey(), tvToken: house.tvToken(), manager: { email: session.manager.email, name: session.manager.name }, operator: session.operator })
    }),
    // Delete my Household: typed name to confirm; everything goes at once, and its streams close.
    'POST /api/household/delete': manager(async (req, house) => {
      const { confirm } = await req.json()
      accounts.deleteHousehold(house.id, confirm)
      hub.close({ householdId: house.id })
      return new Response('Deleted', { headers: { 'Set-Cookie': sessionCookie('', 0) } })
    }),
    'GET /api/events': manager((req, house) => Response.json(house.events())),
    // ⬇ Export event (spec §6): a CSV download.
    'GET /api/export': manager((req, house) => {
      const night = house.exportEvent(Number(new URL(req.url).searchParams.get('event')))
      if (!night) return notFound()
      const filename = night.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'event'
      return new Response(toCsv(night), {
        headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}.csv"` },
      })
    }),
    'GET /api/batches': manager((req, house) => Response.json(house.batches())),
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
    // ☰ "🌙 End the night" / "Resume the night": any phone with the join key.
    'POST /api/end': write(async (req, house) => {
      hub.publish(house.id, house.apply({ type: 'end' }))
    }),
    'POST /api/resume': write(async (req, house) => {
      hub.publish(house.id, house.apply({ type: 'resume' }))
    }),
    // ☰ "Release remaining tickets": any phone with the join key (the phone shows it from 7:45pm event time).
    'POST /api/release': write(async (req, house) => {
      hub.publish(house.id, house.apply({ type: 'release' }))
    }),
    // ☰ soundboard: any phone with the key; the answer says whether it played or hit the cooldown.
    'POST /api/soundboard': write(async (req, house) => {
      const { slot } = await req.json()
      const deltas = house.apply({ type: 'soundboard', slot })
      hub.publish(house.id, deltas)
      return Response.json({ played: deltas.length > 0 })
    }),
    'POST /api/mix': write(async (req, house) => {
      const { volume, mutes } = await req.json()
      hub.publish(house.id, house.apply({ type: 'mix', volume, mutes }))
    }),
    'POST /api/catch-up': write(async (req, house) => {
      const { tag, n, kid } = await req.json()
      hub.publish(house.id, house.apply({ type: 'catchUp', tag, n, kid }))
    }),
  }

  // A phone's join key (X-Join-Key, or ?key=), the TV link's token (?key=), or a Manager's session
  // cookie, and its Household: { householdId, kind: 'key' | 'tv' | 'session', token }, or null.
  function credentialOf(req) {
    const header = req.headers.get('X-Join-Key')
    const key = header ?? new URL(req.url).searchParams.get('key')
    if (key) {
      const householdId = ledger.householdByJoinKey(key)
      if (householdId != null) return { householdId, kind: 'key', token: key }
      const tvHousehold = header ? null : ledger.householdByTvToken(key)
      return tvHousehold == null ? null : { householdId: tvHousehold, kind: 'tv', token: key }
    }
    const token = tokenOf(req)
    const session = accounts.session(token)
    return session ? { householdId: session.householdId, kind: 'session', token, session } : null
  }

  // The live night's reads: a join key or a Manager's session.
  function read(handler) {
    return async (req, server) => {
      const credential = credentialOf(req)
      if (!credential) return new Response('Join with a helper code, or sign in', { status: 403 })
      const res = await handler(req, ledger.household(credential.householdId), credential, server)
      return credential.session ? renew(res, credential.session, req) : res
    }
  }

  // A page only a signed-in Manager opens; anyone else goes to sign-in.
  function managerPage(pathname) {
    return async (req) => {
      const session = accounts.session(tokenOf(req))
      if (!session) return redirect('/signup')
      return renew(await serveStatic(pathname, req), session, req)
    }
  }

  // Every write carries its Household's join key.
  function write(handler) {
    return async (req) => {
      const id = ledger.householdByJoinKey(req.headers.get('X-Join-Key'))
      if (id == null) return new Response('Wrong join key', { status: 403 })
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

  // Setup's reads and commands: the session leads to the Manager's one Household.
  function manager(handler) {
    return async (req, server) => {
      const session = accounts.session(tokenOf(req))
      if (!session) return new Response('Sign in first', { status: 401 })
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

  // A session that was just renewed sends its cookie again, with a fresh 90 days.
  function renew(res, session, req) {
    if (session.renewed && !res.headers.has('Set-Cookie')) res.headers.append('Set-Cookie', sessionCookie(tokenOf(req)))
    return res
  }

  // Google's callback on this host: the public one in production, the request's own in development.
  function callbackUrl(req) {
    return `${env.PUBLIC_HOST ? `https://${env.PUBLIC_HOST}` : originOf(req)}/auth/google/callback`
  }

  const server = Bun.serve({
    port: port ?? config.port,
    fetch(req, server) {
      const { pathname } = new URL(req.url)
      const route = routes[`${req.method} ${pathname}`]
      if (route) return route(req, server)
      // The TV link's page: the same TV page; it reads its token from the address.
      if (req.method === 'GET' && pathname.startsWith('/tv/k/')) return serveStatic('/tv', req)
      if (req.method === 'GET') return serveStatic(pathname, req)
      return notFound()
    },
  })

  return {
    url: server.url.origin,
    ledger,
    stop() {
      hub.shutdown()
      server.stop(true)
    },
  }
}

async function serveStatic(pathname, req) {
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
  state: () => page('Start again', '<p>That sign-in link has expired or was already used. <a href="/signup">Start again</a>.</p>', 400),
  unverified: () => page('Email not verified', '<p>Google hasn\'t verified this account\'s email yet, so it can\'t sign in.</p>', 403),
  noHousehold: () => page('No household yet', '<p>This Google account doesn\'t run a household here yet. <a href="/signup">Sign up</a> to start one.</p>', 404),
  paused: () => page('Sign-ups are paused', '<p>Sign-ups are paused, try again later.</p>', 503),
}

function notFound() {
  return new Response('Not found', { status: 404 })
}
