// The server config file (spec §3): read once at startup, no UI.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { ghostSeedFromCsv } from './export.js'

export function loadConfig(configPath) {
  const raw = JSON.parse(readFileSync(configPath, 'utf8'))
  const dir = dirname(configPath)
  const fromConfigDir = (p) => (p === ':memory:' ? p : resolve(dir, p))

  return {
    adminPin: String(raw.adminPin ?? ''),
    port: raw.port ?? 3131,
    lanUrl: raw.lanUrl ?? null, // what "Add a helper" puts in its QR code; null → this machine's LAN address
    dbPath: fromConfigDir(raw.dbPath ?? 'count-dracula.sqlite'),
    switches: raw.switches ?? {},
    // 6 slots (3 homemade, 3 stock): the button label, the file the TV plays, and its TV visual.
    soundboard: (raw.soundboard ?? []).map((slot) => ({ label: slot.label, file: slot.file ?? null, shout: slot.shout ?? null, emoji: slot.emoji ?? null })),
    ghostSeed: raw.ghostSeed ? readGhostSeed(fromConfigDir(raw.ghostSeed)) : null,
  }
}

// The 2025 counts file (JSON), or any past night's CSV export: its half-hour summary is the seed.
function readGhostSeed(path) {
  const text = readFileSync(path, 'utf8')
  return path.endsWith('.csv') ? ghostSeedFromCsv(text) : JSON.parse(text)
}
