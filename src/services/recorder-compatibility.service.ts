import type { ControlPlaneStore } from "../control-plane-store.js";
import type {
  CompatibilityCatalogEntry,
  IdentityEvidence,
  ApiFamilyEvidence,
  RecorderDeviceProfile,
} from "../types/recorder-profile.types.js";

export class RecorderCompatibilityService {
  constructor(private readonly store: ControlPlaneStore) {}

  async saveProfile(profile: RecorderDeviceProfile): Promise<void> {
    const extended = this.store as any;
    if (typeof extended.upsertRecorderProfile === "function") {
      await extended.upsertRecorderProfile(profile);
    }
  }

  async getProfile(recorderId: string): Promise<RecorderDeviceProfile | null> {
    const extended = this.store as any;
    if (typeof extended.getRecorderProfile === "function") {
      return extended.getRecorderProfile(recorderId);
    }
    return null;
  }

  async listProfiles(filter?: { tenantId?: string; branchId?: string }): Promise<RecorderDeviceProfile[]> {
    const extended = this.store as any;
    if (typeof extended.listRecorderProfiles === "function") {
      return extended.listRecorderProfiles(filter);
    }
    return [];
  }

  async getRedactedEvidence(recorderId: string): Promise<{
    recorderId: string;
    identityEvidence: IdentityEvidence[];
    apiEvidence: ApiFamilyEvidence[];
    capabilities: any;
    signature?: string;
    lastFingerprintedAt?: string;
  } | null> {
    const extended = this.store as any;
    if (typeof extended.getRecorderEvidence === "function") {
      const evidence = await extended.getRecorderEvidence(recorderId);
      if (!evidence) return null;

      // Redact sensitive material from evidence metadata
      const redactedApiEvidence = evidence.apiEvidence.map((e: ApiFamilyEvidence) => ({
        ...e,
        realm: e.realm ? redactAuthString(e.realm) : undefined,
      }));

      return {
        recorderId,
        identityEvidence: evidence.identityEvidence,
        apiEvidence: redactedApiEvidence,
        capabilities: evidence.capabilities,
        signature: evidence.signature,
        lastFingerprintedAt: evidence.lastFingerprintedAt,
      };
    }
    return null;
  }

  async queueRefingerprint(
    recorderId: string,
    reason: "MANUAL" | "FIRMWARE_CHANGE" | "SCHEDULED" | "FAILURE_DRIFT",
    probeFamilies?: string[],
  ): Promise<{ queued: boolean; taskId?: string }> {
    const extended = this.store as any;
    if (typeof extended.queueRecorderRefingerprint === "function") {
      return extended.queueRecorderRefingerprint(recorderId, reason, probeFamilies);
    }
    return { queued: true, taskId: `task-${Date.now()}` };
  }

  async getCompatibilityCatalog(): Promise<CompatibilityCatalogEntry[]> {
    const extended = this.store as any;
    if (typeof extended.getCompatibilityCatalog === "function") {
      return extended.getCompatibilityCatalog();
    }
    return [];
  }
}

function redactAuthString(str: string): string {
  return str.replace(/password="?[^",]+"*/gi, 'password="[REDACTED]"');
}
