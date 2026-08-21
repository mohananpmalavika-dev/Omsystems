/**
 * Alert Enrichment Service
 * 
 * Enriches normalized alert candidates with branch metadata, camera friendly names,
 * banking zone classifications, and business hours context.
 */

import type { NormalizedAlertCandidate } from "../domain/raw-ai-event.types.js";
import type { SurveillanceZone } from "../domain/surveillance-alert.types.js";

export interface EnrichedAlertContext {
  branchName: string;
  cameraName: string;
  zone: SurveillanceZone;
  isAfterHours: boolean;
}

export class AlertEnrichmentService {
  private cameraZoneMap: Map<string, { zone: SurveillanceZone; cameraName: string }> = new Map();
  private branchNameMap: Map<string, string> = new Map();

  constructor() {
  }

  private seedDefaultMetadata() {
    this.branchNameMap.set("branch-178", "Aluva Main Branch");
    this.branchNameMap.set("branch-kochi-08", "Kochi MG Road Branch");
    this.branchNameMap.set("branch-thrissur-14", "Thrissur Round Branch");

    // Camera zone mappings
    this.cameraZoneMap.set("cam-178-01", { zone: "ENTRANCE", cameraName: "CAM01-Entrance Lobby" });
    this.cameraZoneMap.set("cam-178-04", { zone: "VAULT", cameraName: "CAM04-Main Vault Door" });
    this.cameraZoneMap.set("cam-178-07", { zone: "CASH_COUNTER", cameraName: "CAM07-Cash Vault & Counter" });
    this.cameraZoneMap.set("cam-178-08", { zone: "ATM_LOBBY", cameraName: "CAM08-24x7 ATM Lobby" });
    this.cameraZoneMap.set("cam-178-12", { zone: "PERIMETER", cameraName: "CAM12-Rear Perimeter Fence" });
  }

  setCameraZone(cameraId: string, zone: SurveillanceZone, cameraName?: string) {
    this.cameraZoneMap.set(cameraId, { zone, cameraName: cameraName || cameraId });
  }

  enrich(candidate: NormalizedAlertCandidate, now = new Date()): EnrichedAlertContext {
    const branchName = this.branchNameMap.get(candidate.branchId) || `Branch ${candidate.branchId}`;
    const camMeta = this.cameraZoneMap.get(candidate.cameraId) || {
      zone: candidate.suggestedZone || "GENERAL",
      cameraName: `CAM-${candidate.cameraId}`,
    };

    // Business hours calculation (e.g., 09:00 - 18:00)
    const hour = now.getHours();
    const isAfterHours = hour < 9 || hour >= 18;

    return {
      branchName,
      cameraName: camMeta.cameraName,
      zone: camMeta.zone,
      isAfterHours,
    };
  }
}

export const alertEnrichmentService = new AlertEnrichmentService();
