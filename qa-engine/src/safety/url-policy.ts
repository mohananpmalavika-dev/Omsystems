/**
 * URL Safety & Scope Policy
 *
 * Ensures the crawler stays within target domains and avoids forbidden protocols.
 */

export const FORBIDDEN_SCHEMES = ["javascript:", "file:", "ftp:", "data:", "blob:", "mailto:", "tel:"];

export const DEFAULT_BLOCKED_PATHS = [
  "/logout",
  "/signout",
  "/api/logout",
  "/api/auth/logout",
  "/api/control/v1/auth/logout",
];

export class UrlPolicy {
  private allowedHostnames: Set<string>;
  private blockedPaths: string[];

  constructor(targetUrl: string, allowedDomains: string[] = [], blockedPaths: string[] = []) {
    this.allowedHostnames = new Set();
    this.blockedPaths = [...DEFAULT_BLOCKED_PATHS, ...blockedPaths].map((p) => p.toLowerCase());

    try {
      const parsed = new URL(targetUrl);
      this.allowedHostnames.add(parsed.hostname.toLowerCase());
    } catch {
      // ignore
    }

    for (const domain of allowedDomains) {
      if (domain) {
        this.allowedHostnames.add(domain.toLowerCase().trim());
      }
    }
  }

  /**
   * Check if a URL is safe and in-scope for crawling
   */
  evaluate(rawUrl: string, baseUrl?: string): {
    isAllowed: boolean;
    isExternal: boolean;
    normalizedUrl: string;
    reason?: string;
  } {
    if (!rawUrl || typeof rawUrl !== "string") {
      return { isAllowed: false, isExternal: false, normalizedUrl: "", reason: "Empty URL" };
    }

    const trimmed = rawUrl.trim();

    // 1. Check forbidden schemes
    for (const scheme of FORBIDDEN_SCHEMES) {
      if (trimmed.toLowerCase().startsWith(scheme)) {
        return {
          isAllowed: false,
          isExternal: false,
          normalizedUrl: trimmed,
          reason: `Forbidden URL scheme: "${scheme}"`,
        };
      }
    }

    // 2. Parse URL
    let parsed: URL;
    try {
      parsed = baseUrl ? new URL(trimmed, baseUrl) : new URL(trimmed);
    } catch {
      return {
        isAllowed: false,
        isExternal: false,
        normalizedUrl: trimmed,
        reason: "Malformed URL",
      };
    }

    const normalizedUrl = `${parsed.protocol}//${parsed.host}${parsed.pathname}${parsed.search}`;
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();

    // 3. Check blocked paths
    for (const blocked of this.blockedPaths) {
      if (pathname === blocked || pathname.startsWith(`${blocked}/`)) {
        return {
          isAllowed: false,
          isExternal: false,
          normalizedUrl,
          reason: `Path matches blocked list: "${blocked}"`,
        };
      }
    }

    // 4. Check domain scope
    const isDomainAllowed = this.allowedHostnames.has(hostname) ||
      Array.from(this.allowedHostnames).some((allowed) =>
        hostname.endsWith(`.${allowed}`)
      );

    if (!isDomainAllowed) {
      return {
        isAllowed: false,
        isExternal: true,
        normalizedUrl,
        reason: `External domain "${hostname}" outside crawl scope`,
      };
    }

    return {
      isAllowed: true,
      isExternal: false,
      normalizedUrl,
    };
  }

  /**
   * Helper returning boolean
   */
  isAllowed(url: string, baseUrl?: string): boolean {
    return this.evaluate(url, baseUrl).isAllowed;
  }
}
