#!/usr/bin/env bash
# Pulls the newest VACUUM INTO copy off LXC 118 onto this machine, and keeps 14 days of pulls (spec §15).
# Run daily from cron (deploy/README.md):  deploy/pull-backup.sh
#   deploy/pull-backup.sh --dry-run   prints what it would do
set -euo pipefail

cd "$(dirname "$0")/.."
if [[ -f deploy/local.env ]]; then source deploy/local.env; fi
PVE=${PVE:-proxmox}
VMID=${VMID:-118}
REMOTE_DIR=/var/lib/count-dracula/backups
DEST=${BACKUP_PULL_DIR:-$HOME/count-dracula-backups}
KEEP_DAYS=14

run() { if [[ ${1:-} == --dry-run ]]; then shift; echo "would: $*"; else shift; "$@"; fi; }
mode=${1:-}

newest=$(ssh -o BatchMode=yes "$PVE" "pct exec $VMID -- sh -c 'ls -1t $REMOTE_DIR/count-dracula-*.sqlite 2>/dev/null | head -n 1'")
if [[ -z $newest ]]; then
  echo "!! No backup on LXC $VMID in $REMOTE_DIR" >&2
  exit 1
fi
name=$(basename "$newest")

run "$mode" mkdir -p "$DEST"
# pct pull lands it on the Proxmox host; then it's copied here and the host's temp copy removed.
run "$mode" ssh -o BatchMode=yes "$PVE" "pct pull $VMID $newest /tmp/$name"
run "$mode" scp -q -o BatchMode=yes "$PVE:/tmp/$name" "$DEST/$name"
run "$mode" ssh -o BatchMode=yes "$PVE" "rm -f /tmp/$name"
run "$mode" find "$DEST" -name 'count-dracula-*.sqlite' -mtime +$((KEEP_DAYS - 1)) -delete
[[ $mode == --dry-run ]] || echo "==> Pulled $name into $DEST"
