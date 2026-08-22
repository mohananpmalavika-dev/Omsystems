/**
 * Security Device Event Correlation Engine
 * 
 * Intelligently correlates events from multiple security devices to detect
 * coordinated security incidents. Prevents alert fatigue by combining related
 * events into single high-confidence incidents.
 * 
 * Key Patterns Detected:
 * - Unauthorized access attempts (door + camera + vault + alarm)
 * - Panic emergencies (button + nearby cameras)
 * - Fire/smoke events (detector + panel + cameras)
 * - ATM tampering (cabinet + camera + alarm)
 * - Power failures affecting multiple systems
 * - Environmental threats (temperature + UPS + equipment)
 */

import { Pool } from 'pg';
import { Redis } from 'ioredis';
import {
  SecurityDeviceEvent,
  CorrelatedSecurityIncident,
  EventSeverity,
  SecurityDeviceEventType,
} from '../types/security-device';
import { PanicButtonEmergencyService } from './panic-button-emergency.service';

interface CorrelationRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  
  // Matching criteria
  eventTypes: SecurityDeviceEventType[];
  timeWindowSeconds: number;
  minimumEvents: number;
  requiredDeviceTypes?: string[];
  
  // Incident generation
  incidentType: string;
  severity: EventSeverity;
  confidenceThreshold: number;
  
  // Correlation logic
  correlate: (events: SecurityDeviceEvent[]) => CorrelationResult | null;
}

interface CorrelationResult {
  confidence: number;
  title: string;
  description: string;
  aiSummary: string;
  involvedDeviceIds: string[];
  primaryEventId: string;
  evidence: string[];
  actionable: boolean;
  recommendedActions: string[];
}

interface TimeWindowedEvents {
  [branchId: string]: {
    [eventType: string]: SecurityDeviceEvent[];
  };
}

