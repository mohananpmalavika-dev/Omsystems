/**
 * Detection Rules
 * 
 * Deterministic rules for detecting specific anomaly patterns.
 */

import type { SecurityEvent } from '../types/index.js';

export interface DetectionRule {
  id: string;
  name: string;
  description: string;
  when: (event: SecurityEvent, context: RuleContext) => boolean;
  score: number | ((event: SecurityEvent, context: RuleContext) => number);
  reason: string;
}

export interface RuleContext {
  recentEvents?: SecurityEvent[];
  currentTime?: Date;
  branchOpenHours?: { start: number; end: number };
  securezones?: string[];
}

/**
 * Predefined detection rules
 */
export const DETECTION_RULES: DetectionRule[] = [
  // Critical Infrastructure Rules
  {
    id: 'door-forced',
    name: 'Door Forced Open',
    description: 'Door was forced open without authorization',
    when: event => event.type === 'access.door_forced',
    score: 0.95,
    reason: 'Physical security breach - door forced',
  },

  {
    id: 'camera-tamper',
    name: 'Camera Tampering',
    description: 'Camera tampering detected',
    when: event => event.type === 'camera.tamper',
    score: 0.95,
    reason: 'Camera tampering detected',
  },

  {
    id: 'recording-stopped',
    name: 'Recording Stopped',
    description: 'Critical: Video recording has stopped',
    when: event => event.type === 'recorder.recording_stopped',
    score: 0.9,
    reason: 'Video recording failure',
  },

  // Safety Rules
  {
    id: 'fire-detected',
    name: 'Fire Detected',
    description: 'Fire or flames detected by AI',
    when: event => event.type === 'ai.fire_detected',
    score: 1.0,
    reason: 'Fire detected - immediate safety threat',
  },

  {
    id: 'smoke-detected',
    name: 'Smoke Detected',
    description: 'Smoke detected by AI',
    when: event => event.type === 'ai.smoke_detected',
    score: 1.0,
    reason: 'Smoke detected - potential fire hazard',
  },

  {
    id: 'person-down',
    name: 'Person Down / Fall',
    description: 'Person fallen or lying down detected',
    when: event => {
      const isFallType =
        event.type === 'ai.fall_detected' ||
        event.type === 'ai.fall' ||
        event.type === 'ai.person_fall' ||
        event.type === 'ai.man_down' ||
        event.type === 'medical.emergency' ||
        event.type === 'safety.fall_detected' ||
        event.type === 'security.person_down';
      if (isFallType) return true;

      const metadata = event.metadata as Record<string, unknown> | undefined;
      if (
        metadata?.fall_detected === true ||
        metadata?.fallDetected === true ||
        metadata?.person_down === true ||
        metadata?.personDown === true ||
        metadata?.person_fallen === true ||
        metadata?.man_down === true ||
        metadata?.manDown === true ||
        metadata?.medical_emergency === true
      ) {
        return true;
      }

      if (metadata?.phase === 'POST_FALL_MOTIONLESS' || metadata?.phase === 'IMPACT') return true;
      if (metadata?.motionless_seconds !== undefined && Number(metadata.motionless_seconds) >= 5) return true;

      return false;
    },
    score: 0.95,
    reason: 'Person down - potential medical emergency',
  },

  {
    id: 'weapon-detected',
    name: 'Weapon Detected',
    description: 'Weapon detected by AI',
    when: event => event.type === 'ai.weapon_detected',
    score: 1.0,
    reason: 'Weapon detected - critical security threat',
  },

  // After-Hours Activity Rules
  {
    id: 'after-hours-person',
    name: 'After-Hours Person Detected',
    description: 'Person detected outside business hours',
    when: (event, context) => {
      if (event.type !== 'ai.person_detected') return false;
      
      const hour = event.timestamp.getHours();
      const isAfterHours = hour < 6 || hour >= 20;
      
      return isAfterHours;
    },
    score: 0.7,
    reason: 'Person detected after business hours',
  },

  {
    id: 'after-hours-access-denied',
    name: 'After-Hours Access Denial',
    description: 'Access denied outside business hours',
    when: (event, context) => {
      if (event.type !== 'access.denied') return false;
      
      const hour = event.timestamp.getHours();
      const isAfterHours = hour < 6 || hour >= 20;
      
      return isAfterHours;
    },
    score: 0.75,
    reason: 'Access attempt after hours',
  },

  // Multiple Failed Attempts
  {
    id: 'multiple-access-denied',
    name: 'Multiple Access Denials',
    description: 'Multiple failed access attempts',
    when: (event, context) => {
      if (event.type !== 'access.denied') return false;
      if (!context.recentEvents) return false;

      const doorId = event.entities?.doorId;
      if (!doorId) return false;

      // Count recent denials at same door
      const recentDenials = context.recentEvents.filter(
        e => e.type === 'access.denied' &&
             e.entities?.doorId === doorId &&
             e.timestamp.getTime() > event.timestamp.getTime() - 5 * 60 * 1000 // Last 5 mins
      );

      return recentDenials.length >= 3;
    },
    score: 0.85,
    reason: 'Multiple failed access attempts',
  },

  // Storage Critical
  {
    id: 'storage-critical',
    name: 'Storage Critically Low',
    description: 'Storage space critically low',
    when: (event, context) => {
      if (event.type !== 'storage.low') return false;
      
      const freePercent = event.metadata?.freePercent as number | undefined;
      return freePercent !== undefined && freePercent < 5;
    },
    score: 0.85,
    reason: 'Storage critically low (<5% free)',
  },

  {
    id: 'storage-full',
    name: 'Storage Full',
    description: 'Storage completely full',
    when: event => event.type === 'storage.full',
    score: 0.95,
    reason: 'Storage full - recording will fail',
  },

  // Network Infrastructure
  {
    id: 'switch-failure',
    name: 'Network Switch Failure',
    description: 'Network switch unreachable',
    when: (event, context) => {
      return event.type === 'network.device_unreachable' &&
             event.metadata?.deviceType === 'switch';
    },
    score: 0.9,
    reason: 'Network switch failure - multiple devices affected',
  },

  // High Confidence AI Detections in Secure Zones
  {
    id: 'intrusion-high-confidence',
    name: 'High Confidence Intrusion',
    description: 'Intrusion detected with high confidence',
    when: (event, context) => {
      if (event.type !== 'ai.intrusion') return false;
      return event.confidence !== undefined && event.confidence >= 0.85;
    },
    score: 0.9,
    reason: 'High confidence intrusion detection',
  },

  // Loitering in Restricted Areas
  {
    id: 'loitering-restricted',
    name: 'Loitering in Restricted Area',
    description: 'Person loitering in restricted zone',
    when: (event, context) => {
      if (event.type !== 'ai.loitering') return false;
      
      const zoneName = event.location?.zone?.toLowerCase() ?? '';
      const secureKeywords = ['restricted', 'secure', 'server', 'vault'];
      
      return secureKeywords.some(keyword => zoneName.includes(keyword));
    },
    score: 0.85,
    reason: 'Loitering in restricted area',
  },

  // Camera Offline During Business Hours
  {
    id: 'camera-offline-business-hours',
    name: 'Camera Offline During Business Hours',
    description: 'Camera went offline during active hours',
    when: (event, context) => {
      if (event.type !== 'camera.offline' && event.type !== 'security.camera.offline' && event.type !== 'camera_offline') return false;
      
      const hour = event.timestamp.getHours();
      const dayOfWeek = event.timestamp.getDay();
      if (dayOfWeek === 0) return false; // Sunday closed
      if (dayOfWeek === 6) return hour >= 8 && hour < 13; // Saturday banking hours: 08:00 - 13:00
      return hour >= 8 && hour < 18; // Mon-Fri: 08:00 - 18:00
    },
    score: 0.75,
    reason: 'Camera offline during business hours',
  },

  // PPE Violation
  {
    id: 'ppe-violation',
    name: 'PPE Violation',
    description: 'Personal protective equipment violation',
    when: event => event.type === 'ai.ppe_violation',
    score: (event, context) => {
      // Higher score for high confidence
      return event.confidence && event.confidence > 0.8 ? 0.8 : 0.6;
    },
    reason: 'PPE violation detected',
  },

  // Unattended Object / Left Baggage
  {
    id: 'unattended-object',
    name: 'Unattended Object / Left Baggage',
    description: 'Unattended object/baggage detected stationary in monitored zone',
    when: (event, context) => {
      const isUnattendedEvent =
        event.type === 'ai.unattended_object' ||
        event.type === 'ai.abandoned_object' ||
        event.type === 'ai.left_object' ||
        event.type === 'security.unattended_object' ||
        event.type === 'security.abandoned_object' ||
        event.type === 'unattended_baggage' ||
        event.type === 'abandoned_object';
      if (isUnattendedEvent) return true;

      const metadata = event.metadata as Record<string, unknown> | undefined;
      if (
        metadata?.unattended_detected === true ||
        metadata?.left_object_detected === true ||
        metadata?.abandoned_object === true ||
        metadata?.unattended_object === true
      ) {
        return true;
      }

      const stationarySec = Number(
        metadata?.stationary_duration_seconds ??
        metadata?.stationaryDurationSec ??
        metadata?.dwellTimeSeconds ??
        0
      );
      return stationarySec >= 300;
    },
    score: 0.85,
    reason: 'Unattended object/baggage detected stationary beyond safety threshold',
  },

  // Tailgating
  {
    id: 'tailgating',
    name: 'Tailgating Detected',
    description: 'Unauthorized tailgating through access point',
    when: event => event.type === 'ai.tailgating',
    score: 0.8,
    reason: 'Tailgating detected',
  },

  // Suspicious Repeated Zone Re-entry
  {
    id: 'suspicious-repeated-zone-reentry',
    name: 'Suspicious Repeated Zone Re-entry',
    description: 'Anonymous subject repeatedly entered secure perimeter/zone within short window',
    when: (event, context) => {
      const isReentryEvent =
        event.type === 'ai.repeated_entry' ||
        event.type === 'ai.zone_reentry' ||
        event.type === 'zone.reentry' ||
        event.type === 'security.zone.reentry';
      if (isReentryEvent) return true;

      const metadata = event.metadata as Record<string, unknown> | undefined;
      const count = Number(
        metadata?.reentry_count_10m ??
        metadata?.reentryCount10m ??
        metadata?.reentryCount ??
        metadata?.reentry_count ??
        0
      );
      return count > 3;
    },
    score: 0.85,
    reason: 'Suspicious repeated zone re-entry in secure perimeter',
  },

  // Restricted Zone Intrusion
  {
    id: 'restricted-zone-intrusion',
    name: 'Restricted Zone Intrusion',
    description: 'Unauthorized intrusion or perimeter breach detected in high-security zone',
    when: (event, context) => {
      const isIntrusionEvent =
        event.type === 'ai.intrusion' ||
        event.type === 'ai.zone_intrusion' ||
        event.type === 'zone.intrusion' ||
        event.type === 'security.intrusion' ||
        event.type === 'perimeter.breach';
      if (isIntrusionEvent) return true;

      const metadata = event.metadata as Record<string, unknown> | undefined;
      if (
        metadata?.intrusion_detected === true ||
        metadata?.intrusionDetected === true ||
        metadata?.zone_intrusion === true ||
        metadata?.zoneIntrusion === true ||
        metadata?.unauthorized_presence === true ||
        metadata?.perimeter_breach === true
      ) {
        return true;
      }

      if (metadata?.intruder_count !== undefined && Number(metadata.intruder_count) > 0) return true;
      if (metadata?.intruderCount !== undefined && Number(metadata.intruderCount) > 0) return true;

      return false;
    },
    score: 0.95,
    reason: 'Restricted zone intrusion detected',
  },

  // Unregistered Vehicle in Cash Bay
  {
    id: 'unregistered-vehicle-cash-bay',
    name: 'Unregistered Vehicle in Cash Bay',
    description: 'Unregistered or unauthorized vehicle detected in secure cash transfer bay',
    when: (event, context) => {
      const isVehicleBayEvent =
        event.type === 'ai.unregistered_vehicle' ||
        event.type === 'ai.unknown_cash_van' ||
        event.type === 'anpr.unregistered_vehicle' ||
        event.type === 'vehicle.unauthorized' ||
        event.type === 'cash_bay.unauthorized_vehicle' ||
        event.type === 'security.cash_bay.vehicle';
      if (isVehicleBayEvent) return true;

      const metadata = event.metadata as Record<string, unknown> | undefined;
      if (
        metadata?.unregistered_vehicle === true ||
        metadata?.unknown_vehicle === true ||
        metadata?.unauthorized_vehicle === true ||
        metadata?.unknown_cash_van === true
      ) {
        return true;
      }

      if (metadata?.vehicle_in_bay === true && metadata?.plate_authorized === false) {
        return true;
      }

      if (metadata?.vehicleInBay === true && metadata?.plateAuthorized === false) {
        return true;
      }

      return false;
    },
    score: 0.9,
    reason: 'Unregistered or unauthorized vehicle detected in cash bay',
  },

  // Cash Counter Overcrowding / Crowd Density
  {
    id: 'cash-counter-crowd-density',
    name: 'Cash Counter Crowd Density Exceeded',
    description: 'High crowd density or overcrowding detected at cash counter / teller area',
    when: (event, context) => {
      const isCrowdEvent =
        event.type === 'ai.crowd_density' ||
        event.type === 'ai.crowd_detected' ||
        event.type === 'crowd.density' ||
        event.type === 'cash_counter.crowd' ||
        event.type === 'security.crowd_density';
      if (isCrowdEvent) return true;

      const metadata = event.metadata as Record<string, unknown> | undefined;
      if (
        metadata?.crowd_detected === true ||
        metadata?.crowdDetected === true ||
        metadata?.overcrowding === true ||
        metadata?.overcrowded === true
      ) {
        return true;
      }

      const count = Number(
        metadata?.person_count ??
        metadata?.personCount ??
        metadata?.crowd_count ??
        metadata?.crowdCount ??
        metadata?.occupancy ??
        metadata?.count ??
        0
      );
      if (count > 5) return true;

      const dLevel = String(metadata?.density_level ?? metadata?.densityLevel ?? metadata?.density ?? '').toUpperCase();
      if (dLevel === 'CROWDED' || dLevel === 'CRITICAL' || dLevel === 'HIGH') return true;

      return false;
    },
    score: 0.75,
    reason: 'High crowd density at cash counter exceeding safety and operational limit',
  },

  // Cash Van Excessive Bay Dwell Time
  {
    id: 'cash-van-excessive-bay-dwell',
    name: 'Cash Van Excessive Bay Dwell Time',
    description: 'Armored cash transfer van exceeded maximum loading turnaround dwell time in secure bay',
    when: (event, context) => {
      const isVanDwellEvent =
        event.type === 'ai.cash_van_dwell' ||
        event.type === 'ai.van_dwell_time' ||
        event.type === 'cash_van.dwell_exceeded' ||
        event.type === 'bay.dwell_time' ||
        event.type === 'logistics.bay_dwell_exceeded';
      if (isVanDwellEvent) return true;

      const metadata = event.metadata as Record<string, unknown> | undefined;
      if (
        metadata?.excessive_bay_dwell === true ||
        metadata?.excessiveBayDwell === true ||
        metadata?.van_dwell_exceeded === true ||
        metadata?.vanDwellExceeded === true
      ) {
        return true;
      }

      const dwellSec = Number(
        metadata?.dwell_time_seconds ??
        metadata?.dwellTimeSeconds ??
        metadata?.bay_dwell_seconds ??
        metadata?.bayDwellSeconds ??
        metadata?.van_dwell_seconds ??
        metadata?.vanDwellSeconds ??
        metadata?.durationSeconds ??
        0
      );
      if (dwellSec > 1200) return true;

      const dwellMins = Number(
        metadata?.dwell_minutes ??
        metadata?.dwellMinutes ??
        0
      );
      if (dwellMins > 20) return true;

      return false;
    },
    score: 0.8,
    reason: 'Armored cash logistics van exceeded maximum 20-minute turnaround bay dwell SLA',
  },

  // Locker / Vault Maximum Occupancy Exceeded
  {
    id: 'locker-vault-max-occupancy',
    name: 'Locker / Vault Maximum Occupancy Exceeded',
    description: 'Occupancy inside high-security locker or strong room exceeded authorized dual-custody threshold',
    when: (event, context) => {
      const isOccupancyEvent =
        event.type === 'ai.max_occupancy' ||
        event.type === 'ai.vault_occupancy' ||
        event.type === 'ai.locker_occupancy' ||
        event.type === 'vault.over_occupancy' ||
        event.type === 'locker.over_occupancy' ||
        event.type === 'security.vault.occupancy';
      if (isOccupancyEvent) return true;

      const metadata = event.metadata as Record<string, unknown> | undefined;
      if (
        metadata?.max_occupancy_exceeded === true ||
        metadata?.maxOccupancyExceeded === true ||
        metadata?.over_occupancy === true ||
        metadata?.overOccupancy === true
      ) {
        return true;
      }

      const zoneType = String(metadata?.zoneType ?? metadata?.zone_type ?? metadata?.zoneName ?? metadata?.zone ?? '').toUpperCase();
      const isVaultOrLocker =
        zoneType.includes('LOCKER') ||
        zoneType.includes('VAULT') ||
        zoneType.includes('STRONG_ROOM') ||
        zoneType.includes('STRONGROOM');

      const count = Number(
        metadata?.person_count ??
        metadata?.personCount ??
        metadata?.occupancy ??
        metadata?.vault_occupancy ??
        metadata?.count ??
        0
      );

      if (isVaultOrLocker && count > 2) {
        return true;
      }

      return false;
    },
    score: 0.9,
    reason: 'Maximum allowable occupancy exceeded inside locker or vault strong room',
  },

  // Directional Line Crossing / Virtual Tripwire Breach
  {
    id: 'directional-line-crossing',
    name: 'Directional Line Crossing / Tripwire Breach',
    description: 'Entity crossed virtual perimeter boundary or tripwire in unauthorized direction',
    when: (event, context) => {
      const isLineCrossingEvent =
        event.type === 'ai.line_crossing' ||
        event.type === 'ai.tripwire' ||
        event.type === 'tripwire.breach' ||
        event.type === 'perimeter.line_crossing' ||
        event.type === 'security.line_crossing';
      if (isLineCrossingEvent) return true;

      const metadata = event.metadata as Record<string, unknown> | undefined;
      if (
        metadata?.line_crossed === true ||
        metadata?.lineCrossed === true ||
        metadata?.tripwire_triggered === true ||
        metadata?.tripwireTriggered === true ||
        metadata?.line_crossing === true ||
        metadata?.lineCrossing === true
      ) {
        return true;
      }

      if (typeof metadata?.line_crossing === 'string' && metadata.line_crossing.length > 0) return true;
      if (typeof metadata?.lineCrossing === 'string' && metadata.lineCrossing.length > 0) return true;
      if (typeof metadata?.crossing_direction === 'string' && metadata.crossing_direction.length > 0) return true;
      if (typeof metadata?.tripwire_direction === 'string' && metadata.tripwire_direction.length > 0) return true;

      return false;
    },
    score: 0.85,
    reason: 'Directional line crossing / virtual tripwire boundary breach detected',
  },
];

