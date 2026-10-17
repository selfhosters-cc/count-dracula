#!/usr/bin/env bash
# Opening day, runbook step 2.4: switches the public host on. Puts deploy/caddy-site.caddy, with $PUBLIC_HOST for the
# example host, into the shared Caddy's Caddyfile as its own site: just before the wildcard site it falls under, or at
# the end for a domain of its own. Each host in $REDIRECT_HOSTS (an old name, www) gets a site that sends everything
# to $PUBLIC_HOST with a 301, path and query kept. Then it runs caddy-int's deploy.sh (it shows the diff and asks; a
# bad config is refused and the live one stays). Run it again after changing either: it replaces the sites already there.
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
python3 - "$PUBLIC_HOST" "$caddyfile" "$LXC_IP" ${REDIRECT_HOSTS:-} <<'EOF'
import sys
host, path, upstream, redirects = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4:]
block = open('deploy/caddy-site.caddy').read()
block = block[block.index('count-dracula.example.com {'):].replace('count-dracula.example.com', host).replace('COUNT_DRACULA_LXC', upstream).rstrip('\n') + '\n'
caddyfile = open(path).read()
before = caddyfile

def find(name):
    # A site's "name {" line to the next "}" at the start of a line, or None.
    opening = '\n' + name + ' {\n'
    if opening not in caddyfile:
        return None
    start = caddyfile.index(opening) + 1
    return start, caddyfile.index('\n}\n', start) + 3

span = find(host)
if span:
    caddyfile = caddyfile[:span[0]] + block + caddyfile[span[1]:]
else:
    wildcard = '*.' + host.split('.', 1)[1] + ' {\n'
    if '\n' + wildcard in caddyfile:
        caddyfile = caddyfile.replace('\n' + wildcard, '\n' + block + '\n' + wildcard, 1)
    else:
        caddyfile = caddyfile.rstrip('\n') + '\n\n' + block

# No log: the URIs it sends on carry the same tokens the site's own log masks.
for name in redirects:
    site = f'{name} {{\n\timport dnstls\n\timport hsts\n\tredir https://{host}{{uri}} permanent\n}}\n'
    span = find(name)
    if span:
        caddyfile = caddyfile[:span[0]] + site + caddyfile[span[1]:]
    else:
        end = find(host)[1]
        caddyfile = caddyfile[:end] + '\n' + site + caddyfile[end:]

if caddyfile == before:
    print('==> The Count Dracula sites are already up to date')
else:
    open(path, 'w').write(caddyfile)
    print(f'==> Updated the Count Dracula sites in {path} (the old one is Caddyfile.bak-count-dracula)')
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
for name in ${REDIRECT_HOSTS:-}; do
  where=$(curl -s -o /dev/null -m 10 -w '%{http_code} %{redirect_url}' --resolve "$name:443:$CADDY_LAN" "https://$name/tv?x=1" || true)
  echo "    $name/tv?x=1 → $where   (want 301 https://$PUBLIC_HOST/tv?x=1)"
done
