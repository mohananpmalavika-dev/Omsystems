/**
 * Investigation Service
 * 
 * Creates and manages security investigations from incidents and events.
 */

import type { Pool } from 'pg';
import { InvestigationRepository } from '../repositories/investigation.repository.js';
import { IncidentRepository } from '../repositories/incident.repository.js';
import { SecurityEventRepository } from '../repositories/security-event.repository.js';
import type {
  Investigation,
  CreateInvestigationInput,
  TimelineEntry,
  Evidence,
  InvestigationHypothesis,
  RecommendedAction,
  Incident,
  SecurityEvent,
  AssetReference,
} from '../types/index.js';

export interface CreateInvestigationFromQueryOptions {
  tenantId: string;
  title: string;
  description?: string;
  timeRange: {
    from: Date;
    to: Date;
  };
  branchId?: string;
  branchIds?: string[];
  abnormalOnly?: boolean;
  minSeverity?: string;
  userId?: string;
}

export class InvestigationService {
  private readonly investigationRepo: InvestigationRepository;
  private readonly incidentRepo: IncidentRepository;
  private readonly eventRepo: SecurityEventRepository;

  constructor(pool: Pool) {
    this.investigationRepo = new InvestigationRepository(pool);
    this.incidentRepo = new IncidentRepository(pool);
    this.eventRepo = new SecurityEventRepository(pool);
  }

  /**
   * Create investigation from a query (e.g., "show me abnormal events in last 30 minutes")
   */
  async createInvestigationFromQuery(
    options: CreateInvestigationFromQueryOptions
  ): Promise<Investigation> {
    const {
      tenantId,
      title,
      description,
      timeRange,
      branchId,
      branchIds,
      abnormalOnly,
      minSeverity,
      userId,
    } = options;

    // Search for relevant incidents
    const incidents = await this.incidentRepo.searchIncidents({
      tenantId,
      branchId,
      branchIds,
      from: timeRange.from,
      to: timeRange.to,
      severities: minSeverity ? [minSeverity as any] : undefined,
      limit: 1000,
    });

    // Search for relevant events
    const events = await this.eventRepo.searchEvents({
      tenantId,
      branchId,
      branchIds,
      from: timeRange.from,
      to: timeRange.to,
      abnormalOnly: abnormalOnly ?? false,
      limit: 10000,
    });

    // Create investigation
    const input: CreateInvestigationInput = {
      tenantId,
      title,
      description,
      priority: this.determinePriority(incidents),
      timeRange,
      scope: {
        type: branchId ? 'branch' : branchIds ? 'custom' : 'enterprise',
        branchId,
        branchIds,
      },
      createdBy: {
        type: userId ? 'operator' : 'ai-commander',
        userId,
      },
    };

    const investigation = await this.investigationRepo.createInvestigation(input);

    // Associate incidents
    if (incidents.length > 0) {
      await this.investigationRepo.associateIncidents(
        investigation.id,
        incidents.map(i => i.id)
      );
    }

    // Build timeline from events and incidents
    await this.buildTimeline(investigation.id, events, incidents);

    // Extract and add evidence
    await this.extractEvidence(investigation.id, events);

    // Generate hypotheses
    await this.generateHypotheses(investigation.id, incidents);

    // Add recommended actions based on incidents
    await this.generateRecommendedActions(investigation.id, incidents);

    // Reload with all data
    return (await this.investigationRepo.getInvestigation(investigation.id))!;
  }

  /**
   * Build investigation timeline from events and incidents
   */
  private async buildTimeline(
    investigationId: string,
    events: SecurityEvent[],
    incidents: Incident[]
  ): Promise<void> {
    // Add event entries
    for (const event of events) {
      await this.investigationRepo.addTimelineEntry(investigationId, {
        timestamp: event.timestamp,
        type: 'event',
        title: this.generateEventTitle(event),
        description: this.generateEventDescription(event),
        eventId: event.id,
        severity: event.severity,
        assets: event.entities ? this.entitiesToAssets(event.entities) : undefined,
        evidenceIds: event.evidence ? [event.id] : undefined,
      });
    }

    // Add incident entries
    for (const incident of incidents) {
      await this.investigationRepo.addTimelineEntry(investigationId, {
        timestamp: incident.startedAt,
        type: 'incident',
        title: incident.title,
        description: incident.explanation,
        incidentId: incident.id,
        severity: incident.severity,
        assets: incident.affectedAssets,
      });
    }
  }

