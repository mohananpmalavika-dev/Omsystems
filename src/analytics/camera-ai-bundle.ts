import type { AnalyticsRuleInput, ControlPlaneStore } from "../control-plane-store.js";

export type CameraAiRuleDefinition = Pick<
  AnalyticsRuleInput,
  "name" | "detectionType" | "objectClasses" | "severity" | "minDurationSeconds"
> & {
  minConfidence?: number;
  cooldownSeconds?: number;
};

/**
 * Detector-backed capabilities that can run on a whole camera frame without
 * a site-specific zone, watchlist, calibration, or biometric consent setup.
 * Zone and identity capabilities remain available in the capability centre,
 * but are deliberately not guessed during zero-touch provisioning.
 */
export const CAMERA_AI_RULE_BUNDLE: readonly CameraAiRuleDefinition[] = [
  { name: "AI - Motion detection", detectionType: "motion", objectClasses: [], severity: "P4", minDurationSeconds: 1, cooldownSeconds: 30 },
  { name: "AI - Object detection", detectionType: "object", objectClasses: [], severity: "P4", minDurationSeconds: 0, cooldownSeconds: 60 },
  { name: "AI - Person detection", detectionType: "person", objectClasses: ["person"], severity: "P3", minDurationSeconds: 0, cooldownSeconds: 60 },
  { name: "AI - Vehicle detection", detectionType: "vehicle", objectClasses: ["car", "truck", "bus", "motorcycle", "bicycle", "auto-rickshaw"], severity: "P3", minDurationSeconds: 0, cooldownSeconds: 60 },
  { name: "AI - Fire detection", detectionType: "fire", objectClasses: ["fire"], severity: "P1", minDurationSeconds: 1, minConfidence: 0.7, cooldownSeconds: 30 },
  { name: "AI - Smoke detection", detectionType: "smoke", objectClasses: ["smoke"], severity: "P1", minDurationSeconds: 1, minConfidence: 0.7, cooldownSeconds: 30 },
  { name: "AI - Fall detection", detectionType: "fall", objectClasses: ["person"], severity: "P1", minDurationSeconds: 1, minConfidence: 0.7, cooldownSeconds: 30 },
  { name: "AI - Helmet / Face cover detection", detectionType: "helmet", objectClasses: ["helmet", "person"], severity: "P2", minDurationSeconds: 1, minConfidence: 0.7, cooldownSeconds: 60 },
  { name: "AI - Helmet worn inside bank", detectionType: "helmet-worn", objectClasses: ["helmet", "person"], severity: "P2", minDurationSeconds: 1, minConfidence: 0.7, cooldownSeconds: 60 },
  { name: "AI - Polygon intrusion", detectionType: "intrusion", objectClasses: ["person", "vehicle"], severity: "P1", minDurationSeconds: 0, cooldownSeconds: 30 },
  { name: "AI - Line crossing", detectionType: "line-crossing", objectClasses: ["person", "vehicle"], severity: "P2", minDurationSeconds: 0, cooldownSeconds: 30 },
  { name: "AI - Loitering detection", detectionType: "loitering", objectClasses: ["person"], severity: "P3", minDurationSeconds: 5, cooldownSeconds: 60 },
  { name: "AI - Crowd density", detectionType: "crowd-density", objectClasses: ["person"], severity: "P2", minDurationSeconds: 4, cooldownSeconds: 120 },
  { name: "AI - People counting", detectionType: "person-counting", objectClasses: ["person"], severity: "P4", minDurationSeconds: 0, minConfidence: 0.65, cooldownSeconds: 60 },
  { name: "AI - Occupancy counting", detectionType: "occupancy-counting", objectClasses: ["person"], severity: "P4", minDurationSeconds: 0, minConfidence: 0.65, cooldownSeconds: 60 },
  { name: "AI - Footfall counter", detectionType: "footfall", objectClasses: ["person"], severity: "P4", minDurationSeconds: 0, minConfidence: 0.65, cooldownSeconds: 60 },
  { name: "AI - Tailgating", detectionType: "tailgating", objectClasses: ["person"], severity: "P2", minDurationSeconds: 0, cooldownSeconds: 60 },
  { name: "AI - Queue analysis", detectionType: "queue", objectClasses: ["person"], severity: "P3", minDurationSeconds: 5, cooldownSeconds: 120 },
  { name: "AI - Camera tampering", detectionType: "camera-tampering", objectClasses: [], severity: "P1", minDurationSeconds: 1, cooldownSeconds: 30 },
  { name: "AI - Video loss", detectionType: "video-loss", objectClasses: [], severity: "P1", minDurationSeconds: 1, cooldownSeconds: 30 },
  { name: "AI - Face detection", detectionType: "face", objectClasses: ["face"], severity: "P4", minDurationSeconds: 0, minConfidence: 0.70, cooldownSeconds: 300 },
  { name: "AI - Face recognition match", detectionType: "face-recognition", objectClasses: ["face"], severity: "P2", minDurationSeconds: 0, minConfidence: 0.70, cooldownSeconds: 60 },
  { name: "AI - Number plate recognition", detectionType: "anpr", objectClasses: ["license-plate"], severity: "P4", minDurationSeconds: 0, minConfidence: 0.75, cooldownSeconds: 300 },
  { name: "AI - Watchlist match", detectionType: "watchlist-match", objectClasses: ["face", "license-plate"], severity: "P1", minDurationSeconds: 0, cooldownSeconds: 30 },
  // Banking-specific alerting. These rules are deliberately camera-wide: the
  // analytics engine emits the domain-specific detection only when its model
  // or upstream integration has verified the banking context.
  { name: "Banking AI - Person in vault after hours", detectionType: "person-in-vault-after-hours", objectClasses: ["person"], severity: "P1", minDurationSeconds: 0, cooldownSeconds: 30 },
  { name: "Banking AI - Cash counter monitoring", detectionType: "cash-counter-monitoring", objectClasses: ["person"], severity: "P2", minDurationSeconds: 0, cooldownSeconds: 60 },
  { name: "Banking AI - Teller presence", detectionType: "teller-presence", objectClasses: ["person"], severity: "P3", minDurationSeconds: 30, cooldownSeconds: 120 },
  { name: "Banking AI - Vault door monitoring", detectionType: "vault-door-monitoring", objectClasses: [], severity: "P1", minDurationSeconds: 0, cooldownSeconds: 30 },
  { name: "Banking AI - ATM queue", detectionType: "atm-queue", objectClasses: ["person"], severity: "P3", minDurationSeconds: 60, cooldownSeconds: 120 },
  { name: "Banking AI - ATM tampering", detectionType: "atm-tampering", objectClasses: [], severity: "P1", minDurationSeconds: 1, minConfidence: 0.75, cooldownSeconds: 30 },
  { name: "Banking AI - ATM skimming", detectionType: "atm-skimming", objectClasses: [], severity: "P1", minDurationSeconds: 1, minConfidence: 0.75, cooldownSeconds: 30 },
  { name: "Banking AI - Cash van arrival", detectionType: "cash-van-arrival", objectClasses: ["vehicle"], severity: "P3", minDurationSeconds: 0, cooldownSeconds: 120 },
  { name: "Banking AI - Strong room entry", detectionType: "strong-room-entry", objectClasses: ["person"], severity: "P1", minDurationSeconds: 0, cooldownSeconds: 30 },
  { name: "Banking AI - Cash tray left open", detectionType: "cash-tray-left-open", objectClasses: [], severity: "P1", minDurationSeconds: 5, cooldownSeconds: 30 },
  { name: "Banking AI - Dual control verification", detectionType: "dual-control-verification", objectClasses: ["person"], severity: "P1", minDurationSeconds: 0, cooldownSeconds: 30 },
];

