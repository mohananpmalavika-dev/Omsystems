/**
 * Console Collector
 *
 * Captures and deduplicates console.error, console.warn, and uncaught page exceptions.
 */

import type { Page } from "@playwright/test";
import type { QAConsoleEvent } from "../types/qa.types";
import { maskSensitiveData } from "../safety/credential-vault";

export class ConsoleCollector {
  private events: Map<string, QAConsoleEvent> = new Map();
  private currentPageUrl = "";

  /**
   * Attach listeners to page
   */
  attach(page: Page): void {
    // Track console messages
    page.on("console", (msg) => {
      const type = msg.type();
      if (type === "error" || type === "warning") {
        this.recordEvent({
          severity: type === "error" ? "error" : "warn",
          message: maskSensitiveData(msg.text()),
          pageUrl: this.currentPageUrl || page.url(),
        });
      }
    });

    // Track unhandled page errors / exceptions
    page.on("pageerror", (error) => {
      this.recordEvent({
        severity: "error",
        message: maskSensitiveData(error.message || String(error)),
        stack: maskSensitiveData(error.stack || ""),
        pageUrl: this.currentPageUrl || page.url(),
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
   * Record and deduplicate event
   */
  private recordEvent(data: {
    severity: "error" | "warn" | "info";
    message: string;
    stack?: string;
    pageUrl: string;
  }): void {
    const key = `${data.severity}:${data.pageUrl}:${data.message.slice(0, 150)}`;
    const existing = this.events.get(key);

    if (existing) {
      existing.occurrences++;
    } else {
      this.events.set(key, {
        id: `console-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        runId: "",
        pageUrl: data.pageUrl,
        severity: data.severity,
        message: data.message,
        stack: data.stack,
        occurrences: 1,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Get all captured console events
   */
  getEvents(runId = ""): QAConsoleEvent[] {
    return Array.from(this.events.values()).map((e) => ({
      ...e,
      runId,
    }));
  }

  /**
   * Get total error count
   */
  get errorCount(): number {
    let count = 0;
    for (const e of this.events.values()) {
      if (e.severity === "error") count += e.occurrences;
    }
    return count;
  }
}
