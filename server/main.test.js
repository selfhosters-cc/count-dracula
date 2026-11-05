// The startup log: the URLs to open, never a Household's join key.
import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openLedger } from './ledger.js'

test('prints the TV and Setup URLs, and no join key, with a Household signed up', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'count-dracula-'))
  const dbPath = join(dir, 'db.sqlite')
  const db = new Database(dbPath)
  const ledger = openLedger(db, {})
  const key = ledger.household(ledger.createHousehold({ displayName: 'The Smiths', timeZone: 'America/Toronto' })).joinKey()
  db.close()
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ dbPath, port: 0 }))

  const proc = Bun.spawn([process.execPath, join(import.meta.dir, 'main.js'), join(dir, 'config.json')], { stdout: 'pipe', stderr: 'pipe', env: { ...process.env, EXTENSIONS: '' } })
  let out = ''
  const reader = proc.stdout.getReader()
  const decoder = new TextDecoder()
  while (!out.includes('Setup:')) {
    const { value, done } = await reader.read()
    if (done) break
    out += decoder.decode(value)
  }
  proc.kill()
  await proc.exited

  expect(out).toMatch(/TV: +http:\/\/\S+\/tv/)
  expect(out).toMatch(/Setup: +http:\/\/\S+\/setup/)
  expect(out).not.toContain(key)
  expect(out).not.toContain('key=')
})
