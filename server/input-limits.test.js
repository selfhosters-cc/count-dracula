// What a request may carry: a body of at most 64 KB, as the Caddy in front allows, and names short enough for the
// TV and the phone. A costume's emoji is emoji: a top costume's reaches other houses' screens.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer } from './app.js'
import { fakeGoogle } from '../test/fake-google.js'
import { cookieOf, signIn } from '../test/sign-in.js'

const running = []
afterEach(() => running.splice(0).forEach((app) => app.stop()))

async function served() {
  const dir = mkdtempSync(join(tmpdir(), 'count-dracula-'))
  const configPath = join(dir, 'config.json')
  writeFileSync(configPath, JSON.stringify({ dbPath: join(dir, 'db.sqlite') }))
  const google = fakeGoogle()
  const app = startServer({ configPath, port: 0, google, env: {} })
  running.push(app)
  const cookie = cookieOf(await signIn({ app, google }, { sub: 'a', email: 'a@example.com' }, { displayName: 'The Smiths' }))
  const info = await (await fetch(`${app.url}/api/household`, { headers: { Cookie: cookie } })).json()
  const house = app.ledger.household(info.id)
  const night = () => ({ eventId: house.testNightId(), stamp: house.events().find((e) => e.id === house.testNightId()).wentLiveAt })
  const admin = async (command) => {
    const res = await fetch(`${app.url}/api/admin`, { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify(command) })
    return { status: res.status, text: await res.text() }
  }
  const phone = async (path, body) => {
    const res = await fetch(`${app.url}${path}`, { method: 'POST', headers: { 'X-Join-Key': info.joinKey }, body: JSON.stringify(body) })
    return { status: res.status, text: await res.text() }
  }
  return { app, house, night, admin, phone }
}

const kid = (id, extra = {}) => ({ id, tagId: null, tappedAt: Date.now(), phoneName: 'Dad', ...extra })

describe('request bodies', () => {
  test('past 64 KB are refused before they are read, even where no credential is needed', async () => {
    const { app } = await served()

    const res = await fetch(`${app.url}/api/pair/wait`, { method: 'POST', body: JSON.stringify({ waitToken: 'x'.repeat(100 * 1024) }) })

    expect(res.status).toBe(413)
  })
})

describe("a night's name", () => {
  test('is at most 40 characters and passes the blocklist, as a household name does', async () => {
    const { admin } = await served()

    expect(await admin({ type: 'createEvent', name: 'x'.repeat(41) })).toEqual({ status: 400, text: "A night's name is at most 40 characters" })
    expect(await admin({ type: 'createEvent', name: 'fuck' })).toEqual({ status: 400, text: 'Pick another name' })
    expect((await admin({ type: 'createEvent', name: 'x'.repeat(40) })).status).toBe(200)
  })

  test('is checked on rename too', async () => {
    const { house, admin } = await served()

    const res = await admin({ type: 'settings', eventId: house.testNightId(), name: '<meta http-equiv=refresh content="0;url=https://example.com">' })

    expect(res).toEqual({ status: 400, text: "A night's name is at most 40 characters" })
  })
})

describe("a costume's name and emoji", () => {
  test('a name is at most 40 characters, from Setup or a phone', async () => {
    const { house, night, admin, phone } = await served()
    const long = 'x'.repeat(41)

    expect(await admin({ type: 'createTag', eventId: house.testNightId(), name: long, emoji: '🧙' })).toEqual({ status: 400, text: 'A costume name is at most 40 characters' })
    expect(await phone('/api/catch-up', { ...night(), tag: { name: long, emoji: '🧙' }, n: 0, kid: kid('k1') })).toEqual({ status: 400, text: 'A costume name is at most 40 characters' })
  })

  test('an emoji is one or two emoji, or none', async () => {
    const { house, night, admin, phone } = await served()
    const add = (emoji) => admin({ type: 'createTag', eventId: house.testNightId(), name: `Costume ${emoji}`, emoji })

    for (const emoji of ['🧙', '🏴‍☠️', '🕷️', '👍🏽', '🇨🇦', '#️⃣', '🧛🦇', '', null]) expect({ emoji, ...(await add(emoji)) }).toMatchObject({ emoji, status: 200 })
    for (const emoji of ['WITCH', 'A🧙', '🧙🧛🦇', 'visit example.com', 7, '🧙'.repeat(9)]) {
      expect({ emoji, ...(await add(emoji)) }).toEqual({ emoji, status: 400, text: 'A costume emoji is one or two emoji' })
    }
    expect(await phone('/api/catch-up', { ...night(), tag: { name: 'Witch', emoji: 'Visit example.com' }, n: 0, kid: kid('k2') })).toEqual({ status: 400, text: 'A costume emoji is one or two emoji' })
  })

  test("every emoji on the phone's + New sheet is one", async () => {
    const { night, phone } = await served()
    const door = await Bun.file(new URL('../public/door.js', import.meta.url)).text()
    const emojis = JSON.parse(door.match(/const EMOJIS = (\[[^\]]+\])/)[1].replaceAll("'", '"'))

    for (const [i, emoji] of emojis.entries()) {
      expect({ emoji, ...(await phone('/api/catch-up', { ...night(), tag: { name: `Costume ${i}`, emoji }, n: 0, kid: kid(`e${i}`) })) }).toMatchObject({ emoji, status: 200 })
    }
  })

  test('a costume can be renamed and given a new emoji within the same limits', async () => {
    const { house, admin } = await served()
    const tagId = house.snapshot(house.testNightId()).tags[0].id

    expect(await admin({ type: 'updateTag', tagId, emoji: 'Visit example.com' })).toEqual({ status: 400, text: 'A costume emoji is one or two emoji' })
    expect(await admin({ type: 'updateTag', tagId, name: 'x'.repeat(41) })).toEqual({ status: 400, text: 'A costume name is at most 40 characters' })
    expect(await admin({ type: 'updateTag', tagId, sound: 'x'.repeat(101) })).toEqual({ status: 400, text: 'A costume sound is a file name' })
    expect((await admin({ type: 'updateTag', tagId, name: 'Ghoul', emoji: '🧟' })).status).toBe(200)
  })
})

describe("a phone's name", () => {
  test('is cut to 40 characters, never refused: a refused tap would hold up the outbox behind it', async () => {
    const { house, night, phone } = await served()

    expect((await phone('/api/taps', { ...night(), ...kid('long', { phoneName: 'y'.repeat(5_000) }) })).status).toBe(200)
    expect((await phone('/api/taps', { ...night(), ...kid('odd', { phoneName: { not: 'a string' } }) })).status).toBe(200)

    const kids = house.snapshot(house.testNightId()).kids
    expect(kids.find((k) => k.id === 'long').phoneName).toBe('y'.repeat(40))
    expect(kids.find((k) => k.id === 'odd').phoneName).toBeNull()
  })
})