export interface CorrelatedIncidentFilters {
  tenantId: string;
  branchId?: string;
  status?: string;
  severity?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export class SecurityDeviceCorrelationService {
  private rules: Map<string, CorrelationRule> = new Map();
  private eventBuffer: Map<string, SecurityDeviceEvent[]> = new Map();
  private panicService: PanicButtonEmergencyService | null = null;

  constructor(
    private readonly pool: Pool,
    private readonly redis?: Redis
  ) {
    this.initializeCorrelationRules();
    
    // Initialize panic button service if Redis is available
    if (redis) {
      this.panicService = PanicButtonEmergencyService.getInstance(pool, redis);
    }
  }

  /**
   * Initialize built-in correlation rules
   */
  private initializeCorrelationRules(): void {
    // Rule 1: Unauthorized Vault Access
    this.registerRule({
      id: 'unauthorized_vault_access',
      name: 'Unauthorized Vault Access',
      description: 'Detects potential unauthorized vault access through correlated door, access control, camera, and alarm events',
      enabled: true,
      eventTypes: [
        'VAULT_OPENED',
        'VAULT_DOOR_OPENED',
        'VAULT_FORCED_OPEN',
        'VAULT_UNAUTHORIZED_ACCESS',
        'ACCESS_DENIED',
        'ACCESS_DENIED_INVALID_CREDENTIAL',
        'DOOR_FORCED_OPEN',
        'ALARM_ZONE_TRIGGERED',
        'CAMERA_MOTION_DETECTED',
      ],
      timeWindowSeconds: 120, // 2 minutes
      minimumEvents: 2,
      requiredDeviceTypes: ['VAULT', 'VAULT_DOOR'],
      incidentType: 'UNAUTHORIZED_VAULT_ACCESS',
      severity: 'P1',
      confidenceThreshold: 70,
      correlate: this.correlateVaultAccess.bind(this),
    });

    // Rule 2: Panic Button Emergency
    this.registerRule({
      id: 'panic_emergency',
      name: 'Panic Button Emergency',
      description: 'Branch emergency detected through panic button activation',
      enabled: true,
      eventTypes: [
        'PANIC_BUTTON_PRESSED',
        'DURESS_BUTTON_PRESSED',
        'EMERGENCY_BUTTON_PRESSED',
      ],
      timeWindowSeconds: 30,
      minimumEvents: 1, // Single panic event is enough
      incidentType: 'PANIC_EMERGENCY',
      severity: 'P1',
      confidenceThreshold: 100,
      correlate: this.correlatePanicEvent.bind(this),
    });

    // Rule 3: Fire/Smoke Emergency
    this.registerRule({
      id: 'fire_emergency',
      name: 'Fire/Smoke Emergency',
      description: 'Fire or smoke detected through fire panel and sensors',
      enabled: true,
      eventTypes: [
        'FIRE_ALARM_TRIGGERED',
        'SMOKE_DETECTED',
        'HEAT_DETECTED',
        'FIRE_SUPPRESSION_ACTIVATED',
      ],
      timeWindowSeconds: 60,
      minimumEvents: 1,
      incidentType: 'FIRE_EMERGENCY',
      severity: 'P1',
      confidenceThreshold: 95,
      correlate: this.correlateFireEvent.bind(this),
    });

    // Rule 4: ATM Tampering
    this.registerRule({
      id: 'atm_tampering',
      name: 'ATM Tampering',
      description: 'Potential ATM tampering detected through cabinet, camera, and alarm events',
      enabled: true,
      eventTypes: [
        'ATM_TAMPER',
        'ATM_CABINET_OPENED',
        'ATM_DOOR_OPENED',
        'ATM_VANDALISM',
        'CAMERA_MOTION_DETECTED',
        'ALARM_ZONE_TRIGGERED',
      ],
      timeWindowSeconds: 180,
      minimumEvents: 2,
      requiredDeviceTypes: ['ATM'],
      incidentType: 'ATM_TAMPERING',
      severity: 'P1',
      confidenceThreshold: 75,
      correlate: this.correlateATMTampering.bind(this),
    });

    // Rule 5: Forced Entry
    this.registerRule({
      id: 'forced_entry',
      name: 'Forced Entry Attempt',
      description: 'Forced entry detected through door sensors and alarms',
      enabled: true,
      eventTypes: [
        'DOOR_FORCED_OPEN',
        'DOOR_PROPPED_OPEN',
        'GLASS_BREAK_DETECTED',
        'ALARM_ZONE_TRIGGERED',
        'MOTION_DETECTED',
        'INTRUSION_DETECTED',
      ],
      timeWindowSeconds: 90,
      minimumEvents: 2,
      incidentType: 'FORCED_ENTRY',
      severity: 'P1',
      confidenceThreshold: 80,
      correlate: this.correlateForcedEntry.bind(this),
    });

    // Rule 6: Power Failure Cascade
    this.registerRule({
      id: 'power_failure_cascade',
      name: 'Power Failure Cascade',
      description: 'Power failure affecting multiple systems',
      enabled: true,
      eventTypes: [
        'POWER_FAILURE',
        'UPS_ON_BATTERY',
        'UPS_LOW_BATTERY',
        'UPS_CRITICAL_BATTERY',
        'DEVICE_OFFLINE',
        'CAMERA_OFFLINE',
        'NVR_OFFLINE',
      ],
      timeWindowSeconds: 300,
      minimumEvents: 3,
      incidentType: 'POWER_FAILURE',
      severity: 'P2',
      confidenceThreshold: 85,
      correlate: this.correlatePowerFailure.bind(this),
    });

    // Rule 7: Environmental Threat
    this.registerRule({
      id: 'environmental_threat',
      name: 'Environmental Threat',
      description: 'Environmental conditions threatening equipment',
      enabled: true,
      eventTypes: [
        'TEMPERATURE_HIGH',
        'TEMPERATURE_CRITICAL',
        'WATER_LEAK_DETECTED',
        'FLOOD_DETECTED',
        'HUMIDITY_HIGH',
        'GAS_LEAK_DETECTED',
      ],
      timeWindowSeconds: 180,
      minimumEvents: 1,
      incidentType: 'ENVIRONMENTAL_THREAT',
      severity: 'P2',
      confidenceThreshold: 90,
      correlate: this.correlateEnvironmentalThreat.bind(this),
    });

    console.log(`[CorrelationEngine] Initialized ${this.rules.size} correlation rules`);
  }

  /**
   * Process new security device event and check for correlations
   */
  async processEvent(event: SecurityDeviceEvent): Promise<{
    incident: CorrelatedSecurityIncident | null;
    shouldSuppress: boolean;
  }> {
    // Special handling for panic button events - immediate response required
    if (this.isPanicButtonEvent(event) && this.panicService) {
      try {
        const emergencyResponse = await this.panicService.handlePanicButtonPress(event);
        console.log(`[CorrelationEngine] Panic emergency handled: ${emergencyResponse.incidentNumber}`);
        
        // Still create a correlated incident record for tracking
        const panicIncident = await this.createPanicIncident(event, emergencyResponse);
        
        return {
          incident: panicIncident,
          shouldSuppress: true, // Suppress individual panic event
        };
      } catch (error) {
        console.error('[CorrelationEngine] Panic button handling failed:', error);
        // Fall through to normal correlation processing
      }
    }

    // Add event to buffer
    this.addEventToBuffer(event);

    // Check each rule
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      // Check if event matches rule
      if (!rule.eventTypes.includes(event.eventType)) continue;

      // Get relevant events from buffer
      const relevantEvents = this.getRelevantEvents(
        event.branchId,
        rule.eventTypes,
        rule.timeWindowSeconds
      );

      // Check if minimum event threshold met
      if (relevantEvents.length < rule.minimumEvents) continue;

      // Check device type requirements
      if (rule.requiredDeviceTypes && rule.requiredDeviceTypes.length > 0) {
        const hasRequiredDevice = await this.checkRequiredDevices(
          relevantEvents,
          rule.requiredDeviceTypes
        );
        if (!hasRequiredDevice) continue;
      }

      // Run correlation logic
      const correlationResult = rule.correlate(relevantEvents);
      if (!correlationResult) continue;

      // Check confidence threshold
      if (correlationResult.confidence < rule.confidenceThreshold) continue;

      console.log(
        `[CorrelationEngine] Rule "${rule.name}" matched with confidence ${correlationResult.confidence}%`
      );

      // Create correlated incident
      const incident = await this.createCorrelatedIncident(
        event,
        relevantEvents,
        rule,
        correlationResult
      );

      // Mark constituent events as processed
      await this.markEventsAsProcessed(relevantEvents, incident.id);

      return {
        incident,
        shouldSuppress: true, // Suppress individual events
      };
    }

    // No correlation found
    return {
      incident: null,
      shouldSuppress: false,
    };
  }

