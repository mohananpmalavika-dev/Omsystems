/**
 * Retention Compliance REST API Routes
 * Connected directly to live database / ControlPlaneStore for real-time fleet compliance.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../../control-plane-store.js";
import {
  retentionPolicyService,
  retentionSummaryService,
  retentionReportService,
  retentionAuditService,
  retentionEvidenceService,
  type BranchRetentionSummary,
  type RetentionAssessment,
  type RetentionEvidence,
  type RetentionState,
  type RetentionComplianceState,
  type RetentionRiskState,
} from "../index.js";
import { retentionEngine } from "../services/retention-engine.service.js";

async function loadLiveBranchRetentionSummaries(store?: ControlPlaneStore, tenantId: string = "tenant-default"): Promise<BranchRetentionSummary[]> {
  if (!store) return [];

  const branches = (await (store as any).listBranches?.()) || (await (store as any).listNodes?.("branch")) || [];
  if (!branches || branches.length === 0) return [];

  const summaries: BranchRetentionSummary[] = [];

  for (const branch of branches) {
    const cameras = (await (store as any).listCameras?.(branch.id)) || [];
    const telemetry = await store.listLatestOperationalTelemetry(tenantId, [branch.id]);
    const policy = (await store.getOperationalHealthPolicy?.(branch.id)) || {
      retentionDays: 90,
      retentionWarningDays: 14,
      maxRecordingGapSeconds: 60,
    };

    const assessments: RetentionAssessment[] = [];

    for (const camera of cameras) {
      const camTelemetry = telemetry.find(
        (t) => (t.deviceType === "camera" || t.deviceType === "archive") && t.deviceId === camera.id
      );

      const metrics = (camTelemetry?.metrics || {}) as Record<string, unknown>;
      const actualDays = typeof metrics.retentionDays === "number"
        ? metrics.retentionDays
        : typeof metrics.actualRetentionDays === "number"
          ? metrics.actualRetentionDays
          : undefined;

      const coveragePercent = typeof metrics.coveragePercent === "number"
        ? metrics.coveragePercent
        : 100;

      let state: RetentionState = "UNKNOWN";
      let complianceState: RetentionComplianceState = "UNKNOWN";
      let riskState: RetentionRiskState = "UNKNOWN";

      if (actualDays !== undefined) {
        if (actualDays >= policy.retentionDays) {
          state = "HEALTHY";
          complianceState = "COMPLIANT";
          riskState = actualDays - policy.retentionDays <= 7 ? "AT_RISK" : "STABLE";
        } else if (actualDays >= policy.retentionDays - (policy.retentionWarningDays || 14)) {
          state = "WARNING";
          complianceState = "COMPLIANT";
          riskState = "AT_RISK";
        } else if (actualDays > 0) {
          state = "VIOLATION";
          complianceState = "VIOLATION";
          riskState = "IMMINENT";
        } else {
          state = "CRITICAL";
          complianceState = "VIOLATION";
          riskState = "IMMINENT";
        }
      }

      const daysUntilViolation = actualDays !== undefined
        ? Math.max(0, Math.round(actualDays - policy.retentionDays))
        : undefined;

      assessments.push({
        id: `assessment-${camera.id}`,
        tenantId,
        branchId: branch.id,
        recorderId: (camera as any).recorderId || `rec-${branch.id}`,
        cameraId: camera.id,
        cameraName: camera.name,
        requiredRetentionDays: policy.retentionDays,
        actualRetentionDays: actualDays,
        daysUntilPolicyViolation: daysUntilViolation,
        coveragePercent,
        state,
        complianceState,
        riskState,
        reason: state === "HEALTHY" ? "MEETS_POLICY" : state === "WARNING" ? "NEAR_THRESHOLD" : state === "UNKNOWN" ? "INSUFFICIENT_EVIDENCE" : "BELOW_REQUIRED_RETENTION",
        confidence: actualDays !== undefined ? 0.98 : 0.2,
        evidenceAgreement: actualDays !== undefined ? "AGREED" : "NO_EVIDENCE",
        evaluatedAt: new Date(),
        evidenceIds: [],
      });
    }

    if (cameras.length === 0) {
      summaries.push({
        branchId: branch.id,
        branchName: branch.name,
        cameraCount: 0,
        healthy: 0,
        warning: 0,
        violation: 0,
        critical: 0,
        unknown: 0,
        worstRetentionDays: undefined,
        requiredRetentionDays: policy.retentionDays,
        state: "UNKNOWN",
        complianceState: "UNKNOWN",
        riskState: "UNKNOWN",
        averageCoveragePercent: 0,
        daysUntilViolation: undefined,
        lastCheckedAt: new Date(),
      });
    } else {
      const summary = retentionSummaryService.summarizeBranch(
        branch.id,
        branch.name,
        assessments,
        policy.retentionDays
      );
      summaries.push(summary);
    }
  }

  return summaries;
}

export async function registerRetentionRoutes(app: FastifyInstance, store?: ControlPlaneStore) {
  /**
   * GET /api/v1/retention/overview & /v1/retention/overview
   */
  const handleRetentionOverview = async (request: FastifyRequest, reply: FastifyReply) => {
    const branches = await loadLiveBranchRetentionSummaries(store);
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

    let branches = await loadLiveBranchRetentionSummaries(store);

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

    if (!store) {
      return reply.code(404).send({ success: false, error: "store_unavailable" });
    }

    const branches: any[] = (await (store as any).listBranches?.()) || (await (store as any).listNodes?.("branch")) || [];
    const branch = branches.find((b: any) => b.id === branchId);
    const branchName = branch?.name || `Branch ${branchId}`;

    const cameras: any[] = (await (store as any).listCameras?.(branchId)) || [];
    const telemetry = await store.listLatestOperationalTelemetry("tenant-default", [branchId]);
    const policy = (await store.getOperationalHealthPolicy?.(branchId)) || {
      retentionDays: 90,
      retentionWarningDays: 14,
      maxRecordingGapSeconds: 60,
    };

    const cameraAssessments: RetentionAssessment[] = cameras.map((camera: any, i: number) => {
      const camTelemetry = telemetry.find(
        (t) => (t.deviceType === "camera" || t.deviceType === "archive") && t.deviceId === camera.id
      );

      const metrics = (camTelemetry?.metrics || {}) as Record<string, unknown>;
      const actualDays = typeof metrics.retentionDays === "number"
        ? metrics.retentionDays
        : typeof metrics.actualRetentionDays === "number"
          ? metrics.actualRetentionDays
          : undefined;

      const oldestDate = actualDays !== undefined ? new Date(now.getTime() - actualDays * 86_400_000) : undefined;

      const evidence: RetentionEvidence = {
        id: `ev-${camera.id}-${Date.now()}`,
        tenantId: "tenant-default",
        branchId,
        recorderId: (camera as any).recorderId || `rec-${branchId}-01`,
        cameraId: camera.id,
        source: "RECORDER_ARCHIVE",
        quality: "PLAYBACK_CONFIRMED",
        oldestRecordingAt: oldestDate,
        newestRecordingAt: actualDays !== undefined ? now : undefined,
        verifiedPlayable: actualDays !== undefined,
        observedAt: now,
        confidence: actualDays !== undefined ? 0.98 : 0.2,
      };

      retentionEvidenceService.recordEvidence(evidence);

      return retentionPolicyService.assess({
        tenantId: "tenant-default",
        branchId,
        recorderId: (camera as any).recorderId || `rec-${branchId}-01`,
        cameraId: camera.id,
        cameraName: camera.name,
        evidenceList: [evidence],
        now,
      });
    });

    const summary = retentionSummaryService.summarizeBranch(
      branchId,
      branchName,
      cameraAssessments,
      policy.retentionDays
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

    const telemetry = store ? await store.listLatestOperationalTelemetry("tenant-default") : [];
    const camTelemetry = telemetry.find(
      (t) => (t.deviceType === "camera" || t.deviceType === "archive") && t.deviceId === cameraId
    );

    const metrics = (camTelemetry?.metrics || {}) as Record<string, unknown>;
    const actualDays = typeof metrics.retentionDays === "number" ? metrics.retentionDays : undefined;

    const recorderEvidence: RetentionEvidence = {
      id: `ev-rec-${cameraId}`,
      tenantId: "tenant-default",
      branchId: camTelemetry?.branchId || "branch-default",
      recorderId: (camTelemetry as any)?.recorderId || "rec-default",
      cameraId,
      source: "RECORDER_ARCHIVE",
      quality: "PLAYBACK_CONFIRMED",
      oldestRecordingAt: actualDays ? new Date(now.getTime() - actualDays * 86_400_000) : undefined,
      newestRecordingAt: actualDays ? now : undefined,
      verifiedPlayable: actualDays !== undefined,
      recordingGapMinutes: 0,
      observedAt: now,
      confidence: actualDays ? 0.98 : 0.2,
    };

    const platformEvidence: RetentionEvidence = {
      id: `ev-plat-${cameraId}`,
      tenantId: "tenant-default",
      branchId: camTelemetry?.branchId || "branch-default",
      recorderId: (camTelemetry as any)?.recorderId || "rec-default",
      cameraId,
      source: "PLATFORM_INDEX",
      quality: "INDEX_ONLY",
      oldestRecordingAt: actualDays ? new Date(now.getTime() - actualDays * 86_400_000) : undefined,
      newestRecordingAt: actualDays ? now : undefined,
      verifiedPlayable: false,
      observedAt: now,
      confidence: actualDays ? 0.92 : 0.2,
    };

    const assessment = retentionPolicyService.assess({
      tenantId: "tenant-default",
      branchId: camTelemetry?.branchId || "branch-default",
      recorderId: (camTelemetry as any)?.recorderId || "rec-default",
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
    const branches = await loadLiveBranchRetentionSummaries(store);
    const report = retentionReportService.generateDailyReport(
      new Date().toISOString().slice(0, 10),
      branches,
      [],
      []
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

  /**
   * Enterprise Retention Engine Endpoints
   */
  // 1. Camera Comprehensive Retention Status
  app.get("/v1/retention/engine/cameras/:cameraId", async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { cameraId: string };
    const query = (request.query as any) || {};
    const status = retentionEngine.evaluateCameraRetention({
      cameraId: params.cameraId,
      cameraGroup: query.cameraGroup || "ATM",
      branchId: query.branchId || "BR-118",
      tenantId: query.tenantId || "BANK-001",
    });
    return reply.send({ success: true, data: status });
  });

  // 2. Branch Retention Overview & Capacity Forecast
  app.get("/v1/retention/engine/branches/:branchId", async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { branchId: string };
    const overview = retentionEngine.getBranchOverview(params.branchId);
    return reply.send({ success: true, data: overview });
  });

  // 3. Pre-Deployment Retention Policy Simulation
  app.post("/v1/retention/simulate", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = z.object({
      tenantId: z.string().default("BANK-001"),
      policyName: z.string().default("ATM 180-Day Regulatory Policy"),
      targetScope: z.object({
        branches: z.array(z.string()).optional(),
        cameraGroups: z.array(z.string()).optional(),
        cameras: z.array(z.string()).optional(),
      }).default({}),
      proposedMinimumDays: z.number().int().min(1).default(180),
      proposedTargetDays: z.number().int().min(1).default(190),
    }).parse(request.body);

    const simulation = retentionEngine.simulateRetentionChange(body);
    return reply.send({ success: true, data: simulation });
  });

  // 4. Create Legal Hold
  app.post("/v1/retention/legal-holds", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = z.object({
      tenantId: z.string().default("BANK-001"),
      caseNumber: z.string(),
      reason: z.string(),
      createdBy: z.string().default("sec-officer"),
      scope: z.object({
        branches: z.array(z.string()).optional(),
        cameras: z.array(z.string()).optional(),
        startTime: z.coerce.date(),
        endTime: z.coerce.date(),
      }),
    }).parse(request.body);

    const hold = retentionEngine.createLegalHold(body);
    return reply.status(201).send({ success: true, data: hold });
  });

  // 5. Release Legal Hold
  app.post("/v1/retention/legal-holds/:id/release", async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { id: string };
    const body = z.object({ approvedBy: z.string().default("chief-security-officer") }).parse(request.body);
    const released = retentionEngine.releaseLegalHold(params.id, body.approvedBy);
    if (!released) return reply.code(404).send({ success: false, error: "LEGAL_HOLD_NOT_FOUND" });
    return reply.send({ success: true, data: released });
  });

  // 6. List Active Legal Holds
  app.get("/v1/retention/legal-holds", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = (request.query as any) || {};
    const holds = retentionEngine.getLegalHolds(query.cameraId, query.branchId);
    return reply.send({ success: true, data: holds });
  });
}
