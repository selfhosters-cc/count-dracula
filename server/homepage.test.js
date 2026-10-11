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
    expect(html).toContain('<script type="module" src="/home.js"></script>')
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

  test('one Continue with Google (no household name), Continue with email, Got a code?, and the footer\'s three links', async () => {
    const { app } = boot()

    const html = await (await get(app, '/')).text()

    // The top row, the Sign in section and the sticky phone bar: each the same Google form, with the zone and a TV's code.
    expect(html.match(/<form method="post" action="\/auth\/google\/start">/g)).toHaveLength(3)
    expect(html.match(/<button class="primary" type="submit">Continue with Google<\/button>/g)).toHaveLength(3)
    expect(html).not.toContain('name="displayName"')
    expect(html).not.toContain('Start your household')
    expect(html.match(/<input type="hidden" name="timeZone">/g)).toHaveLength(4)
    expect(html.match(/<input type="hidden" name="pair">/g)).toHaveLength(4)
    expect(html.match(/<a class="button" href="#code">Got a code\?<\/a>/g)).toHaveLength(2)
    expect(html).toContain('id="sign-in"')
    expect(html).toContain('<form method="post" action="/auth/email/start" id="email-form" hidden>')
    expect(html).toContain('<input id="email" name="email" type="email"')
    expect(html).toContain('>Continue with email</button>')
    expect(html).toContain('<form id="code-form"')
    expect(html).toContain('New households are paused for now. Signing in still works.')
    expect(html).toContain('<a href="/privacy">Privacy and House rules</a>')
    expect(html).toContain('<a href="/help/tv">TV setup help</a>')
    expect(html).toContain('Help: <a href="mailto:help@count-dracula.example.com">email us</a>')
  })

  test('the social card: title, description, og:* and a large image', async () => {
    const { app } = boot()

    const html = await (await fetch(`${app.url}/`, { headers: { 'X-Forwarded-Proto': 'https', Host: 'count-dracula.example.com' } })).text()

    const pitch = 'Count your trick-or-treaters on your phones, while a TV on the porch cheers every kid.'
    expect(html).toContain('<title>Count Dracula — count your trick-or-treaters</title>')
    expect(html).toContain(`<meta name="description" content="${pitch}">`)
    expect(html).toContain('<meta property="og:title" content="Count Dracula">')
    expect(html).toContain(`<meta property="og:description" content="${pitch}">`)
    expect(html).toContain('<meta property="og:image" content="https://count-dracula.example.com/og-home.png">')
    expect(html).toContain('<meta property="og:url" content="https://count-dracula.example.com/">')
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">')
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

describe('every "go sign in" points at /', () => {
  test('/setup, /tally, /summary and /operator without a session go to the Sign in form', async () => {
    const { app } = boot()

    for (const path of ['/setup', '/tally', '/summary', '/operator']) {
      const res = await get(app, path)
      expect({ path, status: res.status, to: res.headers.get('Location') }).toEqual({ path, status: 303, to: '/#sign-in' })
    }
  })

  test('sign-out goes to /', async () => {
    const { app, google } = boot()
    const cookie = cookieOf(await signIn({ app, google }, { sub: 'a', email: 'a@example.com' }, { displayName: 'The Smiths' }))

    const res = await fetch(`${app.url}/auth/signout`, { method: 'POST', headers: { Cookie: cookie }, redirect: 'manual' })

    expect(res.headers.get('Location')).toBe('/')
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
