/**
 * Central Telemetry Ingestion Pipeline & Agent Liveness Tracker
 */

import type {
  BranchTelemetryEnvelope,
  DeviceHealthChangedEvent,
} from "../domain/telemetry-envelope.types.js";

export interface BranchCurrentState {
  branchId: string;
  agentId: string;
  overallState: "HEALTHY" | "WARNING" | "CRITICAL" | "OFFLINE";
  internetState: string;
  recorderState: string;
  totalCameras: number;
  onlineCameras: number;
  recordingCameras: number;
  retentionDays: number;
  lastSequenceNumber: number;
  lastReportedAt: Date;
}

export interface AgentLivenessRecord {
  agentId: string;
  branchId: string;
  version: string;
  status: "ONLINE" | "STALE" | "OFFLINE";
  lastHeartbeatAt: Date;
  lastSequenceNumber: number;
}

export class TelemetryIngestionService {
  private processedMessageIds = new Set<string>();
  private branchCurrentStates = new Map<string, BranchCurrentState>();
  private agentLiveness = new Map<string, AgentLivenessRecord>();
  private transitionEvents: DeviceHealthChangedEvent[] = [];

  async ingestEnvelope(envelope: BranchTelemetryEnvelope): Promise<{ accepted: boolean; duplicate: boolean; messageId: string }> {
    // 1. Idempotency check
    if (this.processedMessageIds.has(envelope.messageId)) {
      return { accepted: true, duplicate: true, messageId: envelope.messageId };
    }
    this.processedMessageIds.add(envelope.messageId);

    // 2. Calculate branch overall state based on camera & recorder health
    const onlineCameras = envelope.cameras.filter((c) => c.state === "HEALTHY").length;
    const recordingCameras = envelope.cameras.filter((c) => c.recording).length;
    const totalCameras = envelope.cameras.length;

    let overallState: "HEALTHY" | "WARNING" | "CRITICAL" | "OFFLINE" = "HEALTHY";
    if (envelope.internet.state === "OFFLINE" || envelope.recorders.some((r) => r.state === "OFFLINE")) {
      overallState = "CRITICAL";
    } else if (recordingCameras < totalCameras || envelope.cameras.some((c) => c.state === "WARNING")) {
      overallState = "WARNING";
    }

    const minRetention = envelope.disks.length > 0 ? Math.min(...envelope.disks.map((d) => d.retentionDays)) : 90;

    // 3. Update fast current state (Redis/Memory)
    this.branchCurrentStates.set(envelope.branchId, {
      branchId: envelope.branchId,
      agentId: envelope.agentId,
      overallState,
      internetState: envelope.internet.state,
      recorderState: envelope.recorders[0]?.state || "HEALTHY",
      totalCameras,
      onlineCameras,
      recordingCameras,
      retentionDays: minRetention,
      lastSequenceNumber: envelope.sequenceNumber,
      lastReportedAt: new Date(envelope.observedAt),
    });

    // 4. Update Agent Liveness
    this.agentLiveness.set(envelope.agentId, {
      agentId: envelope.agentId,
      branchId: envelope.branchId,
      version: envelope.agent.version,
      status: "ONLINE",
      lastHeartbeatAt: new Date(envelope.sentAt),
      lastSequenceNumber: envelope.sequenceNumber,
    });

    return { accepted: true, duplicate: false, messageId: envelope.messageId };
  }

  async recordTransition(event: DeviceHealthChangedEvent): Promise<void> {
    this.transitionEvents.push(event);
  }

  getBranchCurrentState(branchId: string): BranchCurrentState | undefined {
    return this.branchCurrentStates.get(branchId);
  }

  getAgentLiveness(agentId: string, currentTime = new Date()): AgentLivenessRecord | undefined {
    const record = this.agentLiveness.get(agentId);
    if (!record) return undefined;

    const elapsedSeconds = (currentTime.getTime() - record.lastHeartbeatAt.getTime()) / 1000;
    let status: "ONLINE" | "STALE" | "OFFLINE" = "ONLINE";
    if (elapsedSeconds >= 120) {
      status = "OFFLINE";
    } else if (elapsedSeconds >= 60) {
      status = "STALE";
    }

    return { ...record, status };
  }

  listAgents(currentTime = new Date()): AgentLivenessRecord[] {
    return Array.from(this.agentLiveness.keys()).map((id) => this.getAgentLiveness(id, currentTime)!);
  }

  clear() {
    this.processedMessageIds.clear();
    this.branchCurrentStates.clear();
    this.agentLiveness.clear();
    this.transitionEvents = [];
  }
}

export const telemetryIngestionService = new TelemetryIngestionService();
