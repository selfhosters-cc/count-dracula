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

describe('removing kids', () => {
  test('an unsent tap is just dropped from the outbox and never reaches the server', async () => {
    const { outbox, server, clock } = setup()
    server.up = false
    const a = outbox.tap(null)
    const b = outbox.tap(null)
    await settle()

    expect(outbox.remove(b.id)).toEqual({ local: b })

    server.up = true
    await clock.advance(2_000)
    expect(server.received).toEqual([a])
    expect(outbox.pending).toEqual([])
  })

  test('a kid the server has gets a queued removal, retried until acknowledged', async () => {
    const { outbox, server, clock } = setup()
    const a = outbox.tap(null)
    await settle()
    server.up = false

    expect(outbox.remove(a.id)).toEqual({ server: a.id })
    await clock.advance(10_000)
    expect(outbox.pending).toEqual([{ type: 'remove', id: expect.any(String), kidId: a.id, queuedAt: expect.any(Number) }])
    expect(outbox.status).toEqual({ waiting: 1 })

    server.up = true
    await clock.advance(2_000)
    expect(server.received).toEqual([a, { type: 'remove', id: expect.any(String), kidId: a.id, queuedAt: expect.any(Number) }])
    expect(outbox.pending).toEqual([])
  })

  test('a tap caught mid-send is removed on the server too, after it lands', async () => {
    let release
    const sent = []
    const send = async (entry) => {
      if (!entry.type) await new Promise((r) => (release = r)) // the tap's POST hangs
      sent.push(entry)
    }
    const outbox = createOutbox({ send, storage: fakeStorage(), clock: fakeClock(), phoneName: 'Dad' })
    const a = outbox.tap(null)

    expect(outbox.remove(a.id)).toEqual({ server: a.id })

    release()
    await settle()
    await settle()
    expect(sent.map((e) => e.type ?? 'tap')).toEqual(['tap', 'remove'])
  })

  test('an acked removal stays unconfirmed until the live state no longer shows the kid', async () => {
    const { outbox } = setup()
    const a = outbox.tap(null)
    await settle()
    outbox.sync({ cause: 'delta', state: { kids: [{ id: a.id }] } })
    outbox.remove(a.id)
    await settle()

    outbox.sync({ cause: 'delta', state: { kids: [{ id: a.id }] } }) // the stream hasn't caught up
    expect(outbox.unconfirmed).toMatchObject([{ type: 'remove', kidId: a.id }])

    outbox.sync({ cause: 'delta', state: { kids: [] } })
    expect(outbox.unconfirmed).toEqual([])
  })

  test("remembers which kids are this phone's, across a reload, including a claimed catch-up kid", async () => {
    const storage = fakeStorage()
    const before = setup({ storage })
    const a = before.outbox.tap(null)
    const b = before.outbox.tap(3)
    before.outbox.claim('door-kid')
    await settle()

    const after = setup({ storage })

    expect([...after.outbox.mine]).toEqual([a.id, b.id, 'door-kid'])
  })
})