  /**
   * Read correlated incidents for the operator workspace.
   * Tenant scoping is mandatory because incidents contain sensitive branch
   * and evidence metadata.
   */
  async getCorrelatedIncidents(
    filters: CorrelatedIncidentFilters
  ): Promise<CorrelatedSecurityIncident[]> {
    const conditions = ['tenant_id = $1'];
    const params: unknown[] = [filters.tenantId];
    let parameterIndex = 2;

    if (filters.branchId) {
      conditions.push(`branch_id = $${parameterIndex}`);
      params.push(filters.branchId);
      parameterIndex += 1;
    }

    if (filters.status) {
      conditions.push(`status = $${parameterIndex}`);
      params.push(filters.status);
      parameterIndex += 1;
    }

    if (filters.severity) {
      conditions.push(`severity = $${parameterIndex}`);
      params.push(filters.severity);
      parameterIndex += 1;
    }

    if (filters.from) {
      conditions.push(`detected_at >= $${parameterIndex}`);
      params.push(filters.from);
      parameterIndex += 1;
    }

    if (filters.to) {
      conditions.push(`detected_at <= $${parameterIndex}`);
      params.push(filters.to);
      parameterIndex += 1;
    }

    const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
    const offset = Math.max(filters.offset ?? 0, 0);
    params.push(limit, offset);

    const result = await this.pool.query(
      `SELECT *
       FROM correlated_security_incidents
       WHERE ${conditions.join(' AND ')}
       ORDER BY
         CASE severity
           WHEN 'P0' THEN 0
           WHEN 'P1' THEN 1
           WHEN 'P2' THEN 2
           WHEN 'P3' THEN 3
           WHEN 'P4' THEN 4
           ELSE 5
         END,
         detected_at DESC
       LIMIT $${parameterIndex} OFFSET $${parameterIndex + 1}`,
      params
    );

    return result.rows.map((row) => this.mapIncident(row));
  }

