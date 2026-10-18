// v2.1 ticket 59: the homepage on `/` (spec v2.1 §11). `/signup` folds into it, every "go sign in" points at it,
// and GET /api/home tells the page whether sign-ups are paused and who's signed in.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer } from './app.js'
import { fakeGoogle } from '../test/fake-google.js'
import { cookieOf, signIn } from '../test/sign-in.js'

const running = []
afterEach(() => running.splice(0).forEach((app) => app.stop()))

const ENV = { OPERATOR_EMAILS: 'op@example.com', OPERATOR_CONTACT: 'help@count-dracula.example.com' }

function boot() {
  const dir = mkdtempSync(join(tmpdir(), 'count-dracula-'))
  const configPath = join(dir, 'config.json')
  writeFileSync(configPath, JSON.stringify({ dbPath: join(dir, 'db.sqlite') }))
  const google = fakeGoogle()
  const app = startServer({ configPath, port: 0, google, env: ENV, log: () => {} })
  running.push(app)
  return { app, google }
}

const get = (app, path, cookie) => fetch(`${app.url}${path}`, { headers: cookie ? { Cookie: cookie } : {}, redirect: 'manual' })
const pngWidth = async (res) => new DataView(await res.arrayBuffer()).getUint32(16)
const pngHeight = async (res) => new DataView(await res.arrayBuffer()).getUint32(20)

