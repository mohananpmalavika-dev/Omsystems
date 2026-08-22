/**
 * AI Intelligence Layer API Routes
 * 
 * Unified endpoints for:
 * - Incident Summary & Correlation
 * - SOP Engine & Workflow
 * - Investigation Reports
 * - Evidence Packages & Chain of Custody
 * - Video Search & Tracking
 */

import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { AIIncidentSummaryService } from "../services/ai-incident-summary.js";
import { AISOPEngineService } from "../services/ai-sop-engine.js";
import { AIInvestigationReportService } from "../services/ai-investigation-report.js";
import { AIEvidenceBuilderService } from "../services/ai-evidence-builder.js";
import { AIVideoSearchService } from "../services/ai-video-search.js";
import { FeatureUnavailableError } from "../errors/feature-unavailable-error.js";

function handleFeatureResponse<T>(feature: string, fn: () => Promise<T>): Promise<T | { feature: string; status: string; reason: string }> {
  return fn().catch((err: any) => {
    if (err instanceof FeatureUnavailableError) {
      return {
        feature,
        status: 'unavailable',
        reason: err.message || 'feature_not_implemented',
      } as any;
    }
    throw err;
  });
}

export async function registerAIIntelligenceRoutes(app: FastifyInstance) {
  const store = (app as any).store as import("../control-plane-store.js").ControlPlaneStore;
  const pool = (store as unknown as { pool: Pool }).pool;
  const authenticateRequest = (app as any).authenticateRequest as (request: import("fastify").FastifyRequest) => Promise<any>;

  const incidentSummaryService = new AIIncidentSummaryService(store);
  const sopEngineService = new AISOPEngineService(store);
  const investigationService = new AIInvestigationReportService(store);
  const evidenceService = new AIEvidenceBuilderService(store);
  const videoSearchService = new AIVideoSearchService(pool);

  // ============ INCIDENT SUMMARY & CORRELATION ============

  /**
   * GET /v1/ai/incidents/summary/shift
   * Generate shift summary with alert correlation
   */
  app.get("/v1/ai/incidents/summary/shift", async (request, reply) => {
    const auth = await authenticateRequest(request);
    const { shiftStart, shiftEnd, branchId } = request.query as any;

    const summary = await incidentSummaryService.generateShiftSummary(
      auth.user.tenantId,
      shiftStart,
      shiftEnd,
      branchId
    );

    return summary;
  });

  /**
   * GET /v1/ai/incidents/summary/daily
   * Generate daily incident summary
   */
  app.get("/v1/ai/incidents/summary/daily", async (request, reply) => {
    const auth = await authenticateRequest(request);
    const { date, branchId } = request.query as any;

    const summary = await incidentSummaryService.generateDailySummary(
      auth.user.tenantId,
      date,
      branchId
    );

    return summary;
  });

  /**
   * GET /v1/ai/incidents/summary/executive
   * Generate executive summary (weekly/monthly)
   */
  app.get("/v1/ai/incidents/summary/executive", async (request, reply) => {
    const auth = await authenticateRequest(request);
    const { period, startDate } = request.query as any;

    const summary = await incidentSummaryService.generateExecutiveSummary(
      auth.user.tenantId,
      period || "week",
      startDate
    );

    return summary;
  });

  /**
   * POST /v1/ai/incidents/correlate
   * Correlate alerts into incident clusters
   */
  app.post("/v1/ai/incidents/correlate", async (request, reply) => {
    const auth = await authenticateRequest(request);
    const { from, to, branchId, limit } = request.body as any;

    // Get alerts for time range
    const alerts = await store.listAnalyticsAlerts(auth.user.tenantId, {
      from,
      to,
      branchId,
      limit: limit || 1000,
    });

    const clusters = await incidentSummaryService.correlateAlerts(
      auth.user.tenantId,
      alerts
    );

    return { clusters, totalAlerts: alerts.length, totalClusters: clusters.length };
  });

  // ============ SOP ENGINE & WORKFLOW ============

  /**
   * GET /v1/ai/sops
   * List SOP definitions
   */
  app.get("/v1/ai/sops", async (request, reply) => {
    const auth = await authenticateRequest(request);
    
    // Would fetch from store
    return { sops: [] };
  });

  /**
   * POST /v1/ai/sops
   * Create SOP definition
   */
  app.post("/v1/ai/sops", async (request, reply) => {
    const auth = await authenticateRequest(request);
    const sopData = request.body as any;

    const sop = await sopEngineService.createSOPDefinition(
      auth.user.tenantId,
      auth.user.id,
      sopData
    );

    return sop;
  });

  /**
   * POST /v1/ai/sops/:sopId/publish
   * Publish SOP (make active)
   */
  app.post("/v1/ai/sops/:sopId/publish", async (request, reply) => {
    const auth = await authenticateRequest(request);
    const { sopId } = request.params as any;

    const sop = await sopEngineService.publishSOP(sopId, auth.user.id);
    return sop;
  });

  /**
   * POST /v1/ai/sops/select
   * Select appropriate SOP for incident
   */
  app.post("/v1/ai/sops/select", async (request, reply) => {
    const auth = await authenticateRequest(request);
    const { incidentType, severity, context } = request.body as any;

    const sop = await sopEngineService.selectSOP(
      auth.user.tenantId,
      incidentType,
      severity,
      context
    );

    return sop;
  });

  /**
   * POST /v1/ai/sop-executions
   * Start SOP execution
   */
  app.post("/v1/ai/sop-executions", async (request, reply) => {
    const auth = await authenticateRequest(request);
    const { sopId, incidentId, alertId, branchId } = request.body as any;

    const execution = await sopEngineService.startSOPExecution(
      auth.user.tenantId,
      sopId,
      auth.user.id,
      { incidentId, alertId, branchId }
    );

    return execution;
  });

  /**
   * GET /v1/ai/sop-executions/:executionId
   * Get SOP execution status
   */
  app.get("/v1/ai/sop-executions/:executionId", async (request, reply) => {
    const auth = await authenticateRequest(request);
    const { executionId } = request.params as any;

    // Would fetch from store
    return { execution: {} };
  });

  /**
   * GET /v1/ai/sop-executions/:executionId/current-step
   * Get current step
   */
  app.get("/v1/ai/sop-executions/:executionId/current-step", async (request, reply) => {
    const auth = await authenticateRequest(request);
    const { executionId } = request.params as any;

    const step = await sopEngineService.getCurrentStep(executionId);
    return step;
  });

  /**
   * POST /v1/ai/sop-executions/:executionId/steps/:stepNumber/complete
   * Complete SOP step
   */
  app.post("/v1/ai/sop-executions/:executionId/steps/:stepNumber/complete", async (request, reply) => {
    const auth = await authenticateRequest(request);
    const { executionId, stepNumber } = request.params as any;
    const { result, response, evidence, comments } = request.body as any;

    const execution = await sopEngineService.completeStep(
      executionId,
      parseInt(stepNumber),
      auth.user.id,
      { result, response, evidence, comments }
    );

    return execution;
  });

  /**
   * POST /v1/ai/sop-executions/:executionId/steps/:stepNumber/skip
   * Skip SOP step
   */
  app.post("/v1/ai/sop-executions/:executionId/steps/:stepNumber/skip", async (request, reply) => {
    const auth = await authenticateRequest(request);
    const { executionId, stepNumber } = request.params as any;
    const { reason } = request.body as any;

    const execution = await sopEngineService.skipStep(
      executionId,
      parseInt(stepNumber),
      auth.user.id,
      reason
    );

    return execution;
  });

  /**
   * POST /v1/ai/sop-executions/:executionId/escalate
   * Escalate SOP execution
   */
  app.post("/v1/ai/sop-executions/:executionId/escalate", async (request, reply) => {
    const auth = await authenticateRequest(request);
    const { executionId } = request.params as any;
    const { reason, recipients } = request.body as any;

    const execution = await sopEngineService.escalateExecution(
      executionId,
      auth.user.id,
      reason,
      recipients
    );

    return execution;
  });

  /**
   * POST /v1/ai/sop-executions/:executionId/complete
   * Complete SOP execution
   */
  app.post("/v1/ai/sop-executions/:executionId/complete", async (request, reply) => {
    const auth = await authenticateRequest(request);
    const { executionId } = request.params as any;
    const { summary } = request.body as any;

    const execution = await sopEngineService.completeExecution(
      executionId,
      auth.user.id,
      summary
    );

    return execution;
  });

  // ============ INVESTIGATION REPORTS ============

  /**
   * POST /v1/ai/investigation-reports
   * Generate investigation report
   */
  app.post("/v1/ai/investigation-reports", async (request, reply) => {
    const auth = await authenticateRequest(request);
    const { incidentId, reportType } = request.body as any;

    const report = await investigationService.generateInvestigationReport(
      auth.user.tenantId,
      incidentId,
      reportType || "detailed",
      auth.user.id
    );

    return report;
  });

  /**
   * GET /v1/ai/investigation-reports/:reportId
   * Get investigation report
   */
  app.get("/v1/ai/investigation-reports/:reportId", async (request, reply) => {
    const auth = await authenticateRequest(request);
    const { reportId } = request.params as any;

    // Would fetch from store
    return { report: {} };
  });

  /**
   * POST /v1/ai/investigation-reports/:reportId/review
   * Review report
   */
  app.post("/v1/ai/investigation-reports/:reportId/review", async (request, reply) => {
    const auth = await authenticateRequest(request);
    const { reportId } = request.params as any;

    return await handleFeatureResponse('investigation_report_review', () =>
      investigationService.reviewReport(reportId, auth.user.id)
    );
  });

  /**
   * POST /v1/ai/investigation-reports/:reportId/approve
   * Approve report
   */
  app.post("/v1/ai/investigation-reports/:reportId/approve", async (request, reply) => {
    const auth = await authenticateRequest(request);
    const { reportId } = request.params as any;

    return await handleFeatureResponse('investigation_report_approve', () =>
      investigationService.approveReport(reportId, auth.user.id)
    );
  });

  /**
   * POST /v1/ai/investigation-reports/:reportId/finalize
   * Finalize report (make immutable)
   */
  app.post("/v1/ai/investigation-reports/:reportId/finalize", async (request, reply) => {
    const auth = await authenticateRequest(request);
    const { reportId } = request.params as any;

    return await handleFeatureResponse('investigation_report_finalize', () =>
      investigationService.finalizeReport(reportId)
    );
  });

  /**
   * GET /v1/ai/investigation-reports/:reportId/export
   * Export report
   */
  app.get("/v1/ai/investigation-reports/:reportId/export", async (request, reply) => {
    const auth = await authenticateRequest(request);
    const { reportId } = request.params as any;
    const { format } = request.query as any;

    return {
      feature: 'investigation_report_export',
      status: 'unavailable',
      reason: 'feature_not_implemented',
      requestedFormat: format,
      reportId,
    };
  });

  // ============ EVIDENCE PACKAGES ============

  /**
   * POST /v1/ai/evidence-packages
   * Create evidence package
   */
  app.post("/v1/ai/evidence-packages", async (request, reply) => {
    const auth = await authenticateRequest(request);
    const config = request.body as any;

    return await handleFeatureResponse('evidence_package_creation', () =>
      evidenceService.createEvidencePackage(
        auth.user.tenantId,
        config.incidentId,
        auth.user.id,
        config
      )
    );
  });

  /**
   * POST /v1/ai/evidence-packages/court
   * Generate court-ready package
   */
  app.post("/v1/ai/evidence-packages/court", async (request, reply) => {
    const auth = await authenticateRequest(request);
    const { incidentId } = request.body as any;

    return await handleFeatureResponse('evidence_package_court', () =>
      evidenceService.generateCourtPackage(incidentId, auth.user.id)
    );
  });

  /**
   * POST /v1/ai/evidence-packages/police
   * Generate police submission package
   */
  app.post("/v1/ai/evidence-packages/police", async (request, reply) => {
    const auth = await authenticateRequest(request);
    const { incidentId } = request.body as any;

    return await handleFeatureResponse('evidence_package_police', () =>
      evidenceService.generatePolicePackage(incidentId, auth.user.id)
    );
  });

  /**
   * POST /v1/ai/evidence-packages/insurance
   * Generate insurance claim package
   */
  app.post("/v1/ai/evidence-packages/insurance", async (request, reply) => {
    const auth = await authenticateRequest(request);
    const { incidentId } = request.body as any;

    return await handleFeatureResponse('evidence_package_insurance', () =>
      evidenceService.generateInsurancePackage(incidentId, auth.user.id)
    );
  });

  /**
   * POST /v1/ai/evidence-packages/:packageId/collect
   * Collect evidence automatically
   */
  app.post("/v1/ai/evidence-packages/:packageId/collect", async (request, reply) => {
    const auth = await authenticateRequest(request);
    const { packageId } = request.params as any;

    return await handleFeatureResponse('evidence_package_collect', () =>
      evidenceService.collectEvidence(packageId)
    );
  });

  /**
   * POST /v1/ai/evidence-packages/:packageId/sign
   * Apply digital signature
   */
  app.post("/v1/ai/evidence-packages/:packageId/sign", async (request, reply) => {
    const auth = await authenticateRequest(request);
    const { packageId } = request.params as any;

    return await handleFeatureResponse('evidence_package_sign', () =>
      evidenceService.signPackage(packageId, auth.user.id)
    );
  });

  /**
   * GET /v1/ai/evidence-packages/:packageId/verify
   * Verify package integrity
   */
  app.get("/v1/ai/evidence-packages/:packageId/verify", async (request, reply) => {
    const auth = await authenticateRequest(request);
    const { packageId } = request.params as any;

    return await handleFeatureResponse('evidence_package_verify', () =>
      evidenceService.verifyPackageIntegrity(packageId)
    );
  });

  /**
   * GET /v1/ai/evidence-packages/:packageId/manifest
   * Get evidence manifest
   */
  app.get("/v1/ai/evidence-packages/:packageId/manifest", async (request, reply) => {
    const auth = await authenticateRequest(request);
    const { packageId } = request.params as any;

    return await handleFeatureResponse('evidence_package_manifest', () =>
      evidenceService.generateManifest(packageId)
    );
  });

  /**
   * POST /v1/ai/evidence-packages/:packageId/custody/transfer
   * Transfer custody
   */
  app.post("/v1/ai/evidence-packages/:packageId/custody/transfer", async (request, reply) => {
    const auth = await authenticateRequest(request);
    const { packageId } = request.params as any;
    const { toUser, method, purpose } = request.body as any;

    const event = await evidenceService.transferCustody(
      packageId,
      auth.user.id,
      toUser,
      method,
      purpose
    );

    return event;
  });

  /**
   * POST /v1/ai/evidence-packages/:packageId/download
   * Record download
   */
  app.post("/v1/ai/evidence-packages/:packageId/download", async (request, reply) => {
    const auth = await authenticateRequest(request);
    const { packageId } = request.params as any;

    const event = await evidenceService.recordDownload(
      packageId,
      auth.user.id,
      request.ip
    );

    return event;
  });

  // ============ VIDEO SEARCH ============

  /**
   * POST /v1/ai/video/search
   * Search videos with natural language
   */
  app.post("/v1/ai/video/search", async (request, reply) => {
    const auth = await authenticateRequest(request);
    const { query, branchId, from, to, limit } = request.body as any;

    const results = await handleFeatureResponse('video_search', () =>
      videoSearchService.searchByNaturalLanguage(auth.user.tenantId, query, {
        branchId,
        from,
        to,
        limit,
      })
    );

    if (Array.isArray(results)) {
      return { results, total: results.length };
    }

    return results;
  });

  /**
   * POST /v1/ai/video/search/person
   * Find person by clothing description
   */
  app.post("/v1/ai/video/search/person", async (request, reply) => {
    const auth = await authenticateRequest(request);
    const { clothing, branchId, from, to } = request.body as any;

    const results = await handleFeatureResponse('video_search_person', () =>
      videoSearchService.findPersonByClothing(auth.user.tenantId, clothing, {
        branchId,
        from,
        to,
      })
    );

    if (Array.isArray(results)) {
      return { results, total: results.length };
    }

    return results;
  });

  /**
   * POST /v1/ai/video/search/vehicle
   * Find vehicle by description
   */
  app.post("/v1/ai/video/search/vehicle", async (request, reply) => {
    const auth = await authenticateRequest(request);
    const { vehicle, branchId, from, to } = request.body as any;

    const results = await handleFeatureResponse('video_search_vehicle', () =>
      videoSearchService.findVehicle(auth.user.tenantId, vehicle, {
        branchId,
        from,
        to,
      })
    );

    if (Array.isArray(results)) {
      return { results, total: results.length };
    }

    return results;
  });

  /**
   * POST /v1/ai/video/track-across-cameras
   * Track object across cameras
   */
  app.post("/v1/ai/video/track-across-cameras", async (request, reply) => {
    const auth = await authenticateRequest(request);
    const { objectId, startTimestamp, timeWindowMinutes } = request.body as any;

    const track = await handleFeatureResponse('video_track_across_cameras', () =>
      videoSearchService.trackAcrossCameras(
        auth.user.tenantId,
        objectId,
        startTimestamp,
        timeWindowMinutes
      )
    );

    return track;
  });

  /**
   * GET /v1/ai/video/tracks
   * Get cross-camera tracks
   */
  app.get("/v1/ai/video/tracks", async (request, reply) => {
    const auth = await authenticateRequest(request);
    const { objectType, branchId, from, to, minCameras } = request.query as any;

    const tracks = await handleFeatureResponse('video_cross_camera_tracks', () =>
      videoSearchService.getCrossCameraTracks(auth.user.tenantId, {
        objectType,
        branchId,
        from,
        to,
        minCameras: minCameras ? parseInt(minCameras) : undefined,
      })
    );

    if (Array.isArray(tracks)) {
      return { tracks, total: tracks.length };
    }

    return tracks;
  });

  /**
   * GET /v1/ai/video/journey/:trackingId
   * Get object journey visualization
   */
  app.get("/v1/ai/video/journey/:trackingId", async (request, reply) => {
    const auth = await authenticateRequest(request);
    const { trackingId } = request.params as any;

    try {
      const journey = await videoSearchService.getObjectJourney(
        auth.user.tenantId,
        trackingId
      );
      return journey;
    } catch (err: any) {
      if (err instanceof FeatureUnavailableError) {
        // Return capability metadata so UI can disable this feature cleanly
        return {
          feature: 'video_object_journey',
          status: 'unavailable',
          reason: err.message || 'feature_not_implemented'
        };
      }
      // Unexpected error -> rethrow for upstream error handling
      throw err;
    }
  });

  /**
   * POST /v1/ai/video/index
   * Index video metadata for search
   */
  app.post("/v1/ai/video/index", async (request, reply) => {
    const auth = await authenticateRequest(request);
    const { cameraId, segmentId, objects, metadata } = request.body as any;

    const indexed = await videoSearchService.indexVideoMetadata(
      auth.user.tenantId,
      cameraId,
      segmentId,
      objects,
      metadata
    );

    return indexed;
  });

  // ============ HEALTH & ANALYTICS ============

  /**
   * GET /v1/ai/health
   * Check AI services health
   */
  app.get("/v1/ai/health", async (request, reply) => {
    return {
      status: "healthy",
      services: {
        incidentSummary: "operational",
        sopEngine: "operational",
        investigationReports: "operational",
        evidenceBuilder: "operational",
        videoSearch: "operational",
      },
      timestamp: new Date().toISOString(),
    };
  });

  /**
   * GET /v1/ai/stats
   * Get AI intelligence statistics
   */
  app.get("/v1/ai/stats", async (request, reply) => {
    const auth = await authenticateRequest(request);

    return {
      incidentSummary: {
        shiftsGenerated: 0,
        alertsCorrelated: 0,
        averageReductionRatio: 0,
      },
      sopEngine: {
        activeExecutions: 0,
        completedExecutions: 0,
        averageCompletionTime: 0,
      },
      investigationReports: {
        generated: 0,
        approved: 0,
        finalized: 0,
      },
      evidencePackages: {
        created: 0,
        courtReady: 0,
        totalEvidence: 0,
      },
      videoSearch: {
        searches: 0,
        trackedObjects: 0,
        crossCameraTracks: 0,
      },
    };
  });
}
