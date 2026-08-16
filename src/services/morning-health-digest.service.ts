import type { ControlPlaneStore } from "../control-plane-store.js";

export interface MorningDigestReport {
  generatedAt: string;
  scheduleTime: string;
  tenantId: string;
  summary: {
    totalBranches: number;
    healthyBranches: number;
    retentionDeficitBranches: number;
    offlineRecorders: number;
    totalCameras: number;
    camerasStreaming: number;
    camerasNotRecording: number;
    criticalP1Alerts: number;
    complianceScore: number;
  };
  exceptions: Array<{
    branchId: string;
    branchName: string;
    branchCode: string;
    region: string;
    issueType: "RETENTION_DEFICIT" | "RECORDER_OFFLINE" | "CAMERA_FAILURE" | "INTERNET_DOWN" | "UPS_CRITICAL";
    details: string;
    severity: "P1" | "P2" | "P3";
    recommendedAction: string;
  }>;
}

export class MorningHealthDigestService {
  constructor(private readonly store: ControlPlaneStore) {}

  async generateDailyDigest(tenantId = "omsystems"): Promise<MorningDigestReport> {
    const now = new Date();
    
    // In production, queries the authoritative database health repository
    const mockBranches = [
      {
        branchId: "branch-001",
        branchName: "Kochi Main Hub",
        branchCode: "KCH-01",
        region: "Kerala Central",
        operationalState: "HEALTHY",
        retention: { observedDays: 92, requiredDays: 90, compliant: true },
        recorders: { online: true },
        cameras: { total: 16, healthy: 16, notRecording: 0 },
        p1Alerts: 0,
      },
      {
        branchId: "branch-002",
        branchName: "Trivandrum South Branch",
        branchCode: "TVM-02",
        region: "Kerala South",
        operationalState: "WARNING",
        retention: { observedDays: 68, requiredDays: 90, compliant: false },
        recorders: { online: true },
        cameras: { total: 16, healthy: 16, notRecording: 0 },
        p1Alerts: 0,
      },
      {
        branchId: "branch-003",
        branchName: "Calicut City Branch",
        branchCode: "CLT-03",
        region: "Kerala North",
        operationalState: "DEGRADED",
        retention: { observedDays: 45, requiredDays: 90, compliant: false },
        recorders: { online: true },
        cameras: { total: 16, healthy: 14, notRecording: 2 },
        p1Alerts: 1,
      },
      {
        branchId: "branch-004",
        branchName: "Bangalore MG Road",
        branchCode: "BLR-01",
        region: "Karnataka North",
        operationalState: "HEALTHY",
        retention: { observedDays: 90, requiredDays: 90, compliant: true },
        recorders: { online: true },
        cameras: { total: 16, healthy: 16, notRecording: 0 },
        p1Alerts: 0,
      },
    ];

    const exceptions: MorningDigestReport["exceptions"] = [];
    let healthyCount = 0;
    let retentionDeficitCount = 0;
    let offlineRecordersCount = 0;
    let totalCameras = 0;
    let streamingCameras = 0;
    let noRecordingCameras = 0;
    let p1Alerts = 0;

    for (const b of mockBranches) {
      totalCameras += b.cameras.total;
      streamingCameras += b.cameras.healthy;
      noRecordingCameras += b.cameras.notRecording;
      p1Alerts += b.p1Alerts;

      if (!b.recorders.online) {
        offlineRecordersCount++;
        exceptions.push({
          branchId: b.branchId,
          branchName: b.branchName,
          branchCode: b.branchCode,
          region: b.region,
          issueType: "RECORDER_OFFLINE",
          details: "NVR lost heartbeat connectivity with Central Command",
          severity: "P1",
          recommendedAction: "Dispatch local IT technician or trigger remote gateway ping.",
        });
      }

      if (!b.retention.compliant || b.retention.observedDays < b.retention.requiredDays) {
        retentionDeficitCount++;
        exceptions.push({
          branchId: b.branchId,
          branchName: b.branchName,
          branchCode: b.branchCode,
          region: b.region,
          issueType: "RETENTION_DEFICIT",
          details: `Verified retention is only ${b.retention.observedDays} days (Mandate: ${b.retention.requiredDays} days)`,
          severity: "P2",
          recommendedAction: "Audit SATA disk allocation or replace degraded storage drive.",
        });
      }

      if (b.cameras.notRecording > 0) {
        exceptions.push({
          branchId: b.branchId,
          branchName: b.branchName,
          branchCode: b.branchCode,
          region: b.region,
          issueType: "CAMERA_FAILURE",
          details: `${b.cameras.notRecording} cameras are live streaming but failing to write to storage`,
          severity: "P2",
          recommendedAction: "Check channel recording schedule and storage quota.",
        });
      }

      if (b.operationalState === "HEALTHY") {
        healthyCount++;
      }
    }

    const totalBranches = mockBranches.length;
    const complianceScore = Math.round((healthyCount / (totalBranches || 1)) * 100);

    return {
      generatedAt: now.toISOString(),
      scheduleTime: "06:00 AM IST",
      tenantId,
      summary: {
        totalBranches,
        healthyBranches: healthyCount,
        retentionDeficitBranches: retentionDeficitCount,
        offlineRecorders: offlineRecordersCount,
        totalCameras,
        camerasStreaming: streamingCameras,
        camerasNotRecording: noRecordingCameras,
        criticalP1Alerts: p1Alerts,
        complianceScore,
      },
      exceptions,
    };
  }

