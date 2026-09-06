/**
 * JSON Report Generator
 *
 * Generates structured, comprehensive JSON report export.
 */

import type { HtmlReportData } from "./html-report";

export class JsonReportGenerator {
  static generate(data: HtmlReportData): string {
    const report = {
      version: "1.0",
      generatedAt: new Date().toISOString(),
      run: {
        id: data.config.id,
        targetUrl: data.config.targetUrl,
        userRole: data.config.userRole,
        browser: data.config.browser,
        deviceProfile: data.config.deviceProfile,
      },
      score: {
        overall: data.score,
        breakdown: data.breakdown,
      },
      summary: data.stats,
      issues: data.issues,
      pages: data.pages,
      edges: data.edges,
      consoleEvents: data.consoleEvents,
      networkEvents: data.networkEvents,
      accessibility: data.accessibility,
      performance: data.performance,
      artifacts: {
        video: data.videoPath,
        trace: data.tracePath,
        screenshots: data.screenshots,
      },
    };

    return JSON.stringify(report, null, 2);
  }
}