  /**
   * Extract evidence from events
   */
  private async extractEvidence(
    investigationId: string,
    events: SecurityEvent[]
  ): Promise<void> {
    for (const event of events) {
      // Add snapshot evidence
      if (event.evidence?.snapshotUrl) {
        await this.investigationRepo.addEvidence(investigationId, {
          type: 'camera_snapshot',
          sourceId: event.source.id,
          sourceName: event.source.name,
          timestamp: event.timestamp,
          uri: event.evidence.snapshotUrl,
          description: `Snapshot from ${event.source.name} at ${event.timestamp.toISOString()}`,
          metadata: {
            eventId: event.id,
            eventType: event.type,
          },
        });
      }

      // Add clip evidence
      if (event.evidence?.clipUrl) {
        await this.investigationRepo.addEvidence(investigationId, {
          type: 'camera_clip',
          sourceId: event.source.id,
          sourceName: event.source.name,
          timestamp: event.timestamp,
          uri: event.evidence.clipUrl,
          description: `Video clip from ${event.source.name}`,
          metadata: {
            eventId: event.id,
            eventType: event.type,
          },
        });
      }

      // Add AI detection evidence
      if (event.source.type === 'ai') {
        await this.investigationRepo.addEvidence(investigationId, {
          type: 'ai_detection',
          sourceId: event.source.id,
          sourceName: event.source.name,
          timestamp: event.timestamp,
          description: `AI Detection: ${event.type}`,
          metadata: {
            eventId: event.id,
            eventType: event.type,
            confidence: event.confidence,
            detectionData: event.metadata,
          },
        });
      }
    }
  }

  /**
   * Generate investigation hypotheses
   */
  private async generateHypotheses(
    investigationId: string,
    incidents: Incident[]
  ): Promise<void> {
    // Group incidents by type to find patterns
    const incidentsByType = new Map<string, Incident[]>();
    for (const incident of incidents) {
      const list = incidentsByType.get(incident.type) || [];
      list.push(incident);
      incidentsByType.set(incident.type, list);
    }

    // Generate hypotheses based on incident patterns
    for (const [type, relatedIncidents] of incidentsByType.entries()) {
      if (relatedIncidents.length === 0) continue;

      const hypothesis = this.generateHypothesisFromIncidents(type, relatedIncidents);
      
      if (hypothesis) {
        await this.investigationRepo.addHypothesis(investigationId, {
          description: hypothesis.description,
          confidence: hypothesis.confidence,
          status: hypothesis.status,
          supportingEvidenceIds: hypothesis.supportingEvidenceIds,
          contradictingEvidenceIds: [],
          createdBy: {
            type: 'ai-commander',
          },
        });
      }
    }
  }

  /**
   * Generate hypothesis from incident patterns
   */
  private generateHypothesisFromIncidents(
    type: string,
    incidents: Incident[]
  ): Omit<InvestigationHypothesis, 'id' | 'createdAt' | 'updatedAt'> | null {
    const evidenceIds = incidents.flatMap(i => i.evidenceIds || []);

    switch (type) {
      case 'security.unauthorized_entry':
        return {
          description: 'Potential unauthorized physical breach detected. Access was denied but entry was gained through force.',
          confidence: Math.max(...incidents.map(i => i.confidence)),
          status: 'likely',
          supportingEvidenceIds: evidenceIds,
          contradictingEvidenceIds: [],
          createdBy: { type: 'ai-commander' },
        };

      case 'infrastructure.network_cascade':
        return {
          description: 'Network infrastructure failure caused cascade of device outages. Root cause likely network switch failure.',
          confidence: 0.9,
          status: 'likely',
          supportingEvidenceIds: evidenceIds,
          contradictingEvidenceIds: [],
          createdBy: { type: 'ai-commander' },
        };

      case 'infrastructure.camera_tampering':
        return {
          description: 'Camera tampering detected, possibly to disable surveillance before unauthorized activity.',
          confidence: 0.85,
          status: 'possible',
          supportingEvidenceIds: evidenceIds,
          contradictingEvidenceIds: [],
          createdBy: { type: 'ai-commander' },
        };

      case 'security.after_hours_activity':
        return {
          description: 'Unusual activity detected outside normal business hours. May indicate unauthorized access or security breach.',
          confidence: 0.75,
          status: 'possible',
          supportingEvidenceIds: evidenceIds,
          contradictingEvidenceIds: [],
          createdBy: { type: 'ai-commander' },
        };

      default:
        return null;
    }
  }

