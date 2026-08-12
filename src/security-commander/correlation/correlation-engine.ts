/**
 * Correlation Engine
 * 
 * Main engine for correlating security events into meaningful incidents.
 */

import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { SecurityEventRepository } from '../repositories/security-event.repository.js';
import { IncidentRepository } from '../repositories/incident.repository.js';
import { getCorrelationRules } from './correlation-rules.registry.js';
import {
  type CorrelationRule,
  matchesCondition,
  canCorrelateByTime,
  canCorrelateByLocation,
  canCorrelateByEntity,
} from './correlation-rule.js';
import type {
  SecurityEvent,
  Incident,
  CreateIncidentInput,
  AssetReference,
} from '../types/index.js';
import { createHash } from 'node:crypto';

export interface CorrelationResult {
  incidents: Incident[];
  uncorrelatedEvents: SecurityEvent[];
  correlationTime: number;
}

export interface CorrelationMatch {
  rule: CorrelationRule;
  events: SecurityEvent[];
  confidence: number;
}

export class CorrelationEngine {
  private readonly eventRepository: SecurityEventRepository;
  private readonly incidentRepository: IncidentRepository;
  private readonly rules: CorrelationRule[];

  constructor(
    pool: Pool,
    customRules: CorrelationRule[] = []
  ) {
    this.eventRepository = new SecurityEventRepository(pool);
    this.incidentRepository = new IncidentRepository(pool);
    this.rules = [...getCorrelationRules(), ...customRules];
  }

  /**
   * Correlate events in a time range
   */
  async correlateEvents(
    tenantId: string,
    from: Date,
    to: Date,
    branchId?: string
  ): Promise<CorrelationResult> {
    const startTime = Date.now();

    // Get uncorrelated events
    const events = await this.eventRepository.getEventsForCorrelation(
      tenantId,
      branchId,
      from,
      to
    );

    if (events.length === 0) {
      return {
        incidents: [],
        uncorrelatedEvents: [],
        correlationTime: Date.now() - startTime,
      };
    }

    // Find correlation matches
    const matches = this.findCorrelationMatches(events);

    // Create incidents from matches
    const incidents: Incident[] = [];
    const correlatedEventIds = new Set<string>();

    for (const match of matches) {
      const incident = await this.createIncidentFromMatch(match, tenantId);
      incidents.push(incident);

      // Mark events as correlated
      for (const event of match.events) {
        correlatedEventIds.add(event.id);
      }
    }

    // Find uncorrelated events
    const uncorrelatedEvents = events.filter(
      event => !correlatedEventIds.has(event.id)
    );

    return {
      incidents,
      uncorrelatedEvents,
      correlationTime: Date.now() - startTime,
    };
  }

  /**
   * Correlate a single new event against recent events
   */
  async correlateNewEvent(event: SecurityEvent): Promise<Incident | null> {
    // Get recent events for correlation
    const windowStart = new Date(event.timestamp.getTime() - 600 * 1000); // Last 10 minutes
    
    const recentEvents = await this.eventRepository.searchEvents({
      tenantId: event.tenantId,
      branchId: event.branchId,
      from: windowStart,
      to: event.timestamp,
      limit: 1000,
    });

    // Add current event
    const allEvents = [...recentEvents, event];

    // Try to find matches
    const matches = this.findCorrelationMatches(allEvents);

    if (matches.length === 0) {
      return null;
    }

    // Use highest priority match
    const match = matches[0];
    if (!match) {
      return null;
    }

    // Check if this should update an existing incident
    const fingerprint = this.generateFingerprint(match);
    const existingIncident = await this.incidentRepository.getIncidentByFingerprint(
      event.tenantId,
      fingerprint,
      60 // Within last 60 minutes
    );

    if (existingIncident) {
      // Add new events to existing incident
      const newEventIds = match.events
        .filter(e => !existingIncident.eventIds.includes(e.id))
        .map(e => e.id);

      if (newEventIds.length > 0) {
        await this.incidentRepository.addEventsToIncident(
          existingIncident.id,
          newEventIds
        );
      }

      return existingIncident;
    }

    // Create new incident
    return this.createIncidentFromMatch(match, event.tenantId);
  }

