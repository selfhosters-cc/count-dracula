// The HTTP layer stays thin: check the join key, parse the body, call ledger.apply, publish the deltas.
import { Database } from 'bun:sqlite'
import { networkInterfaces } from 'node:os'
import { resolve, sep } from 'node:path'
import { loadConfig } from './config.js'
import { BadCommand, openLedger } from './ledger.js'
import { createHub } from './hub.js'

const PUBLIC_DIR = resolve(import.meta.dir, '../public')
const SHARED_DIR = resolve(import.meta.dir, '../shared') // served at /shared/ for the browser
const PAGES = { '/': '/index.html', '/tv': '/tv.html', '/setup': '/setup.html' }
const ADMIN_COMMANDS = new Set(['createEvent', 'goLive', 'settings', 'changeKey', 'deleteEvent', 'createTag', 'updateTag', 'deleteTag'])

export function startServer({ configPath, port, heartbeatMs }) {
  const config = loadConfig(configPath)
  let lanUrl = config.lanUrl // resolved once the server is listening, if the config doesn't say
  const ledger = openLedger(new Database(config.dbPath, { create: true }), { ...config, lanUrl: () => lanUrl })
  const hub = createHub({ heartbeatMs })

  const routes = {
    'GET /api/snapshot': () => Response.json(ledger.snapshot()),
    'GET /api/stream': (req, server) => hub.attach(req, server, () => ledger.snapshot()),
    'POST /api/taps': write(async (req) => {
      const { id, tagId, tappedAt, phoneName } = await req.json()
      hub.publish(ledger.apply({ type: 'tap', id, tagId, tappedAt, phoneName }))
    }),
    'POST /api/remove': write(async (req) => {
      const { kidId } = await req.json()
      hub.publish(ledger.apply({ type: 'remove', kidId }))
    }),
    // Setup (spec §6): the join key and the admin PIN.
    'GET /api/events': (req) =>
      isAdmin(req) ? Response.json(ledger.events()) : new Response('Wrong PIN', { status: 403 }),
    'POST /api/admin': write(async (req) => {
      if (!isAdmin(req)) return new Response('Wrong PIN', { status: 403 })
      const command = await req.json()
      if (!ADMIN_COMMANDS.has(command?.type)) throw new BadCommand(`Not a Setup command: ${command?.type}`)
      const deltas = ledger.apply(command)
      hub.publish(deltas)
      return Response.json({ deltas, joinKey: ledger.joinKey() })
    }),
    'POST /api/mix': write(async (req) => {
      const { volume, mutes } = await req.json()
      hub.publish(ledger.apply({ type: 'mix', volume, mutes }))
    }),
    'POST /api/catch-up': write(async (req) => {
      const { tag, n, kid } = await req.json()
      hub.publish(ledger.apply({ type: 'catchUp', tag, n, kid }))
    }),
  }

  // Every write carries the live event's join key; reads need none.
  function write(handler) {
    return async (req) => {
      if (req.headers.get('X-Join-Key') !== ledger.joinKey()) {
        return new Response('Wrong join key', { status: 403 })
      }
      try {
        const res = await handler(req)
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
      if (req.method === 'GET') return serveStatic(pathname)
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

async function serveStatic(pathname) {
  const [dir, rest] = pathname.startsWith('/shared/')
    ? [SHARED_DIR, pathname.slice('/shared'.length)]
    : [PUBLIC_DIR, PAGES[pathname] ?? pathname]
  let path
  try {
    path = resolve(dir, '.' + decodeURIComponent(rest))
  } catch {
    return notFound()
  }
  if (!path.startsWith(dir + sep) || path.endsWith('.test.js')) return notFound()
  const file = Bun.file(path)
  return (await file.exists()) ? new Response(file) : notFound()
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
