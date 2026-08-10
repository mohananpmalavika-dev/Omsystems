/**
 * Correlation Rule Definition
 * 
 * Defines rules for correlating security events into incidents.
 */

import type { SecurityEvent, SecuritySeverity, IncidentType } from '../types/index.js';

export interface CorrelationCondition {
  /** Event type to match */
  eventType?: string;

  /** Event types that match (any) */
  eventTypes?: string[];

  /** Minimum severity */
  minSeverity?: SecuritySeverity;

  /** Minimum confidence */
  minConfidence?: number;

  /** Source type */
  sourceType?: string;

  /** Custom matcher function */
  matches?: (event: SecurityEvent) => boolean;
}

export interface CorrelationRule {
  /** Unique rule identifier */
  id: string;

  /** Rule name */
  name: string;

  /** Description */
  description: string;

  /** Time window in seconds */
  windowSeconds: number;

  /** Conditions that must be met */
  conditions: CorrelationCondition[];

  /** How many conditions must match (default: all) */
  minMatches?: number;

  /** Output incident type */
  outputIncidentType: IncidentType;

  /** Output severity */
  severity: SecuritySeverity;

  /** Confidence multiplier based on match quality */
  confidenceCalculator?: (events: SecurityEvent[]) => number;

  /** Title generator */
  generateTitle?: (events: SecurityEvent[]) => string;

  /** Explanation generator */
  generateExplanation?: (events: SecurityEvent[]) => string;

  /** Priority (higher runs first) */
  priority?: number;

  /** Enabled */
  enabled?: boolean;
}

/**
 * Check if event matches a condition
 */
export function matchesCondition(
  event: SecurityEvent,
  condition: CorrelationCondition
): boolean {
  // Check event type
  if (condition.eventType && event.type !== condition.eventType) {
    return false;
  }

  if (condition.eventTypes && !condition.eventTypes.includes(event.type)) {
    return false;
  }

  // Check severity
  if (condition.minSeverity) {
    const severityOrder: Record<SecuritySeverity, number> = {
      info: 0,
      low: 1,
      medium: 2,
      high: 3,
      critical: 4,
    };

    if (severityOrder[event.severity] < severityOrder[condition.minSeverity]) {
      return false;
    }
  }

  // Check confidence
  if (condition.minConfidence !== undefined && event.confidence !== undefined) {
    if (event.confidence < condition.minConfidence) {
      return false;
    }
  }

  // Check source type
  if (condition.sourceType && event.source.type !== condition.sourceType) {
    return false;
  }

  // Custom matcher
  if (condition.matches && !condition.matches(event)) {
    return false;
  }

  return true;
}

/**
 * Check if events can be correlated by location
 */
export function canCorrelateByLocation(
  a: SecurityEvent,
  b: SecurityEvent
): boolean {
  // Must be same branch
  if (a.branchId !== b.branchId) {
    return false;
  }

  // If zones are specified, they should match
  if (a.location?.zoneId && b.location?.zoneId) {
    return a.location.zoneId === b.location.zoneId;
  }

  return true;
}

/**
 * Check if events can be correlated by time
 */
export function canCorrelateByTime(
  a: SecurityEvent,
  b: SecurityEvent,
  windowSeconds: number
): boolean {
  const timeDiff = Math.abs(
    a.timestamp.getTime() - b.timestamp.getTime()
  ) / 1000;

  return timeDiff <= windowSeconds;
}

/**
 * Check if events can be correlated by entity
 */
export function canCorrelateByEntity(
  a: SecurityEvent,
  b: SecurityEvent
): boolean {
  // Check common entities
  const aEntities = a.entities ?? {};
  const bEntities = b.entities ?? {};

  // Check for shared camera
  if (aEntities.cameraId && bEntities.cameraId) {
    return aEntities.cameraId === bEntities.cameraId;
  }

  // Check for shared door
  if (aEntities.doorId && bEntities.doorId) {
    return aEntities.doorId === bEntities.doorId;
  }

  // Check for shared zone
  if (aEntities.zoneId && bEntities.zoneId) {
    return aEntities.zoneId === bEntities.zoneId;
  }

  // Check for shared badge/user
  if (aEntities.badgeId && bEntities.badgeId) {
    return aEntities.badgeId === bEntities.badgeId;
  }

  if (aEntities.userId && bEntities.userId) {
    return aEntities.userId === bEntities.userId;
  }

  return false;
}