/**
 * Rule Engine for applying detection rules
 */
export class RuleEngine {
  private rules: DetectionRule[] = [];

  constructor(rules: DetectionRule[] = DETECTION_RULES) {
    this.rules = rules;
  }

  /**
   * Add a custom rule
   */
  addRule(rule: DetectionRule): void {
    this.rules.push(rule);
  }

  /**
   * Evaluate all rules against an event
   */
  evaluate(event: SecurityEvent, context: RuleContext = {}): {
    matchedRules: Array<{
      rule: DetectionRule;
      score: number;
      reason: string;
    }>;
    maxScore: number;
    reasons: string[];
  } {
    const matchedRules: Array<{
      rule: DetectionRule;
      score: number;
      reason: string;
    }> = [];

    for (const rule of this.rules) {
      if (rule.when(event, context)) {
        const score = typeof rule.score === 'function'
          ? rule.score(event, context)
          : rule.score;

        matchedRules.push({
          rule,
          score,
          reason: rule.reason,
        });
      }
    }

    const maxScore = matchedRules.length > 0
      ? Math.max(...matchedRules.map(m => m.score))
      : 0;

    const reasons = matchedRules.map(m => m.reason);

    return {
      matchedRules,
      maxScore,
      reasons,
    };
  }

  /**
   * Get all rules
   */
  getRules(): DetectionRule[] {
    return [...this.rules];
  }

  /**
   * Remove a rule
   */
  removeRule(ruleId: string): boolean {
    const index = this.rules.findIndex(r => r.id === ruleId);
    if (index >= 0) {
      this.rules.splice(index, 1);
      return true;
    }
    return false;
  }
}
