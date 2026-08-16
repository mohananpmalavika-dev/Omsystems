import type { EvidencePolicy } from "../domain/evidence.types.js";

export class EvidencePolicyService {
  private readonly policies = new Map<string, EvidencePolicy>();

  constructor() {
    this.seedDefaultPolicies();
  }

  getPolicy(alertType: string, severity: "P1" | "P2" | "P3" | "P4"): EvidencePolicy {
    const key = `${alertType.toLowerCase()}:${severity}`;
    const policy = this.policies.get(key);
    if (policy) return policy;

    // Fallback baseline defaults by severity
    if (severity === "P1") {
      return {
        alertType,
        severity: "P1",
        snapshotRequired: true,
        preEventSeconds: 10,
        postEventSeconds: 30,
        minimumClipSeconds: 35,
        retryCount: 5,
        retentionDays: 365,
      };
    }

    if (severity === "P2") {
      return {
        alertType,
        severity: "P2",
        snapshotRequired: true,
        preEventSeconds: 10,
        postEventSeconds: 20,
        minimumClipSeconds: 25,
        retryCount: 4,
        retentionDays: 180,
      };
    }

    return {
      alertType,
      severity,
      snapshotRequired: true,
      preEventSeconds: 5,
      postEventSeconds: 15,
      minimumClipSeconds: 15,
      retryCount: 2,
      retentionDays: 90,
    };
  }

  private seedDefaultPolicies() {
    this.policies.set("intrusion:P1", {
      alertType: "intrusion",
      severity: "P1",
      snapshotRequired: true,
      preEventSeconds: 10,
      postEventSeconds: 30,
      minimumClipSeconds: 35,
      retryCount: 5,
      retentionDays: 365,
    });

    this.policies.set("fire:P1", {
      alertType: "fire",
      severity: "P1",
      snapshotRequired: true,
      preEventSeconds: 30,
      postEventSeconds: 120,
      minimumClipSeconds: 120,
      retryCount: 10,
      retentionDays: 730,
    });

    this.policies.set("cameratampering:P2", {
      alertType: "cameratampering",
      severity: "P2",
      snapshotRequired: true,
      preEventSeconds: 15,
      postEventSeconds: 30,
      minimumClipSeconds: 30,
      retryCount: 5,
      retentionDays: 180,
    });

    this.policies.set("vault_unauthorized_access:P1", {
      alertType: "vault_unauthorized_access",
      severity: "P1",
      snapshotRequired: true,
      preEventSeconds: 15,
      postEventSeconds: 45,
      minimumClipSeconds: 50,
      retryCount: 5,
      retentionDays: 730,
    });
  }
}

export const evidencePolicyService = new EvidencePolicyService();