  /**
   * Check if event is a panic button event
   */
  private isPanicButtonEvent(event: SecurityDeviceEvent): boolean {
    return (
      event.eventType === 'PANIC_BUTTON_PRESSED' ||
      event.eventType === 'DURESS_BUTTON_PRESSED' ||
      event.eventType === 'EMERGENCY_BUTTON_PRESSED'
    );
  }

  /**
   * Create panic incident record for tracking
   */
  private async createPanicIncident(
    event: SecurityDeviceEvent,
    emergencyResponse: any
  ): Promise<CorrelatedSecurityIncident> {
    const insertResult = await this.pool.query(
      `INSERT INTO correlated_security_incidents (
        tenant_id, branch_id,
        incident_type, severity, confidence,
        title, description, ai_summary,
        device_ids, event_ids, primary_event_id,
        first_event_at, last_event_at,
        status, attached_camera_ids,
        actions_log, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
      [
        event.tenantId,
        event.branchId,
        'PANIC_EMERGENCY',
        'P1',
        100,
        emergencyResponse.panicEvent.title || 'Panic Button Emergency',
        emergencyResponse.panicEvent.description || 'Panic button activated - immediate response initiated',
        `PANIC EMERGENCY: Button activated at ${emergencyResponse.panicEvent.location}. ${emergencyResponse.attachedCameras.length} cameras attached. ${emergencyResponse.notificationsSent.length} personnel notified.`,
        JSON.stringify([event.deviceId]),
        JSON.stringify([event.id]),
        event.id,
        event.occurredAt,
        event.occurredAt,
        'ACTIVE',
        JSON.stringify(emergencyResponse.attachedCameras.map((c: any) => c.cameraId)),
        JSON.stringify([
          {
            timestamp: new Date().toISOString(),
            action: 'PANIC_EMERGENCY_CREATED',
            performedBy: 'PANIC_BUTTON_SERVICE',
            details: {
              responseTime: emergencyResponse.responseTime,
              camerasAttached: emergencyResponse.attachedCameras.length,
              notificationsSent: emergencyResponse.notificationsSent.length,
              socEscalated: emergencyResponse.socEscalated,
            },
          },
        ]),
        JSON.stringify({
          panicEventId: emergencyResponse.panicEvent.id,
          triggeredBy: emergencyResponse.panicEvent.triggeredBy,
          responseTime: emergencyResponse.responseTime,
          socEscalated: emergencyResponse.socEscalated,
        }),
      ]
    );

    return this.mapIncident(insertResult.rows[0]);
  }

  /**
   * Correlate vault access events
   */
  private correlateVaultAccess(events: SecurityDeviceEvent[]): CorrelationResult | null {
    const vaultEvents = events.filter((e) =>
      e.eventType.includes('VAULT') || e.deviceType === 'VAULT' || e.deviceType === 'VAULT_DOOR'
    );
    const accessEvents = events.filter((e) => e.eventType.includes('ACCESS'));
    const alarmEvents = events.filter((e) => e.eventType.includes('ALARM'));
    const motionEvents = events.filter((e) => e.eventType.includes('MOTION'));

    if (vaultEvents.length === 0) return null;

    let confidence = 50;
    const evidence: string[] = [];

    // Vault opened
    evidence.push(`Vault ${vaultEvents[0].deviceType || 'device'} event detected`);
    confidence += 20;

    // Access denied before vault opened
    if (accessEvents.some((e) => e.eventType.includes('DENIED'))) {
      evidence.push('Access denied event preceded vault opening');
      confidence += 15;
    }

    // Alarm triggered
    if (alarmEvents.length > 0) {
      evidence.push('Alarm system triggered');
      confidence += 10;
    }

    // Motion detected
    if (motionEvents.length > 0) {
      evidence.push('Motion detected on cameras');
      confidence += 5;
    }

    // Unknown or invalid credential
    const invalidCredential = events.some(
      (e) =>
        e.eventType === 'ACCESS_DENIED_INVALID_CREDENTIAL' ||
        e.credential === 'UNKNOWN' ||
        e.credential === 'INVALID'
    );
    if (invalidCredential) {
      evidence.push('Unknown or invalid credential used');
      confidence += 15;
    }

    return {
      confidence: Math.min(confidence, 100),
      title: 'Possible Unauthorized Vault Access',
      description: `Vault access detected with suspicious indicators: ${evidence.join(', ')}`,
      aiSummary: this.generateVaultAccessSummary(events, evidence),
      involvedDeviceIds: events.map((e) => e.deviceId),
      primaryEventId: vaultEvents[0].id,
      evidence,
      actionable: true,
      recommendedActions: [
        'View live camera feeds immediately',
        'Verify vault security',
        'Contact branch manager',
        'Review access logs',
        'Consider lockdown if threat confirmed',
      ],
    };
  }

  /**
   * Correlate panic button events
   */
  private correlatePanicEvent(events: SecurityDeviceEvent[]): CorrelationResult | null {
    const panicEvent = events[0];

    return {
      confidence: 100,
      title: 'Branch Emergency - Panic Button Activated',
      description: `Panic button pressed at ${panicEvent.location || 'branch location'}`,
      aiSummary: `EMERGENCY: Panic button #${panicEvent.deviceId} activated. Immediate SOC response required.`,
      involvedDeviceIds: [panicEvent.deviceId],
      primaryEventId: panicEvent.id,
      evidence: ['Panic button activation'],
      actionable: true,
      recommendedActions: [
        'Open all nearby camera feeds immediately',
        'Establish contact with branch',
        'Alert security personnel',
        'Prepare incident response team',
        'Document timeline',
      ],
    };
  }

