/**
 * VMS Observability & Prometheus Route Definitions
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { vmsMetricsRegistry } from "./vms-metrics-registry.js";
import { digitalTwinTelemetryBridge } from "./digital-twin-telemetry-bridge.service.js";

export async function registerObservabilityRoutes(app: FastifyInstance) {
  // 1. Authoritative Prometheus Metrics Exposition Endpoint
  try {
    app.get("/metrics", { config: { noAuth: true } }, async (_request, reply) => {
      const text = vmsMetricsRegistry.formatPrometheusText();
      return reply
        .header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
        .code(200)
        .send(text);
    });
  } catch (err: any) {
    if (err?.code !== "FST_ERR_DUPLICATED_ROUTE") throw err;
  }

  // 2. Structured JSON Telemetry Summary for UI / Alerting
  const handleSummary = async (_request: any, reply: any) => {
    try {
      const snapshot = vmsMetricsRegistry.getMetricsSnapshot();
      return reply.code(200).send({
        success: true,
        data: snapshot,
      });
    } catch (err: any) {
      return reply.code(200).send({
        success: true,
        data: {
          timestamp: new Date().toISOString(),
          status: "degraded",
          cameras: { totalMonitored: 0, onlineCount: 0, offlineCount: 0 },
          recording: { totalSegmentsWritten: 0, totalWriteFailures: 0, activeGapSecondsTotal: 0 },
          playback: { activeSessions: 0 },
          mediaNodes: [],
          storage: { freeTb: null, totalTb: null, usagePct: null, p95WriteLatencyMs: null },
        },
      });
    }
  };

  app.get("/api/vms/observability/summary", { config: { noAuth: true } }, handleSummary);
  app.get("/api/observability/summary", { config: { noAuth: true } }, handleSummary);
  app.get("/v1/vms/observability/summary", { config: { noAuth: true } }, handleSummary);
  app.get("/v1/observability/summary", { config: { noAuth: true } }, handleSummary);

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
