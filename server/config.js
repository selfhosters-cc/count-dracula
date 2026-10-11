// The server config file (spec §3): read once at startup, no UI.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export function loadConfig(configPath) {
  const raw = JSON.parse(readFileSync(configPath, 'utf8'))
  const dir = dirname(configPath)
  const fromConfigDir = (p) => (p === ':memory:' ? p : resolve(dir, p))

  return {
    port: raw.port ?? 3131,
    lanUrl: raw.lanUrl ?? null,
    // Host names whose visitors get the join key without scanning: the private tailnet name behind Caddy,
    // which only serves *.int to Tailscale and LAN clients (spec §3 "Tailnet phones receive the join key").
    autoJoinHosts: raw.autoJoinHosts ?? [], // what "Add a helper" puts in its QR code; null → this machine's LAN address
    dbPath: fromConfigDir(raw.dbPath ?? 'count-dracula.sqlite'),
    switches: raw.switches ?? {},
    // 6 slots (3 homemade, 3 stock): the button label, the file the TV plays, and its TV visual.
    soundboard: (raw.soundboard ?? []).map((slot) => ({ label: slot.label, file: slot.file ?? null, shout: slot.shout ?? null, emoji: slot.emoji ?? null })),
  }
}
