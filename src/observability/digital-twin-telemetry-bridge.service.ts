/**
 * Digital Twin Telemetry Bridge Service
 * Ingests real-time Prometheus VMS metrics and projects them onto
 * the Digital Twin 3D/2D topological models, branch twins, and camera objects.
 */

import { EventEmitter } from "node:events";
import { vmsMetricsRegistry } from "./vms-metrics-registry.js";

export interface DigitalTwinCameraState {
  cameraId: string;
  branchId: string;
  status: "STREAMING" | "OFFLINE" | "DEGRADED";
  fps: number;
  bitrateKbps: number;
  packetLossPct: number;
  recordingActive: boolean;
  activeGapSeconds: number;
  lastTelemetryAt: string;
}

export interface DigitalTwinBranchState {
  branchId: string;
  totalCameras: number;
  onlineCameras: number;
  offlineCameras: number;
  networkHealthScore: number;
  lteFailoverActive: boolean;
  edgeBufferEvents: number;
  status: "OPTIMAL" | "DEGRADED" | "CRITICAL";
  lastSyncAt: string;
}

export class DigitalTwinTelemetryBridgeService extends EventEmitter {
  /**
   * Generates real-time camera state projection for Digital Twin consumers
   */
  public getCameraTwinState(cameraId: string, branchId = "BR-MUM-01"): DigitalTwinCameraState {
    const isOnline = vmsMetricsRegistry.cameraOnline.get({ camera_id: cameraId, branch_id: branchId }) === 1;
    const fps = vmsMetricsRegistry.cameraStreamFps.get({ camera_id: cameraId, stream_type: "main" });
    const bitrate = vmsMetricsRegistry.cameraBitrateKbps.get({ camera_id: cameraId, stream_type: "main" });
    const packetLoss = vmsMetricsRegistry.cameraPacketLossPct.get({ camera_id: cameraId });
    const gap = vmsMetricsRegistry.recordingGapSeconds.get({ camera_id: cameraId, branch_id: branchId });

    return {
      cameraId,
      branchId,
      status: !isOnline ? "OFFLINE" : packetLoss > 5 ? "DEGRADED" : "STREAMING",
      fps: isOnline ? (fps || 25) : 0,
      bitrateKbps: isOnline ? (bitrate || 3200) : 0,
      packetLossPct: packetLoss || 0,
      recordingActive: isOnline && gap === 0,
      activeGapSeconds: gap || 0,
      lastTelemetryAt: new Date().toISOString(),
    };
  }

  /**
   * Generates branch twin state projection
   */
  public getBranchTwinState(branchId: string): DigitalTwinBranchState {
    const allCams = vmsMetricsRegistry.cameraOnline.entries().filter((e) => e.labels?.branch_id === branchId);
    const total = allCams.length || 4;
    const online = allCams.filter((e) => e.value === 1).length;
    const offline = total - online;
    const edgeBuffer = vmsMetricsRegistry.edgeAgentBufferEvents.get({ branch_id: branchId }) || 0;

    let status: "OPTIMAL" | "DEGRADED" | "CRITICAL" = "OPTIMAL";
    if (offline > total / 2) status = "CRITICAL";
    else if (offline > 0 || edgeBuffer > 0) status = "DEGRADED";

    return {
      branchId,
      totalCameras: total,
      onlineCameras: online,
      offlineCameras: offline,
      networkHealthScore: Math.round((online / total) * 100),
      lteFailoverActive: false,
      edgeBufferEvents: edgeBuffer,
      status,
      lastSyncAt: new Date().toISOString(),
    };
  }

  /**
   * Feeds a telemetry event from a camera or agent into the Prometheus registry and notifies Twin listeners
   */
  public pushDeviceTelemetry(telemetry: {
    cameraId: string;
    branchId: string;
    tenantId: string;
    vendor?: string;
    isOnline: boolean;
    fps?: number;
    bitrateKbps?: number;
    packetLossPct?: number;
  }): void {
    const { cameraId, branchId, tenantId, vendor, isOnline } = telemetry;

    vmsMetricsRegistry.cameraOnline.set(isOnline ? 1 : 0, { camera_id: cameraId, branch_id: branchId, tenant_id: tenantId, vendor });
    if (telemetry.fps !== undefined) {
      vmsMetricsRegistry.cameraStreamFps.set(telemetry.fps, { camera_id: cameraId, stream_type: "main" });
    }
    if (telemetry.bitrateKbps !== undefined) {
      vmsMetricsRegistry.cameraBitrateKbps.set(telemetry.bitrateKbps, { camera_id: cameraId, stream_type: "main" });
    }
    if (telemetry.packetLossPct !== undefined) {
      vmsMetricsRegistry.cameraPacketLossPct.set(telemetry.packetLossPct, { camera_id: cameraId });
    }

    const state = this.getCameraTwinState(cameraId, branchId);
    this.emit("twin:camera_updated", state);
  }
}

export const digitalTwinTelemetryBridge = new DigitalTwinTelemetryBridgeService();
