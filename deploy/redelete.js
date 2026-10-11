// After restoring a backup (deploy/RUNBOOK.md, "Database file damaged"): deletes again every Household that
// was deleted after the backup was taken. Run with the service stopped:
//   bun deploy/redelete.js <restored database> <household id> [<household id> …]
// The ids come from the damaged database's `deletions` table, or the journal's "household deleted" lines.
import { Database } from 'bun:sqlite'
import { openLedger } from '../server/ledger.js'
import { openAccounts } from '../server/accounts.js'

const [path, ...ids] = process.argv.slice(2)
if (!path || !ids.length) {
  console.error('Usage: bun deploy/redelete.js <restored database> <household id> […]')
  process.exit(2)
}
const db = new Database(path)
const ledger = openLedger(db, {})
const accounts = openAccounts(db, { ledger, google: null })
for (const id of ids.map(Number)) {
  const house = ledger.households().find((h) => h.id === id)
  if (!house) {
    console.log(`household ${id} is not in this database (deleted before the backup): nothing to do`)
    continue
  }
  accounts.deleteHousehold(id, house.displayName)
  console.log(`deleted household ${id}`)
}
