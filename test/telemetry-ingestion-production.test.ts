import { describe, expect, it } from "vitest";
import { TelemetryIngestionService } from "../src/telemetry/services/telemetry-ingestion.service.js";
import type { BranchTelemetryEnvelope } from "../src/telemetry/domain/telemetry-envelope.types.js";

function envelope(sequenceNumber: number, messageId = `message-${sequenceNumber}`): BranchTelemetryEnvelope {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1, messageId, tenantId: "tenant-1", branchId: "branch-1", agentId: "agent-1", sequenceNumber,
    observedAt: now, sentAt: now, type: "FULL",
    internet: { state: "HEALTHY", latencyMs: 10, packetLossPct: 0, mode: "PRIMARY" },
    recorders: [], cameras: [], disks: [],
    agent: { version: "1.0.0", uptimeSeconds: 1, queueDepth: 0 },
  };
}

describe("production telemetry ingestion", () => {
  it("does not let delayed telemetry overwrite a newer branch state", async () => {
    const service = new TelemetryIngestionService();
    await service.ingestEnvelope(envelope(2));

    const delayed = await service.ingestEnvelope(envelope(1));

    expect(delayed).toMatchObject({ accepted: true, duplicate: false, outOfOrder: true });
    expect(service.getBranchCurrentState("branch-1")?.lastSequenceNumber).toBe(2);
  });

  it("rejects invalid or materially future timestamps", async () => {
    const service = new TelemetryIngestionService();
    const malformed = envelope(1);
    malformed.observedAt = "not-a-date";
    await expect(service.ingestEnvelope(malformed)).rejects.toThrow("telemetry_timestamp_invalid");

    const future = envelope(2);
    future.sentAt = new Date(Date.now() + 6 * 60_000).toISOString();
    await expect(service.ingestEnvelope(future)).rejects.toThrow("telemetry_timestamp_in_future");
  });
});
