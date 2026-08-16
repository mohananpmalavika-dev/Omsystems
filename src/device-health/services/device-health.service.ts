/**
 * Capability-Aware Device Health Service
 * 
 * Coordinates device capability profiles, evidence storage, evaluation,
 * and branch-level aggregated health diagnostics.
 */

import type {
  DeviceCapabilityProfile,
  DeviceEvidence,
  DeviceHealthSnapshot,
  HealthState,
} from "../domain/device-health.types.js";
import { deviceCapabilityRegistry, DeviceCapabilityRegistry } from "../capabilities/device-capability-profiles.js";
import { deviceEvidenceStore, DeviceEvidenceStore } from "../evidence/device-evidence.store.js";
import { healthEvaluatorEngine, HealthEvaluatorEngine } from "../evaluation/health-evaluator.engine.js";

export class DeviceHealthService {
  constructor(
    private readonly capabilities: DeviceCapabilityRegistry = deviceCapabilityRegistry,
    private readonly evidenceStore: DeviceEvidenceStore = deviceEvidenceStore,
    private readonly evaluator: HealthEvaluatorEngine = healthEvaluatorEngine
  ) {}

  getProfile(deviceId: string): DeviceCapabilityProfile {
    return this.capabilities.getOrCreateProfile(deviceId);
  }

  ingestEvidence(evidence: DeviceEvidence) {
    this.evidenceStore.put(evidence);
  }

  ingestEvidenceBatch(evidenceList: DeviceEvidence[]) {
    this.evidenceStore.putBatch(evidenceList);
  }

  getHealthSnapshot(
    deviceId: string,
    tenantId = "bank-corp",
    options?: { branchId?: string; branchName?: string; now?: Date }
  ): DeviceHealthSnapshot {
    const profile = this.capabilities.getOrCreateProfile(deviceId);
    const evidenceList = this.evidenceStore.getAllForDevice(deviceId, options?.now);

    return this.evaluator.evaluateSnapshot(profile, evidenceList, {
      tenantId,
      branchId: options?.branchId,
      branchName: options?.branchName,
      now: options?.now,
    });
  }

  getBranchDeviceHealthSummary(
    branchId: string,
    deviceIds: string[],
    tenantId = "bank-corp"
  ): {
    branchId: string;
    overallState: HealthState;
    totalDevices: number;
    healthy: number;
    warning: number;
    failure: number;
    unknown: number;
    snapshots: DeviceHealthSnapshot[];
  } {
    const snapshots = deviceIds.map((id) => this.getHealthSnapshot(id, tenantId, { branchId }));

    const healthy = snapshots.filter((s) => s.overallState === "HEALTHY").length;
    const warning = snapshots.filter((s) => s.overallState === "WARNING").length;
    const failure = snapshots.filter((s) => s.overallState === "FAILURE").length;
    const unknown = snapshots.filter((s) => s.overallState === "UNKNOWN").length;

    let overallState: HealthState = "HEALTHY";
    if (failure > 0) overallState = "FAILURE";
    else if (unknown > 0) overallState = "UNKNOWN";
    else if (warning > 0) overallState = "WARNING";

    return {
      branchId,
      overallState,
      totalDevices: deviceIds.length,
      healthy,
      warning,
      failure,
      unknown,
      snapshots,
    };
  }
}

export const deviceHealthService = new DeviceHealthService();
