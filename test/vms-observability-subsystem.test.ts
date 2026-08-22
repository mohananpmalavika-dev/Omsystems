import { describe, it, expect, beforeEach } from "vitest";
import {
  VmsMetricsRegistry,
} from "../src/observability/vms-metrics-registry.js";
import {
  DigitalTwinTelemetryBridgeService,
} from "../src/observability/digital-twin-telemetry-bridge.service.js";

describe("VMS-Grade Observability & Prometheus Instrumentation Test Suite", () => {
  let registry: VmsMetricsRegistry;
  let bridge: DigitalTwinTelemetryBridgeService;

  beforeEach(() => {
    registry = new VmsMetricsRegistry();
    bridge = new DigitalTwinTelemetryBridgeService();
  });

  it("Invariant 1: Exposes Prometheus-standard text format with HELP and TYPE lines", () => {
    const text = registry.formatPrometheusText();
    expect(text).toContain("# HELP vms_camera_online");
    expect(text).toContain("# TYPE vms_camera_online gauge");
    expect(text).toContain("# HELP vms_recording_segments_written_total");
    expect(text).toContain("# TYPE vms_recording_segments_written_total counter");
    expect(text).toContain("# HELP vms_storage_write_latency_ms");
    expect(text).toContain("# TYPE vms_storage_write_latency_ms histogram");
  });

  it("Invariant 2: Tracks camera online, FPS, bitrate, and packet loss gauges per label", () => {
    const camId = "CAM-TEST-01";
    registry.cameraOnline.set(1, { camera_id: camId, branch_id: "BR-01" });
    registry.cameraStreamFps.set(30, { camera_id: camId, stream_type: "main" });
    registry.cameraBitrateKbps.set(3500, { camera_id: camId, stream_type: "main" });
    registry.cameraPacketLossPct.set(0.01, { camera_id: camId });

    expect(registry.cameraOnline.get({ camera_id: camId, branch_id: "BR-01" })).toBe(1);
    expect(registry.cameraStreamFps.get({ camera_id: camId, stream_type: "main" })).toBe(30);
    expect(registry.cameraBitrateKbps.get({ camera_id: camId, stream_type: "main" })).toBe(3500);
    expect(registry.cameraPacketLossPct.get({ camera_id: camId })).toBe(0.01);
  });

  it("Invariant 3: Recording counters monotonically increment segments and write failures", () => {
    const camId = "CAM-REC-01";
    registry.recordingSegmentsWritten.inc(10, { camera_id: camId, storage_tier: "HOT" });
    registry.recordingSegmentsWritten.inc(5, { camera_id: camId, storage_tier: "HOT" });
    registry.recordingWriteFailures.inc(1, { camera_id: camId, storage_tier: "HOT", reason: "DISK_FULL" });

    expect(registry.recordingSegmentsWritten.get({ camera_id: camId, storage_tier: "HOT" })).toBe(15);
    expect(registry.recordingWriteFailures.get({ camera_id: camId, storage_tier: "HOT", reason: "DISK_FULL" })).toBe(1);
  });

  it("Invariant 4: Recording timeline gap seconds gauge accurately reflects outage duration", () => {
    const camId = "CAM-GAP-01";
    registry.recordingGapSeconds.set(4.2, { camera_id: camId, branch_id: "BR-02" });
    expect(registry.recordingGapSeconds.get({ camera_id: camId, branch_id: "BR-02" })).toBe(4.2);
  });

  it("Invariant 5: Tracks concurrent playback sessions by client type", () => {
    registry.playbackSessions.set(25, { tenant_id: "tenant-bank-01", client_type: "DESKTOP_WALL" });
    registry.playbackSessions.set(12, { tenant_id: "tenant-bank-01", client_type: "MOBILE_PWA" });

    expect(registry.playbackSessions.get({ tenant_id: "tenant-bank-01", client_type: "DESKTOP_WALL" })).toBe(25);
    expect(registry.playbackSessions.get({ tenant_id: "tenant-bank-01", client_type: "MOBILE_PWA" })).toBe(12);
  });

  it("Invariant 6: Exposes Media Gateway node CPU, GPU, and Ingress/Egress bandwidth", () => {
    const nodeId = "media-gw-alpha";
    registry.mediaNodeCpu.set(42, { node_id: nodeId, failure_domain: "DC-MUMBAI-01" });
    registry.mediaNodeGpu.set(28, { node_id: nodeId });
    registry.mediaNodeBandwidthIngress.set(450, { node_id: nodeId });
    registry.mediaNodeBandwidthEgress.set(620, { node_id: nodeId });

    expect(registry.mediaNodeCpu.get({ node_id: nodeId, failure_domain: "DC-MUMBAI-01" })).toBe(42);
    expect(registry.mediaNodeGpu.get({ node_id: nodeId })).toBe(28);
    expect(registry.mediaNodeBandwidthIngress.get({ node_id: nodeId })).toBe(450);
    expect(registry.mediaNodeBandwidthEgress.get({ node_id: nodeId })).toBe(620);
  });

  it("Invariant 7: Measures enterprise storage free/total bytes capacity", () => {
    const poolId = "san-pool-01";
    const freeBytes = 150 * 1024 * 1024 * 1024 * 1024;
    const totalBytes = 200 * 1024 * 1024 * 1024 * 1024;

    registry.storageFreeBytes.set(freeBytes, { pool_id: poolId, storage_type: "SAN", tier: "HOT" });
    registry.storageTotalBytes.set(totalBytes, { pool_id: poolId, storage_type: "SAN", tier: "HOT" });

    expect(registry.storageFreeBytes.get({ pool_id: poolId, storage_type: "SAN", tier: "HOT" })).toBe(freeBytes);
    expect(registry.storageTotalBytes.get({ pool_id: poolId, storage_type: "SAN", tier: "HOT" })).toBe(totalBytes);
  });

  it("Invariant 8: Histogram computes write latency distribution and cumulative buckets", () => {
    registry.storageWriteLatency.observe(4.5, { pool_id: "san-pool-01", storage_type: "SAN" });
    registry.storageWriteLatency.observe(18.2, { pool_id: "san-pool-01", storage_type: "SAN" });
    registry.storageWriteLatency.observe(150.0, { pool_id: "san-pool-01", storage_type: "SAN" });

    const text = registry.storageWriteLatency.format().join("\n");
    expect(text).toContain('vms_storage_write_latency_ms_bucket{pool_id="san-pool-01",storage_type="SAN",le="5"} 1');
    expect(text).toContain('vms_storage_write_latency_ms_bucket{pool_id="san-pool-01",storage_type="SAN",le="20"} 2');
    expect(text).toContain('vms_storage_write_latency_ms_bucket{pool_id="san-pool-01",storage_type="SAN",le="250"} 3');
    expect(text).toContain('vms_storage_write_latency_ms_count{pool_id="san-pool-01",storage_type="SAN"} 3');
  });

  it("Invariant 9: Digital Twin Telemetry Bridge consumes Prometheus metrics into topological state", () => {
    const camId = "CAM-TWIN-01";
    const branchId = "BR-MUM-01";

    bridge.pushDeviceTelemetry({
      cameraId: camId,
      branchId,
      isOnline: true,
      fps: 28,
      bitrateKbps: 3100,
      packetLossPct: 0.05,
    });

    const twin = bridge.getCameraTwinState(camId, branchId);
    expect(twin.status).toBe("STREAMING");
    expect(twin.fps).toBe(28);
    expect(twin.bitrateKbps).toBe(3100);
    expect(twin.recordingActive).toBe(true);
  });

  it("Invariant 10: Generates structured JSON metrics snapshot for Dashboard UI consumption", () => {
    const snapshot = registry.getMetricsSnapshot();
    expect(snapshot.timestamp).toBeDefined();
    expect(snapshot.cameras).toBeDefined();
    expect(snapshot.recording).toBeDefined();
    expect(snapshot.mediaNodes).toBeDefined();
    expect(snapshot.storage).toBeDefined();
  });
});
