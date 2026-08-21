import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
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
      const user = request.currentUser;
      if (!user) return reply.code(401).send({ success: false, error: "Authentication required" });
      const body = z.object({
        id: z.string().min(1).optional(),
        branchId: z.string().min(1),
        cameraId: z.string().min(1),
        detectorId: z.string().min(1),
        detectorVersion: z.string().min(1),
        detectionType: z.string().min(1),
        detectedAt: z.coerce.date(),
        confidence: z.number().min(0).max(1),
        trackId: z.string().optional(),
        objectClass: z.string().min(1),
        boundingBox: z.object({
          x: z.number().finite(),
          y: z.number().finite(),
          width: z.number().finite().positive(),
          height: z.number().finite().positive(),
        }).optional(),
        zoneId: z.string().min(1),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }).parse(request.body);

      const detection = {
        id: body.id ?? `det-${randomUUID()}`,
        tenantId: user.tenantId,
        branchId: body.branchId,
        cameraId: body.cameraId,
        detectorId: body.detectorId,
        detectorVersion: body.detectorVersion,
        detectionType: body.detectionType,
        detectedAt: body.detectedAt,
        confidence: body.confidence,
        trackId: body.trackId,
        objectClass: body.objectClass,
        boundingBox: body.boundingBox,
        zoneId: body.zoneId,
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
      if (!request.currentUser) return reply.code(401).send({ success: false, error: "Authentication required" });
      const metrics = dedup.getMetrics();
      return reply.code(200).send({
        success: true,
        data: metrics,
      });
    });

    // 3. View Deduplication Policies
    app.get(`${prefix}/alerts/deduplication/policies`, async (request, reply) => {
      if (!request.currentUser) return reply.code(401).send({ success: false, error: "Authentication required" });
      const policies = policy.listPolicies();
      return reply.code(200).send({
        success: true,
        data: policies,
      });
    });

    // 4. View Active Event Deduplication Windows
    app.get(`${prefix}/alerts/events/active`, async (request, reply) => {
      if (!request.currentUser) return reply.code(401).send({ success: false, error: "Authentication required" });
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
