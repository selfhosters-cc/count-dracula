// The server config file (spec §3): read once at startup, no UI.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export function loadConfig(configPath) {
  const raw = JSON.parse(readFileSync(configPath, 'utf8'))
  const dir = dirname(configPath)
  const fromConfigDir = (p) => (p === ':memory:' ? p : resolve(dir, p))

  return {
    adminPin: String(raw.adminPin ?? ''),
    port: raw.port ?? 3131,
    dbPath: fromConfigDir(raw.dbPath ?? 'count-dracula.sqlite'),
    switches: raw.switches ?? {},
    soundboard: (raw.soundboard ?? []).map((slot) => ({ label: slot.label, file: slot.file })),
    ghostSeed: raw.ghostSeed ? JSON.parse(readFileSync(fromConfigDir(raw.ghostSeed), 'utf8')) : null,
  }
}
