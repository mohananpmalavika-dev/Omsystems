import type {
  DeviceEvent,
  DeviceEventSeverity,
  DeviceEventType,
  NormalizationContext,
} from "../domain/device-event.types.js";

export class SeverityEvaluatorService {
  /**
   * Evaluates and dynamically assigns severity based on event type, security zone, and context.
   */
  evaluateSeverity(event: DeviceEvent, context?: NormalizationContext): DeviceEventSeverity {
    const isVaultOrHighSecurity =
      context?.isHighSecurityZone ||
      context?.zoneName?.toLowerCase().includes("vault") ||
      context?.zoneName?.toLowerCase().includes("strongroom") ||
      context?.zoneName?.toLowerCase().includes("cash") ||
      context?.zoneName?.toLowerCase().includes("server") ||
      event.details?.analytics?.zoneName?.toLowerCase().includes("vault") ||
      event.cameraId?.toLowerCase().includes("vault");

    switch (event.type) {
      case "VIDEO_LOSS":
        return "critical"; // Video loss on any bank camera is critical

      case "STORAGE_FAULT":
      case "RECORDING_FAILURE":
        return "critical"; // Failure to record evidence is critical in banking compliance

      case "TAMPER":
        return isVaultOrHighSecurity ? "critical" : "high";

      case "DOOR_ACCESS": {
        const accessType = event.details?.access?.accessType;
        if (accessType === "DOOR_FORCED_OPEN" || accessType === "DURESS") {
          return "critical";
        }
        if (accessType === "ACCESS_DENIED" || accessType === "DOOR_HELD_OPEN") {
          return isVaultOrHighSecurity ? "high" : "medium";
        }
        return "info";
      }

      case "ANALYTICS": {
        const analyticsType = event.details?.analytics?.analyticsType;
        if (analyticsType === "INTRUSION" || analyticsType === "SMOKE_FIRE") {
          return isVaultOrHighSecurity ? "critical" : "high";
        }
        if (analyticsType === "LINE_CROSSING" || analyticsType === "OBJECT_REMOVED") {
          return "high";
        }
        return "medium";
      }

      case "CAMERA_OFFLINE":
        return isVaultOrHighSecurity ? "critical" : "high";

      case "RELAY":
        return isVaultOrHighSecurity ? "high" : "medium";

      case "MOTION":
        return isVaultOrHighSecurity ? "high" : "low";

      default:
        return "low";
    }
  }
}

export const severityEvaluatorService = new SeverityEvaluatorService();