export const CAMERA_AI_SETUP_REQUIRED: readonly string[] = [];

export function cameraAiRuleInput(
  definition: CameraAiRuleDefinition,
  options: { protectEvidence?: boolean } = {},
): AnalyticsRuleInput {
  return {
    name: definition.name,
    detectionType: definition.detectionType,
    enabled: true,
    objectClasses: [...definition.objectClasses],
    minConfidence: definition.minConfidence ?? 0.65,
    minDurationSeconds: definition.minDurationSeconds,
    direction: "any",
    severity: definition.severity,
    cooldownSeconds: definition.cooldownSeconds ?? 60,
    recipients: [],
    recordingPolicy: options.protectEvidence ? "protect-window" : "event-recording",
    preRollSeconds: 30,
    postRollSeconds: 120,
  };
}

export type CameraAiBundleStore = Pick<
  ControlPlaneStore,
  "listAnalyticsRules" | "createAnalyticsRule" | "updateAnalyticsRule"
>;

export async function ensureCameraAiBundle(
  store: CameraAiBundleStore,
  tenantId: string,
  cameraId: string,
  createdBy?: string,
) {
  const existing = await store.listAnalyticsRules(cameraId);
  const byType = new Map(existing.map((rule) => [rule.detectionType, rule]));
  let created = 0;
  let enabled = 0;

  for (const definition of CAMERA_AI_RULE_BUNDLE) {
    const rule = byType.get(definition.detectionType);
    if (!rule) {
      await store.createAnalyticsRule(
        tenantId,
        cameraId,
        createdBy,
        cameraAiRuleInput(definition, { protectEvidence: Boolean(createdBy) }),
      );
      created++;
      continue;
    }
    if (!rule.enabled) {
      await store.updateAnalyticsRule(rule.id, tenantId, cameraId, { enabled: true });
      enabled++;
    }
  }

  return {
    cameraId,
    total: CAMERA_AI_RULE_BUNDLE.length,
    created,
    enabled,
    unchanged: CAMERA_AI_RULE_BUNDLE.length - created - enabled,
  };
}
