#!/usr/bin/env bash
# Opening day, runbook step 2.4: switches the public host on. Puts deploy/caddy-site.caddy, with $PUBLIC_HOST for the
# example host, into the shared Caddy's Caddyfile as its own site, just before the wildcard site it falls under, then
# runs caddy-int's deploy.sh (it shows the diff and asks; a bad config is refused and the live one stays).
#   deploy/caddy-add-site.sh
# Not host-public.sh add: that puts the host inside the wildcard site, whose shared log would keep the tokens.
set -euo pipefail

cd "$(dirname "$0")/.."
source deploy/local.env
CADDY_INT=${CADDY_INT:-/opt/docker-compose/caddy-int}
CADDY_LAN=${CADDY_LAN:-192.168.5.20}
[[ -n ${PUBLIC_HOST:-} ]] || { echo "!! No PUBLIC_HOST in deploy/local.env" >&2; exit 1; }

caddyfile=$CADDY_INT/Caddyfile
if grep -qxF "$PUBLIC_HOST {" "$caddyfile"; then
  echo "==> $caddyfile already has the Count Dracula site"
else
  cp -p "$caddyfile" "$caddyfile.bak-count-dracula"
  python3 - "$PUBLIC_HOST" "$caddyfile" <<'EOF'
import sys
host, path = sys.argv[1], sys.argv[2]
block = open('deploy/caddy-site.caddy').read()
block = block[block.index('count-dracula.example.com {'):].replace('count-dracula.example.com', host)
caddyfile = open(path).read()
wildcard = '*.' + host.split('.', 1)[1] + ' {\n'
if '\n' + wildcard not in caddyfile:
    sys.exit(f'!! No wildcard site {wildcard.strip()} in {path}')
open(path, 'w').write(caddyfile.replace('\n' + wildcard, '\n' + block + '\n' + wildcard, 1))
EOF
  echo "==> Added the Count Dracula site to $caddyfile (the old one is Caddyfile.bak-count-dracula)"
fi

if ! (cd "$CADDY_INT" && ./deploy.sh --no-verify); then
  # Cancelled or refused: put the local copy back so it matches the live config again.
  [[ -f $caddyfile.bak-count-dracula ]] && mv -f "$caddyfile.bak-count-dracula" "$caddyfile"
  echo "!! Not deployed; $caddyfile is back as it was" >&2
  exit 1
fi
rm -f "$caddyfile.bak-count-dracula"

echo "==> Through Caddy ($CADDY_LAN), as a visitor will reach it"
for path in /healthz /api/snapshot; do
  code=$(curl -s -o /dev/null -m 10 -w '%{http_code}' --resolve "$PUBLIC_HOST:443:$CADDY_LAN" "https://$PUBLIC_HOST$path" || true)
  echo "    $path → $code"
done
echo "    (want /healthz → 200, /api/snapshot → 403: v2, reads closed)"
