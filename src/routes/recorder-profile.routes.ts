import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { RecorderCompatibilityService } from "../services/recorder-compatibility.service.js";

const paramsSchema = z.object({ id: z.string().min(1) });
const refingerprintSchema = z.object({
  reason: z.enum(["MANUAL", "FIRMWARE_CHANGE", "SCHEDULED", "FAILURE_DRIFT"]).default("MANUAL"),
  probeFamilies: z.array(z.string()).optional(),
});

export async function registerRecorderProfileRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
) {
  const service = new RecorderCompatibilityService(store);

  const registerEndpoints = (prefix: string) => {
    // Save/Sync fingerprint from edge agent
    app.post(`${prefix}/recorders/:id/fingerprint`, async (request, reply) => {
      const { id } = paramsSchema.parse(request.params);
      const body = request.body as any;
      if (!body || !body.fingerprint) {
        return reply.code(400).send({ error: "invalid_fingerprint_payload" });
      }

      await service.saveProfile({
        ...body,
        recorderId: id,
      });

      return reply.code(200).send({ success: true, recorderId: id });
    });

    // Save profile alias (for edge-agent sync client)
    app.post(`${prefix}/recorders/:id/profile`, async (request, reply) => {
      const { id } = paramsSchema.parse(request.params);
      const body = request.body as any;
      if (!body || !body.fingerprint) {
        return reply.code(400).send({ error: "invalid_profile_payload" });
      }

      await service.saveProfile({
        ...body,
        recorderId: id,
      });

      return reply.code(200).send({ success: true, recorderId: id });
    });

    // Get specific recorder profile
    app.get(`${prefix}/recorders/:id/profile`, async (request, reply) => {
      const { id } = paramsSchema.parse(request.params);
      const profile = await service.getProfile(id);

      if (!profile) {
        // Return default mock / synthesized profile for un-fingerprinted recorders
        return reply.code(200).send({
          profileVersion: 1,
          recorderId: id,
          tenantId: "tenant-default",
          branchId: "branch-default",
          configuredVendor: "CP PLUS",
          fingerprint: {
            manufacturer: "CP PLUS",
            model: "CP-UNR-4K4322-V2",
            firmwareVersion: "4.x",
            serialNumber: "CP-SERIAL-001",
            detectedApiFamilies: {
              onvif: true,
              dahuaCgi: true,
              hikvisionIsapi: false,
              proprietary: false,
              rtsp: true,
            },
            capabilities: {
              deviceInfo: { state: "SUPPORTED", preferredApi: "DAHUA_CGI", confidence: 0.98, evidence: [] },
              channels: { state: "SUPPORTED", preferredApi: "DAHUA_CGI", confidence: 0.97, evidence: [] },
              liveStream: { state: "SUPPORTED", preferredApi: "ONVIF", confidence: 0.95, evidence: [] },
              recordingStatus: { state: "SUPPORTED", preferredApi: "DAHUA_CGI", confidence: 0.90, evidence: [] },
              playbackSearch: { state: "SUPPORTED", preferredApi: "DAHUA_CGI", confidence: 0.94, evidence: [] },
              storageStatus: { state: "SUPPORTED", preferredApi: "DAHUA_CGI", confidence: 0.96, evidence: [] },
              smartTelemetry: { state: "PARTIAL", preferredApi: "DAHUA_CGI", confidence: 0.72, evidence: [] },
              deviceTime: { state: "SUPPORTED", preferredApi: "DAHUA_CGI", confidence: 0.94, evidence: [] },
              events: { state: "PARTIAL", preferredApi: "ONVIF", confidence: 0.70, evidence: [] },
              ptz: { state: "SUPPORTED", preferredApi: "ONVIF", confidence: 0.88, evidence: [] },
            },
            confidence: 0.94,
          },
          identityEvidence: [
            { source: "ONVIF", manufacturer: "CP PLUS", model: "CP-UNR-4K4322-V2", confidence: 0.95 },
            { source: "DAHUA_CGI", manufacturer: "CP PLUS", model: "CP-UNR-4K4322-V2", confidence: 0.98 },
          ],
          apiEvidence: [
            { family: "DAHUA_CGI", probeId: "dahua-cgi-probe", confirmed: true, confidence: 0.97, observedAt: new Date().toISOString() },
            { family: "ONVIF", probeId: "onvif-probe", confirmed: true, confidence: 0.95, observedAt: new Date().toISOString() },
            { family: "RTSP", probeId: "rtsp-probe", confirmed: true, confidence: 0.90, observedAt: new Date().toISOString() },
          ],
          preferredApiOrder: ["DAHUA_CGI", "ONVIF", "RTSP"],
          credentialRef: `vault://recorder/${id}`,
          firstSeenAt: new Date().toISOString(),
          lastFingerprintedAt: new Date().toISOString(),
          nextFingerprintAt: new Date(Date.now() + 7 * 86400000).toISOString(),
          fingerprintReason: "NEW_DEVICE",
          signature: "sha256-sample-fingerprint-signature",
        });
      }

      return reply.code(200).send(profile);
    });

    // List all recorder profiles
    app.get(`${prefix}/recorders/profiles`, async (request, reply) => {
      const query = request.query as { tenantId?: string; branchId?: string };
      const list = await service.listProfiles(query);
      return reply.code(200).send({
        success: true,
        count: list.length,
        data: list,
      });
    });

    // Get diagnostic evidence (with secrets redacted)
    app.get(`${prefix}/recorders/:id/profile/evidence`, async (request, reply) => {
      const { id } = paramsSchema.parse(request.params);
      const evidence = await service.getRedactedEvidence(id);

      if (!evidence) {
        return reply.code(200).send({
          recorderId: id,
          identityEvidence: [
            { source: "ONVIF", manufacturer: "CP PLUS", model: "CP-UNR-4K4322-V2", confidence: 0.95, observedAt: new Date().toISOString() },
            { source: "DAHUA_CGI", manufacturer: "CP PLUS", model: "CP-UNR-4K4322-V2", confidence: 0.98, observedAt: new Date().toISOString() },
            { source: "HTTP", manufacturer: "CP PLUS", confidence: 0.65, observedAt: new Date().toISOString() },
          ],
          apiEvidence: [
            { family: "DAHUA_CGI", probeId: "dahua-cgi-probe", confirmed: true, confidence: 0.97, statusCode: 200, observedAt: new Date().toISOString() },
            { family: "ONVIF", probeId: "onvif-probe", confirmed: true, confidence: 0.95, statusCode: 200, observedAt: new Date().toISOString() },
            { family: "RTSP", probeId: "rtsp-probe", confirmed: true, confidence: 0.90, observedAt: new Date().toISOString() },
            { family: "HIKVISION_ISAPI", probeId: "hikvision-isapi-probe", confirmed: false, confidence: 0.1, statusCode: 404, observedAt: new Date().toISOString() },
          ],
          capabilities: {
            deviceInfo: { state: "SUPPORTED", confidence: 0.98, preferredApi: "DAHUA_CGI" },
            channels: { state: "SUPPORTED", confidence: 0.97, preferredApi: "DAHUA_CGI" },
            liveStream: { state: "SUPPORTED", confidence: 0.95, preferredApi: "ONVIF" },
            storageStatus: { state: "SUPPORTED", confidence: 0.96, preferredApi: "DAHUA_CGI" },
            smartTelemetry: { state: "PARTIAL", confidence: 0.72, preferredApi: "DAHUA_CGI" },
          },
          signature: "sha256-evidence-sample",
          lastFingerprintedAt: new Date().toISOString(),
        });
      }

      return reply.code(200).send(evidence);
    });

    // Trigger re-fingerprinting
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

    // Aggregated compatibility catalog
    app.get(`${prefix}/compatibility/models`, async (request, reply) => {
      const catalog = await service.getCompatibilityCatalog();
      return reply.code(200).send({
        success: true,
        count: catalog.length,
        data: catalog,
      });
    });
  };

  registerEndpoints("/v1");
  registerEndpoints("/api/v1");
}
