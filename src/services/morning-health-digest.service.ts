import type { ControlPlaneStore } from "../control-plane-store.js";
import type { User } from "../domain/models.js";
import { UnifiedOperationsService } from "../operations/services/unified-operations.service.js";

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
  private readonly operations = new UnifiedOperationsService();

  constructor(private readonly store: ControlPlaneStore) {}

  async generateDailyDigest(user: User): Promise<MorningDigestReport> {
    const branches = await this.operations.getFleetBranchSummaries(user.tenantId, this.store, user);
    const exceptions: MorningDigestReport["exceptions"] = [];

    for (const branch of branches) {
      const identity = {
        branchId: branch.branchId,
        branchName: branch.name,
        branchCode: branch.branchCode,
        region: branch.region,
      };

      if (branch.recorders.offline > 0) {
        exceptions.push({
          ...identity,
          issueType: "RECORDER_OFFLINE",
          details: `${branch.recorders.offline} of ${branch.recorders.total} recorder(s) are offline in current telemetry.`,
          severity: "P1",
          recommendedAction: "Verify edge connectivity and inspect the affected recorder telemetry.",
        });
      }
      if (branch.retention.compliant === false) {
        exceptions.push({
          ...identity,
          issueType: "RETENTION_DEFICIT",
          details: `Verified retention is ${branch.retention.observedDays ?? "unknown"} days; policy requires ${branch.retention.requiredDays} days.`,
          severity: "P2",
          recommendedAction: "Review recorder archive coverage and storage capacity before changing policy.",
        });
      }
      if (branch.cameras.offline > 0 || branch.cameras.notRecording > 0) {
        exceptions.push({
          ...identity,
          issueType: "CAMERA_FAILURE",
          details: `${branch.cameras.offline} camera(s) offline and ${branch.cameras.notRecording} camera(s) not recording.`,
          severity: branch.cameras.offline > 0 ? "P1" : "P2",
          recommendedAction: "Inspect the affected camera telemetry, stream path, and recorder channel state.",
        });
      }
      if (branch.internet.state === "OFFLINE") {
        exceptions.push({
          ...identity,
          issueType: "INTERNET_DOWN",
          details: "The latest verified branch network telemetry is offline.",
          severity: "P1",
          recommendedAction: "Verify primary and backup WAN paths and the edge-agent heartbeat.",
        });
      }
    }

    const knownBranches = branches.filter((branch) =>
      !["UNKNOWN", "STALE", "MONITORING_INCOMPLETE", "NOT_PROVISIONED"].includes(branch.operationalState),
    );
    const healthyBranches = branches.filter((branch) => branch.operationalState === "HEALTHY").length;
    const totalCameras = branches.reduce((sum, branch) => sum + branch.cameras.total, 0);

    return {
      generatedAt: new Date().toISOString(),
      scheduleTime: process.env.MORNING_DIGEST_SCHEDULE ?? "06:00 Asia/Kolkata",
      tenantId: user.tenantId,
      summary: {
        totalBranches: branches.length,
        healthyBranches,
        retentionDeficitBranches: branches.filter((branch) => branch.retention.compliant === false).length,
        offlineRecorders: branches.reduce((sum, branch) => sum + branch.recorders.offline, 0),
        totalCameras,
        camerasStreaming: branches.reduce((sum, branch) => sum + branch.cameras.working, 0),
        camerasNotRecording: branches.reduce((sum, branch) => sum + branch.cameras.notRecording, 0),
        criticalP1Alerts: branches.reduce((sum, branch) => sum + branch.alerts.p1, 0),
        complianceScore: knownBranches.length > 0
          ? Math.round((healthyBranches / knownBranches.length) * 100)
          : 0,
      },
      exceptions,
    };
  }

  generateHtmlEmailDigest(report: MorningDigestReport): string {
    const summary = report.summary;
    const rows = report.exceptions.map((item) => `
      <tr>
        <td>${escapeHtml(item.severity)}</td>
        <td>${escapeHtml(item.branchName)} (${escapeHtml(item.branchCode)})</td>
        <td>${escapeHtml(item.details)}</td>
        <td>${escapeHtml(item.recommendedAction)}</td>
      </tr>`).join("");

    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Sentinel Grid Morning Health Digest</title>
<style>body{font-family:Arial,sans-serif;color:#172033}table{border-collapse:collapse;width:100%}th,td{border:1px solid #d7deea;padding:8px;text-align:left}.metrics{display:flex;gap:16px;flex-wrap:wrap}.metric{padding:12px;border:1px solid #d7deea;border-radius:8px}</style>
</head><body>
<h1>Sentinel Grid Morning Health Digest</h1>
<p>Generated ${escapeHtml(report.generatedAt)} for ${escapeHtml(report.tenantId)}. Scheduled window: ${escapeHtml(report.scheduleTime)}.</p>
<div class="metrics">
  <div class="metric">Branches: ${summary.totalBranches}</div><div class="metric">Healthy: ${summary.healthyBranches}</div>
  <div class="metric">Retention deficits: ${summary.retentionDeficitBranches}</div><div class="metric">Offline recorders: ${summary.offlineRecorders}</div>
  <div class="metric">Known-state compliance: ${summary.complianceScore}%</div>
</div>
<h2>Exceptions requiring review</h2>
${rows ? `<table><thead><tr><th>Severity</th><th>Branch</th><th>Observed issue</th><th>Recommended action</th></tr></thead><tbody>${rows}</tbody></table>` : "<p>No exceptions were reported by currently available telemetry.</p>"}
</body></html>`;
  }
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
