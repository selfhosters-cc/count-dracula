// A clock whose timers only fire when the test advances it. Matches the { now, setTimeout, clearTimeout }
// clocks that the outbox and the celebration director take.
export const settle = () => new Promise((resolve) => setImmediate(resolve))

export function fakeClock(start = 1_000_000) {
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
