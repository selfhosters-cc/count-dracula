#!/usr/bin/env bash
# Creates the Count Dracula LXC on Proxmox. Run once, from the dev machine: deploy/create-lxc.sh
# Then deploy/deploy.sh puts the app on it. Everything goes through `ssh proxmox` + pct, so the LXC
# needs no SSH keys of its own.
set -euo pipefail

PVE=${PVE:-proxmox}            # ssh host alias for the Proxmox node (root@192.168.5.1)
VMID=${VMID:-118}
IP=${IP:-192.168.5.31}         # static, like the other LXCs; the helper QR code bakes it in
GW=${GW:-192.168.1.1}
STORAGE=${STORAGE:-zstorage2}
TEMPLATE=${TEMPLATE:-local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst}
# Like the other LXCs: the Proxmox host's own resolv.conf points at Tailscale (100.100.100.100), which an
# LXC off the tailnet can't reach, so a container that inherits it can't resolve anything.
NAMESERVER=${NAMESERVER:-1.1.1.1}

pve() { ssh -o BatchMode=yes "$PVE" "$@"; }

if pve "pct status $VMID" >/dev/null 2>&1; then
  # Resumable: an earlier run that stopped part-way left our own LXC behind; finish setting it up.
  if pve "pct config $VMID" | grep -qx 'hostname: count-dracula'; then
    echo "==> LXC $VMID (count-dracula) already exists: finishing its setup"
    pve pct set "$VMID" --nameserver "$NAMESERVER" --searchdomain lan
    # A restart, so the container's resolv.conf is rewritten with the new nameserver for sure.
    if pve "pct status $VMID" | grep -q running; then pve pct reboot "$VMID"; else pve pct start "$VMID"; fi
  else
    echo "LXC $VMID already exists on $PVE and isn't count-dracula: pick another VMID (VMID=...)." >&2
    exit 1
  fi
else
  if pve "ping -c1 -W1 $IP" >/dev/null 2>&1; then
    echo "$IP already answers ping: pick another IP (IP=...)." >&2
    exit 1
  fi
  echo "==> Creating LXC $VMID (count-dracula, $IP)"
  pve pct create "$VMID" "$TEMPLATE" \
    --hostname count-dracula \
    --cores 1 --memory 512 --swap 256 \
    --rootfs "$STORAGE:4" \
    --net0 "name=eth0,bridge=vmbr0,gw=$GW,ip=$IP/20,type=veth" \
    --nameserver "$NAMESERVER" --searchdomain lan \
    --unprivileged 1 --features nesting=1 \
    --timezone America/Toronto \
    --onboot 1 \
    --description "'Count Dracula: trick-or-treat counter. Deployed with deploy/deploy.sh from the count-dracula repo.'"
  pve pct start "$VMID"
fi

echo "==> Waiting for the network"
online=no
for _ in $(seq 1 20); do
  if pve "pct exec $VMID -- timeout 3 getent hosts deb.debian.org" >/dev/null 2>&1; then
    online=yes
    break
  fi
  sleep 1
done
if [[ $online != yes ]]; then
  echo "!! LXC $VMID can't resolve deb.debian.org. Check: ssh $PVE pct exec $VMID -- cat /etc/resolv.conf" >&2
  exit 1
fi

echo "==> Base setup inside the LXC"
pve "pct exec $VMID -- bash -euc '
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq --no-install-recommends ca-certificates >/dev/null
  id countdracula >/dev/null 2>&1 || useradd --system --home-dir /nonexistent --shell /usr/sbin/nologin countdracula
  mkdir -p /etc/count-dracula /opt
'"

# Spec §11: the existing scheduled Proxmox backup jobs must include the new LXC. Ours list guests
# explicitly, so add this one to every job that backs up more than one guest.
echo "==> Adding LXC $VMID to the scheduled backup jobs"
pve "pvesh get /cluster/backup --output-format json" | python3 -c '
import json, sys
vmid = sys.argv[1]
for job in json.load(sys.stdin):
    ids = [i for i in (job.get("vmid") or "").split(",") if i]
    if job.get("all") or len(ids) < 2 or vmid in ids:
        continue
    print(job["id"], ",".join(ids + [vmid]))
' "$VMID" | while read -r job ids; do
  pve "pvesh set /cluster/backup/$job --vmid $ids" && echo "    $job now backs up: $ids"
done

echo "==> LXC $VMID is ready at $IP. Next: deploy/deploy.sh"
