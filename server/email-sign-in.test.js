// Continue with email (spec v2.1 §11): a magic link, 15 minutes, single use, opened through a page whose
// button POSTs, so a mail scanner's prefetch can't use it up. Same address = same Manager.
import { afterEach, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer } from './app.js'
import { fakeGoogle } from '../test/fake-google.js'
import { fakeSmtp } from '../test/fake-smtp.js'
import { cookieOf, signIn } from '../test/sign-in.js'
import { LIMITS } from './guard.js'

const MINUTE = 60_000
const running = []
afterEach(() => running.splice(0).forEach((thing) => thing.stop()))

const EMAIL_ENV = { SMTP_HOST: '192.0.2.25', EMAIL_FROM: 'Count Dracula <sign-in@count-dracula.example.com>', PUBLIC_HOST: 'count-dracula.example.com' }

// A fresh server with a fake Google, a fake mailer that keeps each message (mailer: 'env' for the one env
// makes), a clock and a log.
function start({ env = EMAIL_ENV, mailer = 'fake', limits = LIMITS, canSignUp } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'count-dracula-email-'))
  const dbPath = join(dir, 'db.sqlite')
  const configPath = join(dir, 'config.json')
  writeFileSync(configPath, JSON.stringify({ dbPath }))
  const clock = { now: Date.parse('2026-10-12T23:04:00Z') }
  const sent = []
  const logs = []
  const google = fakeGoogle()
  const app = startServer({
    configPath,
    port: 0,
    google,
    now: () => clock.now,
    env,
    limits,
    canSignUp,
    log: (line) => logs.push(line),
    mailer: mailer === 'fake' ? { send: async (message) => void sent.push(message) } : mailer === 'env' ? undefined : mailer,
  })
  running.push(app)
  return { app, google, clock, sent, logs, db: () => new Database(dbPath) }
}

const ask = (app, email, { pair, invite, timeZone = 'America/Toronto', ip } = {}) => {
  const body = new URLSearchParams({ email, timeZone })
  if (pair != null) body.set('pair', pair)
  if (invite != null) body.set('invite', invite)
  return fetch(`${app.url}/auth/email/start`, { method: 'POST', body, redirect: 'manual', headers: ip ? { 'CF-Connecting-IP': ip } : {} })
}
const linkIn = (message) => message.text.match(/https:\/\/\S+/)[0]
const tokenIn = (message) => new URL(linkIn(message)).searchParams.get('token')
const openLink = (app, token) => fetch(`${app.url}/auth/email?token=${encodeURIComponent(token)}`, { redirect: 'manual' })
const follow = (app, token) => fetch(`${app.url}/auth/email`, { method: 'POST', body: new URLSearchParams({ token }), redirect: 'manual' })
const settle = () => new Promise((r) => setTimeout(r, 20)) // the send runs after the reply

async function household(app, cookie) {
  const res = await fetch(`${app.url}/api/household`, { headers: { Cookie: cookie } })
  return res.status === 200 ? res.json() : res.status
}

// The whole round trip: ask, the email, its page, the button. Returns the button's response.
async function emailSignIn(server, email, options) {
  await ask(server.app, email, options)
  await settle()
  return follow(server.app, tokenIn(server.sent.at(-1)))
}

describe('switched off', () => {
  test('until SMTP_HOST and EMAIL_FROM are both set, the homepage hides it and every route refuses', async () => {
    for (const env of [{}, { SMTP_HOST: '192.0.2.25' }, { EMAIL_FROM: 'a@example.com' }]) {
      const { app } = start({ env, mailer: 'env' })

      expect((await (await fetch(`${app.url}/api/home`)).json()).emailSignIn).toBe(false)
      expect((await ask(app, 'alice@example.com')).status).toBe(404)
      expect((await openLink(app, 'x')).status).toBe(404)
      expect((await follow(app, 'x')).status).toBe(404)
      app.stop()
      running.length = 0
    }
  })

  test('set, the homepage shows it', async () => {
    const { app } = start()

    expect((await (await fetch(`${app.url}/api/home`)).json()).emailSignIn).toBe(true)
  })
})

