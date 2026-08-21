/**
 * VMS Observability & Prometheus Route Definitions
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { vmsMetricsRegistry } from "./vms-metrics-registry.js";
import { digitalTwinTelemetryBridge } from "./digital-twin-telemetry-bridge.service.js";

export async function registerObservabilityRoutes(app: FastifyInstance) {
  // 1. Authoritative Prometheus Metrics Exposition Endpoint
  app.get("/metrics", { config: { noAuth: true } }, async (_request, reply) => {
    const text = vmsMetricsRegistry.formatPrometheusText();
    return reply
      .header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
      .code(200)
      .send(text);
  });

  // 2. Structured JSON Telemetry Summary for UI / Alerting
  app.get("/api/vms/observability/summary", async (_request, reply) => {
    const snapshot = vmsMetricsRegistry.getMetricsSnapshot();
    return reply.code(200).send({
      success: true,
      data: snapshot,
    });
  });

  // 3. Digital Twin Camera Telemetry Ingestion / Query
  app.get("/api/vms/observability/digital-twin/camera/:cameraId", async (request, reply) => {
    const { cameraId } = request.params as { cameraId: string };
    const query = z.object({ branchId: z.string().min(1) }).parse(request.query || {});
    const state = digitalTwinTelemetryBridge.getCameraTwinState(cameraId, query.branchId);
    return reply.code(200).send({ success: true, data: state });
  });

  // 4. Digital Twin Branch Telemetry Query
  app.get("/api/vms/observability/digital-twin/branch/:branchId", async (request, reply) => {
    const { branchId } = request.params as { branchId: string };
    const state = digitalTwinTelemetryBridge.getBranchTwinState(branchId);
    return reply.code(200).send({ success: true, data: state });
  });

}
