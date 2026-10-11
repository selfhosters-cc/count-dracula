// Run on the LXC by deploy.sh: bun upgrade-config.js <config.json> <backup dir>
// A v1 server's config loses its dead keys (the admin PIN, the ghost seed, the LAN and tailnet settings) and
// gains the backup directory, once (spec §5). Prints what changed, or nothing.
import { readFileSync, writeFileSync } from 'node:fs'

const [path, backupDir] = process.argv.slice(2)
const config = JSON.parse(readFileSync(path, 'utf8'))
const removed = ['adminPin', 'ghostSeed', 'lanUrl', 'autoJoinHosts'].filter((key) => key in config)
for (const key of removed) delete config[key]
const added = 'backupDir' in config ? [] : ['backupDir']
if (added.length) config.backupDir = backupDir
if (removed.length || added.length) {
  writeFileSync(path, JSON.stringify(config, null, 2) + '\n')
  console.log(`removed: ${removed.join(', ') || 'none'}; added: ${added.join(', ') || 'none'}`)
}
