/**
 * Alert-Driven Camera Promotion Service
 * Automatically promotes cameras from snapshot/metadata to live based on alerts
 */

import { logger } from "../utils/logger.js";
import { getMediaOrchestrator } from "./media-orchestrator.js";
import type { CameraMediaState } from "./types.js";

export interface AlertPromotionEvent {
  alertId: string;
  cameraId: string;
  branchId: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  alertType: string;
  timestamp: Date;
}

export interface PromotionResult {
  cameraId: string;
  promoted: boolean;
  fromState: string;
  toState: string;
  reason: string;
}

export class AlertPromotionService {
  private promotedCameras: Map<string, AlertPromotionEvent> = new Map();
  private promotionHistory: Array<{
    event: AlertPromotionEvent;
    result: PromotionResult;
    timestamp: Date;
  }> = [];

  /**
   * Process alert and determine if camera should be promoted
   */
  async processAlert(event: AlertPromotionEvent): Promise<PromotionResult> {
    const { cameraId, severity, alertType } = event;

    // Check if camera is already promoted
    const existing = this.promotedCameras.get(cameraId);
    if (existing) {
      logger.debug("Camera already promoted", { cameraId, existingAlert: existing.alertId });
      return {
        cameraId,
        promoted: false,
        fromState: "ALREADY_PROMOTED",
        toState: "LIVE",
        reason: "Camera already promoted by another alert",
      };
    }

    // Determine if alert severity warrants promotion
    const shouldPromote = this.shouldPromoteForAlert(severity, alertType);
    if (!shouldPromote) {
      logger.debug("Alert does not warrant promotion", { cameraId, severity, alertType });
      return {
        cameraId,
        promoted: false,
        fromState: "METADATA_ONLY",
        toState: "METADATA_ONLY",
        reason: `${severity} ${alertType} does not warrant automatic promotion`,
      };
    }

    // Get orchestrator and update camera state
    const orchestrator = getMediaOrchestrator();

    // Update camera media state with critical flag
    const cameraState: CameraMediaState = {
      cameraId,
      branchId: event.branchId,
      online: true,
      capabilities: null, // Would be fetched from registry
      lastSeen: new Date(),
      healthStatus: severity === "CRITICAL" ? "DEGRADED" : "HEALTHY",
      networkPath: [], // Would come from digital twin
      canStreamNow: true,
    };

    orchestrator.updateCameraState(cameraState);

    // Mark as promoted
    this.promotedCameras.set(cameraId, event);

    const result: PromotionResult = {
      cameraId,
      promoted: true,
      fromState: "METADATA_ONLY",
      toState: severity === "CRITICAL" ? "LIVE_MAINSTREAM" : "LIVE_SUBSTREAM",
      reason: `Promoted due to ${severity} ${alertType} alert`,
    };

    // Log promotion
    this.promotionHistory.push({
      event,
      result,
      timestamp: new Date(),
    });

    logger.info("Camera promoted due to alert", {
      cameraId,
      alertId: event.alertId,
      severity,
      alertType,
      toState: result.toState,
    });

    return result;
  }

  /**
   * Clear promotion when alert is resolved
   */
  clearPromotion(cameraId: string): boolean {
    const event = this.promotedCameras.get(cameraId);
    if (!event) {
      return false;
    }

    this.promotedCameras.delete(cameraId);

    logger.info("Camera promotion cleared", {
      cameraId,
      alertId: event.alertId,
    });

    return true;
  }

  /**
   * Auto-clear promotions after alert resolution timeout
   */
  clearPromotionAfterTimeout(cameraId: string, timeoutMs: number = 300_000): void {
    setTimeout(() => {
      this.clearPromotion(cameraId);
    }, timeoutMs);
  }

  /**
   * Determine if alert should trigger promotion
   */
  private shouldPromoteForAlert(severity: string, alertType: string): boolean {
    // Critical and high severity always promote
    if (severity === "CRITICAL" || severity === "HIGH") {
      return true;
    }

    // Medium severity for specific alert types
    if (severity === "MEDIUM") {
      const promotionAlertTypes = [
        "intrusion",
        "perimeter-breach",
        "loitering",
        "tailgating",
        "fire",
        "smoke",
        "weapon-detected",
        "ppe-violation",
        "fall-detected",
        "crowd-density",
        "vault-access",
        "atm-tampering",
      ];

      return promotionAlertTypes.some((type) =>
        alertType.toLowerCase().includes(type)
      );
    }

    // Low severity does not auto-promote
    return false;
  }

  /**
   * Get currently promoted cameras
   */
  getPromotedCameras(): Map<string, AlertPromotionEvent> {
    return new Map(this.promotedCameras);
  }

  /**
   * Get promotion history
   */
  getPromotionHistory(limit: number = 100): Array<{
    event: AlertPromotionEvent;
    result: PromotionResult;
    timestamp: Date;
  }> {
    return this.promotionHistory.slice(-limit);
  }

  /**
   * Get metrics
   */
  getMetrics(): {
    currentlyPromoted: number;
    totalPromotions: number;
    promotionsByeSeverity: Record<string, number>;
    promotionsByAlertType: Record<string, number>;
  } {
    const bySeverity: Record<string, number> = {};
    const byAlertType: Record<string, number> = {};

    for (const { event } of this.promotionHistory) {
      bySeverity[event.severity] = (bySeverity[event.severity] || 0) + 1;
      byAlertType[event.alertType] = (byAlertType[event.alertType] || 0) + 1;
    }

    return {
      currentlyPromoted: this.promotedCameras.size,
      totalPromotions: this.promotionHistory.length,
      promotionsByeSeverity: bySeverity,
      promotionsByAlertType: byAlertType,
    };
  }
}

/**
 * Global instance
 */
let alertPromotionService: AlertPromotionService | null = null;

/**
 * Get or create service instance
 */
export function getAlertPromotionService(): AlertPromotionService {
  if (!alertPromotionService) {
    alertPromotionService = new AlertPromotionService();
  }
  return alertPromotionService;
}