  /**
   * Find correlation matches from a set of events
   */
  private findCorrelationMatches(events: SecurityEvent[]): CorrelationMatch[] {
    const matches: CorrelationMatch[] = [];

    for (const rule of this.rules) {
      const ruleMatches = this.findMatchesForRule(rule, events);
      matches.push(...ruleMatches);
    }

    // Sort by confidence (highest first)
    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Find matches for a specific rule
   */
  private findMatchesForRule(
    rule: CorrelationRule,
    events: SecurityEvent[]
  ): CorrelationMatch[] {
    const matches: CorrelationMatch[] = [];

    // Group events that could potentially match this rule
    const candidateGroups = this.groupCandidateEvents(rule, events);

    for (const group of candidateGroups) {
      if (this.groupMatchesRule(rule, group)) {
        const confidence = rule.confidenceCalculator
          ? rule.confidenceCalculator(group)
          : 0.8;

        matches.push({
          rule,
          events: group,
          confidence,
        });
      }
    }

    return matches;
  }

  /**
   * Group candidate events that could match a rule
   */
  private groupCandidateEvents(
    rule: CorrelationRule,
    events: SecurityEvent[]
  ): SecurityEvent[][] {
    const groups: SecurityEvent[][] = [];

    // Filter events that match at least one condition
    const matchingEvents = events.filter(event =>
      rule.conditions.some(condition => matchesCondition(event, condition))
    );

    if (matchingEvents.length === 0) {
      return groups;
    }

    // Group by time, location, and entity proximity
    for (const seedEvent of matchingEvents) {
      const group = [seedEvent];

      for (const otherEvent of matchingEvents) {
        if (otherEvent.id === seedEvent.id) continue;
        if (group.some(e => e.id === otherEvent.id)) continue;

        // Check if can correlate
        const canCorrelate =
          canCorrelateByTime(seedEvent, otherEvent, rule.windowSeconds) &&
          canCorrelateByLocation(seedEvent, otherEvent) &&
          this.eventsShareContext(seedEvent, otherEvent);

        if (canCorrelate) {
          group.push(otherEvent);
        }
      }

      // Only add groups that meet minimum size
      if (group.length >= (rule.minMatches ?? rule.conditions.length)) {
        // Check if this group is unique
        const isDuplicate = groups.some(existingGroup =>
          this.groupsAreEquivalent(group, existingGroup)
        );

        if (!isDuplicate) {
          groups.push(group);
        }
      }
    }

    return groups;
  }

  /**
   * Check if a group matches a rule
   */
  private groupMatchesRule(
    rule: CorrelationRule,
    events: SecurityEvent[]
  ): boolean {
    const minMatches = rule.minMatches ?? rule.conditions.length;

    // Count how many conditions are satisfied
    let satisfiedConditions = 0;

    for (const condition of rule.conditions) {
      const hasMatch = events.some(event => matchesCondition(event, condition));
      if (hasMatch) {
        satisfiedConditions++;
      }
    }

    return satisfiedConditions >= minMatches;
  }

  /**
   * Check if events share context (entity, location, or time)
   */
  private eventsShareContext(a: SecurityEvent, b: SecurityEvent): boolean {
    return !!(
      canCorrelateByEntity(a, b) ||
      (a.location?.zoneId && b.location?.zoneId && a.location.zoneId === b.location.zoneId)
    );
  }

  /**
   * Check if two groups are equivalent
   */
  private groupsAreEquivalent(a: SecurityEvent[], b: SecurityEvent[]): boolean {
    if (a.length !== b.length) return false;

    const aIds = new Set(a.map(e => e.id));
    const bIds = new Set(b.map(e => e.id));

    return a.every(e => bIds.has(e.id)) && b.every(e => aIds.has(e.id));
  }

  /**
   * Create an incident from a correlation match
   */
  private async createIncidentFromMatch(
    match: CorrelationMatch,
    tenantId: string
  ): Promise<Incident> {
    const { rule, events, confidence } = match;

    // Sort events by timestamp
    const sortedEvents = [...events].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    const firstEvent = sortedEvents[0];
    const lastEvent = sortedEvents[sortedEvents.length - 1];
    
    if (!firstEvent || !lastEvent) {
      throw new Error('Cannot create incident from empty events array');
    }

    // Generate title and explanation
    const title = rule.generateTitle
      ? rule.generateTitle(events)
      : rule.name;

    const explanation = rule.generateExplanation
      ? rule.generateExplanation(events)
      : rule.description;

    // Extract affected assets
    const affectedAssets = this.extractAffectedAssets(events);

    // Extract evidence IDs
    const evidenceIds = events
      .filter(e => e.evidence?.snapshotUrl || e.evidence?.clipUrl)
      .map(e => e.id);

    // Generate fingerprint for deduplication
    const fingerprint = this.generateFingerprint(match);

    // Create incident
    const input: CreateIncidentInput = {
      tenantId,
      branchId: firstEvent.branchId,
      zoneId: firstEvent.location?.zoneId,
      type: rule.outputIncidentType,
      title,
      description: explanation,
      severity: rule.severity,
      confidence,
      startedAt: firstEvent.timestamp,
      eventIds: events.map(e => e.id),
      affectedAssets,
      evidenceIds,
      explanation,
      fingerprint,
      metadata: {
        ruleId: rule.id,
        ruleName: rule.name,
        eventCount: events.length,
        duration: lastEvent.timestamp.getTime() - firstEvent.timestamp.getTime(),
      },
    };

    // Check for existing incident with same fingerprint
    const existing = await this.incidentRepository.getIncidentByFingerprint(
      tenantId,
      fingerprint,
      60 // Within last 60 minutes
    );

    if (existing) {
      // Add new events to existing
      const newEventIds = events
        .filter(e => !existing.eventIds?.includes(e.id))
        .map(e => e.id);

      if (newEventIds.length > 0) {
        await this.incidentRepository.addEventsToIncident(existing.id, newEventIds);
      }

      return existing;
    }

    return this.incidentRepository.createIncident(input);
  }

  /**
   * Extract affected assets from events
   */
  private extractAffectedAssets(events: SecurityEvent[]): AssetReference[] {
    const assets = new Map<string, AssetReference>();

    for (const event of events) {
      // Add camera
      if (event.entities?.cameraId) {
        assets.set(`camera-${event.entities.cameraId}`, {
          type: 'camera',
          id: event.entities.cameraId,
          name: event.source.name,
        });
      }

      // Add door
      if (event.entities?.doorId) {
        assets.set(`door-${event.entities.doorId}`, {
          type: 'door',
          id: event.entities.doorId,
        });
      }

      // Add recorder
      if (event.entities?.recorderId) {
        assets.set(`recorder-${event.entities.recorderId}`, {
          type: 'recorder',
          id: event.entities.recorderId,
        });
      }

      // Add zone
      if (event.entities?.zoneId) {
        assets.set(`zone-${event.entities.zoneId}`, {
          type: 'zone',
          id: event.entities.zoneId,
          name: event.location?.zone,
        });
      }

      // Add network device
      if (event.entities?.networkDeviceId) {
        assets.set(`network-device-${event.entities.networkDeviceId}`, {
          type: 'network-device',
          id: event.entities.networkDeviceId,
        });
      }

      // Add storage
      if (event.entities?.storageId) {
        assets.set(`storage-${event.entities.storageId}`, {
          type: 'storage',
          id: event.entities.storageId,
        });
      }
    }

    return Array.from(assets.values());
  }

  /**
   * Generate fingerprint for incident deduplication
   */
  private generateFingerprint(match: CorrelationMatch): string {
    const { rule, events } = match;

    // Sort event IDs to ensure consistent fingerprint
    const eventIds = events.map(e => e.id).sort().join(',');

    // Include branch and zone for locality
    const firstEvent = events[0];
    const branchId = firstEvent?.branchId ?? '';
    const zoneId = firstEvent?.location?.zoneId ?? '';

    // Generate hash
    const hash = createHash('sha256');
    hash.update(`${rule.id}:${branchId}:${zoneId}:${eventIds}`);

    return hash.digest('hex').substring(0, 16);
  }

  /**
   * Get correlation statistics
   */
  async getCorrelationStats(
    tenantId: string,
    from: Date,
    to: Date
  ): Promise<{
    totalEvents: number;
    correlatedEvents: number;
    incidentsCreated: number;
    topIncidentTypes: Array<{ type: string; count: number }>;
  }> {
    const eventStats = await this.eventRepository.getEventStats({
      tenantId,
      from,
      to,
    });

    const incidentStats = await this.incidentRepository.getIncidentStats({
      tenantId,
      from,
      to,
    });

    // Calculate correlated events (events that are part of incidents)
    const incidents = await this.incidentRepository.searchIncidents({
      tenantId,
      from,
      to,
      limit: 10000,
    });

    const correlatedEventCount = incidents.reduce(
      (sum, incident) => sum + incident.eventCount,
      0
    );

    return {
      totalEvents: eventStats.total,
      correlatedEvents: correlatedEventCount,
      incidentsCreated: incidentStats.total,
      topIncidentTypes: [],
    };
  }

  /**
   * Add custom correlation rule
   */
  addRule(rule: CorrelationRule): void {
    this.rules.push(rule);
  }

  /**
   * Get all active rules
   */
  getRules(): CorrelationRule[] {
    return [...this.rules];
  }
}
