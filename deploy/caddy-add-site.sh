#!/usr/bin/env bash
# Opening day, runbook step 2.4: switches the public host on. Puts deploy/caddy-site.caddy, with $PUBLIC_HOST for the
# example host, into the shared Caddy's Caddyfile as its own site, just before the wildcard site it falls under, then
# runs caddy-int's deploy.sh (it shows the diff and asks; a bad config is refused and the live one stays). Run it again
# after changing deploy/caddy-site.caddy: it replaces the site already there.
#   deploy/caddy-add-site.sh [-y]      (-y: deploy without asking, after looking at the diff some other way)
# Not host-public.sh add: that puts the host inside the wildcard site, whose shared log would keep the tokens.
set -euo pipefail

cd "$(dirname "$0")/.."
source deploy/local.env
CADDY_INT=${CADDY_INT:-/opt/docker-compose/caddy-int}
CADDY_LAN=${CADDY_LAN:-${CADDY_IP:?Set CADDY_IP in deploy/local.env}}
[[ -n ${LXC_IP:-} ]] || { echo "!! No LXC_IP in deploy/local.env" >&2; exit 1; }
[[ -n ${PUBLIC_HOST:-} ]] || { echo "!! No PUBLIC_HOST in deploy/local.env" >&2; exit 1; }

caddyfile=$CADDY_INT/Caddyfile
cp -p "$caddyfile" "$caddyfile.bak-count-dracula"
# Adds the site just before the wildcard it falls under, or replaces the one already there (its "host {" line to the
# next "}" at the start of a line).
python3 - "$PUBLIC_HOST" "$caddyfile" "$LXC_IP" <<'EOF'
import sys
host, path, upstream = sys.argv[1], sys.argv[2], sys.argv[3]
block = open('deploy/caddy-site.caddy').read()
block = block[block.index('count-dracula.example.com {'):].replace('count-dracula.example.com', host).replace('COUNT_DRACULA_LXC', upstream).rstrip('\n') + '\n'
caddyfile = open(path).read()
opening = '\n' + host + ' {\n'
if opening in caddyfile:
    start = caddyfile.index(opening) + 1
    end = caddyfile.index('\n}\n', start) + 3
    if caddyfile[start:end] == block:
        print('==> The Count Dracula site is already up to date')
    else:
        open(path, 'w').write(caddyfile[:start] + block + caddyfile[end:])
        print(f'==> Updated the Count Dracula site in {path} (the old one is Caddyfile.bak-count-dracula)')
else:
    wildcard = '*.' + host.split('.', 1)[1] + ' {\n'
    if '\n' + wildcard not in caddyfile:
        sys.exit(f'!! No wildcard site {wildcard.strip()} in {path}')
    open(path, 'w').write(caddyfile.replace('\n' + wildcard, '\n' + block + '\n' + wildcard, 1))
    print(f'==> Added the Count Dracula site to {path} (the old one is Caddyfile.bak-count-dracula)')
EOF

if ! (cd "$CADDY_INT" && ./deploy.sh "$@" --no-verify); then
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
