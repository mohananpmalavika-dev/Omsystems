import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function resolveNeighborMac(ipAddress: string) {
  const commands = process.platform === "win32"
    ? [{ command: "arp", args: ["-a", ipAddress] }]
    : [
        { command: "ip", args: ["neigh", "show", ipAddress] },
        { command: "arp", args: ["-n", ipAddress] },
      ];
  for (const item of commands) {
    try {
      const { stdout } = await execFileAsync(item.command, item.args, {
        timeout: 2_000,
        windowsHide: true,
      });
      const macAddress = parseNeighborMac(stdout);
      if (macAddress) return macAddress;
    } catch {
      continue;
    }
  }
  return undefined;
}

export function parseNeighborMac(value: string) {
  const match = value.match(/\b([0-9a-f]{2}(?:[:-][0-9a-f]{2}){5})\b/i)?.[1];
  if (!match) return undefined;
  const normalized = match.replaceAll("-", ":").toLowerCase();
  return /^(?:00:){5}00$/.test(normalized) || /^ff:ff:ff:ff:ff:ff$/.test(normalized)
    ? undefined
    : normalized;
}
