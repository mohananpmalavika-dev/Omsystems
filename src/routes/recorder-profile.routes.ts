import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { RecorderCompatibilityService } from "../services/recorder-compatibility.service.js";

const paramsSchema = z.object({ id: z.string().min(1) });
const refingerprintSchema = z.object({
  reason: z.enum(["MANUAL", "FIRMWARE_CHANGE", "SCHEDULED", "FAILURE_DRIFT"]).default("MANUAL"),
  probeFamilies: z.array(z.string()).optional(),
});

/**
 * Recorder profiles are populated only by authenticated edge fingerprinting.
 * Unknown recorders return 404 rather than a guessed vendor/capability profile.
 */
export async function registerRecorderProfileRoutes(app: FastifyInstance, store: ControlPlaneStore) {
  const service = new RecorderCompatibilityService(store);

  const registerEndpoints = (prefix: string) => {
    const saveProfile = async (request: any, reply: any) => {
      const { id } = paramsSchema.parse(request.params);
      const body = request.body;
      if (!body || typeof body !== "object" || !("fingerprint" in body)) {
        return reply.code(400).send({ error: "invalid_fingerprint_payload" });
      }
      await service.saveProfile({ ...body, recorderId: id });
      return reply.code(200).send({ success: true, recorderId: id });
    };

    app.post(`${prefix}/recorders/:id/fingerprint`, saveProfile);
    app.post(`${prefix}/recorders/:id/profile`, saveProfile);

    app.get(`${prefix}/recorders/:id/profile`, async (request, reply) => {
      const { id } = paramsSchema.parse(request.params);
      const profile = await service.getProfile(id);
      return profile
        ? reply.code(200).send(profile)
        : reply.code(404).send({ error: "recorder_profile_not_found" });
    });

    app.get(`${prefix}/recorders/profiles`, async (request, reply) => {
      const query = request.query as { tenantId?: string; branchId?: string };
      const data = await service.listProfiles(query);
      return reply.code(200).send({ success: true, count: data.length, data });
    });

    app.get(`${prefix}/recorders/:id/capabilities`, async (request, reply) => {
      const { id } = paramsSchema.parse(request.params);
      const profile = await service.getProfile(id);
      if (!profile) return reply.code(404).send({ error: "recorder_profile_not_found" });
      return reply.code(200).send({
        recorderId: id,
        capabilities: profile.fingerprint.capabilities,
        confidence: profile.fingerprint.confidence,
        operationRoutes: profile.operationRoutes,
        verifiedAt: profile.lastFingerprintedAt,
      });
    });

    app.get(`${prefix}/recorders/:id/profile/evidence`, async (request, reply) => {
      const { id } = paramsSchema.parse(request.params);
      const evidence = await service.getRedactedEvidence(id);
      return evidence
        ? reply.code(200).send(evidence)
        : reply.code(404).send({ error: "recorder_profile_evidence_not_found" });
    });

    app.get(`${prefix}/recorders/:id/compatibility-diagnostics`, async (request, reply) => {
      const { id } = paramsSchema.parse(request.params);
      const [profile, evidence] = await Promise.all([
        service.getProfile(id),
        service.getRedactedEvidence(id),
      ]);
      if (!profile || !evidence) {
        return reply.code(404).send({ error: "recorder_compatibility_evidence_not_found" });
      }
      return reply.code(200).send({
        recorderId: id,
        manufacturer: profile.fingerprint.manufacturer,
        model: profile.fingerprint.model,
        firmwareVersion: profile.fingerprint.firmwareVersion,
        primaryApi: profile.preferredApiOrder[0] ?? null,
        additionalApis: profile.preferredApiOrder.slice(1),
        confidence: profile.fingerprint.confidence,
        status: "ACTIVE",
        operationRoutes: profile.operationRoutes,
        capabilities: profile.fingerprint.capabilities,
        evidence,
        lastVerifiedAt: profile.lastFingerprintedAt,
      });
    });

    app.post(`${prefix}/recorders/:id/refingerprint`, async (request, reply) => {
      const { id } = paramsSchema.parse(request.params);
      const body = refingerprintSchema.parse(request.body ?? {});
      const result = await service.queueRefingerprint(id, body.reason, body.probeFamilies);
      return reply.code(202).send({
        success: true,
        message: "Recorder re-fingerprinting queued",
        recorderId: id,
        reason: body.reason,
        taskId: result.taskId,
      });
    });

    app.get(`${prefix}/compatibility/models`, async (_request, reply) => {
      const data = await service.getCompatibilityCatalog();
      return reply.code(200).send({ success: true, count: data.length, data });
    });
  };

  registerEndpoints("/v1");
  registerEndpoints("/api/v1");
  registerEndpoints("/api");
}
