/**
 * Page Fingerprint & Deduplication Engine
 *
 * Generates reliable DOM structural hashes and normalized signatures
 * to prevent crawling loops while detecting meaningful UI state changes.
 */

import { createHash } from "node:crypto";
import type { Page } from "@playwright/test";

export interface PageFingerprint {
  url: string;
  normalizedPath: string;
  title: string;
  structuralHash: string;
  contentHash: string;
}

export class PageFingerprintEngine {
  /**
   * Normalize URL by stripping volatile query parameters (e.g. timestamps, tokens, random IDs)
   */
  normalizeUrl(rawUrl: string): { normalizedUrl: string; normalizedPath: string } {
    try {
      const url = new URL(rawUrl);
      const volatileParams = new Set([
        "_",
        "t",
        "timestamp",
        "time",
        "cb",
        "cachebuster",
        "session",
        "token",
        "csrf",
        "rand",
        "random",
      ]);

      // Remove volatile search params
      const searchParams = new URLSearchParams();
      url.searchParams.forEach((val, key) => {
        if (!volatileParams.has(key.toLowerCase())) {
          searchParams.append(key, val);
        }
      });

      const queryString = searchParams.toString();
      const normalizedPath = url.pathname.replace(/\/+$/, "") || "/";
      const normalizedUrl = `${url.protocol}//${url.host}${normalizedPath}${queryString ? `?${queryString}` : ""}`;

      return { normalizedUrl, normalizedPath };
    } catch {
      return { normalizedUrl: rawUrl, normalizedPath: rawUrl };
    }
  }

  /**
   * Extract structural fingerprint from active page DOM
   */
  async generate(page: Page): Promise<PageFingerprint> {
    const rawUrl = page.url();
    const { normalizedUrl, normalizedPath } = this.normalizeUrl(rawUrl);
    const title = await page.title().catch(() => "");

    // Extract structural skeleton while filtering out volatile numbers/counters
    const domStructure = await page.evaluate(() => {
      function getTagSkeleton(el: Element, depth = 0): string {
        if (depth > 6) return "";
        const tag = el.tagName.toLowerCase();
        // Skip script, style, svg paths
        if (tag === "script" || tag === "style" || tag === "noscript") return "";

        const role = el.getAttribute("role");
        const roleAttr = role ? `[role=${role}]` : "";
        const children = Array.from(el.children)
          .map((c) => getTagSkeleton(c, depth + 1))
          .filter(Boolean)
          .join("");

        return `<${tag}${roleAttr}>${children}</${tag}>`;
      }

      // Collect major headings
      const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
        .map((h) => (h.textContent || "").trim().toLowerCase().replace(/\d+/g, "#"))
        .filter(Boolean)
        .slice(0, 10)
        .join("|");

      const skeleton = document.body ? getTagSkeleton(document.body) : "";
      return { skeleton, headings };
    });

    const structuralHash = createHash("sha256")
      .update(`${normalizedPath}:${domStructure.skeleton}:${domStructure.headings}`)
      .digest("hex")
      .slice(0, 16);

    const contentHash = createHash("sha256")
      .update(`${normalizedPath}:${domStructure.headings}`)
      .digest("hex")
      .slice(0, 16);

    return {
      url: normalizedUrl,
      normalizedPath,
      title,
      structuralHash,
      contentHash,
    };
  }
}
