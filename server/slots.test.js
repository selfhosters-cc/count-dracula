// Page slots (v2.2 §8): /extensions.js, which the core's pages import for slot(name, ctx), through the fixture
// Extension under test/. What the slots do on a page is public/extension-slots.test.js's, and the browser's.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer } from './app.js'
import * as fixture from '../test/fixture-extension/index.js'

const running = []
afterEach(() => running.splice(0).forEach((app) => app.stop()))

function start(extensions) {
  const dir = mkdtempSync(join(tmpdir(), 'count-dracula-'))
  const configPath = join(dir, 'config.json')
  writeFileSync(configPath, JSON.stringify({ dbPath: join(dir, 'db.sqlite') }))
  const app = startServer({ configPath, port: 0, env: {}, extensions, log: () => {} })
  running.push(app)
  return app
}

// /extensions.js, and every module it names (its import, and each Extension's slots.js it loads).
async function extensionsJs(app) {
  const res = await fetch(`${app.url}/extensions.js`)
  const js = await res.text()
  return { res, js, modules: [...js.matchAll(/(["'])(\/[^"'\s]+\.js)(?:\?v=\w+)?\1/g)].map((m) => m[2]) }
}

describe('/extensions.js', () => {
  test("with no Extension, a module whose slot loads nothing: every slot is empty", async () => {
    const app = start([])

    const { res, js, modules } = await extensionsJs(app)

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toStartWith('text/javascript')
    expect(res.headers.get('Cache-Control')).toBe('no-cache')
    expect(js).toMatch(/import \{ loadSlots \} from '\/extension-slots\.js\?v=\w+'/)
    expect(js).toContain('export const slot = await loadSlots([])')
    expect(modules).toEqual(['/extension-slots.js'])
  })

  test("loads each Extension's public/slots.js, stamped with this build, and none for one without", async () => {
    const app = start([fixture, { ...fixture, name: 'plain', dir: undefined }, { ...fixture, name: 'other', dir: join(import.meta.dir, '../test/fixtures') }])

    const { js, modules } = await extensionsJs(app)

    expect(modules).toEqual(['/extension-slots.js', '/fixture/slots.js'])
    expect(js).toMatch(/"\/fixture\/slots\.js\?v=\w+"/)
    for (const path of modules) {
      const res = await fetch(`${app.url}${path}`)
      expect({ path, status: res.status, type: res.headers.get('Content-Type') }).toEqual({ path, status: 200, type: expect.stringMatching(/^text\/javascript/) })
    }
  })
})
