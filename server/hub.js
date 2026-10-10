// The SSE hub (modules.md §2): one stream per device, snapshot first, then `id: <seq>` deltas.
const encoder = new TextEncoder()

export function createHub({ heartbeatMs = 15_000 } = {}) {
  const clients = new Set()

  function send(client, text) {
    try {
      client.enqueue(encoder.encode(text))
    } catch {
      clients.delete(client)
    }
  }

  // A named event rather than a `:` comment: EventSource hides comments from the page, and the page
  // needs to see something every 15 s to notice a link that died without closing (modules.md §4).
  const heartbeat = setInterval(() => {
    for (const client of clients) send(client, frame('ping', {}))
  }, heartbeatMs)

  return {
    attach(req, server, getSnapshot) {
      server.timeout(req, 0)
      let self
      const body = new ReadableStream({
        start(controller) {
          self = controller
          send(controller, frame('snapshot', getSnapshot()))
          clients.add(controller)
        },
        cancel() {
          clients.delete(self)
        },
      })
      return new Response(body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-store',
          Connection: 'keep-alive',
        },
      })
    },

    publish(deltas) {
      for (const delta of deltas) {
        const text = frame('delta', delta, delta.seq)
        for (const client of clients) send(client, text)
      }
    },

    close() {
      clearInterval(heartbeat)
      for (const client of clients) {
        try {
          client.close()
        } catch {}
      }
      clients.clear()
    },
  }
}

function frame(event, data, id) {
  return `${id === undefined ? '' : `id: ${id}\n`}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}
