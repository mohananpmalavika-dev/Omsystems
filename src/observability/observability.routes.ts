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
  app.get("/api/vms/observability/summary", { config: { noAuth: true } }, async (_request, reply) => {
    const snapshot = vmsMetricsRegistry.getMetricsSnapshot();
    return reply.code(200).send({
      success: true,
      data: snapshot,
    });
  });

  // 3. Digital Twin Camera Telemetry Ingestion / Query
  app.get("/api/vms/observability/digital-twin/camera/:cameraId", { config: { noAuth: true } }, async (request, reply) => {
    const { cameraId } = request.params as { cameraId: string };
    const query = z.object({ branchId: z.string().default("BR-MUM-01") }).parse(request.query || {});
    const state = digitalTwinTelemetryBridge.getCameraTwinState(cameraId, query.branchId);
    return reply.code(200).send({ success: true, data: state });
  });

  // 4. Digital Twin Branch Telemetry Query
  app.get("/api/vms/observability/digital-twin/branch/:branchId", { config: { noAuth: true } }, async (request, reply) => {
    const { branchId } = request.params as { branchId: string };
    const state = digitalTwinTelemetryBridge.getBranchTwinState(branchId);
    return reply.code(200).send({ success: true, data: state });
  });

  // 5. Interactive Metric Simulation / Chaos Injection
  app.post("/api/vms/observability/simulate-metric", { config: { noAuth: true } }, async (request, reply) => {
    const body = z.object({
      metricName: z.enum([
        "vms_camera_online",
        "vms_camera_stream_fps",
        "vms_camera_bitrate_kbps",
        "vms_camera_packet_loss_pct",
        "vms_recording_segments_written_total",
        "vms_recording_write_failures_total",
        "vms_recording_gap_seconds",
        "vms_media_node_cpu_pct",
        "vms_storage_write_latency_ms",
      ]),
      value: z.number(),
      labels: z.record(z.union([z.string(), z.number()])).optional(),
    }).parse(request.body);

    if (body.metricName === "vms_camera_online") {
      vmsMetricsRegistry.cameraOnline.set(body.value, body.labels);
    } else if (body.metricName === "vms_camera_stream_fps") {
      vmsMetricsRegistry.cameraStreamFps.set(body.value, body.labels);
    } else if (body.metricName === "vms_camera_bitrate_kbps") {
      vmsMetricsRegistry.cameraBitrateKbps.set(body.value, body.labels);
    } else if (body.metricName === "vms_camera_packet_loss_pct") {
      vmsMetricsRegistry.cameraPacketLossPct.set(body.value, body.labels);
    } else if (body.metricName === "vms_recording_segments_written_total") {
      vmsMetricsRegistry.recordingSegmentsWritten.inc(body.value, body.labels);
    } else if (body.metricName === "vms_recording_write_failures_total") {
      vmsMetricsRegistry.recordingWriteFailures.inc(body.value, body.labels);
    } else if (body.metricName === "vms_recording_gap_seconds") {
      vmsMetricsRegistry.recordingGapSeconds.set(body.value, body.labels);
    } else if (body.metricName === "vms_media_node_cpu_pct") {
      vmsMetricsRegistry.mediaNodeCpu.set(body.value, body.labels);
    } else if (body.metricName === "vms_storage_write_latency_ms") {
      vmsMetricsRegistry.storageWriteLatency.observe(body.value, body.labels);
    }

    return reply.code(200).send({
      success: true,
      message: `Metric ${body.metricName} updated`,
    });
  });
}
