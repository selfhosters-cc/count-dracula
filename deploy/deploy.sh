#!/usr/bin/env bash
# Deploys the current checkout to the Count Dracula LXC: deploy/deploy.sh
#   deploy/deploy.sh --rollback       puts the previous build back
#   deploy/deploy.sh --check-freeze   only says whether now is inside the Oct 31 change freeze
# Refuses to ship if the tests fail. Copies the database first, every time. Keeps the database untouched;
# writes /etc/count-dracula/config.json on the first deploy, and on a v1 server removes its dead keys once.
# The private settings (deploy/local.env, git-ignored) go to /etc/count-dracula/env for the service.
set -euo pipefail

cd "$(dirname "$0")/.."
# Private settings stay out of the repo: deploy/local.env (git-ignored); deploy/local.env.example lists them.
if [[ -f deploy/local.env ]]; then source deploy/local.env; fi
ENV_KEYS=(PUBLIC_HOST GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET OPERATOR_EMAILS HOUSEHOLD1_MANAGER_EMAIL OPERATOR_CONTACT)

PVE=${PVE:-proxmox}
VMID=${VMID:-118}
APP=/opt/count-dracula
DATA=/var/lib/count-dracula

pve() { ssh -o BatchMode=yes "$PVE" "$@"; }
in_lxc() { pve "pct exec $VMID -- env -u SSH_CLIENT -u SSH2_CLIENT -u SSH_CONNECTION bash -euc $(printf '%q' "$1")"; } # (no SSH_* or Debian bash reads bash.bashrc)