describe('asking for a link', () => {
  test('"Check your email", the same for an address with an account and one without', async () => {
    const server = start()
    await emailSignIn(server, 'known@example.com')

    const known = await ask(server.app, 'known@example.com')
    const unknown = await ask(server.app, 'unknown@example.com')

    expect(known.status).toBe(200)
    expect(unknown.status).toBe(200)
    const page = await known.text()
    expect(page).toContain('Check your email')
    expect((await unknown.text()).replaceAll('unknown@', 'known@')).toBe(page)
    await settle()
    expect(server.sent.map((m) => m.to)).toEqual(['known@example.com', 'known@example.com', 'unknown@example.com'])
  })

  test('the email: its subject, a 15-minute single-use link on the public host, who asked and when, and "ignore this"', async () => {
    const server = start()

    await ask(server.app, 'Alice@Example.com', { ip: '203.0.113.9' })
    await settle()

    const [message] = server.sent
    expect(message.to).toBe('Alice@Example.com')
    expect(message.subject).toBe('Your Count Dracula sign-in link')
    expect(linkIn(message)).toMatch(/^https:\/\/count-dracula\.example\.com\/auth\/email\?token=[A-Za-z0-9_-]{43}$/)
    expect(message.text).toContain('Alice@Example.com')
    expect(message.text).toContain('203.0.113.9')
    expect(message.text).toMatch(/7:04\sPM on Monday, October 12 \(America\/Toronto\)/)
    expect(message.text).toContain('15 minutes')
    expect(message.text).toContain("If you didn't ask, ignore this")
    expect(message.html).toContain(`href="${linkIn(message)}"`)
  })

  test('an address that is not one is refused, and nothing is sent', async () => {
    const server = start()

    for (const email of ['', 'alice', 'alice@example', 'a b@example.com', 'alice@example.com\r\nBcc: x@example.com']) {
      expect((await ask(server.app, email)).status).toBe(400)
    }
    await settle()
    expect(server.sent).toEqual([])
  })

  test('the token is kept hashed, never as it was sent', async () => {
    const server = start()

    await ask(server.app, 'alice@example.com')
    await settle()

    const token = tokenIn(server.sent[0])
    const rows = server.db().query('SELECT * FROM email_links').all()
    expect(rows).toHaveLength(1)
    expect(JSON.stringify(rows)).not.toContain(token)
    expect(rows[0].token_hash).toBe(new Bun.CryptoHasher('sha256').update(token).digest('hex'))
  })

  test('logs that a link went out and to which household, with the address masked and never the token', async () => {
    const server = start()
    const google = await household(server.app, cookieOf(await signIn(server, { sub: 'g-alice', email: 'alice@example.com' })))

    await ask(server.app, 'alice@example.com')
    await ask(server.app, 'zed@example.com')
    await settle()

    const lines = server.logs.filter((l) => l.startsWith('email-link'))
    expect(lines).toEqual([`email-link sent to=a***@example.com household=${google.id}`, 'email-link sent to=z***@example.com household=new'])
    const all = server.logs.join('\n')
    expect(all).not.toContain('alice@example.com')
    for (const m of server.sent) expect(all).not.toContain(tokenIn(m))
  })

  test('a relay that refuses still says "Check your email", and the log keeps neither the address nor the token', async () => {
    const errors = []
    const original = console.error
    console.error = (...args) => errors.push(args.join(' '))
    try {
      const server = start({ mailer: { send: async () => { throw new Error('SMTP RCPT TO refused: 550') } } })

      const res = await ask(server.app, 'alice@example.com')
      await settle()

      expect(res.status).toBe(200)
      expect(errors.join('\n')).toContain('email-link failed to=a***@example.com: SMTP RCPT TO refused: 550')
      expect(errors.join('\n')).not.toContain('alice@example.com')
    } finally {
      console.error = original
    }
  })
})

