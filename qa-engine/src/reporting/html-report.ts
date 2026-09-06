/**
 * HTML Audit Report Generator
 *
 * Generates an executive, beautifully styled, self-contained HTML report.
 */

import type {
  QARunConfig,
  QASummaryStats,
  QAScoreBreakdown,
  QAIssue,
  QAPageNode,
  QAConsoleEvent,
  QANetworkEvent,
  QAAccessibilityViolation,
  QAPerformanceMetric,
  QAFlowEdge,
} from "../types/qa.types";

export interface HtmlReportData {
  config: QARunConfig;
  stats: QASummaryStats;
  score: number;
  breakdown: QAScoreBreakdown;
  issues: QAIssue[];
  pages: QAPageNode[];
  edges: QAFlowEdge[];
  consoleEvents: QAConsoleEvent[];
  networkEvents: QANetworkEvent[];
  accessibility: QAAccessibilityViolation[];
  performance: QAPerformanceMetric[];
  screenshots: Array<{ label: string; relativePath: string }>;
  videoPath?: string;
  tracePath?: string;
}

export class HtmlReportGenerator {
  /**
   * Generate self-contained HTML audit report
   */
  static generate(data: HtmlReportData): string {
    const scoreColor =
      data.score >= 80 ? "#10b981" : data.score >= 60 ? "#f59e0b" : "#ef4444";

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>QA Audit Report - ${data.config.id} - KryptoVision</title>
  <style>
    :root {
      --bg: #090d16;
      --card-bg: #111827;
      --card-border: #1f2937;
      --text: #f9fafb;
      --text-muted: #9ca3af;
      --accent: #3b82f6;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: var(--bg); color: var(--text); padding: 32px 16px; line-height: 1.5; }
    .container { max-width: 1200px; margin: 0 auto; }
    header { border-bottom: 1px solid var(--card-border); padding-bottom: 24px; margin-bottom: 32px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; }
    h1 { font-size: 26px; font-weight: 700; color: #fff; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
    .score-banner { display: flex; align-items: center; gap: 24px; background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; padding: 24px; margin-bottom: 32px; }
    .score-circle { width: 100px; height: 100px; border-radius: 50%; border: 6px solid ${scoreColor}; display: flex; align-items: center; justify-content: center; flex-direction: column; font-weight: 800; font-size: 28px; }
    .score-circle span { font-size: 12px; color: var(--text-muted); font-weight: 500; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 32px; }
    .stat-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 10px; padding: 16px; }
    .stat-val { font-size: 24px; font-weight: 700; margin-top: 4px; }
    .stat-label { font-size: 13px; color: var(--text-muted); }
    section { margin-bottom: 40px; }
    h2 { font-size: 18px; margin-bottom: 16px; color: #e5e7eb; border-left: 4px solid var(--accent); padding-left: 10px; }
    table { width: 100%; border-collapse: collapse; background: var(--card-bg); border-radius: 8px; overflow: hidden; font-size: 14px; margin-bottom: 24px; }
    th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid var(--card-border); }
    th { background: #1f2937; color: var(--text-muted); font-weight: 600; font-size: 12px; text-transform: uppercase; }
    tr:last-child td { border-bottom: none; }
    .crit { color: var(--danger); font-weight: 600; }
    .maj { color: var(--warning); font-weight: 600; }
    .min { color: #60a5fa; font-weight: 600; }
    .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
    .gallery-item { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 8px; overflow: hidden; padding: 8px; }
    .gallery-item img { width: 100%; height: 160px; object-fit: cover; border-radius: 4px; }
    .gallery-caption { font-size: 12px; color: var(--text-muted); margin-top: 8px; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <p style="color: #60a5fa; font-size: 13px; font-weight: 600;">KryptoVision Automated QA</p>
        <h1>Audit Run Report: ${data.config.id}</h1>
        <p style="color: var(--text-muted); font-size: 14px; margin-top: 4px;">Target: <strong>${data.config.targetUrl}</strong> | Role: <strong>${data.config.userRole || "Admin"}</strong> | Browser: <strong>${data.config.browser || "Chromium"}</strong></p>
      </div>
      <div>
        <span class="badge" style="background: rgba(16, 185, 129, 0.2); color: var(--success); border: 1px solid var(--success);">Status: Completed</span>
      </div>
    </header>

    <div class="score-banner">
      <div class="score-circle">
        ${data.score}
        <span>/ 100</span>
      </div>
      <div style="flex: 1;">
        <h3 style="font-size: 18px; margin-bottom: 8px;">Overall QA Health Score</h3>
        <p style="color: var(--text-muted); font-size: 14px; margin-bottom: 12px;">Weighted evaluation across navigation availability, functional robustness, API stability, performance benchmarks, and accessibility.</p>
        <div style="display: flex; gap: 16px; flex-wrap: wrap; font-size: 13px;">
          <span>Availability: <strong>${data.breakdown.availabilityNavigation}%</strong></span>
          <span>Functional: <strong>${data.breakdown.functionalUi}%</strong></span>
          <span>API: <strong>${data.breakdown.apiReliability}%</strong></span>
          <span>Console: <strong>${data.breakdown.consoleStability}%</strong></span>
          <span>Performance: <strong>${data.breakdown.performance}%</strong></span>
          <span>Accessibility: <strong>${data.breakdown.accessibility}%</strong></span>
        </div>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Pages Tested</div>
        <div class="stat-val">${data.stats.pagesTested} / ${data.stats.pagesDiscovered}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Page Coverage</div>
        <div class="stat-val">${data.stats.pageCoveragePct}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Critical Issues</div>
        <div class="stat-val crit">${data.stats.criticalIssues}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Major Issues</div>
        <div class="stat-val maj">${data.stats.majorIssues}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Console Errors</div>
        <div class="stat-val">${data.stats.consoleErrors}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">API Failures</div>
        <div class="stat-val">${data.stats.apiFailures}</div>
      </div>
    </div>

    <section>
      <h2>Categorized Issues (${data.issues.length})</h2>
      <table>
        <thead>
          <tr>
            <th>Severity</th>
            <th>Category</th>
            <th>Title</th>
            <th>Page</th>
            <th>Occurrences</th>
          </tr>
        </thead>
        <tbody>
          ${
            data.issues.length === 0
              ? '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No critical or major issues detected!</td></tr>'
              : data.issues
                  .map(
                    (i) => `
            <tr>
              <td class="${i.severity === "CRITICAL" ? "crit" : i.severity === "MAJOR" ? "maj" : "min"}">${i.severity}</td>
              <td>${i.category}</td>
              <td>${i.title}</td>
              <td style="color: #60a5fa;">${i.pageUrl}</td>
              <td>${i.occurrences}</td>
            </tr>
          `
                  )
                  .join("")
          }
        </tbody>
      </table>
    </section>

    <section>
      <h2>Visited Pages & Load Times (${data.pages.length})</h2>
      <table>
        <thead>
          <tr>
            <th>Page Title</th>
            <th>Path</th>
            <th>Load Time</th>
            <th>Interactive Elements</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${data.pages
            .map(
              (p) => `
            <tr>
              <td><strong>${p.title || "Untitled"}</strong></td>
              <td>${p.path}</td>
              <td>${p.loadTimeMs}ms</td>
              <td>${p.testedInteractiveCount} / ${p.interactiveCount}</td>
              <td><span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981;">${p.status}</span></td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </section>

    <section>
      <h2>Artifacts & Downloads</h2>
      <div style="display: flex; gap: 16px; flex-wrap: wrap;">
        ${data.videoPath ? `<a href="${data.videoPath}" style="color: #60a5fa; text-decoration: none; padding: 10px 16px; background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 6px;">🎥 Watch Full Session Video</a>` : ""}
        ${data.tracePath ? `<a href="${data.tracePath}" style="color: #60a5fa; text-decoration: none; padding: 10px 16px; background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 6px;">🔍 Download Playwright Trace.zip</a>` : ""}
      </div>
    </section>
  </div>
</body>
</html>`;
  }
}