  /**
   * Correlate fire/smoke events
   */
  private correlateFireEvent(events: SecurityDeviceEvent[]): CorrelationResult | null {
    const fireEvents = events.filter((e) => e.eventType.includes('FIRE'));
    const smokeEvents = events.filter((e) => e.eventType.includes('SMOKE'));
    const heatEvents = events.filter((e) => e.eventType.includes('HEAT'));

    let confidence = 80;
    const evidence: string[] = [];

    if (fireEvents.length > 0) {
      evidence.push('Fire alarm triggered');
      confidence += 10;
    }

    if (smokeEvents.length > 0) {
      evidence.push('Smoke detected');
      confidence += 5;
    }

    if (heatEvents.length > 0) {
      evidence.push('Heat detected');
      confidence += 5;
    }

    const zone = events[0].location || events[0].metadata?.zone;

    return {
      confidence: Math.min(confidence, 100),
      title: 'Fire/Smoke Emergency Detected',
      description: `Fire safety system activated${zone ? ` in ${zone}` : ''}`,
      aiSummary: `FIRE EMERGENCY: Multiple fire/smoke indicators detected. Immediate evacuation and fire response required.`,
      involvedDeviceIds: events.map((e) => e.deviceId),
      primaryEventId: events[0].id,
      evidence,
      actionable: true,
      recommendedActions: [
        'Verify fire panel status',
        'View camera feeds of affected zone',
        'Initiate evacuation protocol',
        'Contact fire department',
        'Alert branch personnel',
      ],
    };
  }

