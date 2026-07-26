/**
 * Report Generator
 * 
 * Generates HTML, JSON, and CSV reports from test results
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { MetricsSummary } from './metrics-collector.js';

interface ReportData {
  metrics: MetricsSummary;
  acceptance: Record<string, boolean>;
  testConfig: {
    branches: number;
    cameras: number;
    edgeAgents: number;
    dashboardUsers: number;
    duration: string;
  };
}

interface Config {
  reporting?: {
    outputDir: string;
    format: string[];
  };
  phase1?: {
    branches: number;
    cameras: number;
    testDuration: string;
  };
}

export class ReportGenerator {
  private phase: string;
  private config: Config;
  private outputDir: string;

  constructor(phase: string, config: Config) {
    this.phase = phase;
    this.config = config;
    this.outputDir = config.reporting?.outputDir || './reports';
    
    // Ensure output directory exists
    try {
      mkdirSync(this.outputDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

  async generate(data: ReportData): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const formats = this.config.reporting?.format || ['html', 'json'];
    
    for (const format of formats) {
      switch (format) {
        case 'html':
          await this.generateHTML(data, timestamp);
          break;
        case 'json':
          await this.generateJSON(data, timestamp);
          break;
        case 'csv':
          await this.generateCSV(data, timestamp);
          break;
      }
    }
  }

  private async generateHTML(data: ReportData, timestamp: string): Promise<void> {
    const { metrics, acceptance, testConfig } = data;
    
    const passedCount = Object.values(acceptance).filter(Boolean).length;
    const totalCount = Object.keys(acceptance).length;
    const percentage = Math.round((passedCount / totalCount) * 100);
    const statusClass = percentage === 100 ? 'success' : percentage >= 80 ? 'warning' : 'failure';
    
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Phase ${this.phase} Load Test Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f5f5f5;
      padding: 20px;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    h1 {
      color: #2c3e50;
      margin-bottom: 10px;
      border-bottom: 3px solid #3498db;
      padding-bottom: 10px;
    }
    h2 {
      color: #34495e;
      margin-top: 30px;
      margin-bottom: 15px;
      padding-bottom: 8px;
      border-bottom: 2px solid #ecf0f1;
    }
    .meta {
      color: #7f8c8d;
      margin-bottom: 30px;
      font-size: 14px;
    }
    .summary {
      background: #ecf0f1;
      padding: 20px;
      border-radius: 6px;
      margin-bottom: 30px;
    }
    .summary.success { background: #d5f4e6; border-left: 4px solid #27ae60; }
    .summary.warning { background: #fff3cd; border-left: 4px solid #f39c12; }
    .summary.failure { background: #f8d7da; border-left: 4px solid #e74c3c; }
    .summary h3 {
      margin-bottom: 15px;
      font-size: 24px;
    }
    .summary .percentage {
      font-size: 48px;
      font-weight: bold;
      margin-bottom: 10px;
    }
    .summary.success .percentage { color: #27ae60; }
    .summary.warning .percentage { color: #f39c12; }
    .summary.failure .percentage { color: #e74c3c; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .card {
      background: #fff;
      border: 1px solid #ddd;
      border-radius: 6px;
      padding: 20px;
    }
    .card h4 {
      color: #7f8c8d;
      font-size: 12px;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    .card .value {
      font-size: 32px;
      font-weight: bold;
      color: #2c3e50;
    }
    .card .unit {
      font-size: 14px;
      color: #95a5a6;
      margin-left: 5px;
    }
    .criteria-list {
      list-style: none;
    }
    .criteria-list li {
      padding: 12px;
      margin-bottom: 8px;
      border-radius: 4px;
      display: flex;
      align-items: center;
    }
    .criteria-list li.pass {
      background: #d5f4e6;
    }
    .criteria-list li.fail {
      background: #f8d7da;
    }
    .criteria-list li::before {
      content: "✓";
      margin-right: 12px;
      font-weight: bold;
      font-size: 18px;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .criteria-list li.pass::before {
      background: #27ae60;
      color: white;
    }
    .criteria-list li.fail::before {
      content: "✗";
      background: #e74c3c;
      color: white;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 15px;
    }
    th, td {
      text-align: left;
      padding: 12px;
      border-bottom: 1px solid #ddd;
    }
    th {
      background: #34495e;
      color: white;
      font-weight: 600;
    }
    tr:hover {
      background: #f8f9fa;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      text-align: center;
      color: #7f8c8d;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Phase ${this.phase} Load Test Report</h1>
    <div class="meta">
      Generated: ${new Date().toLocaleString()}<br>
      Test Duration: ${testConfig.duration}
    </div>

    <div class="summary ${statusClass}">
      <h3>Overall Result</h3>
      <div class="percentage">${percentage}%</div>
      <p>${passedCount} out of ${totalCount} acceptance criteria met</p>
    </div>

    <h2>Test Configuration</h2>
    <div class="grid">
      <div class="card">
        <h4>Branches</h4>
        <div class="value">${testConfig.branches}</div>
      </div>
      <div class="card">
        <h4>Cameras</h4>
        <div class="value">${testConfig.cameras}</div>
      </div>
      <div class="card">
        <h4>Edge Agents</h4>
        <div class="value">${testConfig.edgeAgents}</div>
      </div>
      <div class="card">
        <h4>Dashboard Users</h4>
        <div class="value">${testConfig.dashboardUsers}</div>
      </div>
    </div>

    <h2>Performance Metrics</h2>
    <div class="grid">
      <div class="card">
        <h4>Heartbeats Sent</h4>
        <div class="value">${metrics.heartbeatsSent.toLocaleString()}</div>
      </div>
      <div class="card">
        <h4>Heartbeats Failed</h4>
        <div class="value">${metrics.heartbeatsFailed.toLocaleString()}</div>
      </div>
      <div class="card">
        <h4>Loss Rate</h4>
        <div class="value">${metrics.heartbeatLossRate.toFixed(3)}<span class="unit">%</span></div>
      </div>
      <div class="card">
        <h4>Status Updates</h4>
        <div class="value">${metrics.statusUpdates.toLocaleString()}</div>
      </div>
      <div class="card">
        <h4>API P95</h4>
        <div class="value">${Math.round(metrics.apiResponseTimeP95)}<span class="unit">ms</span></div>
      </div>
      <div class="card">
        <h4>API P99</h4>
        <div class="value">${Math.round(metrics.apiResponseTimeP99)}<span class="unit">ms</span></div>
      </div>
      <div class="card">
        <h4>Dashboard Load</h4>
        <div class="value">${(metrics.dashboardLoadTime / 1000).toFixed(2)}<span class="unit">s</span></div>
      </div>
      <div class="card">
        <h4>Branch Drill-Down</h4>
        <div class="value">${(metrics.branchDrillDownTime / 1000).toFixed(2)}<span class="unit">s</span></div>
      </div>
    </div>

    <h2>Acceptance Criteria</h2>
    <ul class="criteria-list">
      ${Object.entries(acceptance).map(([criterion, passed]) => `
        <li class="${passed ? 'pass' : 'fail'}">${criterion}</li>
      `).join('')}
    </ul>

    <h2>Detailed Metrics</h2>
    <table>
      <thead>
        <tr>
          <th>Metric</th>
          <th>Value</th>
          <th>Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Heartbeats Sent</td>
          <td>${metrics.heartbeatsSent.toLocaleString()}</td>
          <td>count</td>
        </tr>
        <tr>
          <td>Heartbeats Failed</td>
          <td>${metrics.heartbeatsFailed.toLocaleString()}</td>
          <td>count</td>
        </tr>
        <tr>
          <td>Heartbeat Loss Rate</td>
          <td>${metrics.heartbeatLossRate.toFixed(3)}</td>
          <td>%</td>
        </tr>
        <tr>
          <td>Status Updates</td>
          <td>${metrics.statusUpdates.toLocaleString()}</td>
          <td>count</td>
        </tr>
        <tr>
          <td>Active WebSockets</td>
          <td>${metrics.activeWebSockets}</td>
          <td>connections</td>
        </tr>
        <tr>
          <td>API Response Time (P50)</td>
          <td>${Math.round(metrics.apiResponseTimeP50)}</td>
          <td>ms</td>
        </tr>
        <tr>
          <td>API Response Time (P95)</td>
          <td>${Math.round(metrics.apiResponseTimeP95)}</td>
          <td>ms</td>
        </tr>
        <tr>
          <td>API Response Time (P99)</td>
          <td>${Math.round(metrics.apiResponseTimeP99)}</td>
          <td>ms</td>
        </tr>
        <tr>
          <td>Dashboard Load Time</td>
          <td>${(metrics.dashboardLoadTime / 1000).toFixed(2)}</td>
          <td>s</td>
        </tr>
        <tr>
          <td>Branch Drill-Down Time</td>
          <td>${(metrics.branchDrillDownTime / 1000).toFixed(2)}</td>
          <td>s</td>
        </tr>
        <tr>
          <td>Health Update Delay</td>
          <td>${(metrics.healthUpdateDelay / 1000).toFixed(2)}</td>
          <td>s</td>
        </tr>
        <tr>
          <td>DB CPU Usage</td>
          <td>${metrics.dbCpuUsage.toFixed(1)}</td>
          <td>%</td>
        </tr>
        <tr>
          <td>DB Memory Usage</td>
          <td>${metrics.dbMemoryUsage.toFixed(1)}</td>
          <td>%</td>
        </tr>
        <tr>
          <td>Cross-Tenant Leakage</td>
          <td>${metrics.crossTenantLeakage}</td>
          <td>incidents</td>
        </tr>
      </tbody>
    </table>

    <div class="footer">
      <p>Sentinel Platform — Phase ${this.phase} Load Test</p>
      <p>Report generated on ${new Date().toLocaleString()}</p>
    </div>
  </div>
</body>
</html>`;

    const filename = join(this.outputDir, `phase${this.phase}-report-${timestamp}.html`);
    writeFileSync(filename, html);
    console.log(`HTML report generated: ${filename}`);
  }

  private async generateJSON(data: ReportData, timestamp: string): Promise<void> {
    const report = {
      phase: this.phase,
      timestamp: new Date().toISOString(),
      testConfig: data.testConfig,
      metrics: data.metrics,
      acceptance: data.acceptance,
      summary: {
        passed: Object.values(data.acceptance).filter(Boolean).length,
        total: Object.keys(data.acceptance).length,
        percentage: Math.round(
          (Object.values(data.acceptance).filter(Boolean).length / 
           Object.keys(data.acceptance).length) * 100
        ),
      },
    };

    const filename = join(this.outputDir, `phase${this.phase}-report-${timestamp}.json`);
    writeFileSync(filename, JSON.stringify(report, null, 2));
    console.log(`JSON report generated: ${filename}`);
  }

  private async generateCSV(data: ReportData, timestamp: string): Promise<void> {
    const { metrics, acceptance } = data;
    
    const rows = [
      ['Metric', 'Value', 'Unit'],
      ['Heartbeats Sent', metrics.heartbeatsSent, 'count'],
      ['Heartbeats Failed', metrics.heartbeatsFailed, 'count'],
      ['Heartbeat Loss Rate', metrics.heartbeatLossRate.toFixed(3), '%'],
      ['Status Updates', metrics.statusUpdates, 'count'],
      ['Active WebSockets', metrics.activeWebSockets, 'connections'],
      ['API P50', Math.round(metrics.apiResponseTimeP50), 'ms'],
      ['API P95', Math.round(metrics.apiResponseTimeP95), 'ms'],
      ['API P99', Math.round(metrics.apiResponseTimeP99), 'ms'],
      ['Dashboard Load Time', (metrics.dashboardLoadTime / 1000).toFixed(2), 's'],
      ['Branch Drill-Down', (metrics.branchDrillDownTime / 1000).toFixed(2), 's'],
      ['Health Update Delay', (metrics.healthUpdateDelay / 1000).toFixed(2), 's'],
      ['DB CPU Usage', metrics.dbCpuUsage.toFixed(1), '%'],
      ['DB Memory Usage', metrics.dbMemoryUsage.toFixed(1), '%'],
      ['Cross-Tenant Leakage', metrics.crossTenantLeakage, 'incidents'],
      [],
      ['Acceptance Criteria', 'Result'],
      ...Object.entries(acceptance).map(([criterion, passed]) => [criterion, passed ? 'PASS' : 'FAIL']),
    ];

    const csv = rows.map(row => row.join(',')).join('\n');
    
    const filename = join(this.outputDir, `phase${this.phase}-report-${timestamp}.csv`);
    writeFileSync(filename, csv);
    console.log(`CSV report generated: ${filename}`);
  }
}
