/**
 * Lightweight Edge Health Collectors
 * 
 * Collects telemetry locally on the branch LAN without forcing the central
 * Head Office to poll individual cameras or NVRs across the WAN.
 */

import type {
  InternetHealthSummary,
  RecorderHealthSummary,
  CameraHealthSummary,
  DiskHealthSummary,
} from "../../telemetry/domain/telemetry-envelope.types.js";

export class InternetHealthCollector {
  async collect(): Promise<InternetHealthSummary> {
    return {
      state: "HEALTHY",
      latencyMs: 38,
      packetLossPct: 0.0,
      mode: "PRIMARY",
      uploadMbps: 45.2,
    };
  }
}

export class RecorderHealthCollector {
  async collect(branchId: string): Promise<RecorderHealthSummary[]> {
    return [
      {
        recorderId: `rec-${branchId}-01`,
        model: "CP PLUS 16-CH AI NVR",
        state: "HEALTHY",
        reachable: true,
        recording: true,
        channelsTotal: 16,
        channelsRecording: 15,
        clockOffsetSeconds: 0.4,
      },
    ];
  }
}

export class CameraHealthCollector {
  async collect(branchId: string, cameraCount = 16): Promise<CameraHealthSummary[]> {
    const cameras: CameraHealthSummary[] = [];
    for (let i = 1; i <= cameraCount; i++) {
      const camId = `cam-${branchId.replace("branch-", "")}-${i.toString().padStart(2, "0")}`;
      const isFailed = i === 7; // CAM-07 stopped recording simulation
      cameras.push({
        cameraId: camId,
        channelNumber: i,
        state: isFailed ? "WARNING" : "HEALTHY",
        reachable: true,
        streamAvailable: true,
        recording: !isFailed,
        fps: 25,
        bitrateKbps: 2048,
        lastRecordedAt: new Date().toISOString(),
      });
    }
    return cameras;
  }
}

export class StorageHealthCollector {
  async collect(branchId: string): Promise<DiskHealthSummary[]> {
    return [
      {
        diskId: `hdd-${branchId}-01`,
        slotNumber: 1,
        state: "HEALTHY",
        capacityBytes: 8000000000000,
        freeBytes: 2400000000000,
        smartStatus: "PASSED",
        temperatureC: 38,
        retentionDays: 91.5,
      },
      {
        diskId: `hdd-${branchId}-02`,
        slotNumber: 2,
        state: "HEALTHY",
        capacityBytes: 8000000000000,
        freeBytes: 1900000000000,
        smartStatus: "PASSED",
        temperatureC: 40,
        retentionDays: 90.8,
      },
    ];
  }
}