  /**
   * Generate recommended actions based on incidents
   */
  private async generateRecommendedActions(
    investigationId: string,
    incidents: Incident[]
  ): Promise<void> {
    const actions = new Map<string, RecommendedAction>();
    let order = 1;

    // Determine actions based on incident types
    const hasCritical = incidents.some(i => i.severity === 'critical');
    const hasUnauthorizedEntry = incidents.some(i => 
      i.type === 'security.unauthorized_entry' || i.type === 'security.forced_entry'
    );
    const hasNetworkFailure = incidents.some(i => 
      i.type === 'infrastructure.network_cascade'
    );
    const hasCameraTamper = incidents.some(i => 
      i.type === 'infrastructure.camera_tampering'
    );
    const hasFire = incidents.some(i => i.type === 'safety.fire_alarm');

    // Critical safety actions
    if (hasFire) {
      actions.set('evacuate', {
        id: '',
        order: order++,
        title: 'Initiate evacuation procedures',
        description: 'Fire or smoke detected. Evacuate personnel immediately.',
        required: true,
        status: 'pending',
      });

      actions.set('fire-response', {
        id: '',
        order: order++,
        title: 'Contact fire department',
        description: 'Notify emergency services immediately.',
        required: true,
        status: 'pending',
      });
    }

    // Physical security actions
    if (hasUnauthorizedEntry) {
      actions.set('preserve-evidence', {
        id: '',
        order: order++,
        title: 'Preserve video evidence',
        description: 'Save all camera footage related to the incident.',
        required: true,
        status: 'pending',
      });

      actions.set('verify-access', {
        id: '',
        order: order++,
        title: 'Verify access control logs',
        description: 'Review complete access control records for the time period.',
        required: true,
        status: 'pending',
      });

      actions.set('notify-security', {
        id: '',
        order: order++,
        title: 'Notify local security personnel',
        description: 'Alert on-site security team to investigate.',
        required: true,
        status: 'pending',
      });

      actions.set('check-physical', {
        id: '',
        order: order++,
        title: 'Physical inspection of affected areas',
        description: 'Conduct physical verification of doors and entry points.',
        required: false,
        status: 'pending',
      });
    }

    // Camera tamper actions
    if (hasCameraTamper) {
      actions.set('inspect-cameras', {
        id: '',
        order: order++,
        title: 'Inspect tampered cameras',
        description: 'Physically inspect cameras that reported tampering.',
        required: true,
        status: 'pending',
      });

      actions.set('check-adjacent', {
        id: '',
        order: order++,
        title: 'Review adjacent camera footage',
        description: 'Check footage from nearby cameras for suspicious activity.',
        required: true,
        status: 'pending',
      });
    }

    // Network failure actions
    if (hasNetworkFailure) {
      actions.set('verify-network', {
        id: '',
        order: order++,
        title: 'Verify network infrastructure',
        description: 'Check status of network switches and connections.',
        required: true,
        status: 'pending',
      });

      actions.set('restore-connectivity', {
        id: '',
        order: order++,
        title: 'Restore device connectivity',
        description: 'Reconnect affected cameras and recorders.',
        required: true,
        status: 'pending',
      });
    }

    // Generic critical actions
    if (hasCritical) {
      actions.set('notify-management', {
        id: '',
        order: order++,
        title: 'Notify management',
        description: 'Alert appropriate management personnel of critical incident.',
        required: false,
        status: 'pending',
      });

      actions.set('document-incident', {
        id: '',
        order: order++,
        title: 'Document incident details',
        description: 'Create comprehensive incident report with all findings.',
        required: false,
        status: 'pending',
      });
    }

    // Add all actions to investigation
    for (const action of actions.values()) {
      await this.investigationRepo.addRecommendedAction(investigationId, action);
    }
  }

