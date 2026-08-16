/**
 * Retention Compliance REST API Routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import {
  retentionPolicyService,
  retentionSummaryService,
  retentionReportService,
  retentionAuditService,
  retentionEvidenceService,
  type BranchRetentionSummary,
  type RetentionEvidence,
} from "../index.js";

// Mock synthetic branch dataset to demonstrate 400-branch scale
function getSampleBranches(): BranchRetentionSummary[] {
  const branches: BranchRetentionSummary[] = [
    {
      branchId: "branch-178",
      branchName: "Aluva Central",
      cameraCount: 16,
      healthy: 14,
      warning: 0,
      violation: 1,
      critical: 1,
      unknown: 0,
      worstRetentionDays: 61.4,
      requiredRetentionDays: 90,
      state: "CRITICAL",
      complianceState: "VIOLATION",
      riskState: "IMMINENT",
      averageCoveragePercent: 98.4,
      daysUntilViolation: 0,
      lastCheckedAt: new Date(),
    },
    {
      branchId: "branch-101",
      branchName: "Kochi 01 — MG Road",
      cameraCount: 16,
      healthy: 16,
      warning: 0,
      violation: 0,
      critical: 0,
      unknown: 0,
      worstRetentionDays: 93.5,
      requiredRetentionDays: 90,
      state: "HEALTHY",
      complianceState: "COMPLIANT",
      riskState: "STABLE",
      averageCoveragePercent: 99.9,
      daysUntilViolation: undefined,
      lastCheckedAt: new Date(),
    },
    {
      branchId: "branch-102",
      branchName: "Kochi 02 — Palarivattom",
      cameraCount: 16,
      healthy: 16,
      warning: 0,
      violation: 0,
      critical: 0,
      unknown: 0,
      worstRetentionDays: 92.0,
      requiredRetentionDays: 90,
      state: "HEALTHY",
      complianceState: "COMPLIANT",
      riskState: "AT_RISK",
      averageCoveragePercent: 99.7,
      daysUntilViolation: 2,
      lastCheckedAt: new Date(),
    },
    {
      branchId: "branch-204",
      branchName: "Thrissur 04 — Round North",
      cameraCount: 16,
      healthy: 12,
      warning: 2,
      violation: 1,
      critical: 1,
      unknown: 0,
      worstRetentionDays: 61.0,
      requiredRetentionDays: 90,
      state: "CRITICAL",
      complianceState: "VIOLATION",
      riskState: "IMMINENT",
      averageCoveragePercent: 98.5,
      daysUntilViolation: 0,
      lastCheckedAt: new Date(),
    },
    {
      branchId: "branch-303",
      branchName: "Kannur 03 — Fort Road",
      cameraCount: 16,
      healthy: 0,
      warning: 0,
      violation: 0,
      critical: 0,
      unknown: 16,
      worstRetentionDays: undefined,
      requiredRetentionDays: 90,
      state: "UNKNOWN",
      complianceState: "UNKNOWN",
      riskState: "UNKNOWN",
      averageCoveragePercent: 0,
      daysUntilViolation: undefined,
      lastCheckedAt: new Date(),
    },
  ];

  // Populate remaining branches up to 400 for realistic fleet monitoring
  for (let i = 6; i <= 400; i++) {
    const isViolation = i % 25 === 0;
    const isCritical = i % 45 === 0;
    const isUnknown = i % 75 === 0;
    const isWarning = i % 18 === 0;

    let state: "HEALTHY" | "WARNING" | "VIOLATION" | "CRITICAL" | "UNKNOWN" = "HEALTHY";
    let complianceState: "COMPLIANT" | "VIOLATION" | "UNKNOWN" = "COMPLIANT";
    let worstRetention = 94.0 + (i % 10);

    if (isCritical) {
      state = "CRITICAL";
      complianceState = "VIOLATION";
      worstRetention = 60.0 + (i % 12);
    } else if (isViolation) {
      state = "VIOLATION";
      complianceState = "VIOLATION";
      worstRetention = 85.0 + (i % 4);
    } else if (isUnknown) {
      state = "UNKNOWN";
      complianceState = "UNKNOWN";
      worstRetention = 0;
    } else if (isWarning) {
      state = "WARNING";
      worstRetention = 91.0;
    }

    branches.push({
      branchId: `branch-${i}`,
      branchName: `Branch ${String(i).padStart(3, "0")} — Region ${Math.floor(i / 50) + 1}`,
      cameraCount: 16,
      healthy: state === "HEALTHY" ? 16 : 14,
      warning: state === "WARNING" ? 2 : 0,
      violation: state === "VIOLATION" ? 1 : 0,
      critical: state === "CRITICAL" ? 1 : 0,
      unknown: state === "UNKNOWN" ? 16 : 0,
      worstRetentionDays: state === "UNKNOWN" ? undefined : worstRetention,
      requiredRetentionDays: 90,
      state,
      complianceState,
      riskState: state === "CRITICAL" || isWarning ? "AT_RISK" : "STABLE",
      averageCoveragePercent: state === "UNKNOWN" ? 0 : 99.5,
      daysUntilViolation: isWarning ? 3 : undefined,
      lastCheckedAt: new Date(),
    });
  }

  return branches;
}

export async function registerRetentionRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/retention/overview & /v1/retention/overview
   */
  const handleRetentionOverview = async (request: FastifyRequest, reply: FastifyReply) => {
    const branches = getSampleBranches();
    const summary = retentionSummaryService.summarizeFleet(branches);
    return reply.send({
      success: true,
      data: {
        ...summary,
        observedAt: new Date(),
      },
    });
  };

  app.get("/api/v1/retention/overview", handleRetentionOverview);
  app.get("/v1/retention/overview", handleRetentionOverview);

  /**
   * GET /api/v1/retention/branches & /v1/retention/branches
   */
  const handleRetentionBranches = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = z
      .object({
        filter: z.enum(["all", "healthy", "warning", "violation", "critical", "unknown", "at_risk"]).optional(),
        search: z.string().optional(),
        limit: z.coerce.number().default(50),
        offset: z.coerce.number().default(0),
      })
      .parse(request.query);

    let branches = getSampleBranches();

    if (query.filter && query.filter !== "all") {
      if (query.filter === "healthy") branches = branches.filter((b) => b.state === "HEALTHY");
      else if (query.filter === "warning") branches = branches.filter((b) => b.state === "WARNING");
      else if (query.filter === "violation") branches = branches.filter((b) => b.state === "VIOLATION");
      else if (query.filter === "critical") branches = branches.filter((b) => b.state === "CRITICAL");
      else if (query.filter === "unknown") branches = branches.filter((b) => b.state === "UNKNOWN");
      else if (query.filter === "at_risk") branches = branches.filter((b) => b.riskState === "AT_RISK" || b.riskState === "IMMINENT");
    }

    if (query.search) {
      const s = query.search.toLowerCase();
      branches = branches.filter((b) => b.branchName.toLowerCase().includes(s) || b.branchId.toLowerCase().includes(s));
    }

    const total = branches.length;
    const paginated = branches.slice(query.offset, query.offset + query.limit);

    return reply.send({
      success: true,
      data: {
        branches: paginated,
        total,
        limit: query.limit,
        offset: query.offset,
      },
    });
  };

  app.get("/api/v1/retention/branches", handleRetentionBranches);
  app.get("/v1/retention/branches", handleRetentionBranches);

  /**
   * GET /api/v1/branches/:branchId/retention/assessment
   */
  const handleBranchAssessment = async (request: FastifyRequest, reply: FastifyReply) => {
    const { branchId } = z.object({ branchId: z.string() }).parse(request.params);
    const now = new Date();

    // Synthesize 16 camera assessments for the branch
    const cameraAssessments = Array.from({ length: 16 }, (_, i) => {
      const channelNum = i + 1;
      const camId = `cam-${branchId.replace("branch-", "")}-${String(channelNum).padStart(2, "0")}`;
      const isCritical = channelNum === 8 && branchId === "branch-178";
      const isStopped = channelNum === 7 && branchId === "branch-178";

      const actualDays = isCritical ? 61.4 : isStopped ? 88.2 : 91.5 + (channelNum % 4);
      const oldestDate = new Date(now.getTime() - actualDays * 86_400_000);

      const evidence: RetentionEvidence = {
        id: `ev-${camId}-${Date.now()}`,
        tenantId: "tenant-default",
        branchId,
        recorderId: `rec-${branchId}-01`,
        cameraId: camId,
        source: "RECORDER_ARCHIVE",
        quality: "PLAYBACK_CONFIRMED",
        oldestRecordingAt: oldestDate,
        newestRecordingAt: isStopped ? new Date(now.getTime() - 15 * 60_000) : now,
        verifiedPlayable: true,
        observedAt: now,
        confidence: 0.98,
      };

      retentionEvidenceService.recordEvidence(evidence);

      return retentionPolicyService.assess({
        tenantId: "tenant-default",
        branchId,
        recorderId: `rec-${branchId}-01`,
        cameraId: camId,
        cameraName: `CAM${String(channelNum).padStart(2, "0")}`,
        evidenceList: [evidence],
        now,
      });
    });

    const summary = retentionSummaryService.summarizeBranch(
      branchId,
      branchId === "branch-178" ? "Aluva Central" : `Branch ${branchId}`,
      cameraAssessments,
      90
    );

    return reply.send({
      success: true,
      data: {
        summary,
        cameras: cameraAssessments,
      },
    });
  };

  app.get("/api/v1/branches/:branchId/retention/assessment", handleBranchAssessment);
  app.get("/v1/branches/:branchId/retention/assessment", handleBranchAssessment);

  /**
   * GET /api/v1/cameras/:cameraId/retention/evidence
   */
  const handleCameraEvidence = async (request: FastifyRequest, reply: FastifyReply) => {
    const { cameraId } = z.object({ cameraId: z.string() }).parse(request.params);
    const now = new Date();
    const isCritical = cameraId.includes("08") || cameraId.includes("04");
    const actualDays = isCritical ? 61.4 : 91.5;

    const recorderEvidence: RetentionEvidence = {
      id: `ev-rec-${cameraId}`,
      tenantId: "tenant-default",
      branchId: "branch-178",
      recorderId: "rec-aluva-01",
      cameraId,
      source: "RECORDER_ARCHIVE",
      quality: "PLAYBACK_CONFIRMED",
      oldestRecordingAt: new Date(now.getTime() - actualDays * 86_400_000),
      newestRecordingAt: now,
      verifiedPlayable: true,
      recordingGapMinutes: isCritical ? 134 : 0,
      observedAt: now,
      confidence: 0.98,
    };

    const platformEvidence: RetentionEvidence = {
      id: `ev-plat-${cameraId}`,
      tenantId: "tenant-default",
      branchId: "branch-178",
      recorderId: "rec-aluva-01",
      cameraId,
      source: "PLATFORM_INDEX",
      quality: "INDEX_ONLY",
      oldestRecordingAt: new Date(now.getTime() - (isCritical ? 61.2 : 91.8) * 86_400_000),
      newestRecordingAt: now,
      verifiedPlayable: false,
      observedAt: now,
      confidence: 0.92,
    };

    const assessment = retentionPolicyService.assess({
      tenantId: "tenant-default",
      branchId: "branch-178",
      recorderId: "rec-aluva-01",
      cameraId,
      cameraName: cameraId,
      evidenceList: [recorderEvidence, platformEvidence],
      now,
    });

    return reply.send({
      success: true,
      data: {
        assessment,
        evidence: [recorderEvidence, platformEvidence],
      },
    });
  };

  app.get("/api/v1/cameras/:cameraId/retention/evidence", handleCameraEvidence);
  app.get("/v1/cameras/:cameraId/retention/evidence", handleCameraEvidence);

  /**
   * GET /api/v1/retention/reports/daily & /v1/retention/reports/daily
   */
  const handleDailyReport = async (request: FastifyRequest, reply: FastifyReply) => {
    const branches = getSampleBranches();
    const report = retentionReportService.generateDailyReport(
      new Date().toISOString().slice(0, 10),
      branches,
      ["branch-178"],
      ["branch-042"]
    );
    return reply.send({
      success: true,
      data: report,
    });
  };

  app.get("/api/v1/retention/reports/daily", handleDailyReport);
  app.get("/v1/retention/reports/daily", handleDailyReport);

  /**
   * GET /api/v1/retention/audit & /v1/retention/audit
   */
  const handleRetentionAudit = async (request: FastifyRequest, reply: FastifyReply) => {
    const logs = retentionAuditService.getAuditLogs("tenant-default", 50);
    return reply.send({
      success: true,
      data: logs,
    });
  };

  app.get("/api/v1/retention/audit", handleRetentionAudit);
  app.get("/v1/retention/audit", handleRetentionAudit);
}