describe('/ is the homepage', () => {
  test('a fresh browser gets the homepage, not the door phone', async () => {
    const { app } = boot()

    const res = await get(app, '/')
    const html = await res.text()

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toStartWith('text/html')
    expect(html).toMatch(/<script type="module" src="\/home\.js\?v=[\w-]+"><\/script>/)
    expect(html).not.toContain('/door.js')
    expect(html).toContain('Count your trick-or-treaters on your phones, while a TV on the porch cheers every kid.')
  })

  test('/?key= still goes to /door', async () => {
    const { app } = boot()

    const res = await get(app, '/?key=abc')

    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('/door?key=abc')
  })

  test('/signup lands on /', async () => {
    const { app } = boot()

    const res = await get(app, '/signup')

    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('/')
  })

  test('one sign-in block: Continue with Google, then Continue with email; Got a code? and the footer\'s three links', async () => {
    const { app } = boot()

    const html = await (await get(app, '/')).text()

    // One Google form and one email form, together in the block /#sign-in lands on, each with the zone and a TV's code.
    const block = html.slice(html.indexOf('<section id="sign-in"'), html.indexOf('</section>', html.indexOf('<section id="sign-in"')))
    expect(html.match(/<form method="post" action="\/auth\/google\/start">/g)).toHaveLength(1)
    expect(html.match(/action="\/auth\/email\/start"/g)).toHaveLength(1)
    expect(block).toContain('<form method="post" action="/auth/google/start">')
    expect(block).toContain('<form method="post" action="/auth/email/start" id="email-form" hidden>')
    expect(block).toContain('>Continue with Google</button>')
    expect(block).toContain('<input id="email" name="email" type="email"')
    expect(block).toContain('>Continue with email</button>')
    expect(block).toContain('New households are paused for now. Signing in still works.')
    expect(block).toContain('id="signed-out-note"')
    expect(block).toContain('id="pair-note"')
    expect(html).not.toContain('name="displayName"')
    expect(html.match(/<input type="hidden" name="timeZone">/g)).toHaveLength(2)
    expect(html.match(/<input type="hidden" name="pair">/g)).toHaveLength(2)
    // The phones' sticky bar goes to the block and to the code box.
    expect(html).toContain('<a class="button primary" href="#sign-in">Sign in or start</a>')
    expect(html).toContain('<a class="button" href="#code">Got a code?</a>')
    expect(html).toContain('<form id="code-form"')
    expect(html).toContain('<a href="/privacy">Privacy and House rules</a>')
    expect(html).toContain('<a href="/help/tv">TV setup help</a>')
    expect(html).toContain('Help: <a href="mailto:help@count-dracula.example.com">email us</a>')
  })

  test("Continue with Google is Google's own button: white, the G, on the homepage and an invite", async () => {
    const { app, google } = boot()
    const button = '<button class="google" type="submit"><img src="/google-g.svg" alt="" width="20" height="20">Continue with Google</button>'

    const home = await (await get(app, '/')).text()
    const owner = cookieOf(await signIn({ app, google }, { sub: 'g-1', email: 'alice@example.com', name: 'Alice' }))
    const { url } = await (await fetch(`${app.url}/api/invites`, { method: 'POST', headers: { Cookie: owner } })).json()
    const invite = await (await get(app, new URL(url).pathname + new URL(url).search)).text()

    expect(home).toContain(button)
    expect(invite).toContain(button)
    expect(home).toMatch(/\.google \{[^}]*background: #fff;[^}]*color: #1f1f1f;[^}]*border: 1px solid #747775;/)
    const g = await get(app, '/google-g.svg')
    expect(g.headers.get('Content-Type')).toStartWith('image/svg+xml')
    expect(await g.text()).toContain('#4285F4')
  })

  test('the social card: title, description, og:* and a large image', async () => {
    const { app } = boot()

    const html = await (await fetch(`${app.url}/`, { headers: { 'X-Forwarded-Proto': 'https', Host: 'count-dracula.example.com' } })).text()

    const pitch = "Count your trick-or-treaters on your phones, while a TV on the porch shows the count and a chart comparing to last year's numbers."
    expect(html).toContain('<title>Count Dracula — count your trick-or-treaters</title>')
    expect(html).toContain(`<meta name="description" content="${pitch}">`)
    expect(html).toContain('<meta property="og:title" content="Count Dracula">')
    expect(html).toContain(`<meta property="og:description" content="${pitch}">`)
    expect(html).toContain('<meta property="og:image" content="https://count-dracula.example.com/og-home.png">')
    expect(html).toContain('<meta property="og:url" content="https://count-dracula.example.com/">')
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">')
  })

  test('a helper link and a TV link each preview what they are for, never the Household', async () => {
    const { app } = boot()
    const page = async (path) => (await fetch(`${app.url}${path}`, { headers: { 'X-Forwarded-Proto': 'https', Host: 'count-dracula.example.com' } })).text()

    const helper = await page('/door?key=Ab3dEf7hJk')
    const watch = await page('/tv/k/some-tv-token')
    const bareTv = await page('/tv')

    expect(helper).toContain('<meta property="og:title" content="Help count trick-or-treaters with us">')
    expect(helper).toContain('<meta property="og:image" content="https://count-dracula.example.com/og-helper.png">')
    expect(watch).toContain('<meta property="og:title" content="Watch our trick-or-treat count, live">')
    expect(watch).toContain('<meta property="og:image" content="https://count-dracula.example.com/og-watch.png">')
    expect(bareTv).toContain('<meta property="og:title" content="Make this screen your porch TV">')
    for (const html of [helper, watch, bareTv]) {
      expect(html).not.toContain('og:url') // the link's secret isn't repeated
      expect(html).not.toContain('__PREVIEW')
    }
    for (const path of ['/privacy', '/help/tv']) expect(await page(path)).toContain('<meta property="og:title" content="Count Dracula: ')
    for (const image of ['/og-helper.png', '/og-watch.png']) {
      const res = await get(app, image)
      expect([await pngWidth(res.clone()), await pngHeight(res)]).toEqual([1200, 630])
    }
  })

  test('serves og-home.png at 1200×630, and og-image.png stays for share links', async () => {
    const { app } = boot()

    const home = await get(app, '/og-home.png')
    expect(home.status).toBe(200)
    expect(home.headers.get('Content-Type')).toBe('image/png')
    expect([await pngWidth(home.clone()), await pngHeight(home)]).toEqual([1200, 630])
    expect((await get(app, '/og-image.png')).status).toBe(200)
  })

  test('serves the How it works screenshots, the TV shots downscaled to about 800 px wide', async () => {
    const { app } = boot()
    const html = await (await get(app, '/')).text()

    for (const name of ['tv.png', 'phone.png', 'tv-milestone.png', 'tv-golden.png', 'tv-recap.png']) {
      expect(html).toContain(`src="/${name}"`)
      const res = await get(app, `/${name}`)
      expect(res.status).toBe(200)
      expect(await pngWidth(res)).toBeLessThanOrEqual(800)
    }
    expect(await pngWidth(await get(app, '/tv.png'))).toBe(800)
  })
})

describe('caching, so a deploy is seen at once (Cloudflare keeps .js 4 hours when told nothing)', () => {
  test('pages, scripts, styles and data are revalidated every time; images, fonts and sounds kept a day', async () => {
    const { app } = boot()
    const cacheOf = async (path) => (await get(app, path)).headers.get('Cache-Control')

    for (const path of ['/', '/door', '/tv', '/home.js', '/door-view.js', '/shared/codes.js', '/privacy']) {
      expect({ path, cache: await cacheOf(path) }).toEqual({ path, cache: 'no-cache' })
    }
    for (const path of ['/tv.png', '/og-home.png']) {
      expect({ path, cache: await cacheOf(path) }).toEqual({ path, cache: 'public, max-age=86400' })
    }
  })
})

describe("every script has this build's address (Cloudflare forces browsers to keep .js 4 hours)", () => {
  test("pages and modules all name this build's scripts, the same way, so a phone never runs old code", async () => {
    const { app } = boot()
    const html = await (await get(app, '/door')).text()
    const build = html.match(/src="\/door\.js\?v=([\w-]+)"/)?.[1]
    expect(build).toBeTruthy()

    const door = await (await get(app, `/door.js?v=${build}`)).text()
    expect(door).toContain(`from '/door-view.js?v=${build}'`)
    expect(door).toContain(`from '/outbox.js?v=${build}'`)
    expect(door).not.toMatch(/from '[^']+\.js'/) // nothing left unstamped
    const home = await (await get(app, `/home.js?v=${build}`)).text()
    expect(home).toContain(`from '/shared/codes.js?v=${build}'`)
    const view = await (await get(app, `/setup-night.js?v=${build}`)).text()
    expect(view).toContain(`from './setup-dom.js?v=${build}'`) // relative imports too
    expect(view).toContain(`from '../shared/race-against.js?v=${build}'`)
    expect((await get(app, `/door-view.js?v=${build}`)).status).toBe(200)
  })
})

describe('every "go sign in" points at /', () => {
  test('/setup, /tally, /summary and /operator without a session go to the Sign in form', async () => {
    const { app } = boot()

    for (const path of ['/setup', '/tally', '/summary', '/operator']) {
      const res = await get(app, path)
      expect({ path, status: res.status, to: res.headers.get('Location') }).toEqual({ path, status: 303, to: '/#sign-in' })
    }
  })

  test("sign-out ends only our session and lands on the homepage, told so (not bounced to a phone's door)", async () => {
    const { app, google } = boot()
    const cookie = cookieOf(await signIn({ app, google }, { sub: 'a', email: 'a@example.com' }, { displayName: 'The Smiths' }))

    const res = await fetch(`${app.url}/auth/signout`, { method: 'POST', headers: { Cookie: cookie }, redirect: 'manual' })

    expect(res.headers.get('Location')).toBe('/?signed-out=1#sign-in')
    expect(res.headers.get('Set-Cookie')).toMatch(/Max-Age=0/)
  })

  test('backing out at Google goes to /', async () => {
    const { app } = boot()

    const res = await get(app, '/auth/google/callback?error=access_denied')

    expect(res.headers.get('Location')).toBe('/')
  })

  test("the sign-in error pages' Try again, Start again and Back links", async () => {
    const { app, google } = boot()

    const stale = await (await get(app, '/auth/google/callback?code=x&state=nope')).text()
    expect(stale).toContain('<a href="/#sign-in">Start again</a>')

    const badName = await fetch(`${app.url}/auth/google/start`, { method: 'POST', body: new URLSearchParams({ displayName: 'x'.repeat(41), timeZone: 'America/Toronto' }) })
    expect(await badName.text()).toContain('<a href="/#sign-in">Back</a>')
  })

  test("Google failing says Try again, pointing at /", async () => {
    const { app } = boot()
    const started = await fetch(`${app.url}/auth/google/start`, { method: 'POST', body: new URLSearchParams({ displayName: 'The Smiths', timeZone: 'America/Toronto' }), redirect: 'manual' })
    const state = new URL(started.headers.get('Location')).searchParams.get('state')

    const res = await get(app, `/auth/google/callback?code=not-a-code&state=${state}`)

    expect(res.status).toBe(502)
    expect(await res.text()).toContain('<a href="/#sign-in">Try again</a>')
  })
})

describe('GET /api/home', () => {
  test('a fresh browser: sign-ups open, nobody signed in', async () => {
    const { app } = boot()

    expect(await (await get(app, '/api/home')).json()).toEqual({ signUpsPaused: false, household: null, emailSignIn: false })
  })

  test("a signed-in Manager's Household name, and nothing else about it", async () => {
    const { app, google } = boot()
    const cookie = cookieOf(await signIn({ app, google }, { sub: 'a', email: 'a@example.com' }, { displayName: 'The Smiths on Elm St' }))

    expect(await (await get(app, '/api/home', cookie)).json()).toEqual({ signUpsPaused: false, household: 'The Smiths on Elm St', emailSignIn: false })
    expect(await (await get(app, '/api/home', 'cd_session=forged')).json()).toEqual({ signUpsPaused: false, household: null, emailSignIn: false })
  })

  test("follows the Operator's pause-sign-ups switch", async () => {
    const { app, google } = boot()
    const op = cookieOf(await signIn({ app, google }, { sub: 'op', email: 'op@example.com' }, { displayName: 'Ops House' }))
    const pause = (on) => fetch(`${app.url}/api/operator/pause`, { method: 'POST', headers: { Cookie: op }, body: JSON.stringify({ on }) })

    await pause(true)
    expect(await (await get(app, '/api/home')).json()).toEqual({ signUpsPaused: true, household: null, emailSignIn: false })
    await pause(false)
    expect((await (await get(app, '/api/home')).json()).signUpsPaused).toBe(false)
  })
})
