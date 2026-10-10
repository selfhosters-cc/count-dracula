// The HTTP layer stays thin: check the join key, parse the body, call ledger.apply, publish the deltas.
import { Database } from 'bun:sqlite'
import { resolve, sep } from 'node:path'
import { loadConfig } from './config.js'
import { BadCommand, openLedger } from './ledger.js'
import { createHub } from './hub.js'

const PUBLIC_DIR = resolve(import.meta.dir, '../public')
const SHARED_DIR = resolve(import.meta.dir, '../shared') // served at /shared/ for the browser
const PAGES = { '/': '/index.html', '/tv': '/tv.html' }

export function startServer({ configPath, port, heartbeatMs }) {
  const config = loadConfig(configPath)
  const ledger = openLedger(new Database(config.dbPath, { create: true }), config)
  const hub = createHub({ heartbeatMs })

  const routes = {
    'GET /api/snapshot': () => Response.json(ledger.snapshot()),
    'GET /api/stream': (req, server) => hub.attach(req, server, () => ledger.snapshot()),
    'POST /api/taps': write(async (req) => {
      const { id, tagId, tappedAt, phoneName } = await req.json()
      hub.publish(ledger.apply({ type: 'tap', id, tagId, tappedAt, phoneName }))
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
        await handler(req)
      } catch (err) {
        if (err instanceof BadCommand || err instanceof SyntaxError) {
          return new Response(err.message, { status: 400 })
        }
        throw err
      }
      return new Response('OK')
    }
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

function notFound() {
  return new Response('Not found', { status: 404 })
}