describe('the link', () => {
  test('opening it shows a Sign in button that POSTs, and uses nothing up: a prefetch leaves it working', async () => {
    const server = start()
    await ask(server.app, 'alice@example.com')
    await settle()
    const token = tokenIn(server.sent[0])

    const opened = await openLink(server.app, token)
    await openLink(server.app, token) // a mail scanner, then the person

    expect(opened.status).toBe(200)
    expect(cookieOf(opened)).toBeNull()
    const html = await opened.text()
    expect(html).toContain('<form method="post" action="/auth/email">')
    expect(html).toContain(`<input type="hidden" name="token" value="${token}">`)
    expect(html).toContain('>Sign in</button>')
    expect((await follow(server.app, token)).status).toBe(303)
  })

  test('a new address gets a new Household, "Our household", with that address as its first Manager, and lands in first-run', async () => {
    const server = start()

    const res = await emailSignIn(server, 'New.Person@Example.com')

    expect(res.status).toBe(303)
    expect(res.headers.get('Location')).toBe('/setup')
    const house = await household(server.app, cookieOf(res))
    expect(house).toMatchObject({ displayName: 'Our household', timeZone: 'America/Toronto', firstRunPassed: false, manager: { email: 'New.Person@Example.com' } })
    const events = await (await fetch(`${server.app.url}/api/events`, { headers: { Cookie: cookieOf(res) } })).json()
    expect(events.filter((e) => e.live)).toMatchObject([{ name: 'Test night' }])
  })

  test('works once', async () => {
    const server = start()
    await ask(server.app, 'alice@example.com')
    await settle()
    const token = tokenIn(server.sent[0])

    expect((await follow(server.app, token)).status).toBe(303)
    const again = await follow(server.app, token)
    const reopened = await openLink(server.app, token)

    expect(again.status).toBe(400)
    expect(await again.text()).toContain('expired or was already used')
    expect(cookieOf(again)).toBeNull()
    expect(reopened.status).toBe(400)
    expect(server.app.ledger.households()).toHaveLength(1)
  })

  test('works for 15 minutes', async () => {
    const server = start()
    await ask(server.app, 'early@example.com')
    await ask(server.app, 'late@example.com')
    await settle()
    const [early, late] = server.sent.map(tokenIn)

    server.clock.now += 15 * MINUTE - 1
    expect((await follow(server.app, early)).status).toBe(303)
    server.clock.now += 2
    expect((await openLink(server.app, late)).status).toBe(400)
    expect((await follow(server.app, late)).status).toBe(400)
  })

  test('a made-up token is refused', async () => {
    const server = start()

    expect((await follow(server.app, 'made-up')).status).toBe(400)
    expect((await follow(server.app, '')).status).toBe(400)
    expect((await openLink(server.app, 'made-up')).status).toBe(400)
  })

  test('old links are pruned', async () => {
    const server = start()
    await ask(server.app, 'a@example.com')
    server.clock.now += 16 * MINUTE

    await ask(server.app, 'b@example.com')

    expect(server.db().query('SELECT COUNT(*) AS n FROM email_links').get().n).toBe(1)
  })
})

describe('same address, same person', () => {
  test("an address matching a Google Manager's, in any case, signs in as that Manager and makes nothing", async () => {
    const server = start()
    const google = cookieOf(await signIn(server, { sub: 'g-alice', email: 'alice@example.com', name: 'Alice' }, { displayName: 'The Smiths' }))
    const before = await household(server.app, google)

    const res = await emailSignIn(server, 'ALICE@example.COM')

    expect(res.headers.get('Location')).toBe('/setup')
    const after = await household(server.app, cookieOf(res))
    expect(after).toMatchObject({ id: before.id, displayName: 'The Smiths', manager: { email: 'alice@example.com', name: 'Alice' } })
    expect(server.db().query('SELECT COUNT(*) AS n FROM managers').get().n).toBe(1)
    expect(server.app.ledger.households()).toHaveLength(1)
  })

  test('an email Manager who later continues with Google, with the same address, reaches the same Household', async () => {
    const server = start()
    const viaEmail = await household(server.app, cookieOf(await emailSignIn(server, 'alice@example.com')))

    const viaGoogle = await household(server.app, cookieOf(await signIn(server, { sub: 'g-alice', email: 'Alice@Example.com', name: 'Alice' })))
    // From then on Google's id is the key: a changed address at Google still finds them.
    const renamed = await household(server.app, cookieOf(await signIn(server, { sub: 'g-alice', email: 'alice@elsewhere.example.com' })))

    expect(viaGoogle.id).toBe(viaEmail.id)
    expect(renamed.id).toBe(viaEmail.id)
    expect(server.db().query('SELECT COUNT(*) AS n FROM managers').get().n).toBe(1)
    expect(server.app.ledger.households()).toHaveLength(1)
  })
})

