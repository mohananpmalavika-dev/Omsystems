/**
 * Multi-Layer Edge Network Probes
 */

import type {
  IspLinkEvidence,
  IspRole,
  LinkState,
  VpnEvidence,
  WanPath,
} from "./connectivity.types.js";

export interface ProbeSample {
  timestamp: Date;
  success: boolean;
  latencyMs?: number | undefined;
}

export interface DefaultRoute {
  dev: string;
  via?: string | undefined;
  metric?: number | undefined;
}

export class LatencyCalculator {
  static calculateJitter(latencies: number[]): number {
    if (latencies.length < 2) return 0;
    let variation = 0;
    for (let i = 1; i < latencies.length; i++) {
      variation += Math.abs((latencies[i] ?? 0) - (latencies[i - 1] ?? 0));
    }
    return Math.round((variation / (latencies.length - 1)) * 10) / 10;
  }

  static calculatePacketLoss(samples: ProbeSample[]): number {
    if (!samples.length) return 0;
    const failed = samples.filter((s) => !s.success).length;
    return Math.round((failed / samples.length) * 1000) / 10;
  }

  static calculateAverageLatency(samples: ProbeSample[]): number | undefined {
    const successful = samples.filter((s) => s.success && typeof s.latencyMs === "number");
    if (!successful.length) return undefined;
    const sum = successful.reduce((acc, s) => acc + (s.latencyMs ?? 0), 0);
    return Math.round(sum / successful.length);
  }
}

export class DefaultRouteParser {
  /**
   * Parses 'ip route show default' or similar routing table output
   */
  static parse(output: string): DefaultRoute[] {
    const lines = output.trim().split("\n");
    const routes: DefaultRoute[] = [];

    for (const line of lines) {
      const devMatch = line.match(/dev\s+([^\s]+)/);
      const viaMatch = line.match(/via\s+([^\s]+)/);
      const metricMatch = line.match(/metric\s+(\d+)/);

      if (devMatch && devMatch[1]) {
        routes.push({
          dev: devMatch[1],
          via: viaMatch?.[1] ?? undefined,
          metric: metricMatch ? parseInt(metricMatch[1]!, 10) : 0,
        });
      }
    }

    return routes.sort((a, b) => (a.metric ?? 9999) - (b.metric ?? 9999));
  }

  static identifyCurrentPath(
    routes: DefaultRoute[],
    primaryDev: string,
    backupDev?: string | undefined,
  ): WanPath {
    if (!routes.length) return "UNKNOWN";
    const best = routes[0];
    if (best?.dev === primaryDev) return "PRIMARY";
    if (backupDev && best?.dev === backupDev) return "BACKUP";
    return "UNKNOWN";
  }
}

export class WireGuardStatusParser {
  /**
   * Parses 'wg show <interface> dump' or similar WireGuard output
   */
  static parse(output: string, tunnelDev = "wg0"): VpnEvidence {
    const lines = output.trim().split("\n");
    if (!lines.length || lines[0] === "") {
      return {
        state: "DISCONNECTED",
        tunnelInterface: tunnelDev,
        observedAt: new Date(),
        source: "WIREGUARD",
      };
    }

    // Default to connected if output exists
    const line = lines.find((l) => !l.startsWith("interface:"));
    let lastHandshakeSec = 0;
    let rxBytes = 0;
    let txBytes = 0;
    let peer = "central-vpn-gateway";

    if (line) {
      const parts = line.split("\t");
      if (parts.length >= 6) {
        peer = parts[0] ?? peer;
        lastHandshakeSec = parseInt(parts[4] ?? "0", 10);
        rxBytes = parseInt(parts[5] ?? "0", 10);
        txBytes = parseInt(parts[6] ?? "0", 10);
      }
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const handshakeAge = lastHandshakeSec > 0 ? nowSec - lastHandshakeSec : 9999;

    let state: "CONNECTED" | "DEGRADED" | "DISCONNECTED" = "CONNECTED";
    if (handshakeAge > 180) {
      state = "DISCONNECTED";
    } else if (handshakeAge > 90) {
      state = "DEGRADED";
    }

    return {
      state,
      peer,
      tunnelInterface: tunnelDev,
      lastHandshakeAt: lastHandshakeSec > 0 ? new Date(lastHandshakeSec * 1000) : undefined,
      rxBytes,
      txBytes,
      observedAt: new Date(),
      source: "WIREGUARD",
    };
  }
}
