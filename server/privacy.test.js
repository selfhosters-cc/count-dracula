import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer } from './app.js'
import * as fixture from '../test/fixture-extension/index.js'

const running = []
afterEach(() => running.splice(0).forEach((app) => app.stop()))

function server(env) {
  const dir = mkdtempSync(join(tmpdir(), 'count-dracula-'))
  const configPath = join(dir, 'config.json')
  writeFileSync(configPath, JSON.stringify({ dbPath: join(dir, 'db.sqlite') }))
  const app = startServer({ configPath, port: 0, env })
  running.push(app)
  return app
}

const text = async (app, path) => (await fetch(`${app.url}${path}`)).text()

describe('/privacy', () => {
  test('shows the configured contact, or the fallback when none is set', async () => {
    const configured = await text(server({ OPERATOR_CONTACT: 'help@count-dracula.example.com' }), '/privacy')
    const fallback = await text(server({}), '/privacy')

    expect(configured).toContain('mailto:help@count-dracula.example.com')
    expect(configured).not.toContain('__CONTACT__')
    expect(fallback).toContain('mailto:privacy@count-dracula.example.com')
    for (const heading of ['What we keep', 'Who else sees it', "What's public", 'How long', 'Deleting', 'Contact', 'House rules']) {
      expect(configured).toContain(heading)
    }
    expect(configured).toContain('Updated Oct 18, 2026')
  })

  test('a Report from any page that shows a night: its reason goes when the report is dealt with', async () => {
    const page = await text(server({}), '/privacy')

    expect(page).toContain('If someone reports a page, the reason they give is deleted when the report is dealt with.')
    expect(page).not.toContain('a shared page')
  })

  test('promises no reply time', async () => {
    const page = await text(server({}), '/privacy')

    expect(page).toContain("we'll reply as soon as we can")
    expect(page).not.toMatch(/within a week|slower around Halloween/)
  })

  test('is linked from the homepage, the Location picker and /setup, and help is offered there and on /help/tv; never on the TV', async () => {
    const app = server({ OPERATOR_CONTACT: 'help@count-dracula.example.com' })

    const signup = await text(app, '/')
    expect(signup).toMatch(/By continuing you agree to the <a href="\/privacy">Privacy notice and House rules<\/a>/)
    expect(signup).toContain('Help: <a href="mailto:help@count-dracula.example.com">email us</a>')
    expect(await text(app, '/location-picker.js')).toContain("'/privacy'")
    expect(await text(app, '/setup.html')).toContain('href="/privacy"')
    expect(await text(app, '/setup.html')).toContain('Help: <a href="mailto:help@count-dracula.example.com"')
    expect(await text(app, '/help/tv')).toContain('Help: <a href="mailto:help@count-dracula.example.com">email us</a>')
    for (const path of ['/tv', '/tv.js']) expect(await text(app, path)).not.toContain('/privacy')
  })
})

// An Extension's item in "What's public" (v2.2 §8), from its entry module's privacy: { item, updated }.
describe("/privacy with an Extension's fragment", () => {
  const withExtensions = (extensions) => {
    const dir = mkdtempSync(join(tmpdir(), 'count-dracula-'))
    const configPath = join(dir, 'config.json')
    writeFileSync(configPath, JSON.stringify({ dbPath: join(dir, 'db.sqlite') }))
    const app = startServer({ configPath, port: 0, env: {}, extensions, log: () => {} })
    running.push(app)
    return app
  }
  const whatsPublic = (page) => page.match(/<h2>What's public<\/h2>\s*<ul>([\s\S]*?)<\/ul>/)[1]

  test("with none, the core's own items and date, and nothing left to fill", async () => {
    for (const path of ['/privacy', '/privacy.html']) {
      const page = await text(withExtensions([]), path)

      expect(page).not.toContain('__EXTENSIONS_PRIVACY__')
      expect(page).toContain('Updated Oct 18, 2026')
      expect(whatsPublic(page)).toMatch(/Never a name, an address or a place\.<\/li>\n {6}<li><b>Never public:/)
      expect(whatsPublic(page).match(/<li>/g)).toHaveLength(4)
    }
  })

  test("the fixture's <li> sits just before Never public, and Updated is its later date", async () => {
    for (const path of ['/privacy', '/privacy.html']) {
      const page = await text(withExtensions([fixture]), path)

      expect(whatsPublic(page)).toContain(`a place.</li>\n      ${fixture.privacy.item}\n      <li><b>Never public:`)
      expect(page).toContain('Updated Oct 25, 2026')
      expect(page).not.toContain('Oct 18, 2026')
    }
  })

  test("a fragment dated before the core's keeps the core's date; two Extensions' items go in list order", async () => {
    const older = { ...fixture, name: 'older', dir: undefined, privacy: { item: '<li>The older one.</li>', updated: '2026-03-01' } }
    const plain = { ...fixture, name: 'plain', dir: undefined, privacy: undefined }

    const alone = await text(withExtensions([older, plain]), '/privacy')
    const both = await text(withExtensions([fixture, older]), '/privacy')

    expect(alone).toContain('Updated Oct 18, 2026')
    expect(whatsPublic(alone)).toContain('a place.</li>\n      <li>The older one.</li>\n      <li><b>Never public:')
    expect(whatsPublic(both)).toContain(`a place.</li>\n      ${fixture.privacy.item}\n      <li>The older one.</li>\n      <li><b>Never public:`)
    expect(both).toContain('Updated Oct 25, 2026')
  })
})
