import type { FastifyInstance } from "fastify";
import type { ControlPlaneStore } from "../control-plane-store.js";
import {
  AdvancedDeduplicationService,
  advancedDeduplicationService,
} from "../alerts/services/advanced-deduplication.service.js";
import {
  DeduplicationPolicyService,
  deduplicationPolicyService,
} from "../alerts/services/deduplication-policy.service.js";
import {
  UnifiedAiAlertService,
  unifiedAiAlertService,
} from "../alerts/services/unified-ai-alert.service.js";

export async function registerDeduplicationRoutes(
  app: FastifyInstance,
  store?: ControlPlaneStore,
  customDedup?: AdvancedDeduplicationService,
  customPolicy?: DeduplicationPolicyService,
  customAlertService?: UnifiedAiAlertService,
) {
  const dedup = customDedup ?? advancedDeduplicationService;
  const policy = customPolicy ?? deduplicationPolicyService;
  const alertService = customAlertService ?? unifiedAiAlertService;

  const registerEndpoints = (prefix: string) => {
    // 1. Ingest Raw High-Frequency Detection Stream
    app.post(`${prefix}/alerts/detections/ingest`, async (request, reply) => {
      const body = request.body as any;
      if (!body || !body.branchId || !body.cameraId || !body.detectionType) {
        return reply.code(400).send({
          success: false,
          error: "branchId, cameraId, and detectionType are required",
        });
      }

      const detection = {
        id: body.id ?? `det-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tenantId: body.tenantId ?? "tenant-bank-01",
        branchId: body.branchId,
        cameraId: body.cameraId,
        detectorId: body.detectorId ?? "yolo-v8-edge",
        detectorVersion: body.detectorVersion ?? "1.0",
        detectionType: body.detectionType,
        detectedAt: body.detectedAt ? new Date(body.detectedAt) : new Date(),
        confidence: body.confidence ?? 0.95,
        trackId: body.trackId,
        objectClass: body.objectClass ?? "person",
        boundingBox: body.boundingBox,
        zoneId: body.zoneId ?? "VAULT",
        metadata: body.metadata ?? {},
      };

      const result = await alertService.ingestDetection(detection);
      return reply.code(200).send({
        success: true,
        data: result,
      });
    });

    // 2. View Deduplication Metrics & Suppression Ratios
    app.get(`${prefix}/alerts/deduplication/metrics`, async (request, reply) => {
      const metrics = dedup.getMetrics();
      return reply.code(200).send({
        success: true,
        data: metrics,
      });
    });

    // 3. View Deduplication Policies
    app.get(`${prefix}/alerts/deduplication/policies`, async (request, reply) => {
      const policies = policy.listPolicies();
      return reply.code(200).send({
        success: true,
        data: policies,
      });
    });

    // 4. View Active Event Deduplication Windows
    app.get(`${prefix}/alerts/events/active`, async (request, reply) => {
      const active = dedup.getActiveWindows();
      return reply.code(200).send({
        success: true,
        count: active.length,
        data: active,
      });
    });
  };

  registerEndpoints("/v1");
  registerEndpoints("/api/v1");
  registerEndpoints("/api");
}
