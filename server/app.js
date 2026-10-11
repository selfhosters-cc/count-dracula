// The HTTP layer stays thin: check the join key, parse the body, call apply on that Household, publish the deltas.
// Until every read carries a credential (v2 ticket 22), reads and Setup act on the join key's Household,
// or Household #1.
import { Database } from 'bun:sqlite'
import { networkInterfaces } from 'node:os'
import { resolve, sep } from 'node:path'
import { loadConfig } from './config.js'
import { BadCommand, openLedger } from './ledger.js'
import { createHub } from './hub.js'
import { toCsv } from './export.js'

const PUBLIC_DIR = resolve(import.meta.dir, '../public')
const SHARED_DIR = resolve(import.meta.dir, '../shared') // served at /shared/ for the browser
const KIOSK_DIR = resolve(import.meta.dir, '../kiosk') // the TV laptop's launchers, downloadable from /kiosk/
const PAGES = { '/': '/index.html', '/tv': '/tv.html', '/setup': '/setup.html', '/tally': '/tally.html' }
const ADMIN_COMMANDS = new Set(['createEvent', 'goLive', 'settings', 'changeKey', 'deleteEvent', 'createTag', 'updateTag', 'deleteTag', 'addTicket', 'backfill', 'removeBatch'])

export function startServer({ configPath, port, heartbeatMs }) {
  const config = loadConfig(configPath)
  let lanUrl = config.lanUrl // resolved once the server is listening, if the config doesn't say
  const ledger = openLedger(new Database(config.dbPath, { create: true }), { ...config, lanUrl: () => lanUrl })
  const hub = createHub({ heartbeatMs })

  const routes = {
    // ?event=<id> reads any of the Household's events (a past night's recap on /tv?event=<id>); otherwise the live one.
    'GET /api/snapshot': read((req, house) => {
      const id = new URL(req.url).searchParams.get('event')
      const snap = house.snapshot(id == null ? undefined : Number(id))
      return snap ? Response.json(snap) : notFound()
    }),
    'GET /api/stream': read((req, house, server) => hub.attach(req, server, () => house.snapshot())),
    'POST /api/taps': write(async (req, house) => {
      const { id, tagId, tappedAt, phoneName, teen } = await req.json()
      hub.publish(house.apply({ type: 'tap', id, tagId, tappedAt, phoneName, teen }))
    }),
    'POST /api/remove': write(async (req, house) => {
      const { kidId } = await req.json()
      hub.publish(house.apply({ type: 'remove', kidId }))
    }),
    // Tailnet phones join on first open: the key is handed out only on the private *.int name.
    'GET /api/join': (req) => {
      const host = (req.headers.get('Host') ?? '').replace(/:\d+$/, '').toLowerCase()
      if (!config.autoJoinHosts.includes(host)) return new Response('Scan a helper code to join', { status: 403 })
      const house = firstHousehold()
      return house ? Response.json({ joinKey: house.joinKey() }) : notFound()
    },
    // Setup (spec §6): the join key and the admin PIN.
    'GET /api/events': read((req, house) =>
      isAdmin(req) ? Response.json(house.events()) : new Response('Wrong PIN', { status: 403 })),
    // ⬇ Export event (spec §6): a CSV download, PIN only.
    'GET /api/export': read((req, house) => {
      if (!isAdmin(req)) return new Response('Wrong PIN', { status: 403 })
      const night = house.exportEvent(Number(new URL(req.url).searchParams.get('event')))
      if (!night) return notFound()
      const filename = night.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'event'
      return new Response(toCsv(night), {
        headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}.csv"` },
      })
    }),
    'GET /api/batches': read((req, house) =>
      isAdmin(req) ? Response.json(house.batches()) : new Response('Wrong PIN', { status: 403 })),
    'POST /api/admin': write(async (req, house) => {
      if (!isAdmin(req)) return new Response('Wrong PIN', { status: 403 })
      const command = await req.json()
      if (!ADMIN_COMMANDS.has(command?.type)) throw new BadCommand(`Not a Setup command: ${command?.type}`)
      const deltas = house.apply(command)
      hub.publish(deltas)
      return Response.json({ deltas, joinKey: house.joinKey() })
    }),
    // ☰ "🌙 End the night" / "Resume the night": any phone with the join key.
    'POST /api/end': write(async (req, house) => {
      hub.publish(house.apply({ type: 'end' }))
    }),
    'POST /api/resume': write(async (req, house) => {
      hub.publish(house.apply({ type: 'resume' }))
    }),
    // ☰ "Release remaining tickets": any phone with the join key (the phone shows it from 7:45pm event time).
    'POST /api/release': write(async (req, house) => {
      hub.publish(house.apply({ type: 'release' }))
    }),
    // ☰ soundboard: any phone with the key; the answer says whether it played or hit the cooldown.
    'POST /api/soundboard': write(async (req, house) => {
      const { slot } = await req.json()
      const deltas = house.apply({ type: 'soundboard', slot })
      hub.publish(deltas)
      return Response.json({ played: deltas.length > 0 })
    }),
    'POST /api/mix': write(async (req, house) => {
      const { volume, mutes } = await req.json()
      hub.publish(house.apply({ type: 'mix', volume, mutes }))
    }),
    'POST /api/catch-up': write(async (req, house) => {
      const { tag, n, kid } = await req.json()
      hub.publish(house.apply({ type: 'catchUp', tag, n, kid }))
    }),
  }

  function firstHousehold() {
    const [first] = ledger.households()
    return first ? ledger.household(first.id) : null
  }

  // Reads act on the Household of the join key, if one is given, or else Household #1 (until ticket 22).
  function read(handler) {
    return (req, server) => {
      const key = req.headers.get('X-Join-Key') ?? new URL(req.url).searchParams.get('key')
      const id = key ? ledger.householdByJoinKey(key) : null
      const house = id == null ? firstHousehold() : ledger.household(id)
      if (!house) return notFound()
      return handler(req, house, server)
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

  function isAdmin(req) {
    return config.adminPin !== '' && req.headers.get('X-Admin-Pin') === config.adminPin
  }

  const server = Bun.serve({
    port: port ?? config.port,
    fetch(req, server) {
      const { pathname } = new URL(req.url)
      const route = routes[`${req.method} ${pathname}`]
      if (route) return route(req, server)
      if (req.method === 'GET') return serveStatic(pathname, req)
      return notFound()
    },
  })

  lanUrl ??= lanAddress(server.port)

  return {
    url: server.url.origin,
    ledger,
    stop() {
      hub.close()
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

// This machine's first LAN IPv4 address: what a helper's phone on the home Wi-Fi can reach.
function lanAddress(port) {
  for (const addresses of Object.values(networkInterfaces())) {
    const lan = addresses?.find((a) => a.family === 'IPv4' && !a.internal)
    if (lan) return `http://${lan.address}:${port}`
  }
  return null
}

function notFound() {
  return new Response('Not found', { status: 404 })
}
