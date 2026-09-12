/**
 * Robust IPv4 and IPv6 CIDR Subnet Parser & Matcher
 * Zero external dependencies — fast bitwise arithmetic for IPv4 and 128-bit BigInt math for IPv6.
 */

export interface ParsedCidrV4 {
  version: 4;
  networkInt: number;
  maskInt: number;
  prefixLen: number;
}

export interface ParsedCidrV6 {
  version: 6;
  networkBigInt: bigint;
  maskBigInt: bigint;
  prefixLen: number;
}

export type ParsedCidr = ParsedCidrV4 | ParsedCidrV6;

/** Normalize IPv4-mapped IPv6 or localhost strings */
export function normalizeIp(rawIp: string): string {
  let ip = rawIp.trim();
  if (ip.startsWith("::ffff:")) {
    ip = ip.substring(7);
  }
  if (ip === "::1") {
    return "127.0.0.1";
  }
  return ip;
}

/** Check if string is a valid IPv4 */
export function isIPv4(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => {
    if (!/^\d+$/.test(p)) return false;
    const num = Number(p);
    return num >= 0 && num <= 255 && (p === "0" || !p.startsWith("0"));
  });
}

/** Convert IPv4 string to 32-bit unsigned int */
export function ipv4ToInt(ip: string): number | null {
  if (!isIPv4(ip)) return null;
  const parts = ip.split(".").map(Number);
  const p0 = parts[0];
  const p1 = parts[1];
  const p2 = parts[2];
  const p3 = parts[3];
  if (p0 === undefined || p1 === undefined || p2 === undefined || p3 === undefined) return null;
  return ((p0 << 24) | (p1 << 16) | (p2 << 8) | p3) >>> 0;
}

/** Convert IPv6 string to 128-bit BigInt */
export function ipv6ToBigInt(ip: string): bigint | null {
  let addr = ip.toLowerCase();
  if (addr.includes(".")) {
    // Handle embedded IPv4
    const lastColon = addr.lastIndexOf(":");
    if (lastColon === -1) return null;
    const v4Part = addr.slice(lastColon + 1);
    if (!isIPv4(v4Part)) return null;
    const v4Int = ipv4ToInt(v4Part);
    if (v4Int === null) return null;
    const hex1 = (v4Int >>> 16).toString(16);
    const hex2 = (v4Int & 0xffff).toString(16);
    addr = addr.slice(0, lastColon + 1) + hex1 + ":" + hex2;
  }

  const doubleColonCount = (addr.match(/::/g) || []).length;
  if (doubleColonCount > 1) return null;

  let parts: string[];
  if (doubleColonCount === 1) {
    const [left, right] = addr.split("::");
    const leftParts = left ? left.split(":") : [];
    const rightParts = right ? right.split(":") : [];
    const missing = 8 - (leftParts.length + rightParts.length);
    if (missing < 0) return null;
    parts = [...leftParts, ...Array(missing).fill("0"), ...rightParts];
  } else {
    parts = addr.split(":");
  }

  if (parts.length !== 8) return null;

  let result = 0n;
  for (const part of parts) {
    if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
    const val = BigInt(parseInt(part, 16));
    result = (result << 16n) | val;
  }
  return result;
}

/** Parse CIDR notation (e.g. 10.0.0.0/8, 192.168.1.0/24, 2001:db8::/32) */
export function parseCidr(cidr: string): ParsedCidr | null {
  const trimmed = cidr.trim();
  const slashIdx = trimmed.indexOf("/");
  if (slashIdx === -1) {
    // Single IP treated as /32 (v4) or /128 (v6)
    if (isIPv4(trimmed)) {
      return parseCidr(`${trimmed}/32`);
    }
    return parseCidr(`${trimmed}/128`);
  }

  const ipPart = trimmed.slice(0, slashIdx);
  const prefixStr = trimmed.slice(slashIdx + 1);
  const prefixLen = parseInt(prefixStr, 10);
  if (isNaN(prefixLen) || prefixLen < 0) return null;

  if (isIPv4(ipPart)) {
    if (prefixLen > 32) return null;
    const ipInt = ipv4ToInt(ipPart);
    if (ipInt === null) return null;
    const maskInt = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0;
    return {
      version: 4,
      networkInt: (ipInt & maskInt) >>> 0,
      maskInt,
      prefixLen,
    };
  }

  // IPv6
  if (prefixLen > 128) return null;
  const ipBigInt = ipv6ToBigInt(ipPart);
  if (ipBigInt === null) return null;

  const maskBigInt =
    prefixLen === 0
      ? 0n
      : ((1n << 128n) - 1n) ^ ((1n << BigInt(128 - prefixLen)) - 1n);

  return {
    version: 6,
    networkBigInt: ipBigInt & maskBigInt,
    maskBigInt,
    prefixLen,
  };
}

/** Check if an IP address matches a given CIDR */
export function ipMatchesCidr(rawIp: string, cidr: string): boolean {
  const normalized = normalizeIp(rawIp);
  const parsed = parseCidr(cidr);
  if (!parsed) return false;

  if (parsed.version === 4) {
    const ipInt = ipv4ToInt(normalized);
    if (ipInt === null) return false;
    return ((ipInt & parsed.maskInt) >>> 0) === parsed.networkInt;
  }

  if (parsed.version === 6) {
    const ipBigInt = ipv6ToBigInt(normalized);
    if (ipBigInt === null) return false;
    return (ipBigInt & parsed.maskBigInt) === parsed.networkBigInt;
  }

  return false;
}

/** Check if an IP matches any of the allowed CIDRs while not matching any denied CIDRs */
export function evaluateSubnetAccess(
  sourceIp: string,
  allowedSubnets?: string[],
  deniedSubnets?: string[],
): { allowed: boolean; matchedAllowed?: string; matchedDenied?: string; reason?: string } {
  const normalized = normalizeIp(sourceIp);

  // 1. Explicit Deny check takes absolute precedence
  if (deniedSubnets && deniedSubnets.length > 0) {
    for (const deniedCidr of deniedSubnets) {
      if (ipMatchesCidr(normalized, deniedCidr)) {
        return {
          allowed: false,
          matchedDenied: deniedCidr,
          reason: `Source IP ${normalized} is within explicitly denied subnet ${deniedCidr}`,
        };
      }
    }
  }

  // 2. Allowed Subnets check
  if (!allowedSubnets || allowedSubnets.length === 0 || allowedSubnets.includes("*")) {
    // If no allowed subnets are specified, allow by default (provided it wasn't denied above)
    return { allowed: true };
  }

  for (const allowedCidr of allowedSubnets) {
    if (ipMatchesCidr(normalized, allowedCidr)) {
      return {
        allowed: true,
        matchedAllowed: allowedCidr,
      };
    }
  }

  return {
    allowed: false,
    reason: `Source IP ${normalized} does not match any of the allowed subnets [${allowedSubnets.join(", ")}]`,
  };
}

/** Check if IP is in private/internal corporate network (RFC 1918 / RFC 4193 / loopback) */
export function isInternalIp(rawIp: string): boolean {
  const normalized = normalizeIp(rawIp);
  const privateCidrs = [
    "10.0.0.0/8",
    "172.16.0.0/12",
    "192.168.0.0/16",
    "127.0.0.0/8",
    "fc00::/7",
    "fe80::/10",
    "::1/128",
  ];

  return privateCidrs.some((cidr) => ipMatchesCidr(normalized, cidr));
}
