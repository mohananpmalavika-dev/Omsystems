/**
 * Realistic Surveillance Branch & Device Telemetry Simulator
 * 
 * Generates high-fidelity telemetry, health heartbeats, reconnect storms,
 * and security alarms across hundreds of simulated bank branches and thousands of cameras.
 */

export interface SimulatedCamera {
  cameraId: string;
  channelNumber: number;
  isOnline: boolean;
  isRecording: boolean;
  fps: number;
  bitrateKbps: number;
}

export interface SimulatedBranch {
  branchId: string;
  branchName: string;
  routerId: string;
  recorderId: string;
  edgeGatewayId: string;
  cameras: SimulatedCamera[];
  isRouterOnline: boolean;
  isNvrOnline: boolean;
  hddCount: number;
  retentionDays: number;
}

export class BranchSimulator {
  private branches: SimulatedBranch[] = [];

  constructor(branchCount = 400, camerasPerBranch = 10) {
    this.generateTopology(branchCount, camerasPerBranch);
  }

  generateTopology(branchCount: number, camerasPerBranch: number) {
    this.branches = [];
    for (let b = 1; b <= branchCount; b++) {
      const branchId = `branch-${b.toString().padStart(4, "0")}`;
      const routerId = `router-${branchId}`;
      const recorderId = `nvr-${branchId}`;
      const edgeGatewayId = `edge-gw-${b}`;

      const cameras: SimulatedCamera[] = [];
      for (let c = 1; c <= camerasPerBranch; c++) {
        cameras.push({
          cameraId: `cam-${branchId}-${c.toString().padStart(2, "0")}`,
          channelNumber: c,
          isOnline: true,
          isRecording: true,
          fps: 25,
          bitrateKbps: 2048,
        });
      }

      this.branches.push({
        branchId,
        branchName: `Branch ${b.toString().padStart(4, "0")} - Commercial Hub`,
        routerId,
        recorderId,
        edgeGatewayId,
        cameras,
        isRouterOnline: true,
        isNvrOnline: true,
        hddCount: 2,
        retentionDays: 92.4,
      });
    }
  }

  getBranchCount(): number {
    return this.branches.length;
  }

  getTotalCameraCount(): number {
    return this.branches.reduce((sum, b) => sum + b.cameras.length, 0);
  }

  getTotalMonitoredEntities(): number {
    // branches + routers + gateways + recorders + cameras + HDDs
    return this.branches.length * (1 + 1 + 1 + 1 + this.branches[0]!.cameras.length + 2);
  }

  getBranches(): SimulatedBranch[] {
    return this.branches;
  }

  /**
   * Generate a batch of continuous telemetry events from all branches
   */
  generateHealthTelemetryBatch(count?: number): Array<{
    eventId: string;
    branchId: string;
    deviceId: string;
    type: "CAMERA" | "RECORDER" | "STORAGE" | "ROUTER";
    status: "HEALTHY" | "DEGRADED" | "FAILED";
    observedAt: Date;
  }> {
    const events: Array<any> = [];
    const limit = count || this.getTotalCameraCount();
    let generated = 0;

    for (const b of this.branches) {
      if (generated >= limit) break;
      // Router telemetry
      events.push({
        eventId: `evt-tel-rtr-${b.branchId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        branchId: b.branchId,
        deviceId: b.routerId,
        type: "ROUTER",
        status: b.isRouterOnline ? "HEALTHY" : "FAILED",
        observedAt: new Date(),
      });
      generated++;

      // Camera telemetry
      for (const cam of b.cameras) {
        if (generated >= limit) break;
        events.push({
          eventId: `evt-tel-cam-${cam.cameraId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          branchId: b.branchId,
          deviceId: cam.cameraId,
          type: "CAMERA",
          status: cam.isOnline && cam.isRecording ? "HEALTHY" : "DEGRADED",
          observedAt: new Date(),
        });
        generated++;
      }
    }

    return events;
  }
}