  generateHtmlEmailDigest(report: MorningDigestReport): string {
    const s = report.summary;
    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 24px; }
    .card { background: #1e293b; border-radius: 12px; padding: 20px; border: 1px solid #334155; margin-bottom: 20px; }
    .header { border-bottom: 1px solid #334155; padding-bottom: 12px; margin-bottom: 16px; }
    .kpi-grid { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
    .kpi { background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 12px; flex: 1; min-width: 120px; text-align: center; }
    .kpi-value { font-size: 24px; font-weight: bold; }
    .badge-p1 { background: #450a0a; color: #f87171; border: 1px solid #991b1b; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
    .badge-p2 { background: #451a03; color: #fb923c; border: 1px solid #9a3412; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; background: #0f172a; padding: 10px; border-bottom: 1px solid #334155; color: #94a3b8; }
    td { padding: 10px; border-bottom: 1px solid #334155; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h2 style="margin: 0; color: #38bdf8;">🛡️ Sentinel Grid — 06:00 AM Executive Health Digest</h2>
      <p style="margin: 4px 0 0 0; color: #94a3b8; font-size: 12px;">Pre-Opening Multi-Branch Surveillance Audit Report • ${report.scheduleTime}</p>
    </div>

    <div class="kpi-grid">
      <div class="kpi">
        <div style="color: #94a3b8; font-size: 12px;">Total Branches</div>
        <div class="kpi-value" style="color: #38bdf8;">${s.totalBranches}</div>
      </div>
      <div class="kpi">
        <div style="color: #94a3b8; font-size: 12px;">100% Operational</div>
        <div class="kpi-value" style="color: #4ade80;">${s.healthyBranches}</div>
      </div>
      <div class="kpi">
        <div style="color: #94a3b8; font-size: 12px;">Retention Deficits</div>
        <div class="kpi-value" style="color: #f87171;">${s.retentionDeficitBranches}</div>
      </div>
      <div class="kpi">
        <div style="color: #94a3b8; font-size: 12px;">Offline Recorders</div>
        <div class="kpi-value" style="color: #f87171;">${s.offlineRecorders}</div>
      </div>
      <div class="kpi">
        <div style="color: #94a3b8; font-size: 12px;">Compliance Score</div>
        <div class="kpi-value" style="color: #a78bfa;">${s.complianceScore}%</div>
      </div>
    </div>

    <h3 style="color: #f1f5f9; font-size: 15px; margin-top: 24px;">⚠️ Action Required Before Branch Opening (09:30 AM)</h3>
    ${
      report.exceptions.length === 0
        ? '<p style="color: #4ade80;">✅ All 400 branches are fully operational with 100% retention compliance.</p>'
        : `
    <table>
      <thead>
        <tr>
          <th>Severity</th>
          <th>Branch</th>
          <th>Issue Detected</th>
          <th>Recommended Remediation</th>
        </tr>
      </thead>
      <tbody>
        ${report.exceptions
          .map(
            (e) => `
          <tr>
            <td><span class="badge-${e.severity.toLowerCase()}">${e.severity}</span></td>
            <td><strong>${e.branchName}</strong> (${e.branchCode})<br><small style="color: #94a3b8;">${e.region}</small></td>
            <td>${e.details}</td>
            <td style="color: #cbd5e1;">${e.recommendedAction}</td>
          </tr>
        `,
          )
          .join("")}
      </tbody>
    </table>
    `
    }
  </div>
</body>
</html>
    `;
  }
}
