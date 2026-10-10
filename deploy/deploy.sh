#!/usr/bin/env bash
# Deploys the current checkout to the Count Dracula LXC: deploy/deploy.sh
#   deploy/deploy.sh --rollback   puts the previous build back
# Refuses to ship if the tests fail. Keeps the database and /etc/count-dracula/config.json untouched;
# on the very first deploy it writes that config from deploy/config.production.json with a random PIN.
set -euo pipefail

cd "$(dirname "$0")/.."
# Private settings stay out of the repo: deploy/local.env (git-ignored) can set TAILNET_HOST, e.g.
#   TAILNET_HOST=count-dracula.example.com
if [[ -f deploy/local.env ]]; then source deploy/local.env; fi
TAILNET_HOST=${TAILNET_HOST:-}

PVE=${PVE:-proxmox}
VMID=${VMID:-118}
IP=${IP:-192.168.5.31}
APP=/opt/count-dracula

pve() { ssh -o BatchMode=yes "$PVE" "$@"; }
in_lxc() { pve "pct exec $VMID -- env -u SSH_CLIENT -u SSH2_CLIENT -u SSH_CONNECTION bash -euc $(printf '%q' "$1")"; } # (no SSH_* or Debian bash reads bash.bashrc)

health() {
  for _ in $(seq 1 20); do
    if in_lxc "/usr/local/bin/bun -e \"const r = await fetch('http://127.0.0.1:3131/api/snapshot'); if (!r.ok) process.exit(1)\"" 2>/dev/null; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

if [[ ${1:-} == --rollback ]]; then
  echo "==> Rolling back to the previous build"
  in_lxc "test -d $APP.prev && mv $APP $APP.bad && mv $APP.prev $APP && rm -rf $APP.bad && systemctl restart count-dracula"
  health && echo "==> Rolled back, and it answers." || { echo "!! It doesn't answer after the rollback: journalctl -u count-dracula" >&2; exit 1; }
  exit 0
fi

echo "==> Tests"
bun test >/dev/null 2>&1 || { echo "!! Tests fail: not deploying. Run bun test." >&2; exit 1; }

echo "==> Packing $(git rev-parse --short HEAD)$(git diff --quiet || echo ' (+ uncommitted changes)')"
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
tar -czf "$stage/app.tgz" --exclude='*.test.js' server shared public kiosk package.json config/2025-counts.json
cp deploy/count-dracula.service deploy/config.production.json "$stage/"
cp "$(readlink -f "$(command -v bun)")" "$stage/bun"
git rev-parse HEAD >"$stage/REVISION"

echo "==> Copying to LXC $VMID"
pve "rm -rf /tmp/count-dracula-deploy && mkdir -p /tmp/count-dracula-deploy"
scp -q -o BatchMode=yes "$stage"/* "$PVE:/tmp/count-dracula-deploy/"
pve "cd /tmp/count-dracula-deploy && for f in *; do pct push $VMID \$f /tmp/\$f; done && rm -rf /tmp/count-dracula-deploy"

echo "==> Installing"
pin=$(printf '%04d' $((RANDOM % 10000)))
install_out=$(in_lxc "
  # Bun: only replaced when the version differs.
  if ! cmp -s /tmp/bun /usr/local/bin/bun; then install -m 0755 /tmp/bun /usr/local/bin/bun; fi
  # The app: unpacked beside the old one, then swapped, keeping the old one for --rollback.
  rm -rf $APP.new && mkdir -p $APP.new && tar -xzf /tmp/app.tgz -C $APP.new && cp /tmp/REVISION $APP.new/
  rm -rf $APP.prev && if [ -d $APP ]; then mv $APP $APP.prev; fi && mv $APP.new $APP
  # The config: written once, never overwritten (it holds the admin PIN).
  if [ ! -f /etc/count-dracula/config.json ]; then
    sed -e 's/__PIN__/$pin/' -e 's/__IP__/$IP/' -e 's/\"__HOST__\"/${TAILNET_HOST:+\"$TAILNET_HOST\"}/' /tmp/config.production.json > /etc/count-dracula/config.json
    chmod 640 /etc/count-dracula/config.json && chgrp countdracula /etc/count-dracula/config.json
    echo NEW_PIN
  fi
  install -m 0644 /tmp/count-dracula.service /etc/systemd/system/count-dracula.service
  systemctl daemon-reload
  systemctl enable --quiet count-dracula
  systemctl restart count-dracula
  rm -f /tmp/app.tgz /tmp/bun /tmp/REVISION /tmp/config.production.json /tmp/count-dracula.service
")
if [[ $install_out == *NEW_PIN* ]]; then
  echo "    First deploy: the admin PIN for /setup is $pin (in /etc/count-dracula/config.json)."
fi

echo "==> Checking it answers"
if ! health; then
  echo "!! Not answering. Logs: ssh $PVE pct exec $VMID -- journalctl -u count-dracula -n 50" >&2
  echo "   Undo with: deploy/deploy.sh --rollback" >&2
  exit 1
fi
key=$(in_lxc "/usr/local/bin/bun -e \"const s = JSON.parse(require('fs').readFileSync('/etc/count-dracula/config.json')); const { Database } = require('bun:sqlite'); console.log(new Database(s.dbPath, { readonly: true }).query('SELECT join_key FROM events WHERE live = 1').get().join_key)\"")
cat <<EOF
==> Deployed.${TAILNET_HOST:+
    Tailnet:  https://$TAILNET_HOST   (TV: /tv, Setup: /setup; phones join automatically)}
    LAN:      http://$IP:3131/?key=$key
EOF
