import type {
  AlertCategory,
  AlertSeverity,
} from "../domain/operational-alert.types.js";

export interface RawSourceEvent {
  source: string;
  type: string;
  tenantId: string;
  branchId: string;
  branchName?: string | undefined;
  zone?: string | undefined;
  cameraId?: string | undefined;
  cameraName?: string | undefined;
  cameraCriticality?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | undefined;
  confidence?: number | undefined;
  title?: string | undefined;
  description?: string | undefined;
  observedAt?: Date | undefined;
  boundingBoxes?: Array<{ x: number; y: number; width: number; height: number; label: string }> | undefined;
  payload?: unknown | undefined;
}

export interface NormalizedAlertCandidate {
  tenantId: string;
  branch: {
    id: string;
    name: string;
    zone?: string | undefined;
  };
  camera?: {
    id: string;
    name: string;
    criticality?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | undefined;
  } | undefined;
  detection: {
    type: string;
    category: AlertCategory;
    title: string;
    description: string;
    confidence: number;
    boundingBoxes?: Array<{ x: number; y: number; width: number; height: number; label: string }> | undefined;
  };
  severity: AlertSeverity;
  occurredAt: Date;
  dedupKey: string;
}

export class AlertNormalizerService {
  normalize(event: RawSourceEvent): NormalizedAlertCandidate {
    const occurredAt = event.observedAt ?? new Date();
    const branchName = event.branchName ?? `Branch ${event.branchId}`;
    const confidence = event.confidence ?? 0.95;

    // Classify Category
    const category = this.determineCategory(event.type);

    // Compute Contextual Severity
    const severity = this.calculateContextualSeverity(event);

    const title = event.title ?? this.generateTitle(event.type);
    const description = event.description ?? this.generateDescription(event);

    const dedupKey = [
      event.tenantId,
      event.branchId,
      event.cameraId ?? "global",
      event.type,
    ].join(":");

    return {
      tenantId: event.tenantId,
      branch: {
        id: event.branchId,
        name: branchName,
        zone: event.zone,
      },
      camera: event.cameraId
        ? {
            id: event.cameraId,
            name: event.cameraName ?? `Camera ${event.cameraId}`,
            criticality: event.cameraCriticality ?? "MEDIUM",
          }
        : undefined,
      detection: {
        type: event.type,
        category,
        title,
        description,
        confidence,
        boundingBoxes: event.boundingBoxes,
      },
      severity,
      occurredAt,
      dedupKey,
    };
  }

  private calculateContextualSeverity(event: RawSourceEvent): AlertSeverity {
    const type = event.type.toLowerCase();
    const isVaultOrStrongroom =
      (event.zone && /vault|strongroom|cash|safe/i.test(event.zone)) ||
      (event.cameraName && /vault|strongroom|cash/i.test(event.cameraName)) ||
      event.cameraCriticality === "CRITICAL";

    // 1. Critical Vault / Security Intrusion -> Always P1
    if (
      type.includes("intrusion") ||
      type.includes("person_in_vault") ||
      type.includes("tamper") ||
      type.includes("gun") ||
      type.includes("weapon")
    ) {
      return isVaultOrStrongroom ? "P1" : "P2";
    }

    // 2. Camera Offline Contextual Severity
    if (type.includes("camera_offline") || type.includes("camera_tamper")) {
      if (isVaultOrStrongroom) return "P1"; // Critical Vault camera down is P1!
      if (event.cameraCriticality === "HIGH") return "P2";
      return "P3"; // Normal lobby/decorative camera down is P3
    }

    // 3. Infrastructure & Storage
    if (type.includes("recorder_offline") || type.includes("wan_offline")) {
      return "P1";
    }
    if (type.includes("retention_violation") || type.includes("hdd_failed")) {
      return "P1";
    }
    if (type.includes("smart_warning") || type.includes("wan_failover")) {
      return "P3";
    }

    // 4. Analytics Events
    if (type.includes("crowd") || type.includes("loitering") || type.includes("face_match")) {
      return "P2";
    }

    return "P4";
  }

  private determineCategory(type: string): AlertCategory {
    const t = type.toLowerCase();
    if (t.includes("camera")) return "CAMERA";
    if (t.includes("recorder")) return "RECORDER";
    if (t.includes("hdd") || t.includes("storage") || t.includes("retention")) return "STORAGE";
    if (t.includes("wan") || t.includes("network") || t.includes("internet") || t.includes("vpn")) return "NETWORK";
    if (t.includes("tamper") || t.includes("weapon") || t.includes("intrusion") || t.includes("door")) return "SECURITY";
    if (t.includes("motion") || t.includes("person") || t.includes("crowd") || t.includes("anpr")) return "AI";
    return "SYSTEM";
  }

  private generateTitle(type: string): string {
    return type
      .replace(/[_-]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  private generateDescription(event: RawSourceEvent): string {
    if (event.cameraId) {
      return `${this.generateTitle(event.type)} detected on ${event.cameraName ?? event.cameraId} at ${event.branchName ?? event.branchId}.`;
    }
    return `${this.generateTitle(event.type)} detected at ${event.branchName ?? event.branchId}.`;
  }
}
