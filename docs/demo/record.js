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
const { joinKey, tvToken } = JSON.parse(seeded)

const W = 1890
const H = 1048
// [costume, seconds to wait after it]: about a kid a second, then the takeovers play out.
const TAPS = [
  ['Spider-Man', 1.0], ['Witch', 0.8], ['Princess', 1.1], ['Dinosaur', 0.9], ['Superhero', 1.0],
  ['Ghost', 2.2], // #100: the takeover, and the door keeps counting through it
  ['Vampire', 1.8], ['Witch', 1.0],
  ['Skeleton', 1.8], // #103: "NEXT KID IS GOLDEN" on the phone
  ['Princess', 9.2], // #104: the golden ticket, then the board
]

// Two panels with a gap between them, each labelled: the phone in its bezel, the TV in a TV's frame on a stand.
const page = `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/vendor/fonts/fonts.css"><style>
  html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; cursor: none; background: #07050c; }
  .panel { position: absolute; top: 20px; height: 1008px; box-sizing: border-box; padding: 20px; border-radius: 28px;
    background: linear-gradient(180deg, #1d1433 0%, #120c22 100%); border: 2px solid #34284d; }
  .door { left: 20px; width: 458px; }
  .porch { left: 502px; width: 1368px; }
  .label { height: 96px; text-align: center; }
  .label b { display: block; font: 400 36px/1.15 Bungee, sans-serif; color: #ff8a2a; letter-spacing: .02em; }
  .label span { display: block; margin-top: 6px; font: 500 28px/1.2 Fredoka, sans-serif; color: #d8cff0; }
  .phone { width: 390px; height: 844px; padding: 14px; border-radius: 58px; background: #050407;
    box-shadow: 0 0 0 2px #4a3f5e, 0 20px 50px #000c; }
  .phone iframe { width: 390px; height: 844px; border: 0; border-radius: 44px; display: block; background: #13101c; }
  .tv { width: 1280px; height: 720px; padding: 24px; border-radius: 18px; background: linear-gradient(180deg, #1a1a1f, #0b0b0e);
    box-shadow: 0 0 0 2px #4a3f5e, 0 20px 50px #000c; }
  .tv iframe { width: 1280px; height: 720px; border: 0; display: block; background: #13101c; }
  .neck { width: 90px; height: 26px; margin: 0 auto; background: #121216; }
  .base { width: 380px; height: 14px; margin: 0 auto; border-radius: 8px 8px 3px 3px; background: #1c1c22; box-shadow: 0 0 0 2px #2c2838; }
  .say { margin-top: 26px; text-align: center; font: 500 28px/1.2 Fredoka, sans-serif; color: #a99cc8; }
  .touch { position: absolute; width: 64px; height: 64px; margin: -32px 0 0 -32px; border-radius: 50%;
    background: #ffffff55; box-shadow: 0 0 0 3px #ffffffaa; pointer-events: none; opacity: 0; }
</style>
<div class="panel door">
  <div class="label"><b>📱 The door phone</b><span>a helper taps each kid</span></div>
  <div class="phone"><iframe id="door" src="/door?key=${encodeURIComponent(joinKey)}"></iframe></div>
</div>
<div class="panel porch">
  <div class="label"><b>📺 The TV on the porch</b><span>everyone watches</span></div>
  <div class="tv"><iframe id="tv" src="/tv/k/${tvToken}"></iframe></div>
  <div class="neck"></div><div class="base"></div>
  <div class="say">Each tap lands on the TV a moment later. Watch for kid #100, then a golden ticket.</div>
</div>
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

  for (const [costume, wait] of TAPS) {
    const tile = door.locator('.tile[data-tag]').filter({ has: door.locator('.nm', { hasText: new RegExp(`^${costume}$`) }) })
    const box = await tile.boundingBox() // in the page's coordinates, the iframe's offset included
    await tab.evaluate(([x, y]) => window.touch(x, y), [box.x + box.width / 2, box.y + box.height / 2])
    await tile.click()
    await tab.waitForTimeout(wait * 1000)
  }
  await cdp.send('Page.stopScreencast')
  writeFileSync(join(out, 'frames.json'), JSON.stringify(frames))
  console.log(`${frames.length} frames over ${frames.at(-1).t.toFixed(1)} s`)
} finally {
  await browser.close()
}

