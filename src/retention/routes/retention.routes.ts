/**
 * Retention Compliance REST API Routes
 * Connected directly to live database / ControlPlaneStore for real-time fleet compliance.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../../control-plane-store.js";
import type { User } from "../../domain/models.js";
import {
  retentionSummaryService,
  retentionReportService,
  retentionAuditService,
  type BranchRetentionSummary,
  type RetentionAssessment,
  type RetentionState,
  type RetentionComplianceState,
  type RetentionRiskState,
} from "../index.js";

async function loadLiveBranchRetentionSummaries(store: ControlPlaneStore | undefined, user: User): Promise<BranchRetentionSummary[]> {
  if (!store) return [];

  const branches = await store.listAccessibleNodes(user, "recording:view", "branch");
  if (!branches || branches.length === 0) return [];

  const summaries: BranchRetentionSummary[] = [];

  for (const branch of branches) {
    const cameras = await store.listCamerasByBranch(user, branch.id, "recording:view");
    const telemetry = await store.listLatestOperationalTelemetry(user.tenantId, [branch.id]);
    const policy = await store.getOperationalHealthPolicy(user.tenantId, branch.id)
      ?? await store.getOperationalHealthPolicy(user.tenantId);
    if (!policy) continue;

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
        : undefined;

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
        tenantId: user.tenantId,
        branchId: branch.id,
        recorderId: camera.recorderId ?? "unreported",
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
  const requireUser = (request: FastifyRequest, reply: FastifyReply): User | null => {
    if (!request.currentUser) {
      reply.code(401).send({ success: false, error: "Authentication required" });
      return null;
    }
    return request.currentUser;
  };
  /**
   * GET /api/v1/retention/overview & /v1/retention/overview
   */
  const handleRetentionOverview = async (request: FastifyRequest, reply: FastifyReply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const branches = await loadLiveBranchRetentionSummaries(store, user);
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
    const user = requireUser(request, reply);
    if (!user) return;
    const query = z
      .object({
        filter: z.enum(["all", "healthy", "warning", "violation", "critical", "unknown", "at_risk"]).optional(),
        search: z.string().optional(),
        limit: z.coerce.number().default(50),
        offset: z.coerce.number().default(0),
      })
      .parse(request.query);

    let branches = await loadLiveBranchRetentionSummaries(store, user);

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
    const user = requireUser(request, reply);
    if (!user) return;
    const { branchId } = z.object({ branchId: z.string() }).parse(request.params);
    const now = new Date();

    if (!store) {
      return reply.code(404).send({ success: false, error: "store_unavailable" });
    }

    const branch = await store.getNode(branchId);
    const access = branch ? await store.checkAccess(user, "recording:view", branchId) : undefined;
    if (!branch || branch.type !== "branch" || branch.tenantId !== user.tenantId || !access?.allowed) {
      return reply.code(404).send({ success: false, error: "branch_not_found" });
    }
    const branchName = branch.name;
    const cameras = await store.listCamerasByBranch(user, branchId, "recording:view");
    const telemetry = await store.listLatestOperationalTelemetry(user.tenantId, [branchId]);
    const policy = await store.getOperationalHealthPolicy(user.tenantId, branchId)
      ?? await store.getOperationalHealthPolicy(user.tenantId);
    if (!policy) return reply.code(409).send({ success: false, error: "retention_policy_not_configured" });

    const cameraAssessments: RetentionAssessment[] = cameras.map((camera) => {
      const camTelemetry = telemetry.find(
        (t) => (t.deviceType === "camera" || t.deviceType === "archive") && t.deviceId === camera.id
      );

      const metrics = (camTelemetry?.metrics || {}) as Record<string, unknown>;
      const actualDays = typeof metrics.retentionDays === "number"
        ? metrics.retentionDays
        : typeof metrics.actualRetentionDays === "number"
          ? metrics.actualRetentionDays
          : undefined;

      const coveragePercent = typeof metrics.coveragePercent === "number" ? metrics.coveragePercent : undefined;
      const state: RetentionState = actualDays === undefined ? "UNKNOWN"
        : actualDays >= policy.retentionDays ? "HEALTHY"
          : actualDays >= policy.retentionDays - policy.retentionWarningDays ? "WARNING"
            : actualDays > 0 ? "VIOLATION" : "CRITICAL";
      return {
        id: `assessment-${camera.id}`,
        tenantId: user.tenantId,
        branchId,
        recorderId: camera.recorderId ?? "unreported",
        cameraId: camera.id,
        cameraName: camera.name,
        requiredRetentionDays: policy.retentionDays,
        actualRetentionDays: actualDays,
        daysUntilPolicyViolation: actualDays === undefined ? undefined : Math.max(0, actualDays - policy.retentionDays),
        coveragePercent,
        state,
        complianceState: state === "HEALTHY" || state === "WARNING" ? "COMPLIANT" : state === "UNKNOWN" ? "UNKNOWN" : "VIOLATION",
        riskState: state === "HEALTHY" ? "STABLE" : state === "WARNING" ? "AT_RISK" : state === "UNKNOWN" ? "UNKNOWN" : "IMMINENT",
        reason: state === "HEALTHY" ? "MEETS_POLICY" : state === "WARNING" ? "NEAR_THRESHOLD" : state === "UNKNOWN" ? "INSUFFICIENT_EVIDENCE" : "BELOW_REQUIRED_RETENTION",
        confidence: actualDays === undefined ? 0 : 0.7,
        evidenceAgreement: actualDays === undefined ? "NO_EVIDENCE" : "SINGLE_SOURCE",
        evaluatedAt: now,
        evidenceIds: [],
      };
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
    const user = requireUser(request, reply);
    if (!user) return;
    const { cameraId } = z.object({ cameraId: z.string() }).parse(request.params);
    const now = new Date();
    if (!store) return reply.code(503).send({ success: false, error: "store_unavailable" });
    const camera = await store.getCamera(cameraId);
    if (!camera) return reply.code(404).send({ success: false, error: "camera_not_found" });
    const access = await store.checkAccess(user, "recording:view", camera.nodeId);
    if (!access?.allowed) return reply.code(404).send({ success: false, error: "camera_not_found" });
    const telemetry = await store.listLatestOperationalTelemetry(user.tenantId, [camera.branchId]);
    const camTelemetry = telemetry.find(
      (t) => (t.deviceType === "camera" || t.deviceType === "archive") && t.deviceId === cameraId
    );
    const metrics = (camTelemetry?.metrics || {}) as Record<string, unknown>;
    const actualDays = typeof metrics.retentionDays === "number" ? metrics.retentionDays : undefined;
    const policy = await store.getOperationalHealthPolicy(user.tenantId, camera.branchId)
      ?? await store.getOperationalHealthPolicy(user.tenantId);
    if (!policy) return reply.code(409).send({ success: false, error: "retention_policy_not_configured" });
    const state: RetentionState = actualDays === undefined ? "UNKNOWN"
      : actualDays >= policy.retentionDays ? "HEALTHY"
        : actualDays >= policy.retentionDays - policy.retentionWarningDays ? "WARNING"
          : actualDays > 0 ? "VIOLATION" : "CRITICAL";
    const verified = camTelemetry?.quality === "verified";
    const assessment: RetentionAssessment = {
      id: `assessment-${cameraId}`,
      tenantId: user.tenantId,
      branchId: camera.branchId,
      recorderId: camera.recorderId ?? "unreported",
      cameraId,
      cameraName: camera.name,
      requiredRetentionDays: policy.retentionDays,
      actualRetentionDays: actualDays,
      coveragePercent: typeof metrics.coveragePercent === "number" ? metrics.coveragePercent : undefined,
      daysUntilPolicyViolation: actualDays === undefined ? undefined : Math.max(0, actualDays - policy.retentionDays),
      state,
      complianceState: state === "HEALTHY" || state === "WARNING" ? "COMPLIANT" : state === "UNKNOWN" ? "UNKNOWN" : "VIOLATION",
      riskState: state === "HEALTHY" ? "STABLE" : state === "WARNING" ? "AT_RISK" : state === "UNKNOWN" ? "UNKNOWN" : "IMMINENT",
      reason: state === "HEALTHY" ? "MEETS_POLICY" : state === "WARNING" ? "NEAR_THRESHOLD" : state === "UNKNOWN" ? "INSUFFICIENT_EVIDENCE" : "BELOW_REQUIRED_RETENTION",
      confidence: actualDays === undefined ? 0 : verified ? 0.9 : 0.5,
      evidenceAgreement: actualDays === undefined ? "NO_EVIDENCE" : "SINGLE_SOURCE",
      evaluatedAt: now,
      evidenceIds: [],
    };

    return reply.send({
      success: true,
      data: {
        assessment,
        evidence: [],
        observation: camTelemetry ? {
          source: camTelemetry.source,
          quality: camTelemetry.quality,
          observedAt: camTelemetry.observedAt,
        } : null,
      },
    });
  };

  app.get("/api/v1/cameras/:cameraId/retention/evidence", handleCameraEvidence);
  app.get("/v1/cameras/:cameraId/retention/evidence", handleCameraEvidence);

  /**
   * GET /api/v1/retention/reports/daily & /v1/retention/reports/daily
   */
  const handleDailyReport = async (request: FastifyRequest, reply: FastifyReply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const branches = await loadLiveBranchRetentionSummaries(store, user);
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
    const user = requireUser(request, reply);
    if (!user) return;
    const logs = retentionAuditService.getAuditLogs(user.tenantId, 50);
    return reply.send({
      success: true,
      data: logs,
    });
  };

  app.get("/api/v1/retention/audit", handleRetentionAudit);
  app.get("/v1/retention/audit", handleRetentionAudit);

}
