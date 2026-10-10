import { describe, expect, test } from 'bun:test'
import { createOutbox } from './outbox.js'

// A clock whose timers only fire when the test advances it.
function fakeClock(start = 1_000_000) {
  let now = start
  let timers = []
  let nextId = 1
  return {
    now: () => now,
    setTimeout(fn, ms) {
      const id = nextId++
      timers.push({ id, at: now + ms, fn })
      return id
    },
    clearTimeout(id) {
      timers = timers.filter((t) => t.id !== id)
    },
    async advance(ms) {
      const end = now + ms
      for (;;) {
        timers.sort((a, b) => a.at - b.at)
        if (!timers.length || timers[0].at > end) break
        const timer = timers.shift()
        now = timer.at
        timer.fn()
        await settle()
      }
      now = end
      await settle()
    },
  }
}

// A server that is up or down; records every POST it receives.
function fakeServer() {
  const server = {
    up: true,
    received: [],
    send: async (entry) => {
      if (!server.up) throw new Error('offline')
      server.received.push(entry)
    },
  }
  return server
}

function fakeStorage() {
  const items = new Map()
  return {
    getItem: (k) => (items.has(k) ? items.get(k) : null),
    setItem: (k, v) => items.set(k, String(v)),
  }
}

const settle = () => new Promise((resolve) => setImmediate(resolve))

function setup({ storage = fakeStorage(), server = fakeServer(), clock = fakeClock() } = {}) {
  const outbox = createOutbox({ send: server.send, storage, clock, phoneName: 'Dad' })
  return { outbox, server, storage, clock }
}

describe('outbox', () => {
  test('a tap is sent with its id, tag, tap time and phone name, then dropped once acknowledged', async () => {
    const { outbox, server, clock } = setup()

    const entry = outbox.tap(null)

    expect(entry).toEqual({ id: expect.any(String), tagId: null, tappedAt: clock.now(), phoneName: 'Dad' })
    expect(outbox.pending).toEqual([entry])
    await settle()
    expect(server.received).toEqual([entry])
    expect(outbox.pending).toEqual([])
  })

  test('keeps a tap the server never got and retries it on a timer until it is acknowledged', async () => {
    const { outbox, server, clock } = setup()
    server.up = false

    const entry = outbox.tap(null)
    await clock.advance(30_000)

    expect(outbox.pending).toEqual([entry])
    expect(server.received).toEqual([])

    server.up = true
    await clock.advance(5_000)

    expect(server.received).toEqual([entry])
    expect(outbox.pending).toEqual([])
  })

  test('queued taps survive a reload and are sent by the next page load', async () => {
    const storage = fakeStorage()
    const before = setup({ storage })
    before.server.up = false
    const a = before.outbox.tap(null)
    const b = before.outbox.tap(7)
    await settle()

    const after = setup({ storage })
    await settle()

    expect(after.server.received).toEqual([a, b])
    expect(after.outbox.pending).toEqual([])
  })

  test('retryNow sends straight away instead of waiting for the timer', async () => {
    const { outbox, server } = setup()
    server.up = false
    const entry = outbox.tap(null)
    await settle()

    server.up = true
    outbox.retryNow()
    await settle()

    expect(server.received).toEqual([entry])
  })
})

describe('tap ids', () => {
  test('are distinct v4 UUIDs made without crypto.randomUUID (missing over plain HTTP)', () => {
    const original = crypto.randomUUID
    crypto.randomUUID = () => {
      throw new Error('not available outside a secure context')
    }
    try {
      const { outbox } = setup()
      const ids = Array.from({ length: 50 }, () => outbox.tap(null).id)

      for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
      expect(new Set(ids).size).toBe(50)
    } finally {
      crypto.randomUUID = original
    }
  })
})

describe('outbox status', () => {
  test('a tap that goes straight through never shows the pill', async () => {
    const { outbox, clock } = setup()

    outbox.tap(null)
    expect(outbox.status).toBe('ok')
    await settle() // acknowledged within the same instant
    await clock.advance(10_000)

    expect(outbox.status).toBe('ok')
  })

  test('waiting after ~5 s, server down after ~2 min, then a brief "sent" once drained', async () => {
    const { outbox, server, clock } = setup()
    server.up = false
    outbox.tap(null)

    await clock.advance(4_900)
    expect(outbox.status).toBe('ok')

    await clock.advance(100)
    expect(outbox.status).toEqual({ waiting: 1 })

    outbox.tap(null)
    expect(outbox.status).toEqual({ waiting: 2 })

    await clock.advance(115_000)
    expect(outbox.status).toEqual({ down: 2 })

    server.up = true
    await clock.advance(2_000)
    expect(outbox.pending).toEqual([])
    expect(outbox.status).toBe('sent')

    await clock.advance(3_000)
    expect(outbox.status).toBe('ok')
  })
})

describe('acknowledged but not yet seen', () => {
  test('an acked tap stays unconfirmed until the live state shows it', async () => {
    const { outbox } = setup()
    const entry = outbox.tap(null)
    await settle()

    expect(outbox.pending).toEqual([])
    expect(outbox.unconfirmed).toEqual([entry])

    outbox.sync({ cause: 'delta', state: { kids: [{ id: 'someone-else' }] } })
    expect(outbox.unconfirmed).toEqual([entry])

    outbox.sync({ cause: 'delta', state: { kids: [{ id: entry.id }] } })
    expect(outbox.unconfirmed).toEqual([])
  })

  test('a snapshot taken after the ack settles it even if the kid has since been removed', async () => {
    const { outbox, clock } = setup()
    outbox.tap(null)
    await settle()
    await clock.advance(1_000)

    outbox.sync({ cause: 'snapshot', state: { kids: [] } })

    expect(outbox.unconfirmed).toEqual([])
  })
})