  /**
   * Correlate ATM tampering events
   */
  private correlateATMTampering(events: SecurityDeviceEvent[]): CorrelationResult | null {
    const atmEvents = events.filter((e) => e.deviceType === 'ATM' || e.eventType.includes('ATM'));
    const motionEvents = events.filter((e) => e.eventType.includes('MOTION'));
    const alarmEvents = events.filter((e) => e.eventType.includes('ALARM'));

    if (atmEvents.length === 0) return null;

    let confidence = 60;
    const evidence: string[] = [];

    // ATM tamper or cabinet opened
    evidence.push(`ATM ${atmEvents[0].eventType.replace('ATM_', '').toLowerCase()}`);
    confidence += 20;

    // Motion detected
    if (motionEvents.length > 0) {
      evidence.push('Suspicious activity detected on camera');
      confidence += 10;
    }

    // Alarm triggered
    if (alarmEvents.length > 0) {
      evidence.push('Security alarm triggered');
      confidence += 10;
    }

    return {
      confidence: Math.min(confidence, 100),
      title: 'Potential ATM Tampering',
      description: `ATM security breach indicators detected: ${evidence.join(', ')}`,
      aiSummary: `ATM SECURITY: Tampering attempt detected on ATM. Immediate investigation required.`,
      involvedDeviceIds: events.map((e) => e.deviceId),
      primaryEventId: atmEvents[0].id,
      evidence,
      actionable: true,
      recommendedActions: [
        'View ATM camera feed immediately',
        'Check ATM security status',
        'Alert ATM service provider',
        'Dispatch security personnel',
        'Secure evidence',
      ],
    };
  }

  /**
   * Correlate forced entry events
   */
  private correlateForcedEntry(events: SecurityDeviceEvent[]): CorrelationResult | null {
    const doorEvents = events.filter((e) => e.eventType.includes('DOOR'));
    const glassBreak = events.some((e) => e.eventType === 'GLASS_BREAK_DETECTED');
    const alarmEvents = events.filter((e) => e.eventType.includes('ALARM'));
    const intrusionEvents = events.filter((e) => e.eventType.includes('INTRUSION'));

    let confidence = 65;
    const evidence: string[] = [];

    if (doorEvents.length > 0) {
      evidence.push('Forced door entry detected');
      confidence += 15;
    }

    if (glassBreak) {
      evidence.push('Glass break detected');
      confidence += 10;
    }

    if (alarmEvents.length > 0) {
      evidence.push('Intrusion alarm triggered');
      confidence += 5;
    }

    if (intrusionEvents.length > 0) {
      evidence.push('Intrusion detection activated');
      confidence += 5;
    }

    return {
      confidence: Math.min(confidence, 100),
      title: 'Forced Entry Attempt Detected',
      description: `Security breach indicators: ${evidence.join(', ')}`,
      aiSummary: `SECURITY BREACH: Forced entry attempt detected. Immediate security response required.`,
      involvedDeviceIds: events.map((e) => e.deviceId),
      primaryEventId: events[0].id,
      evidence,
      actionable: true,
      recommendedActions: [
        'View entry point cameras',
        'Verify alarm status',
        'Alert security team',
        'Contact local authorities',
        'Secure premises',
      ],
    };
  }

  /**
   * Correlate power failure events
   */
  private correlatePowerFailure(events: SecurityDeviceEvent[]): CorrelationResult | null {
    const powerEvents = events.filter((e) => e.eventType.includes('POWER'));
    const upsEvents = events.filter((e) => e.eventType.includes('UPS'));
    const offlineEvents = events.filter((e) => e.eventType.includes('OFFLINE'));

    let confidence = 70;
    const evidence: string[] = [];

    evidence.push(`${offlineEvents.length} devices affected`);

    if (upsEvents.some((e) => e.eventType.includes('CRITICAL'))) {
      evidence.push('UPS battery critical');
      confidence += 15;
    }

    return {
      confidence: Math.min(confidence, 100),
      title: 'Power Failure Affecting Multiple Systems',
      description: `Power outage detected affecting ${offlineEvents.length} devices`,
      aiSummary: `POWER FAILURE: Branch power failure detected. UPS systems engaged. Monitoring equipment status.`,
      involvedDeviceIds: events.map((e) => e.deviceId),
      primaryEventId: powerEvents[0]?.id || events[0].id,
      evidence,
      actionable: true,
      recommendedActions: [
        'Check UPS runtime',
        'Monitor critical systems',
        'Prepare for potential recording gaps',
        'Alert facilities team',
        'Plan graceful shutdown if necessary',
      ],
    };
  }

