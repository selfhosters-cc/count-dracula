// The README demo's recording (docs/demo/README.md): the door phone (390×844, in a phone bezel) beside the TV
// (1280×720), both live on one composite page so they stay in step, captured frame by frame over the Chrome
// DevTools screencast. The phone's costume tiles are really tapped; the TV reacts as it would on the night.
//
//   PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core \
//     bun docs/demo/record.js <server url> '<seed.js output>' <frames dir>
//
// playwright-core is not a dependency of this repo: point PLAYWRIGHT_CORE at any install with a Chromium.
// Writes <frames dir>/NNNNN.jpg and <frames dir>/frames.json ([{ file, t }], t in seconds from the start).
import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const [base, seeded, out] = process.argv.slice(2)
if (!out || !process.env.PLAYWRIGHT_CORE) {
  console.error("Usage: PLAYWRIGHT_CORE=<playwright-core dir> bun docs/demo/record.js <server url> '<seed.js output>' <frames dir>")
  process.exit(2)
}
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_CORE)
const { joinKey, tvToken, eventId, stamp, tags } = JSON.parse(seeded)

const W = 1824
const H = 936
// [costume, seconds to wait after it, helper]: about a kid a second, then the takeovers play out. Sam's phone
// is off screen: its #103 is what shows "NEXT KID IS GOLDEN" on the phone in the clip.
const TAPS = [
  ['Spider-Man', 1.0], ['Witch', 0.8], ['Princess', 1.1], ['Dinosaur', 0.9], ['Superhero', 1.0],
  ['Ghost', 2.2], // #100: the takeover, and the door keeps counting through it
  ['Vampire', 1.8], ['Witch', 1.0],
  ['Skeleton', 1.8, 'Sam'], // #103
  ['Princess', 9.2], // #104: the golden ticket, then the board
]

const page = `<!doctype html><meta charset="utf-8"><style>
  html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; cursor: none;
    background: radial-gradient(ellipse at 30% 20%, #241640 0%, #120c22 55%, #0a0712 100%); }
  .phone { position: absolute; left: 32px; top: 32px; width: 390px; height: 844px; padding: 14px;
    border-radius: 58px; background: #050407; box-shadow: 0 0 0 2px #3a3248, 0 24px 60px #000a; }
  .phone iframe { width: 390px; height: 844px; border: 0; border-radius: 44px; display: block; background: #13101c; }
  .tv { position: absolute; left: 488px; top: 64px; padding: 12px; border-radius: 14px; background: #050407;
    box-shadow: 0 0 0 2px #3a3248, 0 24px 60px #000a; }
  .tv iframe { width: 1280px; height: 720px; border: 0; display: block; background: #13101c; }
  .say { position: absolute; left: 488px; top: 830px; width: 1304px; text-align: center; color: #c9bfe0;
    font: 600 28px/1.3 system-ui, sans-serif; letter-spacing: .01em; }
  .say b { color: #ff8a2a; }
  .touch { position: absolute; width: 64px; height: 64px; margin: -32px 0 0 -32px; border-radius: 50%;
    background: #ffffff55; box-shadow: 0 0 0 3px #ffffffaa; pointer-events: none; opacity: 0; }
</style>
<div class="phone"><iframe id="door" src="/door?key=${encodeURIComponent(joinKey)}"></iframe></div>
<div class="tv"><iframe id="tv" src="/tv/k/${tvToken}"></iframe></div>
<div class="say"><b>At the door,</b> a helper taps each kid in. <b>On the TV,</b> every one is celebrated.</div>
<div class="touch" id="touch"></div>
<script>
  window.touch = (x, y) => {
    const t = document.getElementById('touch')
    t.style.left = x + 'px'; t.style.top = y + 'px'
    t.animate([{ opacity: 0.9, transform: 'scale(.6)' }, { opacity: 0, transform: 'scale(1.5)' }], { duration: 450, easing: 'ease-out' })
  }
</script>`

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--hide-scrollbars'] })
try {
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: true })
  await context.addInitScript(() => {
    try {
      localStorage.setItem('cd.phoneName', 'Greg')
    } catch {}
  })
  await context.route(`${base}/__demo`, (route) => route.fulfill({ contentType: 'text/html', body: page }))
  // The app refuses to be framed (frame-ancestors 'none'); only this recording lets the two pages sit side by side.
  await context.route(/\/(door|tv\/k\/[^/?]+)(\?.*)?$/, async (route) => {
    const response = await route.fetch()
    const headers = { ...response.headers() }
    headers['content-security-policy'] = headers['content-security-policy']?.replace(/;?\s*frame-ancestors 'none'/, '')
    await route.fulfill({ response, headers })
  })
  const tab = await context.newPage()
  tab.on('pageerror', (err) => console.error('page error:', err.message))
  await tab.goto(`${base}/__demo`)
  const door = tab.frameLocator('#door')
  await door.locator('.tile[data-tag]').first().waitFor()
  await tab.frameLocator('#tv').locator('#count').waitFor()
  for (const frame of tab.frames()) await frame.evaluate(() => document.fonts.ready.then(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {})))))
  await tab.waitForTimeout(3000) // the TV's first roll-up and chart draw settle

  mkdirSync(out, { recursive: true })
  const frames = []
  const cdp = await context.newCDPSession(tab)
  let first = null
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    first ??= metadata.timestamp
    const file = `${String(frames.length).padStart(5, '0')}.jpg`
    writeFileSync(join(out, file), Buffer.from(data, 'base64'))
    frames.push({ file, t: metadata.timestamp - first })
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
  })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 })
  await tab.waitForTimeout(900)

  for (const [costume, wait, helper] of TAPS) {
    if (helper) await helperTap(helper, tags[costume])
    else {
      const tile = door.locator('.tile[data-tag]').filter({ has: door.locator('.nm', { hasText: new RegExp(`^${costume}$`) }) })
      const box = await tile.boundingBox() // in the page's coordinates, the iframe's offset included
      await tab.evaluate(([x, y]) => window.touch(x, y), [box.x + box.width / 2, box.y + box.height / 2])
      await tile.click()
    }
    await tab.waitForTimeout(wait * 1000)
  }
  await cdp.send('Page.stopScreencast')
  writeFileSync(join(out, 'frames.json'), JSON.stringify(frames))
  console.log(`${frames.length} frames over ${frames.at(-1).t.toFixed(1)} s`)
} finally {
  await browser.close()
}

// Another helper's phone: the same tap the door page sends.
async function helperTap(phoneName, tagId) {
  const res = await fetch(`${base}/api/taps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Join-Key': joinKey },
    body: JSON.stringify({ id: crypto.randomUUID(), tagId, tappedAt: Date.now(), phoneName, eventId, stamp }),
  })
  if (!res.ok) throw new Error(`${phoneName}'s tap: HTTP ${res.status}`)
}
