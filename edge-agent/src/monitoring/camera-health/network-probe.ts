/**
 * Network Connectivity Probe (Layer 1)
 * 
 * Performs direct TCP socket tests against camera IP/port endpoints.
 * Crucial principle: TCP reachability proves ONLY transport connectivity, never that video is working.
 */

import net from "node:net";
import type { CameraConfiguration, NetworkProbeResult } from "./types.js";

export class NetworkProbe {
  async probeTcp(host: string, port: number, timeoutMs = 2000): Promise<NetworkProbeResult> {
    const started = Date.now();
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let completed = false;

      const finish = (reachable: boolean, error?: string) => {
        if (completed) return;
        completed = true;
        socket.destroy();
        resolve({
          reachable,
          port,
          latencyMs: Date.now() - started,
          protocol: port === 443 ? "HTTPS" : port === 80 ? "HTTP" : "TCP",
          error: error ?? undefined,
        });
      };

      socket.setTimeout(timeoutMs);
      socket.once("connect", () => finish(true));
      socket.once("timeout", () => finish(false, "TCP_CONNECTION_TIMEOUT"));
      socket.once("error", (err) => finish(false, err.message));

      try {
        socket.connect(port, host);
      } catch (err: any) {
        finish(false, err.message);
      }
    });
  }

  async probe(camera: CameraConfiguration, timeoutMs = 2000): Promise<NetworkProbeResult> {
    const port = camera.rtspPort ?? 554;
    return this.probeTcp(camera.ipAddress, port, timeoutMs);
  }
}

export const networkProbe = new NetworkProbe();
