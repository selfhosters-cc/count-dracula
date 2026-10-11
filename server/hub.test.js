import { afterEach, describe, expect, test } from 'bun:test'
import { createHub } from './hub.js'
import { readFrames } from '../test/sse.js'

const hubs = []
afterEach(() => hubs.splice(0).forEach((hub) => hub.shutdown()))

function hub(options) {
  const made = createHub({ heartbeatMs: 60_000, ...options })
  hubs.push(made)
  return made
}

// What Bun.serve hands attach: only its timeout is used.
const server = { timeout() {} }

function watch(h, { householdId, kind = 'phone', credential = 'key', seq = 0 }) {
  const res = h.attach(new Request('http://x/api/stream'), server, { householdId, kind, credential, snapshot: () => ({ householdId, seq }) })
  return readFrames(res)
}

const kid = (seq, extra = {}) => ({ type: 'kid.added', seq, ...extra })

describe('per-Household channels', () => {
  test("Household A's deltas never reach Household B's streams", async () => {
    const h = hub()
    const a = watch(h, { householdId: 1, credential: 'key-a' })
    const b = watch(h, { householdId: 2, credential: 'key-b' })
    expect((await a.next()).data).toEqual({ householdId: 1, seq: 0 })
    expect((await b.next()).data).toEqual({ householdId: 2, seq: 0 })

    h.publish(1, [kid(1)])
    h.publish(2, [kid(1, { mark: 'b' })])

    expect(await a.next()).toMatchObject({ event: 'delta', id: '1', data: { seq: 1 } })
    expect(await b.next()).toMatchObject({ event: 'delta', id: '1', data: { mark: 'b' } })
    h.publish(1, [kid(2)])
    h.publish(2, [kid(2, { mark: 'b' })])
    expect((await b.next()).data).toEqual({ type: 'kid.added', seq: 2, mark: 'b' })
  })

  test('counts streams per Household and kind as they open and close', async () => {
    const h = hub()
    const phone = watch(h, { householdId: 1, kind: 'phone' })
    watch(h, { householdId: 1, kind: 'tvLink', credential: 'tv-1' })
    watch(h, { householdId: 1, kind: 'tvLink', credential: 'tv-1' })
    watch(h, { householdId: 2, kind: 'paired', credential: 'device-9' })

    expect(h.counts()).toEqual({
      total: 4,
      households: { 1: { phone: 1, paired: 0, tvLink: 2 }, 2: { phone: 0, paired: 1, tvLink: 0 } },
    })

    await phone.next()
    await phone.cancel()
    await Bun.sleep(0)
    expect(h.counts().households[1]).toEqual({ phone: 0, paired: 0, tvLink: 2 })
    expect(h.counts().total).toBe(3)
  })

  test('closing by credential closes exactly those streams', async () => {
    const h = hub()
    const oldTv = watch(h, { householdId: 1, kind: 'tvLink', credential: 'tv-old' })
    const phone = watch(h, { householdId: 1, kind: 'phone', credential: 'key-1' })
    const otherTv = watch(h, { householdId: 2, kind: 'tvLink', credential: 'tv-other' })

    h.close({ householdId: 1, credential: 'tv-old' })

    expect(await oldTv.closed()).toBe(true)
    await phone.next()
    h.publish(1, [kid(1)])
    expect((await phone.next()).data.seq).toBe(1)
    await otherTv.next()
    h.publish(2, [kid(1)])
    expect((await otherTv.next()).data.seq).toBe(1)
    expect(h.counts().total).toBe(2)
  })

  test("closing a Household closes every one of its streams (Suspend)", async () => {
    const h = hub()
    const tv = watch(h, { householdId: 1, kind: 'tvLink', credential: 'tv' })
    const phone = watch(h, { householdId: 1, kind: 'phone', credential: 'key' })
    watch(h, { householdId: 2 })

    h.close({ householdId: 1 })

    expect(await tv.closed()).toBe(true)
    expect(await phone.closed()).toBe(true)
    expect(h.counts()).toEqual({ total: 1, households: { 2: { phone: 1, paired: 0, tvLink: 0 } } })
  })

  test('a stream that stops reading is dropped, not buffered without limit', async () => {
    const h = hub()
    const stalled = watch(h, { householdId: 1 })
    const reading = watch(h, { householdId: 1 })
    await reading.next()
    const big = 'x'.repeat(10_000)

    for (let seq = 1; seq <= 100; seq++) {
      h.publish(1, [kid(seq, { big })])
      await reading.next()
    }

    expect(h.counts().households[1].phone).toBe(1)
    expect(await stalled.closed()).toBe(true)
  })

  test('tells each device to wait a random 0–5 s before reconnecting, so a restart is no storm', async () => {
    const waits = []
    for (const random of [0, 0.5, 0.999]) {
      const h = hub({ random: () => random })
      waits.push(Number((await watch(h, { householdId: 1 }).next()).retry))
    }

    expect(waits).toEqual([0, 2500, 4995])
  })

  test('pings every stream on the heartbeat', async () => {
    const h = hub({ heartbeatMs: 20 })
    const a = watch(h, { householdId: 1 })
    const b = watch(h, { householdId: 2 })
    await a.next()
    await b.next()

    expect(await a.next()).toMatchObject({ event: 'ping' })
    expect(await b.next()).toMatchObject({ event: 'ping' })
  })
})
