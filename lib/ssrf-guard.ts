// SSRF guard: decide whether a resolved IP address is one we must never fetch from
// a server context (loopback, private, link-local, cloud-metadata, etc.). Pure and
// dependency-free so it unit-tests under node:test. The handler resolves the URL's
// host to IPs and rejects if ANY resolved address is blocked.

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const o = Number(p);
    if (o > 255) return null;
    n = ((n << 8) | o) >>> 0;
  }
  return n >>> 0;
}

function inCidr4(n: number, base: string, bits: number): boolean {
  const b = ipv4ToInt(base);
  if (b === null) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (n & mask) === (b & mask);
}

// IPv4 ranges that must never be fetched server-side (RFC1918, loopback, CGNAT,
// link-local incl. 169.254.169.254 cloud metadata, benchmarking, multicast, reserved).
const BLOCKED_V4: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

export function isBlockedIp(ip: string): boolean {
  // IPv4-mapped IPv6 (::ffff:1.2.3.4) — judge by the embedded v4.
  const mapped = ip.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (mapped) return isBlockedIp(mapped[1]);

  const v4 = ipv4ToInt(ip);
  if (v4 !== null) return BLOCKED_V4.some(([base, bits]) => inCidr4(v4, base, bits));

  // IPv6
  const addr = ip.toLowerCase().split('%')[0]; // strip zone id
  if (addr === '::1' || addr === '::') return true;
  const head = addr.split(':')[0];
  if (/^f[cd]/.test(head)) return true;       // fc00::/7 unique-local
  if (/^fe[89ab]/.test(head)) return true;    // fe80::/10 link-local
  return false;
}
