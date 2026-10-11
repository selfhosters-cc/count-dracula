// The load check (v2 spec §18): what one tap costs with many TV-link viewers on the per-Household hub, and
// how much memory 3,000 streams take, so the caps are set from real numbers.
//
//   bun deploy/loadtest.js [--port 3191] [--viewers 200] [--site 3000] [--taps 20]
//
// It starts its own scratch server (a separate process, so its RSS is the server's alone) on a spare port with
// a throwaway database, makes its Households straight in that database (no Google), and talks to the port
// directly: never through Cloudflare or Caddy, never the real database. On LXC 118, run it from /opt/count-dracula.
import { Database } from 'bun:sqlite'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { openLedger } from '../server/ledger.js'

const PRODUCTION_DB = '/var/lib/count-dracula/count-dracula.sqlite'
const PRODUCTION_PORT = 3131
const PASS_FANOUT_MS = 100 // a tap reaches 200 viewers on one Household in under ~100 ms
const PASS_RSS_MB = 800 // 3,000 site-wide streams stay under ~800 MB

const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map((a) => a.trim().split(/\s+/)))
const port = Number(args.port ?? 3191)
const viewers = Number(args.viewers ?? 200)
const site = Number(args.site ?? 3000)
const taps = Number(args.taps ?? 20)
const dbPath = args.db ? resolve(args.db) : null

// Refusals: never the real server's port or database, never a remote host.
if (port === PRODUCTION_PORT) fail(`Port ${PRODUCTION_PORT} is the real server's. Pick a spare one (--port 3191).`)
if (dbPath === PRODUCTION_DB) fail('That is the production database. The load check makes its own scratch one.')
if (args.url || args.host) fail('The load check only talks to the scratch server it starts, on 127.0.0.1.')

// Bun's fetch holds at most 256 requests open at once unless told otherwise: run again with room for every stream.
if (!process.env.BUN_CONFIG_MAX_HTTP_REQUESTS) {
  const child = Bun.spawn([process.execPath, ...process.argv.slice(1)], { env: { ...process.env, BUN_CONFIG_MAX_HTTP_REQUESTS: '65000' }, stdio: ['inherit', 'inherit', 'inherit'] })
  process.exit(await child.exited)
}

const dir = mkdtempSync(join(tmpdir(), 'count-dracula-loadtest-'))
const scratchDb = dbPath ?? join(dir, 'scratch.sqlite')
const base = `http://127.0.0.1:${port}`
let server = null
const aborts = []
let ipCounter = 0

try {
  // ---- Households, straight in the scratch database: one big one, a few small ones, and enough for 3,000.
  const households = Math.ceil(site / viewers)
  const db = new Database(scratchDb, { create: true })
  const ledger = openLedger(db, {})
  const homes = Array.from({ length: households }, (_, i) => {
    const house = ledger.household(ledger.createHousehold({ displayName: `Load ${i + 1}`, timeZone: 'UTC' }))
    const door = house.doorEvent() // its Test night: every tap names it and its go-live stamp
    return { tvToken: house.tvToken(), joinKey: house.joinKey(), night: { eventId: door.id, stamp: door.wentLiveAt } }
  })
  db.close()

  // ---- The scratch server, as its own process.
  const configPath = join(dir, 'config.json')
  writeFileSync(configPath, JSON.stringify({ port, dbPath: scratchDb }))
  server = Bun.spawn([process.execPath, resolve(import.meta.dir, '../server/main.js'), configPath], {
    cwd: resolve(import.meta.dir, '..'),
    env: { ...process.env, PUBLIC_HOST: '', OPERATOR_EMAILS: '' },
    stdout: 'ignore',
    stderr: 'inherit',
  })
  await waitForHealth()
  console.log(`Scratch server pid ${server.pid} on ${base}, ${households} Households in ${scratchDb}`)

  // ---- 1: N viewers on one Household, a few on others; time each tap's fan-out to the last one.
  const big = await openViewers(homes[0].tvToken, viewers)
  const others = await Promise.all(homes.slice(1, 4).map((h) => openViewers(h.tvToken, 5)))
  console.log(`\n1. ${big.length} TV-link viewers on one Household (+ ${others.flat().length} on others). RSS ${rssMb()} MB`)
  const fanouts = await tapAndTime(homes[0], big, taps)
  const median = percentile(fanouts, 0.5)
  const worst = Math.max(...fanouts)
  console.log(`   fan-out per tap to the last viewer: median ${median.toFixed(1)} ms, p90 ${percentile(fanouts, 0.9).toFixed(1)} ms, worst ${worst.toFixed(1)} ms`)
  const fanoutPass = median < PASS_FANOUT_MS
  console.log(`   ${fanoutPass ? 'PASS' : 'FAIL'}: under ~${PASS_FANOUT_MS} ms to ${viewers} viewers`)

  // ---- 2: fill up to the site-wide number across the other Households, then read the server's memory.
  let open = big.length + others.flat().length
  const all = [big, ...others]
  for (let i = 1; open < site && i < homes.length; i++) {
    const already = i <= 3 ? 5 : 0
    const more = await openViewers(homes[i].tvToken, Math.min(viewers - already, site - open))
    all.push(more)
    open += more.length
  }
  await Bun.sleep(1_000)
  const rss = rssMb()
  const siteFanouts = await tapAndTime(homes[0], big, 5)
  console.log(`\n2. ${open} streams site-wide. RSS ${rss} MB; a tap still reaches ${big.length} viewers in ${percentile(siteFanouts, 0.5).toFixed(1)} ms`)
  const rssPass = open >= site && rss < PASS_RSS_MB
  console.log(`   ${rssPass ? 'PASS' : 'FAIL'}: ${site} streams under ~${PASS_RSS_MB} MB${open < site ? ` (only ${open} opened)` : ''}`)

  console.log(`\n${fanoutPass && rssPass ? 'PASS' : 'FAIL'} overall. If anything failed, lower the caps in server/guard.js (LIMITS) to what passes.`)
  process.exitCode = fanoutPass && rssPass ? 0 : 1
} finally {
  for (const controller of aborts) controller.abort()
  server?.kill()
  await server?.exited
  rmSync(dir, { recursive: true, force: true })
  console.log('Cleaned up: scratch server stopped, scratch database deleted.')
}

