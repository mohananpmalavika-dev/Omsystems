/**
 * Health Rule Registry
 * 
 * Central registry of all health evaluation rules.
 * Rules are applied in priority order to determine branch health.
 */

import { BranchHealthRule } from '../types/health-rules.types';
import { recorderHealthRules } from './recorder-health.rule';
import { cameraHealthRules } from './camera-health.rule';
import { recordingHealthRules } from './recording-health.rule';
import { storageHealthRules } from './storage-health.rule';
import { retentionHealthRules } from './retention-health.rule';
import { networkHealthRules } from './network-health.rule';
import { upsHealthRules } from './ups-health.rule';
import { telemetryHealthRules } from './telemetry-health.rule';
import { alertHealthRules } from './alert-health.rule';

/**
 * All health rules registered in the system
 * Rules are evaluated in priority order (highest first)
 */
export const ALL_HEALTH_RULES: BranchHealthRule[] = [
  ...recorderHealthRules,
  ...cameraHealthRules,
  ...recordingHealthRules,
  ...storageHealthRules,
  ...retentionHealthRules,
  ...networkHealthRules,
  ...upsHealthRules,
  ...telemetryHealthRules,
  ...alertHealthRules,
].sort((a, b) => b.priority - a.priority); // Sort by priority descending

/**
 * Get rules by domain for targeted evaluation
 */
export function getRulesByDomain(domain: string): BranchHealthRule[] {
  const ruleMap: Record<string, BranchHealthRule[]> = {
    RECORDER: recorderHealthRules,
    CAMERA: cameraHealthRules,
    RECORDING: recordingHealthRules,
    STORAGE: storageHealthRules,
    RETENTION: retentionHealthRules,
    NETWORK: networkHealthRules,
    UPS: upsHealthRules,
    EDGE_AGENT: telemetryHealthRules,
    ALERT: alertHealthRules,
  };
  
  return ruleMap[domain] || [];
}

export {
  recorderHealthRules,
  cameraHealthRules,
  recordingHealthRules,
  storageHealthRules,
  retentionHealthRules,
  networkHealthRules,
  upsHealthRules,
  telemetryHealthRules,
  alertHealthRules,
};
