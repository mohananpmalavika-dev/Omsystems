/**
 * Edge Telemetry Envelope Builder, Compression, & Local Buffer
 */

import type {
  BranchTelemetryEnvelope,
  InternetHealthSummary,
  RecorderHealthSummary,
  CameraHealthSummary,
  DiskHealthSummary,
  EdgeAgentHealthSummary,
} from "../../telemetry/domain/telemetry-envelope.types.js";
import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export class CompressionService {
  static async compress(data: string | object): Promise<Buffer> {
    const json = typeof data === "string" ? data : JSON.stringify(data);
    return gzipAsync(Buffer.from(json, "utf-8"));
  }

  static async decompress(buffer: Buffer): Promise<string> {
    const decompressed = await gunzipAsync(buffer);
    return decompressed.toString("utf-8");
  }
}

export class LocalTelemetryBuffer {
  private queue: BranchTelemetryEnvelope[] = [];

  push(envelope: BranchTelemetryEnvelope) {
    this.queue.push(envelope);
  }

  peek(): BranchTelemetryEnvelope | undefined {
    return this.queue[0];
  }

  pop(): BranchTelemetryEnvelope | undefined {
    return this.queue.shift();
  }

  size(): number {
    return this.queue.length;
  }

  getAll(): BranchTelemetryEnvelope[] {
    return [...this.queue];
  }

  clear() {
    this.queue = [];
  }
}

export class EnvelopeBuilder {
  private sequenceNumber = 1000;

  buildEnvelope(params: {
    tenantId: string;
    branchId: string;
    agentId: string;
    type?: "FULL" | "DELTA";
    internet: InternetHealthSummary;
    recorders: RecorderHealthSummary[];
    cameras: CameraHealthSummary[];
    disks: DiskHealthSummary[];
    agent?: Partial<EdgeAgentHealthSummary>;
  }): BranchTelemetryEnvelope {
    this.sequenceNumber++;
    const now = new Date().toISOString();

    return {
      schemaVersion: 1,
      messageId: `msg-${params.branchId}-${this.sequenceNumber}-${Date.now()}`,
      tenantId: params.tenantId,
      branchId: params.branchId,
      agentId: params.agentId,
      sequenceNumber: this.sequenceNumber,
      observedAt: now,
      sentAt: now,
      type: params.type || "FULL",
      internet: params.internet,
      recorders: params.recorders,
      cameras: params.cameras,
      disks: params.disks,
      agent: {
        version: "1.4.0",
        uptimeSeconds: 86400,
        queueDepth: 0,
        cpuPct: 12.5,
        memoryPct: 24.0,
        lastSuccessfulUploadAt: now,
        ...params.agent,
      },
    };
  }

  getSequenceNumber(): number {
    return this.sequenceNumber;
  }
}