  /**
   * Correlate environmental threat events
   */
  private correlateEnvironmentalThreat(events: SecurityDeviceEvent[]): CorrelationResult | null {
    const event = events[0];
    
    let severity = 'WARNING';
    if (event.eventType.includes('CRITICAL') || event.eventType.includes('FLOOD')) {
      severity = 'CRITICAL';
    }

    return {
      confidence: 90,
      title: `Environmental Threat: ${event.eventType.replace(/_/g, ' ')}`,
      description: `${event.title} - Immediate attention required`,
      aiSummary: `ENVIRONMENTAL ALERT: ${event.description || event.title}. Equipment may be at risk.`,
      involvedDeviceIds: [event.deviceId],
      primaryEventId: event.id,
      evidence: [event.title],
      actionable: true,
      recommendedActions: [
        'Verify sensor reading',
        'Check affected equipment',
        'Alert facilities team',
        'Prepare mitigation measures',
        'Monitor situation',
      ],
    };
  }

  /**
   * Generate AI summary for vault access
   */
  private generateVaultAccessSummary(
    events: SecurityDeviceEvent[],
    evidence: string[]
  ): string {
    const time = events[0].occurredAt.toLocaleTimeString();
    const location = events[0].location || 'branch';
    
    return `SECURITY INCIDENT: At ${time}, vault access was detected at ${location} with suspicious indicators: ${evidence.join('; ')}. High confidence unauthorized access attempt. Immediate investigation and camera review required.`;
  }