describe("a TV's code through email sign-in", () => {
  test('rides with the link and lands on /setup?pair=', async () => {
    const server = start()

    const res = await emailSignIn(server, 'alice@example.com', { pair: 'k7q-m4x' })
    const junk = await emailSignIn(server, 'alice@example.com', { pair: '/evil' })

    expect(res.headers.get('Location')).toBe('/setup?pair=K7QM4X')
    expect(junk.headers.get('Location')).toBe('/setup')
  })
})

describe('an Invite link through email sign-in', () => {
  // Alice runs "Our household" (by Google) and makes an invite; returns its key.
  async function inviteFrom(server) {
    const alice = cookieOf(await signIn(server, { sub: 'g-alice', email: 'alice@example.com', name: 'Alice' }))
    const { url } = await (await fetch(`${server.app.url}/api/invites`, { method: 'POST', headers: { Cookie: alice } })).json()
    return { alice, key: new URL(url).searchParams.get('key') }
  }
  const invitesLeft = async (server, alice) => (await (await fetch(`${server.app.url}/api/managers`, { headers: { Cookie: alice } })).json()).invites.length

  test('the invite page offers email too, carrying the invite; with email off, only Google', async () => {
    const server = start()
    const { key } = await inviteFrom(server)
    const off = start({ env: {}, mailer: 'env' })
    const offKey = (await inviteFrom(off)).key

    const html = await (await fetch(`${server.app.url}/invite?key=${key}`)).text()
    const offHtml = await (await fetch(`${off.app.url}/invite?key=${offKey}`)).text()

    expect(html).toContain('<form method="post" action="/auth/email/start">')
    expect(html.match(new RegExp(`<input type="hidden" name="invite" value="${key}">`, 'g'))).toHaveLength(2)
    expect(html).toContain('>Continue with email</button>')
    expect(offHtml).not.toContain('/auth/email/start')
    expect(offHtml).toContain('Continue with Google')
  })

  test('a new address joins the invited household as an equal Manager, and uses the invite up', async () => {
    const server = start()
    const { alice, key } = await inviteFrom(server)

    const bob = cookieOf(await emailSignIn(server, 'bob@example.com', { invite: key }))

    expect((await household(server.app, bob)).id).toBe((await household(server.app, alice)).id)
    expect(server.app.ledger.households()).toHaveLength(1)
    expect(await invitesLeft(server, alice)).toBe(0)
  })

  test('a dead invite says so before any email goes, and one used meanwhile refuses at the link', async () => {
    const server = start()
    const { alice, key } = await inviteFrom(server)
    await fetch(`${server.app.url}/api/invites/revoke`, { method: 'POST', headers: { Cookie: alice }, body: JSON.stringify({ key }) })
    const second = await (await fetch(`${server.app.url}/api/invites`, { method: 'POST', headers: { Cookie: alice } })).json()
    const live = new URL(second.url).searchParams.get('key')

    const revoked = await ask(server.app, 'bob@example.com', { invite: key })
    await settle()
    const sentBefore = server.sent.length
    await ask(server.app, 'carol@example.com', { invite: live })
    await settle()
    await emailSignIn(server, 'dan@example.com', { invite: live }) // Dan takes it first
    const carol = await follow(server.app, tokenIn(server.sent[sentBefore]))

    expect(revoked.status).toBe(410)
    expect(await revoked.text()).toContain('cancelled')
    expect(sentBefore).toBe(0)
    expect(carol.status).toBe(410)
    expect(await carol.text()).toContain('already been used')
    expect(cookieOf(carol)).toBeNull()
  })

  test('a Manager of another household is refused, and the invite stays unused', async () => {
    const server = start()
    const { alice, key } = await inviteFrom(server)
    await emailSignIn(server, 'dave@example.com') // Dave's own household

    const res = await emailSignIn(server, 'dave@example.com', { invite: key })

    expect(res.status).toBe(409)
    expect(await res.text()).toContain('each email address can manage one')
    expect(await invitesLeft(server, alice)).toBe(1)
  })
})

