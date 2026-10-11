// The server config file (spec §3): read once at startup, no UI.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export function loadConfig(configPath) {
  const raw = JSON.parse(readFileSync(configPath, 'utf8'))
  const dir = dirname(configPath)
  const fromConfigDir = (p) => (p === ':memory:' ? p : resolve(dir, p))

  return {
    port: raw.port ?? 3131,
    dbPath: fromConfigDir(raw.dbPath ?? 'count-dracula.sqlite'),
    // Where the 15-minute VACUUM INTO copies go (spec §15); none without it.
    backupDir: raw.backupDir ? fromConfigDir(raw.backupDir) : null,
    switches: raw.switches ?? {},
    // 6 slots (3 homemade, 3 stock): the button label, the file the TV plays, and its TV visual.
    soundboard: (raw.soundboard ?? []).map((slot) => ({ label: slot.label, file: slot.file ?? null, shout: slot.shout ?? null, emoji: slot.emoji ?? null })),
  }
}