  /**
   * Determine investigation priority from incidents
   */
  private determinePriority(incidents: Incident[]): 'low' | 'medium' | 'high' | 'critical' {
    if (incidents.length === 0) return 'medium';

    const hasCritical = incidents.some(i => i.severity === 'critical');
    const hasHigh = incidents.some(i => i.severity === 'high');

    if (hasCritical) return 'critical';
    if (hasHigh) return 'high';
    if (incidents.length >= 5) return 'high';
    if (incidents.length >= 3) return 'medium';
    return 'low';
  }

  /**
   * Generate event title for timeline
   */
  private generateEventTitle(event: SecurityEvent): string {
    const sourceLabel = event.source.name || event.source.id;

    switch (event.type) {
      case 'camera.offline':
        return `Camera ${sourceLabel} went offline`;
      case 'camera.online':
        return `Camera ${sourceLabel} came online`;
      case 'camera.tamper':
        return `Camera ${sourceLabel} tamper detected`;
      case 'access.denied':
        return `Access denied at ${sourceLabel}`;
      case 'access.granted':
        return `Access granted at ${sourceLabel}`;
      case 'access.door_forced':
        return `Door ${sourceLabel} forced open`;
      case 'ai.person_detected':
        return `Person detected by ${sourceLabel}`;
      case 'ai.fire_detected':
        return `Fire detected by ${sourceLabel}`;
      case 'ai.smoke_detected':
        return `Smoke detected by ${sourceLabel}`;
      case 'recorder.recording_stopped':
        return `Recording stopped on ${sourceLabel}`;
      case 'network.device_unreachable':
        return `Network device ${sourceLabel} unreachable`;
      default:
        return `${event.type} - ${sourceLabel}`;
    }
  }

  /**
   * Generate event description
   */
  private generateEventDescription(event: SecurityEvent): string {
    let desc = `Event: ${event.type}\n`;
    desc += `Severity: ${event.severity}\n`;
    
    if (event.confidence !== undefined) {
      desc += `Confidence: ${(event.confidence * 100).toFixed(0)}%\n`;
    }

    if (event.location?.zone) {
      desc += `Location: ${event.location.zone}\n`;
    }

    return desc.trim();
  }

  /**
   * Convert entities to assets
   */
  private entitiesToAssets(entities: any): AssetReference[] {
    const assets: AssetReference[] = [];

    if (entities.cameraId) {
      assets.push({ type: 'camera', id: entities.cameraId });
    }
    if (entities.doorId) {
      assets.push({ type: 'door', id: entities.doorId });
    }
    if (entities.recorderId) {
      assets.push({ type: 'recorder', id: entities.recorderId });
    }
    if (entities.zoneId) {
      assets.push({ type: 'zone', id: entities.zoneId });
    }

    return assets;
  }

  /**
   * Get investigation by ID
   */
  async getInvestigation(id: string): Promise<Investigation | undefined> {
    return this.investigationRepo.getInvestigation(id);
  }

  /**
   * Update investigation
   */
  async updateInvestigation(
    id: string,
    updates: Partial<Investigation>
  ): Promise<Investigation | undefined> {
    return this.investigationRepo.updateInvestigation(id, updates as any);
  }

  /**
   * Close investigation
   */
  async closeInvestigation(
    id: string,
    resolution: 'resolved' | 'dismissed'
  ): Promise<Investigation | undefined> {
    return this.investigationRepo.updateInvestigation(id, {
      status: resolution,
    });
  }
}
