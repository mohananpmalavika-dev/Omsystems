/**
 * Alert Presentation Service
 * 
 * Maps canonical alert types to consistent UI presentation metadata tokens
 * (colors, badges, icons, sound triggers, and default action buttons).
 */

import type { CanonicalAlertType, AlertSeverity, AlertPresentationTokens } from "../domain/surveillance-alert.types.js";

export class AlertPresentationService {
  getPresentation(alertType: CanonicalAlertType, severity: AlertSeverity): AlertPresentationTokens {
    const isP1 = severity === "P1";
    const soundUrgency = isP1 ? "P1_CRITICAL" : severity === "P2" ? "P2_WARNING" : "P3_ATTENTION";

    switch (alertType) {
      case "FIRE":
      case "SMOKE":
        return {
          badgeColor: "bg-red-700 text-white",
          badgeLabel: "FIRE / SMOKE EMERGENCY",
          icon: "flame",
          soundUrgency,
          actions: ["VIEW_LIVE", "VIEW_CLIP", "ESCALATE", "ACKNOWLEDGE"],
        };

      case "WEAPON_DETECTED":
      case "VIOLENCE":
        return {
          badgeColor: "bg-red-600 text-white",
          badgeLabel: "PHYSICAL THREAT",
          icon: "shield-alert",
          soundUrgency,
          actions: ["VIEW_LIVE", "VIEW_CLIP", "ESCALATE", "ACKNOWLEDGE"],
        };

      case "VAULT_ACCESS":
      case "INTRUSION":
        return {
          badgeColor: isP1 ? "bg-red-500 text-white" : "bg-orange-500 text-white",
          badgeLabel: isP1 ? "CRITICAL INTRUSION" : "ZONE INTRUSION",
          icon: "alert-triangle",
          soundUrgency,
          actions: ["VIEW_LIVE", "VIEW_CLIP", "ACKNOWLEDGE", "ESCALATE"],
        };

      case "CAMERA_TAMPER":
      case "CAMERA_OBSTRUCTION":
        return {
          badgeColor: "bg-amber-600 text-white",
          badgeLabel: "CAMERA TAMPERING",
          icon: "eye-off",
          soundUrgency,
          actions: ["VIEW_LIVE", "ACKNOWLEDGE", "ESCALATE"],
        };

      case "ATM_VANDALISM":
        return {
          badgeColor: "bg-purple-600 text-white",
          badgeLabel: "ATM VANDALISM",
          icon: "credit-card",
          soundUrgency,
          actions: ["VIEW_LIVE", "VIEW_CLIP", "ACKNOWLEDGE", "ESCALATE"],
        };

      case "BLACKLIST_PERSON":
        return {
          badgeColor: "bg-rose-600 text-white",
          badgeLabel: "WATCHLIST PERSON",
          icon: "user-x",
          soundUrgency,
          actions: ["VIEW_LIVE", "VIEW_CLIP", "ACKNOWLEDGE", "ESCALATE"],
        };

      case "CROWD_GATHERING":
      case "LOITERING":
        return {
          badgeColor: "bg-yellow-500 text-black",
          badgeLabel: "CROWD / LOITERING",
          icon: "users",
          soundUrgency,
          actions: ["VIEW_LIVE", "ACKNOWLEDGE"],
        };

      case "CASH_VAN_MONITORING":
        return {
          badgeColor: "bg-emerald-600 text-white",
          badgeLabel: "CASH VAN TRANSIT",
          icon: "truck",
          soundUrgency: "SILENT",
          actions: ["VIEW_LIVE", "ACKNOWLEDGE"],
        };

      default:
        return {
          badgeColor: "bg-blue-600 text-white",
          badgeLabel: alertType,
          icon: "bell",
          soundUrgency,
          actions: ["VIEW_LIVE", "ACKNOWLEDGE"],
        };
    }
  }

  getAllPresentationSchemas(): Record<CanonicalAlertType, AlertPresentationTokens> {
    const types: CanonicalAlertType[] = [
      "INTRUSION",
      "FIRE",
      "SMOKE",
      "CAMERA_TAMPER",
      "VAULT_ACCESS",
      "LOITERING",
      "CROWD_GATHERING",
      "BLACKLIST_PERSON",
      "VEHICLE_ANPR",
      "VIOLENCE",
      "CAMERA_OBSTRUCTION",
      "ATM_VANDALISM",
      "WEAPON_DETECTED",
      "CASH_VAN_MONITORING",
      "QUEUE_ANOMALY",
      "CAMERA_HEALTH_FAULT",
    ];

    const result: Partial<Record<CanonicalAlertType, AlertPresentationTokens>> = {};
    for (const t of types) {
      result[t] = this.getPresentation(t, "P2");
    }
    return result as Record<CanonicalAlertType, AlertPresentationTokens>;
  }
}

export const alertPresentationService = new AlertPresentationService();
