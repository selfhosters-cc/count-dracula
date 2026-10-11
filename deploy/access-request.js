// An access request by email (deploy/RUNBOOK.md): what we hold about one Manager, their Household and its
// Events, as JSON to answer by hand. Read-only.
//   bun deploy/access-request.js <database> <email>
import { Database } from 'bun:sqlite'

const [path, email] = process.argv.slice(2)
if (!path || !email) {
  console.error('Usage: bun deploy/access-request.js <database> <email>')
  process.exit(2)
}
const db = new Database(path, { readonly: true })
const manager = db
  .query('SELECT id, email, name, google_sub, household_id, last_sign_in_at FROM managers WHERE lower(email) = lower(?)')
  .get(email.trim())
if (!manager) {
  console.log('No Manager with that email.')
  process.exit(1)
}
// The secrets that let a device in (join key, TV link) aren't "about" anyone: left out.
const household = db
  .query('SELECT id, display_name, time_zone, location_cell, signed_up_at, suspended_since FROM households WHERE id = ?')
  .get(manager.household_id)
const events = db
  .query(`
    SELECT e.id, e.name, e.live, e.ended, e.rehearsal,
      (SELECT COUNT(*) FROM kids k WHERE k.event_id = e.id AND k.deleted_at IS NULL) AS kids,
      (SELECT GROUP_CONCAT(DISTINCT k.phone_name) FROM kids k WHERE k.event_id = e.id) AS phone_names,
      (SELECT GROUP_CONCAT(t.name, ', ') FROM tags t WHERE t.event_id = e.id) AS costumes
    FROM events e WHERE e.household_id = ? ORDER BY e.id
  `)
  .all(manager.household_id)
const sessions = db.query('SELECT COUNT(*) AS n FROM sessions WHERE manager_id = ?').get(manager.id).n
console.log(JSON.stringify({ manager, sessions, household, events }, null, 2))