// ---- helpers

function fail(message) {
  console.error(`!! ${message}`)
  process.exit(2)
}

async function waitForHealth() {
  for (let i = 0; i < 100; i++) {
    const res = await fetch(`${base}/healthz`).catch(() => null)
    if (res?.ok) return
    await Bun.sleep(100)
  }
  throw new Error('The scratch server never answered')
}

// Each viewer comes from its own address, so the 20-per-IP cap doesn't stop the test.
function nextIp() {
  const n = ipCounter++
  return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`
}

// Opens n TV-link streams, each from its own address; each keeps reading and notes when each seq arrives.
async function openViewers(tvToken, n) {
  const opened = []
  for (let start = 0; start < n; start += 100) {
    const batch = await Promise.all(Array.from({ length: Math.min(100, n - start) }, () => openViewer(tvToken)))
    opened.push(...batch.filter(Boolean))
  }
  return opened
}

async function openViewer(tvToken) {
  const controller = new AbortController()
  aborts.push(controller)
  const res = await fetch(`${base}/api/stream?key=${tvToken}`, { signal: controller.signal, headers: { 'CF-Connecting-IP': nextIp() } }).catch(() => null)
  if (!res?.ok) return null
  const viewer = { seen: new Map(), waiting: new Map() }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  ;(async () => {
    let tail = ''
    for (;;) {
      const { value, done } = await reader.read().catch(() => ({ done: true }))
      if (done) return
      const text = tail + value
      const at = performance.now()
      for (const m of text.matchAll(/^id: (\d+)$/gm)) {
        const seq = Number(m[1])
        viewer.seen.set(seq, at)
        viewer.waiting.get(seq)?.(at)
      }
      tail = text.slice(-32)
    }
  })()
  return viewer
}

// Taps n times, 300 ms apart; for each, the time from the POST to the last viewer getting its delta.
async function tapAndTime({ joinKey, night }, group, n) {
  const times = []
  for (let i = 0; i < n; i++) {
    const t0 = performance.now()
    const res = await fetch(`${base}/api/taps`, {
      method: 'POST',
      headers: { 'X-Join-Key': joinKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...night, id: crypto.randomUUID(), tagId: null, tappedAt: Date.now(), phoneName: 'Load' }),
    })
    if (!res.ok) throw new Error(`Tap refused: ${res.status}`)
    const seq = await currentSeq(group[0], t0)
    const arrivals = await Promise.all(group.map((v) => (v.seen.has(seq) ? v.seen.get(seq) : new Promise((done) => v.waiting.set(seq, done)))))
    times.push(Math.max(...arrivals) - t0)
    await Bun.sleep(300)
  }
  return times
}

// The seq of the delta a tap made: the first one the first viewer saw after the tap was sent.
async function currentSeq(viewer, since) {
  for (;;) {
    const seen = [...viewer.seen].filter(([, at]) => at >= since).map(([seq]) => seq)
    if (seen.length) return Math.min(...seen)
    await Bun.sleep(1)
  }
}

function rssMb() {
  const status = readFileSync(`/proc/${server.pid}/status`, 'utf8')
  return Math.round(Number(status.match(/VmRSS:\s+(\d+)/)[1]) / 1024)
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
}
