import type { DeduplicationPolicy, DeduplicationStrategy } from "../domain/detection-event.types.js";

export class DeduplicationPolicyService {
  private readonly policies = new Map<string, DeduplicationPolicy>();

  constructor() {
    this.seedDefaultPolicies();
  }

  getPolicy(alertType: string): DeduplicationPolicy {
    const policy = this.policies.get(alertType.toUpperCase());
    if (policy) return policy;

    // Default fallback
    return {
      alertType: alertType.toUpperCase(),
      windowSeconds: 60,
      strategy: "TRACKED_OBJECT",
      cooldownSeconds: 60,
    };
  }

  setPolicy(policy: DeduplicationPolicy): void {
    this.policies.set(policy.alertType.toUpperCase(), policy);
  }

  listPolicies(): DeduplicationPolicy[] {
    return Array.from(this.policies.values());
  }

  private seedDefaultPolicies() {
    this.policies.set("INTRUSION", {
      alertType: "INTRUSION",
      windowSeconds: 60,
      strategy: "TRACKED_OBJECT",
      cooldownSeconds: 60,
    });

    this.policies.set("LOITERING", {
      alertType: "LOITERING",
      windowSeconds: 300,
      strategy: "TRACKED_OBJECT",
      cooldownSeconds: 120,
    });

    this.policies.set("FIRE", {
      alertType: "FIRE",
      windowSeconds: 120,
      strategy: "CAMERA_ZONE",
      cooldownSeconds: 180,
    });

    this.policies.set("SMOKE", {
      alertType: "SMOKE",
      windowSeconds: 120,
      strategy: "CAMERA_ZONE",
      cooldownSeconds: 180,
    });

    this.policies.set("CAMERA_TAMPER", {
      alertType: "CAMERA_TAMPER",
      windowSeconds: 300,
      strategy: "CAMERA_EVENT",
      cooldownSeconds: 300,
    });

    this.policies.set("CAMERA_OFFLINE", {
      alertType: "CAMERA_OFFLINE",
      windowSeconds: 600,
      strategy: "DEVICE_HEALTH",
      cooldownSeconds: 300,
      hysteresisFailureThreshold: 3,
      hysteresisRecoveryThreshold: 2,
    });

    this.policies.set("ANPR", {
      alertType: "ANPR",
      windowSeconds: 30,
      strategy: "LICENSE_PLATE",
      cooldownSeconds: 30,
    });

    this.policies.set("FACE_WATCHLIST", {
      alertType: "FACE_WATCHLIST",
      windowSeconds: 120,
      strategy: "IDENTITY",
      cooldownSeconds: 60,
    });
  }
}

export const deduplicationPolicyService = new DeduplicationPolicyService();
