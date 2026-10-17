// Whose request it is (spec §15): the per-IP rate limits and the sign-in email go by the visitor's address. Behind a
// proxy that's its CF-Connecting-IP header, but anyone can send that header, so it counts only when a trusted proxy
// sent it. Trusted by default: this machine and private networks (the bundled Caddy, a Docker bridge, an LXC on the
// LAN, a tailnet), which a visitor from the internet can't be; TRUSTED_PROXIES replaces that list.
import net from 'node:net'

const PRIVATE = ['127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '100.64.0.0/10', '::1/128', 'fc00::/7', 'fe80::/10']

// TRUSTED_PROXIES: addresses or CIDR ranges, comma- or space-separated; unset or empty, the private ranges above.
export function trustedProxies(spec) {
  const list = new net.BlockList()
  const ranges = String(spec ?? '').split(/[\s,]+/).filter(Boolean)
  for (const range of ranges.length ? ranges : PRIVATE) {
    const [address, bits] = range.split('/')
    const type = familyOf(address)
    if (!type || (bits != null && !/^\d+$/.test(bits))) throw new Error(`TRUSTED_PROXIES: not an address or a range: ${range}`)
    if (bits == null) list.addAddress(address, type)
    else list.addSubnet(address, Number(bits), type)
  }
  return list
}

// The visitor's address: the header's when a trusted proxy sent it and it is an address, else the peer's own.
export function clientIpOf(header, peer, trusted) {
  const from = peer ? peer.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, '') : null
  const claimed = header?.trim()
  if (from && familyOf(from) && trusted.check(from, familyOf(from)) && claimed && familyOf(claimed)) return claimed
  return from
}

const familyOf = (address) => (net.isIPv4(address) ? 'ipv4' : net.isIPv6(address) ? 'ipv6' : null)
