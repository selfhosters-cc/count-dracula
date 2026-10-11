#!/usr/bin/env bash
# Opening day, runbook step 1: takes the v1-final copy of the live database and practises the v2 migration on it.
#   deploy/v1-final.sh
# The copy is a VACUUM INTO (deploy/copy-db.js), so rows still in the -wal file come too, and v1 keeps running.
# It stays on LXC 118 in /var/lib/count-dracula/v1-final/ and lands here in ~/count-dracula-backups/.
set -euo pipefail

cd "$(dirname "$0")/.."
PVE=${PVE:-proxmox}
VMID=${VMID:-118}
DEST=${BACKUP_PULL_DIR:-$HOME/count-dracula-backups}

echo "==> v1-final tag"
git ls-remote --tags origin v1-final | grep -q . || { echo "!! No v1-final tag on origin" >&2; exit 1; }
git log --oneline -1 v1-final

echo "==> Copying the live database on LXC $VMID"
# The script goes in on stdin; the old cp copy's leftovers (an empty v1-final-*.sqlite) are removed.
out=$(ssh -o BatchMode=yes "$PVE" "cat > /tmp/copy-db.js && pct push $VMID /tmp/copy-db.js /tmp/copy-db.js && rm /tmp/copy-db.js && pct exec $VMID -- bash -c 'rm -f /var/lib/count-dracula/v1-final-*.sqlite && /usr/local/bin/bun /tmp/copy-db.js /etc/count-dracula/config.json /var/lib/count-dracula/v1-final && rm /tmp/copy-db.js'" <deploy/copy-db.js)
[[ -n $out ]] || { echo "!! No database at the config's dbPath on LXC $VMID" >&2; exit 1; }
echo "    $out"

name=v1-final-${out##*count-dracula-}
mkdir -p "$DEST"
ssh -o BatchMode=yes "$PVE" "pct pull $VMID $out /tmp/$name"
scp -q -o BatchMode=yes "$PVE:/tmp/$name" "$DEST/$name"
ssh -o BatchMode=yes "$PVE" "rm -f /tmp/$name"
echo "==> Here: $DEST/$name ($(stat -c %s "$DEST/$name") bytes)"

echo "==> Practising the migration on a scratch copy"
practice=$(mktemp -d)
trap 'rm -rf "$practice"' EXIT
cp "$DEST/$name" "$practice/practice.sqlite"
bun -e "
  import { Database } from 'bun:sqlite'
  import { openLedger } from './server/ledger.js'
  const ledger = openLedger(new Database('$practice/practice.sqlite'), {})
  const h = ledger.household(1)
  const snap = h.snapshot()
  console.log('    Households:', ledger.households().length)
  for (const e of h.events()) console.log('   ', e.live ? '●' : ' ', e.name, e.countsOnly ? '(counts only)' : '', e.kids ?? '')
  console.log('    Live:', snap.event?.name, '| racing:', snap.ghost?.label ?? 'nothing', '| zone:', snap.timeZone)"
