import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer } from './app.js'

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
    expect(configured).toContain('Updated Oct 2026')
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