health() {
  for _ in $(seq 1 20); do
    if in_lxc "/usr/local/bin/bun -e \"const r = await fetch('http://127.0.0.1:3131/healthz'); if (!r.ok) process.exit(1)\"" 2>/dev/null; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

# The only change freeze (spec §15): Oct 31, 3 pm to midnight, Toronto time. A warning and a question,
# never a block. DEPLOY_NOW="2026-10-31 16:00" fakes the time for a check.
in_freeze() {
  local now
  now=$(TZ=America/Toronto date ${DEPLOY_NOW:+-d "$DEPLOY_NOW"} +%m%d%H)
  [[ ${now:0:4} == 1031 && 10#${now:4:2} -ge 15 ]]
}

freeze_warning() {
  in_freeze || return 0
  cat >&2 <<'EOF'

  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
  !!  CHANGE FREEZE: it's Halloween, between 3 pm and midnight.                      !!
  !!  A deploy restarts the server and drops every TV and phone stream, everywhere.  !!
  !!  Only deploy if the site is down.                                               !!
  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

EOF
  read -r -p "Deploy anyway? Type yes: " answer
  [[ $answer == yes ]] || { echo "Not deploying." >&2; exit 1; }
}

if [[ ${1:-} == --check-freeze ]]; then
  if in_freeze; then echo "Inside the freeze"; else echo "Outside the freeze"; fi
  exit 0
fi

if [[ ${1:-} == --rollback ]]; then
  freeze_warning
  echo "==> Rolling back to the previous build"
  in_lxc "test -d $APP.prev && mv $APP $APP.bad && mv $APP.prev $APP && rm -rf $APP.bad && systemctl restart count-dracula"
  health && echo "==> Rolled back, and it answers." || { echo "!! It doesn't answer after the rollback: journalctl -u count-dracula" >&2; exit 1; }
  exit 0
fi

freeze_warning

missing=()
for key in "${ENV_KEYS[@]}"; do [[ -n ${!key:-} ]] || missing+=("$key"); done
if ((${#missing[@]})); then
  echo "!! deploy/local.env is missing: ${missing[*]} (see deploy/local.env.example)" >&2
  exit 1
fi

echo "==> Tests"
bun test >/dev/null 2>&1 || { echo "!! Tests fail: not deploying. Run bun test." >&2; exit 1; }

echo "==> Packing $(git rev-parse --short HEAD)$(git diff --quiet || echo ' (+ uncommitted changes)')"
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
tar -czf "$stage/app.tgz" --exclude='*.test.js' server shared public kiosk package.json deploy/loadtest.js deploy/redelete.js deploy/access-request.js
cp deploy/count-dracula.service deploy/config.production.json deploy/journald-count-dracula.conf deploy/copy-db.js deploy/upgrade-config.js "$stage/"
cp "$(readlink -f "$(command -v bun)")" "$stage/bun"
git rev-parse HEAD >"$stage/REVISION"
# The service's private settings: only these keys, from local.env, never anything else in it.
for key in "${ENV_KEYS[@]}"; do
  value=${!key}
  [[ $value != *$'\n'* ]] || { echo "!! $key has a line break" >&2; exit 1; }
  printf '%s=%s\n' "$key" "$value"
done >"$stage/env"

echo "==> Copying to LXC $VMID"
pve "rm -rf /tmp/count-dracula-deploy && mkdir -p /tmp/count-dracula-deploy"
scp -q -o BatchMode=yes "$stage"/* "$PVE:/tmp/count-dracula-deploy/"
pve "cd /tmp/count-dracula-deploy && for f in *; do pct push $VMID \$f /tmp/\$f; done && rm -rf /tmp/count-dracula-deploy"

echo "==> Copying the database"
copy=$(in_lxc "
  # No copy, no deploy: a failure here stops it (bash -e).
  if [ -f /etc/count-dracula/config.json ]; then /usr/local/bin/bun /tmp/copy-db.js /etc/count-dracula/config.json $DATA/deploy-copies; fi
  # Deploy copies are backups too: gone within 2 months (spec §16), so 14 days here.
  if [ -d $DATA/deploy-copies ]; then find $DATA/deploy-copies -name 'count-dracula-*.sqlite' -mtime +13 -delete; fi
")
echo "    ${copy:-no database yet (first deploy)}"

echo "==> Installing"
install_out=$(in_lxc "
  # Bun: only replaced when the version differs.
  if ! cmp -s /tmp/bun /usr/local/bin/bun; then install -m 0755 /tmp/bun /usr/local/bin/bun; fi
  # The app: unpacked beside the old one, then swapped, keeping the old one for --rollback.
  rm -rf $APP.new && mkdir -p $APP.new && tar -xzf /tmp/app.tgz -C $APP.new && cp /tmp/REVISION $APP.new/
  rm -rf $APP.prev && if [ -d $APP ]; then mv $APP $APP.prev; fi && mv $APP.new $APP
  # The private settings, readable by the service only.
  install -m 0640 -o root -g countdracula /tmp/env /etc/count-dracula/env
  # The config: written once, never overwritten (it may have been edited on the server). A v1 config is
  # upgraded once: its dead keys go and the backup directory is added.
  if [ ! -f /etc/count-dracula/config.json ]; then
    install -m 0640 -o root -g countdracula /tmp/config.production.json /etc/count-dracula/config.json
    echo NEW_CONFIG
  else
    changed=\$(/usr/local/bin/bun /tmp/upgrade-config.js /etc/count-dracula/config.json $DATA/backups)
    if [ -n \"\$changed\" ]; then echo \"CONFIG_CHANGED \$changed\"; fi
  fi
  # journald keeps 30 days (spec §16: logs deleted after 30 days).
  install -D -m 0644 /tmp/journald-count-dracula.conf /etc/systemd/journald.conf.d/count-dracula.conf
  systemctl restart systemd-journald
  install -m 0644 /tmp/count-dracula.service /etc/systemd/system/count-dracula.service
  systemctl daemon-reload
  systemctl enable --quiet count-dracula
  systemctl restart count-dracula
  rm -f /tmp/app.tgz /tmp/bun /tmp/REVISION /tmp/config.production.json /tmp/count-dracula.service /tmp/env /tmp/journald-count-dracula.conf /tmp/copy-db.js /tmp/upgrade-config.js
")
if [[ $install_out == *NEW_CONFIG* ]]; then
  echo "    First deploy: wrote /etc/count-dracula/config.json."
fi
if [[ $install_out == *CONFIG_CHANGED* ]]; then
  echo "    Edited /etc/count-dracula/config.json once: ${install_out#*CONFIG_CHANGED }"
fi

echo "==> Checking it answers"
if ! health; then
  echo "!! Not answering. Logs: ssh $PVE pct exec $VMID -- journalctl -u count-dracula -n 50" >&2
  echo "   Undo with: deploy/deploy.sh --rollback" >&2
  exit 1
fi
cat <<EOF
==> Deployed: https://$PUBLIC_HOST   (TV: /tv, Setup: /setup, Operator: /operator)
EOF
