import { isIP } from "node:net";

function ipv4Number(address: string) {
  if (isIP(address) !== 4) throw new Error("invalid_vpn_network");
  return address.split(".").reduce((value, octet) => value * 256 + Number(octet), 0);
}

export function networkRange(cidr: string): [number, number] {
  const [address, prefixText, ...extra] = cidr.split("/");
  const prefix = Number(prefixText);
  if (extra.length || prefixText === undefined || !/^\d+$/.test(prefixText) ||
      !Number.isInteger(prefix) || prefix < 0 || prefix > 32) throw new Error("invalid_vpn_network");
  const size = 2 ** (32 - prefix);
  const start = Math.floor(ipv4Number(address!) / size) * size;
  return [start, start + size - 1];
}

export function normalizeVpnNetwork(input: string) {
  const value = input.trim();
  const cidr = value.includes("/") ? value : `${value}/32`;
  if (Number(cidr.split("/")[1]) < 20) throw new Error("invalid_vpn_network");
  const [start, end] = networkRange(cidr);
  const privateRanges = [[0x0a000000, 0x0affffff], [0xac100000, 0xac1fffff], [0xc0a80000, 0xc0a8ffff]];
  if (!privateRanges.some(([first, last]) => start >= first! && end <= last!)) throw new Error("invalid_vpn_network");
  return [24, 16, 8, 0].map(shift => (start >>> shift) & 255).join(".") + "/" + cidr.split("/")[1];
}

export function hostInNetworks(host: string, networks: string[]) {
  if (isIP(host) !== 4) return false;
  const value = ipv4Number(host);
  return networks.some(network => {
    const [start, end] = networkRange(network);
    return value >= start && value <= end;
  });
}

export function assertNonOverlappingBranches(assignments: Array<{ branchId: string; vpnNetworks: string[] }>) {
  const ranges = assignments.flatMap(assignment => assignment.vpnNetworks.map(network => {
    const [start, end] = networkRange(network);
    return { branchId: assignment.branchId, start, end };
  })).sort((a, b) => a.start - b.start);
  let furthest: typeof ranges[number] | undefined;
  for (const range of ranges) {
    if (furthest && range.start <= furthest.end && range.branchId !== furthest.branchId) {
      throw new Error("overlapping_branch_networks");
    }
    if (!furthest || range.end > furthest.end) furthest = range;
  }
}
