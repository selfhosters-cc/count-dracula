// A tiny Extension for the core's own tests of the seam (v2.2 §11, ADR 0001). It describes no real Extension:
// each route is here only to show what the core does with an Extension's request. Tests spread it to vary it
// ({ ...fixture, name: 'api' }), or wrap its start() to watch what reaches it.
export const name = 'fixture'
export const dir = import.meta.dir // its public/ folder is served at /fixture/
export const owns = {}
export const migrations = []

export function start(core) {
  return {
    handle(req, url) {
      const echo = () => Response.json({ method: req.method, path: url.pathname })
      if (req.method === 'GET' && url.pathname === '/fixture/x') return echo()
      if (req.method === 'POST' && url.pathname === '/api/fixture/y') return echo()
      // An address that isn't a file's own gets the folder's page, as an entry's own link would.
      if (/^\/fixture\/[a-z0-9]{6}$/.test(url.pathname)) return core.serve(req, 'index.html')
      if (url.pathname === '/fixture/kept-a-minute') return new Response('kept a minute', { headers: { 'Cache-Control': 'public, max-age=60' } })
      if (url.pathname === '/api/fixture/me') return core.guard.manager((req, house) => Response.json({ household: house.id }))(req)
      if (url.pathname === '/api/fixture/boom') throw new Error('fixture failed')
      // Anything else returns nothing, so the core serves public/ (or a 404).
    },
    stop() {},
  }
}

// Its item in the privacy notice's "What's public" (v2.2 §8), and the day it last changed what's public.
export const privacy = { item: "<li><b>The fixture</b> makes nothing public: it's here only for the core's tests.</li>", updated: '2026-10-25' }
