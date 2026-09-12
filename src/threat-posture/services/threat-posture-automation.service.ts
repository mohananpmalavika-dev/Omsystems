import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

export type ThreatPostureLevel = "GREEN" | "AMBER" | "RED" | "BLACK";

export interface ThreatPostureConfig {
  postureLevel: ThreatPostureLevel;
  recordingFps: number;
  recordingBitrateKbps: number;
  retentionDays: number;
  wallDispatchPriority: boolean;
  doorsLockdown: boolean;
}

export const POSTURE_PROFILES: Record<ThreatPostureLevel, ThreatPostureConfig> = {
  GREEN: {
    postureLevel: "GREEN",
    recordingFps: 15,
    recordingBitrateKbps: 1024,
    retentionDays: 90,
    wallDispatchPriority: false,
    doorsLockdown: false,
  },
  AMBER: {
    postureLevel: "AMBER",
    recordingFps: 20,
    recordingBitrateKbps: 2048,
    retentionDays: 120,
    wallDispatchPriority: false,
    doorsLockdown: false,
  },
  RED: {
    postureLevel: "RED",
    recordingFps: 30,
    recordingBitrateKbps: 4096,
    retentionDays: 180,
    wallDispatchPriority: true,
    doorsLockdown: false,
  },
  BLACK: {
    postureLevel: "BLACK",
    recordingFps: 30,
    recordingBitrateKbps: 6144,
    retentionDays: 365,
    wallDispatchPriority: true,
    doorsLockdown: true,
  },
};

export interface PostureTransitionInput {
  tenantId: string;
  branchId: string;
  newLevel: ThreatPostureLevel;
  triggerReason: string;
  triggeredByUserId?: string;
  automated?: boolean;
  sourceIncidentId?: string;
}

export interface ThreatPostureRecord {
  id: string;
  tenantId: string;
  branchId: string;
  postureLevel: ThreatPostureLevel;
  triggerReason: string;
  triggeredByUserId?: string;
  automated: boolean;
  sourceIncidentId?: string;
  active: boolean;
  startedAt: Date;
  config: ThreatPostureConfig;
  executedActions: string[];
}

export class ThreatPostureAutomationService {
  private readonly branchPostures = new Map<string, ThreatPostureRecord>();

  constructor(private readonly pool?: Pool) {}

  getCurrentPosture(branchId: string): ThreatPostureConfig {
    const active = this.branchPostures.get(branchId);
    return active ? active.config : POSTURE_PROFILES.GREEN;
  }

  async transitionPosture(input: PostureTransitionInput): Promise<ThreatPostureRecord> {
    const config = POSTURE_PROFILES[input.newLevel];
    const recordId = randomUUID();
    const now = new Date();

    const executedActions: string[] = [
      `BOOST_RECORDING_FPS_${config.recordingFps}`,
      `BOOST_BITRATE_${config.recordingBitrateKbps}K`,
      `EXTEND_RETENTION_${config.retentionDays}D`,
    ];

    if (config.wallDispatchPriority) {
      executedActions.push("DISPATCH_TO_EMERGENCY_VIDEO_WALL");
    }

    if (config.doorsLockdown) {
      executedActions.push("INITIATE_DOORS_LOCKDOWN");
    }

    const record: ThreatPostureRecord = {
      id: recordId,
      tenantId: input.tenantId,
      branchId: input.branchId,
      postureLevel: input.newLevel,
      triggerReason: input.triggerReason,
      triggeredByUserId: input.triggeredByUserId,
      automated: input.automated ?? true,
      sourceIncidentId: input.sourceIncidentId,
      active: true,
      startedAt: now,
      config,
      executedActions,
    };

    this.branchPostures.set(input.branchId, record);

    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO threat_posture_ledgers (
            id, tenant_id, branch_id, posture_level, trigger_reason,
            triggered_by_user_id, automated, source_incident_id, active, started_at, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, $10)`,
          [
            record.id,
            record.tenantId,
            record.branchId,
            record.postureLevel,
            record.triggerReason,
            record.triggeredByUserId,
            record.automated,
            record.sourceIncidentId,
            record.startedAt,
            JSON.stringify({ executedActions, config }),
          ]
        );
      } catch {
        // memory fallback
      }
    }

    return record;
  }

  async evaluateIncidentForAutoEscalation(
    tenantId: string,
    branchId: string,
    incidentSeverity: "P1" | "P2" | "P3" | "P4",
    incidentType: string,
    incidentId: string
  ): Promise<ThreatPostureRecord | null> {
    if (incidentType === "PANIC_BUTTON" || incidentType === "ARMED_ROBBERY") {
      return this.transitionPosture({
        tenantId,
        branchId,
        newLevel: "BLACK",
        triggerReason: `Panic or Armed Robbery emergency trigger: ${incidentType}`,
        automated: true,
        sourceIncidentId: incidentId,
      });
    }

    if (incidentSeverity === "P1") {
      return this.transitionPosture({
        tenantId,
        branchId,
        newLevel: "RED",
        triggerReason: `P1 Incident detected: ${incidentType}`,
        automated: true,
        sourceIncidentId: incidentId,
      });
    }

    if (incidentSeverity === "P2") {
      const current = this.getCurrentPosture(branchId);
      if (current.postureLevel === "GREEN") {
        return this.transitionPosture({
          tenantId,
          branchId,
          newLevel: "AMBER",
          triggerReason: `P2 Security Alert: ${incidentType}`,
          automated: true,
          sourceIncidentId: incidentId,
        });
      }
    }

    return null;
  }
}