describe('paused sign-ups', () => {
  test('a known address still signs in; a new one gets the email, but its link says sign-ups are paused and makes nothing', async () => {
    const server = start()
    await emailSignIn(server, 'known@example.com')
    server.app.ledger.setSiteSwitch('pauseSignUps', true)

    const known = await emailSignIn(server, 'known@example.com')
    const stranger = await emailSignIn(server, 'stranger@example.com')

    expect(known.headers.get('Location')).toBe('/setup')
    expect(stranger.status).toBe(503)
    expect(await stranger.text()).toContain('Sign-ups are paused')
    expect(cookieOf(stranger)).toBeNull()
    expect(server.app.ledger.households()).toHaveLength(1)
  })
})

describe('limits', () => {
  test('at most 3 links per address per 15 minutes; the 4th is quietly not sent, and the reply is the same', async () => {
    const server = start()

    const replies = []
    for (let i = 0; i < 4; i++) replies.push(await (await ask(server.app, `alice@example.com`, { ip: `203.0.113.${i}` })).text())
    await settle()

    expect(server.sent).toHaveLength(3)
    expect(new Set(replies).size).toBe(1)
    expect(server.logs.join('\n')).not.toContain('alice@example.com') // the guard's refusal names a hash, not the address
    server.clock.now += 15 * MINUTE
    await ask(server.app, 'ALICE@example.com')
    await settle()
    expect(server.sent).toHaveLength(4)
  })

  test('per IP: past the limit, "Slow down"', async () => {
    const server = start({ limits: { ...LIMITS, emailLinkIp: { count: 2, perMs: 60 * MINUTE } } })

    expect((await ask(server.app, 'a@example.com', { ip: '203.0.113.7' })).status).toBe(200)
    expect((await ask(server.app, 'b@example.com', { ip: '203.0.113.7' })).status).toBe(200)
    expect((await ask(server.app, 'c@example.com', { ip: '203.0.113.7' })).status).toBe(429)
    expect((await ask(server.app, 'c@example.com', { ip: '203.0.113.8' })).status).toBe(200)
  })
})

describe('through the real SMTP client', () => {
  test('SMTP_HOST, SMTP_PORT and EMAIL_FROM send the link to the relay', async () => {
    const smtp = fakeSmtp()
    running.push(smtp)
    const dir = mkdtempSync(join(tmpdir(), 'count-dracula-email-'))
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ dbPath: join(dir, 'db.sqlite') }))
    // No mailer seam: the relay named in the env.
    const env = { ...EMAIL_ENV, SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtp.port) }
    const app = startServer({ configPath: join(dir, 'config.json'), port: 0, google: fakeGoogle(), env, log: () => {} })
    running.push(app)

    expect((await ask(app, 'alice@example.com')).status).toBe(200)
    for (let i = 0; i < 100 && !smtp.sessions[0]?.lines.includes('QUIT'); i++) await new Promise((r) => setTimeout(r, 20))

    const [session] = smtp.sessions
    expect(session.lines.slice(0, 3)).toEqual(['EHLO count-dracula.example.com', 'MAIL FROM:<sign-in@count-dracula.example.com>', 'RCPT TO:<alice@example.com>'])
    expect(session.body).toContain('Subject: Your Count Dracula sign-in link')
    const token = session.body.replace(/=\r\n/g, '').match(/auth\/email\?token=(?:3D)?([A-Za-z0-9_-]{43})/)[1]
    expect((await openLink(app, token)).status).toBe(200)
  })
})
