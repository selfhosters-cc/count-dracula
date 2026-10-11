// The SSE hub (modules.md §2, v2 spec §15): one stream per device, snapshot first, then `id: <seq>`
// deltas, on one channel per Household. Each stream knows its Household, its credential kind and the
// credential itself, so caps can count it and Rotate TV link, Change join key and Suspend can close it.
const encoder = new TextEncoder()

// Credential kinds: a join-key phone, a TV paired by code, and anyone holding the TV link.
const KINDS = ['phone', 'paired', 'tvLink']

// A device whose unread frames pass this is dropped; EventSource brings it back to a fresh snapshot.
const MAX_BUFFERED_BYTES = 256 * 1024

// Reconnects spread over 0–5 s, so a restart doesn't come back as one storm.
const MAX_RETRY_MS = 5_000

export function createHub({ heartbeatMs = 15_000, random = Math.random } = {}) {
  const channels = new Map() // household id → Set of clients

  function remove(client) {
    const channel = channels.get(client.householdId)
    channel?.delete(client)
    if (channel?.size === 0) channels.delete(client.householdId)
  }

  function end(client) {
    remove(client)
    try {
      client.controller.close()
    } catch {}
  }

  // A stalled reader's frames would pile up in memory: drop it instead.
  function send(client, bytes) {
    if (client.controller.desiredSize < 0) return end(client)
    try {
      client.controller.enqueue(bytes)
    } catch {
      remove(client)
    }
  }

  // A named event rather than a `:` comment: EventSource hides comments from the page, and the page
  // needs to see something every 15 s to notice a link that died without closing (modules.md §4).
  const heartbeat = setInterval(() => {
    const ping = encoder.encode(frame('ping', {}))
    for (const channel of channels.values()) for (const client of [...channel]) send(client, ping)
  }, heartbeatMs)

  return {
    // { householdId, kind, credential, snapshot } → the stream's Response.
    attach(req, server, { householdId, kind, credential, snapshot }) {
      if (!KINDS.includes(kind)) throw new Error(`Unknown stream kind: ${kind}`)
      server.timeout(req, 0)
      const client = { householdId, kind, credential, controller: null }
      const body = new ReadableStream(
        {
          start(controller) {
            client.controller = controller
            const retry = Math.floor(random() * MAX_RETRY_MS)
            controller.enqueue(encoder.encode(`retry: ${retry}\n${frame('snapshot', snapshot())}`))
            if (!channels.has(householdId)) channels.set(householdId, new Set())
            channels.get(householdId).add(client)
          },
          cancel() {
            remove(client)
          },
        },
        { highWaterMark: MAX_BUFFERED_BYTES, size: (chunk) => chunk.byteLength },
      )
      return new Response(body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-store',
          Connection: 'keep-alive',
        },
      })
    },

    // Deltas go only to their Household's streams.
    publish(householdId, deltas) {
      const channel = channels.get(householdId)
      if (!channel) return
      for (const delta of deltas) {
        const bytes = encoder.encode(frame('delta', delta, delta.seq))
        for (const client of [...channel]) send(client, bytes)
      }
    },

    // Closes a Household's streams: all of them (Suspend), or only those holding one credential.
    close({ householdId, credential }) {
      for (const client of [...(channels.get(householdId) ?? [])]) {
        if (credential === undefined || client.credential === credential) end(client)
      }
    },

    // Open streams per Household and kind, for the caps and /operator.
    counts() {
      const households = {}
      let total = 0
      for (const [id, channel] of channels) {
        const count = Object.fromEntries(KINDS.map((k) => [k, 0]))
        for (const client of channel) count[client.kind]++
        households[id] = count
        total += channel.size
      }
      return { total, households }
    },

    shutdown() {
      clearInterval(heartbeat)
      for (const channel of channels.values()) for (const client of [...channel]) end(client)
      channels.clear()
    },
  }
}

function frame(event, data, id) {
  return `${id === undefined ? '' : `id: ${id}\n`}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}
