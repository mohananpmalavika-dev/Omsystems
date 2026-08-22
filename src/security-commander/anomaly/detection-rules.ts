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
    when: event => event.type === 'ai.fall_detected',
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
      if (event.type !== 'camera.offline') return false;
      
      const hour = event.timestamp.getHours();
      const dayOfWeek = event.timestamp.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isBusinessHours = hour >= 8 && hour < 18;
      
      return !isWeekend && isBusinessHours;
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

  // Unattended Object
  {
    id: 'unattended-object',
    name: 'Unattended Object',
    description: 'Unattended object/baggage detected',
    when: event => event.type === 'ai.unattended_object',
    score: 0.8,
    reason: 'Unattended object detected',
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
