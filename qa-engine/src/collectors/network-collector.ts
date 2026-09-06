/**
 * Network & API Collector
 *
 * Monitors HTTP network requests, captures failed API and asset requests (4xx/5xx),
 * redacts credentials from URLs/headers, and groups failures.
 */

import type { Page, Request, Response } from "@playwright/test";
import type { QANetworkEvent } from "../types/qa.types.js";
import { maskSensitiveData } from "../safety/credential-vault.js";

export class NetworkCollector {
  private failedEvents: Map<string, QANetworkEvent> = new Map();
  private requestStartTimes: Map<Request, number> = new Map();
  private currentPageUrl = "";

  /**
   * Attach network interceptors to page
   */
  attach(page: Page): void {
    page.on("request", (req) => {
      this.requestStartTimes.set(req, Date.now());
    });

    page.on("response", (res) => {
      const req = res.request();
      const startTime = this.requestStartTimes.get(req) || Date.now();
      const durationMs = Date.now() - startTime;
      this.requestStartTimes.delete(req);

      const status = res.status();
      // Flag HTTP 4xx and 5xx errors
      if (status >= 400) {
        this.recordFailure({
          method: req.method(),
          url: maskSensitiveData(req.url()),
          status,
          durationMs,
          resourceType: req.resourceType(),
          pageUrl: this.currentPageUrl || page.url(),
          failureReason: `HTTP ${status} ${res.statusText()}`,
        });
      }
    });

    page.on("requestfailed", (req) => {
      const startTime = this.requestStartTimes.get(req) || Date.now();
      const durationMs = Date.now() - startTime;
      this.requestStartTimes.delete(req);

      const failure = req.failure();
      this.recordFailure({
        method: req.method(),
        url: maskSensitiveData(req.url()),
        status: 0,
        durationMs,
        resourceType: req.resourceType(),
        pageUrl: this.currentPageUrl || page.url(),
        failureReason: failure?.errorText || "Network request failed",
      });
    });
  }

  /**
   * Set active page URL context
   */
  setCurrentPage(url: string): void {
    this.currentPageUrl = url;
  }

  /**
   * Record and group failed network request
   */
  private recordFailure(data: {
    method: string;
    url: string;
    status: number;
    durationMs: number;
    resourceType: string;
    pageUrl: string;
    failureReason: string;
  }): void {
    const key = `${data.method}:${data.url}:${data.status}`;
    const existing = this.failedEvents.get(key);

    if (existing) {
      existing.occurrences++;
    } else {
      this.failedEvents.set(key, {
        id: `net-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        runId: "",
        pageUrl: data.pageUrl,
        method: data.method,
        url: data.url,
        status: data.status,
        durationMs: data.durationMs,
        resourceType: data.resourceType,
        failureReason: data.failureReason,
        occurrences: 1,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Get all captured network failure events
   */
  getFailures(runId = ""): QANetworkEvent[] {
    return Array.from(this.failedEvents.values()).map((e) => ({
      ...e,
      runId,
    }));
  }

  /**
   * Get count of failed API calls (fetch / xhr)
   */
  get apiFailureCount(): number {
    let count = 0;
    for (const e of this.failedEvents.values()) {
      if (e.resourceType === "fetch" || e.resourceType === "xhr" || e.url.includes("/api/")) {
        count += e.occurrences;
      }
    }
    return count;
  }
}
