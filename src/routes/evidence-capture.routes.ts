import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import {
  EvidenceCapturePipelineService,
  evidenceCapturePipeline,
} from "../evidence/services/evidence-capture-pipeline.service.js";
import { EvidenceHashVerifierService } from "../evidence/services/evidence-hash-verifier.service.js";

const alertIdParamSchema = z.object({ alertId: z.string().min(1) });
const idParamSchema = z.object({ id: z.string().min(1) });

export async function registerEvidenceCaptureRoutes(
  app: FastifyInstance,
  store?: ControlPlaneStore,
  customPipeline?: EvidenceCapturePipelineService,
) {
  const pipeline = customPipeline ?? evidenceCapturePipeline;

  const registerEndpoints = (prefix: string) => {
    // 1. Enqueue Guaranteed Evidence Capture Job
    app.post(`${prefix}/evidence/jobs`, async (request, reply) => {
      const body = request.body as any;
      if (!body || !body.alertId || !body.branchId || !body.cameraId) {
        return reply.code(400).send({
          success: false,
          error: "alertId, branchId, and cameraId are required",
        });
      }

      const evidence = await pipeline.enqueueEvidenceCapture({
        alertId: body.alertId,
        tenantId: body.tenantId ?? "tenant-bank-01",
        branchId: body.branchId,
        cameraId: body.cameraId,
        alertType: body.alertType ?? "intrusion",
        severity: body.severity ?? "P1",
        detectedAt: body.detectedAt ? new Date(body.detectedAt) : new Date(),
        preferredSource: body.preferredSource,
        mockFailureCode: body.mockFailureCode,
      });

      return reply.code(201).send({
        success: true,
        data: evidence,
      });
    });

    // 2. Get Evidence Record for an Alert
    app.get(`${prefix}/evidence/alerts/:alertId`, async (request, reply) => {
      const { alertId } = alertIdParamSchema.parse(request.params);
      const evidence = await pipeline.getEvidenceForAlert(alertId);
      if (!evidence) {
        return reply.code(404).send({
          success: false,
          error: "alert_evidence_not_found",
        });
      }
      return reply.code(200).send({
        success: true,
        data: evidence,
      });
    });

    // 3. Get Cryptographic Evidence Manifest
    app.get(`${prefix}/evidence/:id/manifest`, async (request, reply) => {
      const { id } = idParamSchema.parse(request.params);
      const manifest = await pipeline.getManifest(id);
      if (!manifest) {
        return reply.code(404).send({
          success: false,
          error: "evidence_manifest_not_found",
        });
      }
      return reply.code(200).send({
        success: true,
        data: manifest,
      });
    });

    // 4. Re-verify Cryptographic Manifest Integrity
    app.post(`${prefix}/evidence/:id/verify`, async (request, reply) => {
      const { id } = idParamSchema.parse(request.params);
      const manifest = await pipeline.getManifest(id);
      if (!manifest) {
        return reply.code(404).send({
          success: false,
          error: "evidence_manifest_not_found",
        });
      }

      const valid = EvidenceHashVerifierService.verifyManifest(manifest);
      return reply.code(200).send({
        success: true,
        verified: valid,
        manifestSha256: manifest.manifestSha256,
      });
    });

    // 5. Evidence SLA Statistics
    app.get(`${prefix}/evidence/sla/summary`, async (request, reply) => {
      const summary = await pipeline.getSlaSummary();
      return reply.code(200).send({
        success: true,
        data: summary,
      });
    });
  };

  registerEndpoints("/v1");
  registerEndpoints("/api/v1");
  registerEndpoints("/api");
}
