/**
 * TLS Scanner SSRF Protection Policy
 * 
 * Regulates certificate and protocol scanners to prevent Server-Side Request Forgery (SSRF)
 * against cloud metadata services, loopback, or unauthorized private internal networks.
 */

import { isIP } from "node:net";
import type { TlsScannerPolicyOptions } from "../../../packages/contracts/src/security/tls/tls-types.js";
import { SecurityConfigurationError } from "../../../packages/contracts/src/security/tls/tls-errors.js";
import { TlsErrorCode } from "../../../packages/contracts/src/security/tls/tls-types.js";

export class TlsScannerPolicy {
  private readonly allowedPorts: Set<number>;
  private readonly blockedHosts: Set<string>;
  private readonly allowPrivateIps: boolean;

  constructor(options: TlsScannerPolicyOptions = {}) {
    this.allowedPorts = new Set(options.allowedPorts || [443, 8443, 554, 8554, 8000, 9443]);
    this.blockedHosts = new Set([
      "169.254.169.254", // AWS/GCP/Azure Metadata
      "metadata.google.internal",
      "127.0.0.1",
      "localhost",
      "::1",
      ...(options.blockedCidrs || []),
    ]);
    this.allowPrivateIps = options.allowPrivateIps ?? true; // Cameras/NVRs are typically on private LANs
  }

  isTargetAllowed(host: string, port: number): { allowed: boolean; reason?: string } {
    const cleanHost = host.toLowerCase().trim();

    // 1. Port Check
    if (!this.allowedPorts.has(port)) {
      return {
        allowed: false,
        reason: `Port ${port} is not in the allowed scanner port list [${Array.from(this.allowedPorts).join(", ")}].`,
      };
    }

    // 2. Blocked Metadata / Loopback Check
    if (this.blockedHosts.has(cleanHost)) {
      return {
        allowed: false,
        reason: `Host '${cleanHost}' is a restricted loopback or cloud metadata destination.`,
      };
    }

    if (cleanHost.startsWith("127.") || cleanHost === "::1" || cleanHost.startsWith("169.254.")) {
      return {
        allowed: false,
        reason: `IP '${cleanHost}' is within a blocked loopback or link-local subnet.`,
      };
    }

    return { allowed: true };
  }

  assertTargetAllowed(host: string, port: number): void {
    const check = this.isTargetAllowed(host, port);
    if (!check.allowed) {
      throw new SecurityConfigurationError(
        `SSRF Guard: Scanner connection to '${host}:${port}' prohibited: ${check.reason}`,
        TlsErrorCode.INSECURE_OVERRIDE_FORBIDDEN,
      );
    }
  }
}

export const defaultTlsScannerPolicy = new TlsScannerPolicy();
