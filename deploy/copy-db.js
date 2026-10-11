// Run on the LXC by deploy.sh before every deploy: bun copy-db.js <config.json> <out dir>
// A timestamped VACUUM INTO copy of the live database (spec §4); prints its path, or nothing on a first deploy.
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Database } from 'bun:sqlite'

const [configPath, outDir] = process.argv.slice(2)
const { dbPath } = JSON.parse(readFileSync(configPath, 'utf8'))
if (dbPath && existsSync(dbPath)) {
  mkdirSync(outDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
  const out = join(outDir, `count-dracula-${stamp}.sqlite`)
  new Database(dbPath, { readonly: true }).exec(`VACUUM INTO '${out.replaceAll("'", "''")}'`)
  console.log(out)
}