  /**
   * Create correlated incident in database
   */
  private async createCorrelatedIncident(
    triggerEvent: SecurityDeviceEvent,
    events: SecurityDeviceEvent[],
    rule: CorrelationRule,
    result: CorrelationResult
  ): Promise<CorrelatedSecurityIncident> {
    const deviceIds = [...new Set(result.involvedDeviceIds)];
    const eventIds = events.map((e) => e.id);

    // Get nearby cameras for evidence
    const nearbyCameras = await this.getNearbyC ameras(
      triggerEvent.branchId,
      triggerEvent.deviceId
    );

    const insertResult = await this.pool.query(
      `INSERT INTO correlated_security_incidents (
        tenant_id, branch_id,
        incident_type, severity, confidence,
        title, description, ai_summary,
        device_ids, event_ids, primary_event_id,
        first_event_at, last_event_at,
        status, attached_camera_ids,
        actions_log, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
      [
        triggerEvent.tenantId,
        triggerEvent.branchId,
        rule.incidentType,
        rule.severity,
        result.confidence,
        result.title,
        result.description,
        result.aiSummary,
        JSON.stringify(deviceIds),
        JSON.stringify(eventIds),
        result.primaryEventId,
        events[0].occurredAt,
        events[events.length - 1].occurredAt,
        'ACTIVE',
        JSON.stringify(nearbyCameras),
        JSON.stringify([
          {
            timestamp: new Date().toISOString(),
            action: 'INCIDENT_CREATED',
            performedBy: 'CORRELATION_ENGINE',
            details: {
              rule: rule.name,
              confidence: result.confidence,
              evidence: result.evidence,
            },
          },
        ]),
        JSON.stringify({
          rule: rule.id,
          evidence: result.evidence,
          recommendedActions: result.recommendedActions,
        }),
      ]
    );

    console.log(
      `[CorrelationEngine] Created P${rule.severity} incident: ${result.title} (confidence: ${result.confidence}%)`
    );

    return this.mapIncident(insertResult.rows[0]);
  }

  /**
   * Get nearby cameras for incident
   */
  private async getNearbyC ameras(
    branchId: string,
    deviceId: string,
    radiusMeters: number = 50
  ): Promise<string[]> {
    // TODO: Implement spatial query using Digital Twin floor plan data
    // For now, return all cameras at branch
    const result = await this.pool.query(
      `SELECT id FROM security_devices
       WHERE branch_id = $1 AND type = 'CAMERA' AND status = 'ONLINE'
       LIMIT 10`,
      [branchId]
    );

    return result.rows.map((row) => row.id);
  }

  /**
   * Add event to buffer
   */
  private addEventToBuffer(event: SecurityDeviceEvent): void {
    const key = `${event.branchId}:${event.eventType}`;
    
    if (!this.eventBuffer.has(key)) {
      this.eventBuffer.set(key, []);
    }

    const buffer = this.eventBuffer.get(key)!;
    buffer.push(event);

    // Keep only recent events (last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    this.eventBuffer.set(
      key,
      buffer.filter((e) => e.occurredAt >= fiveMinutesAgo)
    );
  }

  /**
   * Get relevant events from buffer
   */
  private getRelevantEvents(
    branchId: string,
    eventTypes: SecurityDeviceEventType[],
    timeWindowSeconds: number
  ): SecurityDeviceEvent[] {
    const cutoff = new Date(Date.now() - timeWindowSeconds * 1000);
    const relevantEvents: SecurityDeviceEvent[] = [];

    for (const eventType of eventTypes) {
      const key = `${branchId}:${eventType}`;
      const buffer = this.eventBuffer.get(key);

      if (buffer) {
        relevantEvents.push(...buffer.filter((e) => e.occurredAt >= cutoff));
      }
    }

    return relevantEvents.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  }

  /**
   * Check if required device types are present
   */
  private async checkRequiredDevices(
    events: SecurityDeviceEvent[],
    requiredTypes: string[]
  ): Promise<boolean> {
    const deviceIds = [...new Set(events.map((e) => e.deviceId))];

    const result = await this.pool.query(
      `SELECT DISTINCT type FROM security_devices
       WHERE id = ANY($1) AND type = ANY($2)`,
      [deviceIds, requiredTypes]
    );

    return result.rows.length > 0;
  }

  /**
   * Mark events as processed
   */
  private async markEventsAsProcessed(
    events: SecurityDeviceEvent[],
    incidentId: string
  ): Promise<void> {
    const eventIds = events.map((e) => e.id);

    await this.pool.query(
      `UPDATE security_device_events
       SET processed = true, incident_id = $1, processed_at = NOW()
       WHERE id = ANY($2)`,
      [incidentId, eventIds]
    );
  }

  /**
   * Register a correlation rule
   */
  public registerRule(rule: CorrelationRule): void {
    this.rules.set(rule.id, rule);
    console.log(`[CorrelationEngine] Registered rule: ${rule.name}`);
  }

  /**
   * Map database row to incident
   */
  private mapIncident(row: any): CorrelatedSecurityIncident {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      branchId: row.branch_id,
      incidentType: row.incident_type,
      severity: row.severity,
      confidence: parseFloat(row.confidence),
      title: row.title,
      description: row.description,
      aiSummary: row.ai_summary,
      deviceIds: row.device_ids || [],
      eventIds: row.event_ids || [],
      primaryEventId: row.primary_event_id,
      firstEventAt: row.first_event_at,
      lastEventAt: row.last_event_at,
      detectedAt: row.detected_at,
      status: row.status,
      acknowledgedBy: row.acknowledged_by,
      acknowledgedAt: row.acknowledged_at,
      resolvedBy: row.resolved_by,
      resolvedAt: row.resolved_at,
      resolutionNotes: row.resolution_notes,
      attachedCameraIds: row.attached_camera_ids || [],
      snapshotUrls: row.snapshot_urls || [],
      videoUrls: row.video_urls || [],
      evidencePackageUrl: row.evidence_package_url,
      actionsLog: row.actions_log || [],
      escalationLevel: row.escalation_level,
      escalatedTo: row.escalated_to || [],
      notificationsSent: row.notifications_sent,
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

/**
 * Singleton factory
 */
let serviceInstance: SecurityDeviceCorrelationService | null = null;

export function getSecurityDeviceCorrelationService(
  pool: Pool
): SecurityDeviceCorrelationService {
  if (!serviceInstance) {
    serviceInstance = new SecurityDeviceCorrelationService(pool);
  }
  return serviceInstance;
}

export default SecurityDeviceCorrelationService;
