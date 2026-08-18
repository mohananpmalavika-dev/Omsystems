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

export async function detectDefaultGatewayIps(): Promise<string[]> {
  const gateways = new Set<string>();
  const isWindows = process.platform === "win32";

  try {
    if (isWindows) {
      const { stdout } = await execFileAsync("route", ["print", "0.0.0.0"], {
        timeout: 2_000,
        windowsHide: true,
      });
      // Match lines like: 0.0.0.0          0.0.0.0      192.168.29.1     192.168.29.155
      const matches = stdout.matchAll(/0\.0\.0\.0\s+0\.0\.0\.0\s+(\d{1,3}(?:\.\d{1,3}){3})/g);
      for (const match of matches) {
        if (match[1] && !match[1].startsWith("127.")) {
          gateways.add(match[1]);
        }
      }
    } else {
      const { stdout } = await execFileAsync("ip", ["route", "show", "default"], {
        timeout: 2_000,
      });
      // Match: default via 192.168.1.1 dev eth0
      const match = stdout.match(/default\s+via\s+(\d{1,3}(?:\.\d{1,3}){3})/);
      if (match?.[1]) gateways.add(match[1]);
    }
  } catch {
    // Non-fatal if command fails
  }

  return [...gateways];
}
