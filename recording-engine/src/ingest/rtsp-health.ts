export interface RtspHealthMetrics {
  cameraId: string;
  connected: boolean;
  bitrateKbps: number;
  fps: number;
  packetLossRate: number;
  roundTripTimeMs: number;
  lastPacketReceivedAt?: Date;
  status: "HEALTHY" | "DEGRADED" | "CRITICAL" | "OFFLINE";
}

export class RtspHealthEvaluator {
  private packetsReceived = 0;
  private bytesReceived = 0;
  private lastSampleAt = Date.now();
  private currentBitrate = 0;
  private currentFps = 0;

  recordPacket(bytes = 1400): void {
    this.packetsReceived += 1;
    this.bytesReceived += bytes;
    this.recomputeIfNeeded();
  }

  private recomputeIfNeeded(): void {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastSampleAt) / 1000;
    if (elapsedSeconds >= 2) {
      this.currentBitrate = Math.round((this.bytesReceived * 8) / (elapsedSeconds * 1000));
      this.currentFps = Math.round(this.packetsReceived / elapsedSeconds);
      this.bytesReceived = 0;
      this.packetsReceived = 0;
      this.lastSampleAt = now;
    }
  }

  getHealth(cameraId: string, connected: boolean, lastPacketAt?: Date): RtspHealthMetrics {
    this.recomputeIfNeeded();

    let status: RtspHealthMetrics["status"] = "HEALTHY";
    if (!connected) {
      status = "OFFLINE";
    } else if (lastPacketAt && Date.now() - lastPacketAt.getTime() > 10000) {
      status = "CRITICAL";
    } else if (this.currentFps < 5 && this.currentBitrate < 100) {
      status = "DEGRADED";
    }

    return {
      cameraId,
      connected,
      bitrateKbps: this.currentBitrate,
      fps: this.currentFps,
      packetLossRate: 0,
      roundTripTimeMs: 20,
      lastPacketReceivedAt: lastPacketAt,
      status,
    };
  }
}
