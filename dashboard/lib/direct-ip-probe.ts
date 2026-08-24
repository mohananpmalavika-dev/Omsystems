const IPV4_PARTS = 4;
const MAX_IPV4 = 0xffff_ffff;

export type DirectProbeTargetMode = "single" | "range";

function ipv4ToNumber(value: string): number | undefined {
  const parts = value.trim().split(".");
  if (parts.length !== IPV4_PARTS || parts.some((part) => !/^\d+$/.test(part))) return undefined;

  const octets = parts.map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) return undefined;
  return (((octets[0] * 256 + octets[1]) * 256 + octets[2]) * 256 + octets[3]) >>> 0;
}

function numberToIpv4(value: number): string {
  return [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ].join(".");
}

function expandInclusiveRange(start: number, end: number, maxTargets: number): string[] {
  if (end < start) throw new Error("The IP range end must be greater than or equal to its start.");
  const count = end - start + 1;
  if (count > maxTargets) throw new Error(`The IP range contains ${count} addresses. Use ${maxTargets} or fewer.`);

  return Array.from({ length: count }, (_, index) => numberToIpv4(start + index));
}

/** Expand a single IPv4, inclusive IPv4 range, or IPv4 CIDR into probe targets. */
export function expandDirectProbeTargets(
  input: string,
  mode: DirectProbeTargetMode,
  maxTargets = 256,
): string[] {
  const value = input.trim();
  if (!value) throw new Error("Enter an IP address or IP range.");
  if (!Number.isInteger(maxTargets) || maxTargets < 1) throw new Error("The maximum probe size is invalid.");

  if (mode === "single") {
    if (value.includes("-") || value.includes("/")) {
      throw new Error("Choose IP range mode to probe more than one address.");
    }
    if (ipv4ToNumber(value) === undefined) throw new Error("Enter a valid IPv4 address.");
    return [value];
  }

  if (value.includes("/")) {
    const [address, prefixText] = value.split("/");
    const base = ipv4ToNumber(address ?? "");
    const prefix = Number(prefixText);
    if (base === undefined || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
      throw new Error("Enter a valid IPv4 CIDR, for example 192.168.1.0/24.");
    }
    const hostBits = 32 - prefix;
    const size = 2 ** hostBits;
    const mask = prefix === 0 ? 0 : (MAX_IPV4 << hostBits) >>> 0;
    const networkStart = (base & mask) >>> 0;
    return expandInclusiveRange(networkStart, networkStart + size - 1, maxTargets);
  }

  if (value.includes("-")) {
    const parts = value.split("-").map((part) => part.trim());
    if (parts.length !== 2) throw new Error("Enter an IP range like 192.168.1.20-192.168.1.40.");
    const start = ipv4ToNumber(parts[0] ?? "");
    const end = ipv4ToNumber(parts[1] ?? "") ?? (() => {
      const startParts = (parts[0] ?? "").split(".");
      const shortEnd = parts[1] ?? "";
      return startParts.length === 4 && /^\d+$/.test(shortEnd)
        ? ipv4ToNumber(`${startParts.slice(0, 3).join(".")}.${shortEnd}`)
        : undefined;
    })();
    if (start === undefined || end === undefined) {
      throw new Error("Enter valid IPv4 addresses at both ends of the range.");
    }
    return expandInclusiveRange(start, end, maxTargets);
  }

  if (ipv4ToNumber(value) === undefined) throw new Error("Enter a valid IPv4 address or range.");
  return [value];
}
