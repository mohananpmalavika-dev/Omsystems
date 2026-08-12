/**
 * Correlation Rules Registry
 * 
 * Predefined correlation rules for common security incident patterns.
 */

import type { CorrelationRule } from './correlation-rule.js';
import type { SecurityEvent } from '../types/index.js';

export const CORRELATION_RULES: CorrelationRule[] = [
  // ========================================================================
  // UNAUTHORIZED ENTRY PATTERNS
  // ========================================================================
  {
    id: 'unauthorized-entry-confirmed',
    name: 'Unauthorized Entry (Confirmed)',
    description: 'Access denied followed by person detection and door forced',
    windowSeconds: 60,
    conditions: [
      { eventType: 'access.denied' },
      { eventType: 'ai.person_detected', minConfidence: 0.7 },
      { eventType: 'access.door_forced' },
    ],
    outputIncidentType: 'security.unauthorized_entry',
    severity: 'critical',
    priority: 100,
    generateTitle: (events) => {
      const doorId = events[0]?.entities?.doorId ?? 'Unknown Door';
      return `Unauthorized Entry Attempt at ${doorId}`;
    },
    generateExplanation: (events) => {
      return `Access was denied, person detected nearby, and door was subsequently forced open. This indicates a potential unauthorized physical breach.`;
    },
    confidenceCalculator: (events) => {
      // High confidence if all three events present
      return events.length >= 3 ? 0.95 : 0.8;
    },
  },

  {
    id: 'forced-entry',
    name: 'Forced Entry',
    description: 'Door forced with person detection',
    windowSeconds: 30,
    conditions: [
      { eventType: 'access.door_forced' },
      { eventType: 'ai.person_detected' },
    ],
    outputIncidentType: 'security.forced_entry',
    severity: 'critical',
    priority: 95,
    generateTitle: () => 'Forced Entry Detected',
    generateExplanation: () => 'Door was forced open with person detected in vicinity.',
    confidenceCalculator: () => 0.9,
  },

  // ========================================================================
  // CAMERA TAMPERING PATTERNS
  // ========================================================================
  {
    id: 'camera-tampering-with-intrusion',
    name: 'Camera Tamper + Intrusion',
    description: 'Camera tampered followed by intrusion detection',
    windowSeconds: 120,
    conditions: [
      { eventType: 'camera.tamper' },
      { eventTypes: ['ai.intrusion', 'ai.person_detected'] },
    ],
    outputIncidentType: 'infrastructure.camera_tampering',
    severity: 'critical',
    priority: 90,
    generateTitle: () => 'Camera Tampering with Intrusion',
    generateExplanation: () => 'Camera was tampered with, followed by intrusion detection. Possible attempt to disable surveillance.',
  },

  // ========================================================================
  // RECORDING FAILURE PATTERNS
  // ========================================================================
  {
    id: 'systematic-recording-failure',
    name: 'Systematic Recording Failure',
    description: 'Multiple cameras stopped recording',
    windowSeconds: 300,
    conditions: [
      { eventType: 'recorder.recording_stopped' },
    ],
    minMatches: 3,
    outputIncidentType: 'infrastructure.recording_failure',
    severity: 'critical',
    priority: 85,
    generateTitle: (events) => {
      return `Recording Failure - ${events.length} Cameras Affected`;
    },
    generateExplanation: (events) => {
      return `Recording stopped on ${events.length} cameras within 5 minutes. This may indicate a systematic failure requiring immediate attention.`;
    },
  },

  // ========================================================================
  // NETWORK CASCADE FAILURES
  // ========================================================================
  {
    id: 'network-cascade-failure',
    name: 'Network Cascade Failure',
    description: 'Switch failure causing multiple device outages',
    windowSeconds: 60,
    conditions: [
      {
        eventType: 'network.device_unreachable',
        matches: (e) => e.metadata?.deviceType === 'switch',
      },
      { eventTypes: ['camera.offline', 'recorder.offline', 'network.device_unreachable'] },
    ],
    minMatches: 4, // Switch + at least 3 devices
    outputIncidentType: 'infrastructure.network_cascade',
    severity: 'critical',
    priority: 95,
    generateTitle: (events) => {
      return `Network Switch Failure - ${events.length - 1} Devices Affected`;
    },
    generateExplanation: (events) => {
      const switchEvent = events.find(e => e.metadata?.deviceType === 'switch');
      const affectedDevices = events.length - 1;
      return `Network switch ${switchEvent?.source.name ?? 'unknown'} became unreachable, causing ${affectedDevices} dependent devices to go offline.`;
    },
  },

  // ========================================================================
  // MULTIPLE FAILED ACCESS ATTEMPTS
  // ========================================================================
  {
    id: 'multiple-failed-access',
    name: 'Multiple Failed Access Attempts',
    description: 'Repeated access denials at same location',
    windowSeconds: 300,
    conditions: [
      { eventType: 'access.denied' },
    ],
    minMatches: 3,
    outputIncidentType: 'access.multiple_failed_attempts',
    severity: 'high',
    priority: 70,
    generateTitle: (events) => {
      const doorId = events[0]?.entities?.doorId ?? 'Unknown Door';
      return `${events.length} Failed Access Attempts at ${doorId}`;
    },
    generateExplanation: (events) => {
      return `${events.length} consecutive access denials occurred within 5 minutes, suggesting potential unauthorized access attempts.`;
    },
  },

  // ========================================================================
  // TAILGATING CONFIRMED
  // ========================================================================
  {
    id: 'tailgating-confirmed',
    name: 'Tailgating (Confirmed)',
    description: 'Tailgating detected by AI with access log',
    windowSeconds: 15,
    conditions: [
      { eventType: 'access.granted' },
      { eventType: 'ai.tailgating', minConfidence: 0.75 },
    ],
    outputIncidentType: 'security.tailgating_confirmed',
    severity: 'high',
    priority: 80,
    generateTitle: () => 'Tailgating Detected',
    generateExplanation: () => 'Authorized access was followed by tailgating detection, indicating an additional person entered without authorization.',
  },

  // ========================================================================
  // FIRE/SAFETY INCIDENTS
  // ========================================================================
  {
    id: 'fire-alarm',
    name: 'Fire Alarm',
    description: 'Fire or smoke detected',
    windowSeconds: 60,
    conditions: [
      { eventTypes: ['ai.fire_detected', 'ai.smoke_detected'] },
    ],
    outputIncidentType: 'safety.fire_alarm',
    severity: 'critical',
    priority: 100,
    generateTitle: (events) => {
      const hasFire = events.some(e => e.type === 'ai.fire_detected');
      return hasFire ? 'Fire Detected' : 'Smoke Detected';
    },
    generateExplanation: (events) => {
      const hasFire = events.some(e => e.type === 'ai.fire_detected');
      const hasSmoke = events.some(e => e.type === 'ai.smoke_detected');
      
      if (hasFire && hasSmoke) {
        return 'Both fire and smoke detected. Immediate evacuation and fire response required.';
      } else if (hasFire) {
        return 'Fire detected. Immediate evacuation and fire response required.';
      } else {
        return 'Smoke detected. Potential fire hazard requiring immediate investigation.';
      }
    },
  },

  // ========================================================================
  // LOITERING IN RESTRICTED AREA
  // ========================================================================
  {
    id: 'suspicious-loitering',
    name: 'Suspicious Loitering',
    description: 'Loitering detected in high-security area',
    windowSeconds: 300,
    conditions: [
      { eventType: 'ai.loitering', minConfidence: 0.7 },
    ],
    outputIncidentType: 'security.loitering_suspicious',
    severity: 'medium',
    priority: 60,
    generateTitle: () => 'Suspicious Loitering Detected',
    generateExplanation: (events) => {
      const location = events[0]?.location?.zone ?? 'unknown area';
      return `Person detected loitering in ${location}. Duration and behavior suggest suspicious activity.`;
    },
  },

  // ========================================================================
  // AFTER-HOURS ACTIVITY
  // ========================================================================
  {
    id: 'after-hours-activity',
    name: 'After-Hours Activity',
    description: 'Multiple person detections outside business hours',
    windowSeconds: 600,
    conditions: [
      {
        eventType: 'ai.person_detected',
        matches: (e) => {
          const hour = e.timestamp.getHours();
          return hour < 6 || hour >= 20;
        },
      },
    ],
    minMatches: 3,
    outputIncidentType: 'security.after_hours_activity',
    severity: 'medium',
    priority: 65,
    generateTitle: () => 'After-Hours Activity Detected',
    generateExplanation: (events) => {
      return `Multiple person detections (${events.length}) occurred outside normal business hours, suggesting unauthorized presence.`;
    },
  },

  // ========================================================================
  // STORAGE FAILURE
  // ========================================================================
  {
    id: 'storage-critical-failure',
    name: 'Storage Critical Failure',
    description: 'Storage full or critically low',
    windowSeconds: 60,
    conditions: [
      { eventTypes: ['storage.full', 'storage.critical', 'storage.disk_failed'] },
    ],
    outputIncidentType: 'infrastructure.storage_failure',
    severity: 'critical',
    priority: 90,
    generateTitle: () => 'Critical Storage Failure',
    generateExplanation: (events) => {
      const isFull = events.some(e => e.type === 'storage.full');
      const isDiskFailed = events.some(e => e.type === 'storage.disk_failed');
      
      if (isDiskFailed) {
        return 'Storage disk has failed. Recording may be interrupted. Immediate replacement required.';
      } else if (isFull) {
        return 'Storage is completely full. Recording will fail. Immediate action required.';
      } else {
        return 'Storage is critically low. Recording may fail soon.';
      }
    },
  },

  // ========================================================================
  // CAMERA OFFLINE CASCADE
  // ========================================================================
  {
    id: 'systematic-camera-offline',
    name: 'Systematic Camera Offline',
    description: 'Multiple cameras went offline',
    windowSeconds: 120,
    conditions: [
      { eventType: 'camera.offline' },
    ],
    minMatches: 5,
    outputIncidentType: 'infrastructure.systematic_offline',
    severity: 'critical',
    priority: 85,
    generateTitle: (events) => {
      return `${events.length} Cameras Offline`;
    },
    generateExplanation: (events) => {
      return `${events.length} cameras went offline within 2 minutes. This suggests a systematic failure requiring investigation.`;
    },
  },

  // ========================================================================
  // INTRUSION WITH CAMERA CONFIRMATION
  // ========================================================================
  {
    id: 'intrusion-with-camera-confirmation',
    name: 'Intrusion (Camera Confirmed)',
    description: 'Intrusion detection with high confidence',
    windowSeconds: 30,
    conditions: [
      { eventType: 'ai.intrusion', minConfidence: 0.8 },
      { eventType: 'ai.person_detected' },
    ],
    outputIncidentType: 'security.intrusion_with_camera_confirmation',
    severity: 'critical',
    priority: 95,
    generateTitle: () => 'Intrusion Detected (Camera Confirmed)',
    generateExplanation: () => 'High-confidence intrusion detection confirmed by multiple camera detections.',
  },

  // ========================================================================
  // PERIMETER BREACH
  // ========================================================================
  {
    id: 'perimeter-breach',
    name: 'Perimeter Breach',
    description: 'Perimeter breach or line crossing detected',
    windowSeconds: 30,
    conditions: [
      { eventTypes: ['ai.perimeter_breach', 'ai.line_crossing'], minConfidence: 0.7 },
    ],
    outputIncidentType: 'security.perimeter_breach',
    severity: 'high',
    priority: 85,
    generateTitle: () => 'Perimeter Breach Detected',
    generateExplanation: () => 'Unauthorized crossing of perimeter boundary detected.',
  },
];

/**
 * Get correlation rules sorted by priority
 */
export function getCorrelationRules(): CorrelationRule[] {
  return [...CORRELATION_RULES]
    .filter(rule => rule.enabled !== false)
    .sort((a, b) => (b.priority ?? 50) - (a.priority ?? 50));
}

/**
 * Get correlation rule by ID
 */
export function getCorrelationRule(id: string): CorrelationRule | undefined {
  return CORRELATION_RULES.find(rule => rule.id === id);
}
