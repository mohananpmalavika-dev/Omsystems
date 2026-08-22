/**
 * Contextual Severity Policy Service
 * 
 * Determines alert severity (P1-P4) based on centralized banking security policy rules
 * combining Alert Type, Banking Zone, and Operating Hours context.
 */

import type { CanonicalAlertType, SurveillanceZone, AlertSeverity } from "../domain/surveillance-alert.types.js";

export interface SeverityEvaluationContext {
  alertType: CanonicalAlertType;
  zone: SurveillanceZone;
  isAfterHours: boolean;
  confidence: number;
}

export class ContextualSeverityPolicyService {
  evaluateSeverity(ctx: SeverityEvaluationContext): AlertSeverity {
    // 1. Unconditional Critical Safety Threats (Always P1)
    if (ctx.alertType === "FIRE" || ctx.alertType === "SMOKE" || ctx.alertType === "WEAPON_DETECTED" || ctx.alertType === "VIOLENCE") {
      return "P1";
    }

    // 2. Camera Health / Obstruction Faults
    if (ctx.alertType === "CAMERA_HEALTH_FAULT" || ctx.alertType === "CAMERA_OBSTRUCTION") {
      const isCriticalZone = (ctx.zone as string) === "VAULT" || (ctx.zone as string) === "CASH_COUNTER" || (ctx.zone as string) === "STRONG_ROOM";
      return isCriticalZone ? "P1" : "P2";
    }

    // 3. Vault & Strong Room Rules
    if (ctx.zone === "VAULT" || ctx.zone === "STRONG_ROOM") {
      if (ctx.alertType === "VAULT_ACCESS" || ctx.alertType === "INTRUSION" || ctx.alertType === "CAMERA_TAMPER") {
        return "P1";
      }
      return "P2";
    }

    // 4. Cash Counter & Server Room Rules
    if (ctx.zone === "CASH_COUNTER" || ctx.zone === "SERVER_ROOM") {
      if (ctx.alertType === "CAMERA_TAMPER" || ctx.alertType === "ATM_VANDALISM" || (ctx.alertType === "INTRUSION" && ctx.isAfterHours)) {
        return "P1";
      }
      return "P2";
    }

    // 5. ATM Lobby Rules
    if (ctx.zone === "ATM_LOBBY") {
      if (ctx.alertType === "ATM_VANDALISM" || ctx.alertType === "CAMERA_TAMPER") {
        return "P1";
      }
      if (ctx.alertType === "CROWD_GATHERING" || ctx.alertType === "LOITERING") {
        return "P2";
      }
      return "P3";
    }

    // 6. Entrance & Perimeter Rules
    if (ctx.zone === "ENTRANCE" || ctx.zone === "PERIMETER") {
      if (ctx.isAfterHours && (ctx.alertType === "INTRUSION" || ctx.alertType === "BLACKLIST_PERSON")) {
        return "P1";
      }
      if (ctx.alertType === "INTRUSION") return "P2";
      if (ctx.alertType === "CROWD_GATHERING") return "P2";
      return "P3";
    }

    // 7. General Defaults
    if (ctx.alertType === "BLACKLIST_PERSON" || ctx.alertType === "CASH_VAN_MONITORING") {
      return "P2";
    }

    return "P3";
  }
}

export const contextualSeverityPolicyService = new ContextualSeverityPolicyService();
