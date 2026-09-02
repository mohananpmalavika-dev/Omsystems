/**
 * Sentinel Grid — Loopback & Hostname Security Guard
 * 
 * Enforces production policy against unsafe localhost, 127.0.0.1, and loopback assumptions.
 */

import { ConfigurationErrorCode, EndpointPolicy } from "../../packages/contracts/src/config/config-types.js";
import { ProductionConfigurationError } from "../../packages/contracts/src/config/config-errors.js";

const LOOPBACK_HOSTNAMES = new Set([
  "localhost",
  "localhost.",
  "127.0.0.1",
  "::1",
  "[::1]",
  "0.0.0.0",
]);

/**
 * Checks if a hostname represents loopback or local host interface.
 */
export function isLoopbackHost(host: string): boolean {
  if (!host) return false;
  const normalized = host.trim().toLowerCase().replace(/^\[|\]$/g, "");

  if (LOOPBACK_HOSTNAMES.has(normalized)) return true;

  // Check IPv4 127.0.0.0/8 subnet
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized)) {
    return true;
  }

  return false;
}

/**
 * Checks if a full URL string points to a loopback host.
 */
export function isLoopbackUrl(urlString: string): boolean {
  if (!urlString) return false;
  try {
    const parsed = new URL(urlString);
    return isLoopbackHost(parsed.hostname);
  } catch {
    // If not a standard URL, check if it matches host:port
    const hostPart = urlString.split(":")[0]?.replace(/^\/\//, "");
    return hostPart ? isLoopbackHost(hostPart) : false;
  }
}

/**
 * Asserts that a given endpoint is not a loopback address in production,
 * unless explicitly allowed by policy (e.g. colocated sidecar).
 */
export function assertNotLoopback(
  endpointName: string,
  endpointUrl: string,
  isProduction: boolean,
  policy?: EndpointPolicy
): void {
  if (!isProduction) return;

  if (policy?.allowLoopback) {
    return; // Approved sidecar exception
  }

  if (isLoopbackUrl(endpointUrl)) {
    throw new ProductionConfigurationError({
      key: endpointName,
      endpoint: endpointUrl,
      code: ConfigurationErrorCode.LOOPBACK_NOT_ALLOWED,
      reason: `Endpoint ${endpointName} points to loopback (${endpointUrl}) which is forbidden in clustered production.`,
    });
  }
}

/**
 * Redacts passwords, tokens, and secrets from connection strings for safe logging.
 */
export function redactConnectionString(urlStr: string): string {
  if (!urlStr) return "";
  try {
    const url = new URL(urlStr);
    if (url.password) {
      url.password = "***";
      return url.toString();
    }
    return urlStr;
  } catch {
    // Regex fallback for non-standard connection strings (e.g. redis://:pass@host)
    return urlStr.replace(/(:\/\/)([^:@\s]+):([^@\s]+)(@)/, "$1$2:***$4")
                 .replace(/(:\/\/):([^@\s]+)(@)/, "$1:***$3");
  }
}

