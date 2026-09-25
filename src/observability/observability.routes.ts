/**
 * VMS Observability & Prometheus Route Definitions
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { vmsMetricsRegistry } from "./vms-metrics-registry.js";
import { digitalTwinTelemetryBridge } from "./digital-twin-telemetry-bridge.service.js";
import { communicationMetrics } from "../communications/services/communication-telemetry.service.js";

export async function registerObservabilityRoutes(app: FastifyInstance) {
  // 1. Authoritative Prometheus Metrics Exposition Endpoint
  try {
    app.get("/metrics", { config: { noAuth: true } }, async (_request, reply) => {
      // Combine VMS metrics and Communication metrics
      const vmsText = vmsMetricsRegistry.formatPrometheusText();
      const commText = communicationMetrics.formatPrometheusText();
      
      const text = `${vmsText}\n${commText}`;
      
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
  
  // 5. Communication Subsystem Telemetry Summary
  app.get("/api/vms/observability/communications/summary", async (_request, reply) => {
    try {
      const snapshot = {
        devices: {
          online: communicationMetrics.devicesOnline.entries().reduce((sum, e) => sum + e.value, 0),
          total: communicationMetrics.devicesTotal.entries().reduce((sum, e) => sum + e.value, 0),
        },
        branches: {
          online: communicationMetrics.branchesOnline.entries().reduce((sum, e) => sum + e.value, 0),
        },
        employees: {
          online: communicationMetrics.employeesOnline.entries().reduce((sum, e) => sum + e.value, 0),
        },
        calls: {
          active: communicationMetrics.callsActive.entries().reduce((sum, e) => sum + e.value, 0),
          started: communicationMetrics.callsStarted.entries().reduce((sum, e) => sum + e.value, 0),
          connected: communicationMetrics.callsConnected.entries().reduce((sum, e) => sum + e.value, 0),
          failed: communicationMetrics.callsFailed.entries().reduce((sum, e) => sum + e.value, 0),
          missed: communicationMetrics.callsMissed.entries().reduce((sum, e) => sum + e.value, 0),
          rejected: communicationMetrics.callsRejected.entries().reduce((sum, e) => sum + e.value, 0),
          cancelled: communicationMetrics.callsCancelled.entries().reduce((sum, e) => sum + e.value, 0),
        },
        messages: {
          sent: communicationMetrics.messagesSent.entries().reduce((sum, e) => sum + e.value, 0),
          delivered: communicationMetrics.messagesDelivered.entries().reduce((sum, e) => sum + e.value, 0),
          read: communicationMetrics.messagesRead.entries().reduce((sum, e) => sum + e.value, 0),
        },
        enrollment: {
          codesGenerated: communicationMetrics.enrollmentCodesGenerated.entries().reduce((sum, e) => sum + e.value, 0),
          codesUsed: communicationMetrics.enrollmentCodesUsed.entries().reduce((sum, e) => sum + e.value, 0),
          codesExpired: communicationMetrics.enrollmentCodesExpired.entries().reduce((sum, e) => sum + e.value, 0),
          devicesEnrolled: communicationMetrics.devicesEnrolled.entries().reduce((sum, e) => sum + e.value, 0),
          devicesRevoked: communicationMetrics.devicesRevoked.entries().reduce((sum, e) => sum + e.value, 0),
        },
        timestamp: new Date().toISOString(),
      };
      
      return reply.code(200).send({
        success: true,
        data: snapshot,
      });
    } catch (error) {
      app.log.error({ error }, 'Failed to get communication metrics summary');
      return reply.code(500).send({ success: false, error: 'internal_error' });
    }
  });

}
