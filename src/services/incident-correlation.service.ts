import { createHash } from 'node:crypto';
import type { ControlPlaneStore } from '../control-plane-store.js';

/**
 * Incident Correlation and Deduplication Service
 * 
 * Prevents duplicate incidents by correlating related detection events
 * and merging them into a single incident with extended timeline.
 */

import type { DetectionEvent } from '../events/detection-event.js';

export interface CorrelationKey {
  tenantId: string;
  branchId?: string;
  cameraId: string;
  detectionType: string;
  zone?: string;
  trackedObjectId?: string;
}

export interface CorrelatedIncident {
  incidentId: string;
  correlationKey: string;
  firstDetectionAt: Date;
  lastDetectionAt: Date;
  detectionCount: number;
  maxConfidence: number;
  highestSeverity: string;
  status: string;
  cooldownEndsAt: Date;
}

export interface CorrelationConfig {
  // Time window for correlating events (minutes)
  correlationWindow: number;
  // Cooldown period after incident closure before creating new incident (minutes)
  cooldownPeriod: number;
  // Minimum detections required to create incident (for low-confidence events)
  minDetectionsThreshold: number;
  // Maximum time between detections to keep correlating (minutes)
  maxDetectionGap: number;
}

const DEFAULT_CONFIG: CorrelationConfig = {
  correlationWindow: 30,
  cooldownPeriod: 10,
  minDetectionsThreshold: 3,
  maxDetectionGap: 5,
};

const CORRELATION_CONFIGS: Record<string, CorrelationConfig> = {
  // High-confidence critical events - create immediately
  'fire': {
    correlationWindow: 60,
    cooldownPeriod: 30,
    minDetectionsThreshold: 1,
    maxDetectionGap: 10,
  },
  'smoke': {
    correlationWindow: 60,
    cooldownPeriod: 30,
    minDetectionsThreshold: 2,
    maxDetectionGap: 10,
  },
  'weapon': {
    correlationWindow: 30,
    cooldownPeriod: 20,
    minDetectionsThreshold: 1,
    maxDetectionGap: 5,
  },
  'intrusion': {
    correlationWindow: 30,
    cooldownPeriod: 15,
    minDetectionsThreshold: 1,
    maxDetectionGap: 5,
  },
  'restricted-area': {
    correlationWindow: 20,
    cooldownPeriod: 10,
    minDetectionsThreshold: 1,
    maxDetectionGap: 3,
  },
  'panic-alarm': {
    correlationWindow: 30,
    cooldownPeriod: 20,
    minDetectionsThreshold: 1,
    maxDetectionGap: 5,
  },
  'atm-tampering': {
    correlationWindow: 30,
    cooldownPeriod: 15,
    minDetectionsThreshold: 2,
    maxDetectionGap: 5,
  },
  
  // Medium confidence events - require multiple detections
  'loitering': {
    correlationWindow: 60,
    cooldownPeriod: 15,
    minDetectionsThreshold: 5,
    maxDetectionGap: 10,
  },
  'crowd-density': {
    correlationWindow: 30,
    cooldownPeriod: 10,
    minDetectionsThreshold: 4,
    maxDetectionGap: 5,
  },
  'tailgating': {
    correlationWindow: 15,
    cooldownPeriod: 10,
    minDetectionsThreshold: 2,
    maxDetectionGap: 3,
  },
  'fall-detection': {
    correlationWindow: 20,
    cooldownPeriod: 10,
    minDetectionsThreshold: 2,
    maxDetectionGap: 3,
  },
  'unattended-object': {
    correlationWindow: 30,
    cooldownPeriod: 15,
    minDetectionsThreshold: 3,
    maxDetectionGap: 5,
  },
  'suspicious-behavior': {
    correlationWindow: 30,
    cooldownPeriod: 10,
    minDetectionsThreshold: 4,
    maxDetectionGap: 5,
  },
  
  // Low priority - informational
  'motion': {
    correlationWindow: 10,
    cooldownPeriod: 5,
    minDetectionsThreshold: 10,
    maxDetectionGap: 2,
  },
  'person-count': {
    correlationWindow: 60,
    cooldownPeriod: 30,
    minDetectionsThreshold: 1,
    maxDetectionGap: 10,
  },
  'queue-length': {
    correlationWindow: 60,
    cooldownPeriod: 30,
    minDetectionsThreshold: 5,
    maxDetectionGap: 10,
  },
};

export class IncidentCorrelationService {
  // In-memory cache of active correlations
  private activeCorrelations = new Map<string, CorrelatedIncident>();
  
  // Detection buffer for events awaiting threshold
  private detectionBuffer = new Map<string, DetectionEvent[]>();
  
  constructor(private readonly store: ControlPlaneStore) {
    // Clean up expired correlations every 5 minutes
    setInterval(() => this.cleanupExpiredCorrelations(), 5 * 60 * 1000);
  }
  
  /**
   * Process a detection event and determine if it should create or update an incident
   */
  async processDetection(event: DetectionEvent): Promise<{
    action: 'create' | 'update' | 'buffer' | 'ignore';
    incidentId?: string;
    reason: string;
  }> {
    const correlationKey = this.generateCorrelationKey(event);
    const config = CORRELATION_CONFIGS[event.detectionType] || DEFAULT_CONFIG;
    
    // Check if there's an active incident for this correlation key
    const activeIncident = this.activeCorrelations.get(correlationKey);
    
    if (activeIncident) {
      // Check if we're still within the correlation window
      const timeSinceLastDetection = Date.now() - activeIncident.lastDetectionAt.getTime();
      const maxGapMs = config.maxDetectionGap * 60 * 1000;
      
      if (timeSinceLastDetection > maxGapMs) {
        // Gap too large, check if cooldown has expired
        const cooldownExpired = Date.now() > activeIncident.cooldownEndsAt.getTime();
        
        if (cooldownExpired) {
          // Create new incident
          this.activeCorrelations.delete(correlationKey);
          return await this.handleNewDetection(event, correlationKey, config);
        }
        
        return {
          action: 'ignore',
          reason: `Still in cooldown period (${Math.round((activeIncident.cooldownEndsAt.getTime() - Date.now()) / 60000)} minutes remaining)`,
        };
      }
      
      // Update existing incident
      activeIncident.lastDetectionAt = new Date(event.detectionTime);
      activeIncident.detectionCount++;
      activeIncident.maxConfidence = Math.max(activeIncident.maxConfidence, event.confidence);
      
      if (this.compareSeverity(event.severity, activeIncident.highestSeverity) > 0) {
        activeIncident.highestSeverity = event.severity;
      }
      
      // Add detection to incident timeline
      await this.store.addIncidentEvent({
        incidentId: activeIncident.incidentId,
        eventType: 'detection',
        description: `${event.detectionType} detected (confidence: ${Math.round(event.confidence * 100)}%)`,
        details: {
          detectionType: event.detectionType,
          confidence: event.confidence,
          cameraId: event.cameraId,
          zone: event.zone,
          trackedObjectId: event.trackedObjectId,
          metadata: event.metadata,
        },
        performedBy: 'system',
      });
      
      return {
        action: 'update',
        incidentId: activeIncident.incidentId,
        reason: `Updated incident with detection #${activeIncident.detectionCount}`,
      };
    }
    
    // No active incident, process new detection
    return await this.handleNewDetection(event, correlationKey, config);
  }
  
  /**
   * Handle a new detection event (no active incident)
   */
  private async handleNewDetection(
    event: DetectionEvent,
    correlationKey: string,
    config: CorrelationConfig
  ): Promise<{
    action: 'create' | 'buffer' | 'ignore';
    incidentId?: string;
    reason: string;
  }> {
    // Check if this is a high-priority event that should create incident immediately
    const shouldCreateImmediately = 
      event.confidence >= 0.85 || 
      ['P1', 'P2'].includes(event.severity) ||
      config.minDetectionsThreshold === 1;
    
    if (shouldCreateImmediately) {
      const incident = await this.createIncident(event);
      
      this.activeCorrelations.set(correlationKey, {
        incidentId: incident.id,
        correlationKey,
        firstDetectionAt: new Date(event.detectionTime),
        lastDetectionAt: new Date(event.detectionTime),
        detectionCount: 1,
        maxConfidence: event.confidence,
        highestSeverity: event.severity,
        status: incident.status,
        cooldownEndsAt: new Date(Date.now() + config.cooldownPeriod * 60 * 1000),
      });
      
      return {
        action: 'create',
        incidentId: incident.id,
        reason: 'High-confidence or critical severity event',
      };
    }
    
    // Buffer for threshold detection
    const bufferedEvents = this.detectionBuffer.get(correlationKey) || [];
    bufferedEvents.push(event);
    this.detectionBuffer.set(correlationKey, bufferedEvents);
    
    // Clean old buffered events outside correlation window
    const windowMs = config.correlationWindow * 60 * 1000;
    const validEvents = bufferedEvents.filter(e => 
      Date.now() - new Date(e.detectionTime).getTime() < windowMs
    );
    this.detectionBuffer.set(correlationKey, validEvents);
    
    // Check if threshold reached
    if (validEvents.length >= config.minDetectionsThreshold) {
      // Create incident from accumulated detections
      const incident = await this.createIncident(event, validEvents);
      
      this.activeCorrelations.set(correlationKey, {
        incidentId: incident.id,
        correlationKey,
        firstDetectionAt: new Date(validEvents[0].detectionTime),
        lastDetectionAt: new Date(event.detectionTime),
        detectionCount: validEvents.length,
        maxConfidence: Math.max(...validEvents.map(e => e.confidence)),
        highestSeverity: event.severity,
        status: incident.status,
        cooldownEndsAt: new Date(Date.now() + config.cooldownPeriod * 60 * 1000),
      });
      
      this.detectionBuffer.delete(correlationKey);
      
      return {
        action: 'create',
        incidentId: incident.id,
        reason: `Detection threshold reached (${validEvents.length} detections in ${config.correlationWindow}min)`,
      };
    }
    
    return {
      action: 'buffer',
      reason: `Buffered (${validEvents.length}/${config.minDetectionsThreshold} detections)`,
    };
  }
  
  /**
   * Create incident from detection event
   */
  private async createIncident(
    primaryEvent: DetectionEvent,
    relatedEvents: DetectionEvent[] = []
  ) {
    const allEvents = [primaryEvent, ...relatedEvents];
    const maxConfidence = Math.max(...allEvents.map(e => e.confidence));
    const detectionCount = allEvents.length;
    
    const title = this.generateIncidentTitle(primaryEvent, detectionCount);
    const description = this.generateIncidentDescription(primaryEvent, allEvents);
    
    const incident = await this.store.createIncident({
      tenantId: primaryEvent.tenantId,
      branchId: primaryEvent.branchId,
      title,
      description,
      incidentType: primaryEvent.detectionType,
      severity: primaryEvent.severity,
      detectionSource: 'ai-analytics',
      occurredAt: primaryEvent.detectionTime,
      reportedBy: 'system',
      aiConfidence: maxConfidence,
      detectionCount,
    });
    
    // Add camera
    await this.store.addIncidentCamera(
      incident.id,
      primaryEvent.cameraId,
      true,
      'system'
    );
    
    // Add all detection events to timeline
    for (const event of allEvents) {
      await this.store.addIncidentEvent({
        incidentId: incident.id,
        eventType: 'detection',
        description: `${event.detectionType} detected (confidence: ${Math.round(event.confidence * 100)}%)`,
        details: {
          detectionType: event.detectionType,
          confidence: event.confidence,
          cameraId: event.cameraId,
          zone: event.zone,
          trackedObjectId: event.trackedObjectId,
          metadata: event.metadata,
        },
        performedBy: 'system',
      });
    }
    
    return incident;
  }
  
  /**
   * Mark incident as closed and start cooldown
   */
  async closeCorrelation(incidentId: string): Promise<void> {
    // Find correlation by incident ID
    for (const [key, correlation] of this.activeCorrelations.entries()) {
      if (correlation.incidentId === incidentId) {
        correlation.status = 'closed';
        
        const config = CORRELATION_CONFIGS[correlation.correlationKey.split(':')[3]] || DEFAULT_CONFIG;
        correlation.cooldownEndsAt = new Date(Date.now() + config.cooldownPeriod * 60 * 1000);
        
        // Remove from active correlations after cooldown
        setTimeout(() => {
          this.activeCorrelations.delete(key);
        }, config.cooldownPeriod * 60 * 1000);
        
        break;
      }
    }
  }
  
  /**
   * Generate correlation key for event grouping
   */
  private generateCorrelationKey(event: DetectionEvent): string {
    const key: CorrelationKey = {
      tenantId: event.tenantId ?? '',
      branchId: event.branchId ?? undefined,
      cameraId: event.cameraId ?? '',
      detectionType: event.detectionType ?? '',
      zone: event.zone,
      trackedObjectId: event.trackedObjectId,
    };
    
    // Create deterministic hash
    const parts = [
      key.tenantId,
      key.branchId || '',
      key.cameraId,
      key.detectionType,
      key.zone || '',
      key.trackedObjectId || '',
    ];
    
    return createHash('sha256')
      .update(parts.join(':'))
      .digest('hex')
      .substring(0, 16);
  }
  
  /**
   * Generate incident title
   */
  private generateIncidentTitle(event: DetectionEvent, count: number): string {
    const typeMap: Record<string, string> = {
      'fire': 'Fire Detected',
      'smoke': 'Smoke Detected',
      'weapon': 'Weapon Detected',
      'intrusion': 'Intrusion Detected',
      'restricted-area': 'Restricted Area Intrusion',
      'panic-alarm': 'Panic Alarm Activated',
      'atm-tampering': 'ATM Tampering Detected',
      'loitering': 'Loitering Detected',
      'crowd-density': 'High Crowd Density',
      'tailgating': 'Tailgating Detected',
      'fall-detection': 'Person Fall Detected',
      'unattended-object': 'Unattended Object Detected',
      'suspicious-behavior': 'Suspicious Behavior Detected',
    };
    
    const detectionType = event.detectionType ?? '';
    const baseTitle = typeMap[detectionType] || `${detectionType} Detection`;
    
    if (count > 1) {
      return `${baseTitle} (${count} detections)`;
    }
    
    return baseTitle;
  }
  
  /**
   * Generate incident description
   */
  private generateIncidentDescription(
    primary: DetectionEvent,
    all: DetectionEvent[]
  ): string {
    const lines: string[] = [];
    
    lines.push(`AI-detected ${primary.detectionType} event with ${Math.round(primary.confidence * 100)}% confidence.`);
    
    if (all.length > 1) {
      const firstEvent = all[0];
      const lastEvent = all[all.length - 1];
      
      if (firstEvent?.detectionTime && lastEvent?.detectionTime) {
        const firstTime = new Date(firstEvent.detectionTime);
        const lastTime = new Date(lastEvent.detectionTime);
        const durationMinutes = Math.round((lastTime.getTime() - firstTime.getTime()) / 60000);
      
        lines.push(`Total detections: ${all.length} over ${durationMinutes} minute(s).`);
        lines.push(`Average confidence: ${Math.round((all.reduce((sum, e) => sum + e.confidence, 0) / all.length) * 100)}%.`);
      }
    }
    
    if (primary.zone) {
      lines.push(`Location: ${primary.zone}`);
    }
    
    if (primary.trackedObjectId) {
      lines.push(`Tracked object: ${primary.trackedObjectId}`);
    }
    
    lines.push('Automatic video preservation has been initiated.');
    
    return lines.join('\n');
  }
  
  /**
   * Compare severity levels
   */
  private compareSeverity(a: string, b: string): number {
    const order = { 'P1': 5, 'P2': 4, 'P3': 3, 'P4': 2, 'P5': 1 };
    return (order[a as keyof typeof order] || 0) - (order[b as keyof typeof order] || 0);
  }
  
  /**
   * Clean up expired correlations
   */
  private cleanupExpiredCorrelations(): void {
    const now = Date.now();
    
    for (const [key, correlation] of this.activeCorrelations.entries()) {
      if (now > correlation.cooldownEndsAt.getTime() && correlation.status === 'closed') {
        this.activeCorrelations.delete(key);
      }
    }
    
    // Clean up old buffered events
    for (const [key, events] of this.detectionBuffer.entries()) {
      const validEvents = events.filter(e => {
        const detectionTime = e.detectionTime;
        if (!detectionTime) return false;
        return now - new Date(detectionTime).getTime() < 60 * 60 * 1000; // Keep for 1 hour max
      });
      
      if (validEvents.length === 0) {
        this.detectionBuffer.delete(key);
      } else if (validEvents.length < events.length) {
        this.detectionBuffer.set(key, validEvents);
      }
    }
  }
  
  /**
   * Get correlation statistics
   */
  getStatistics() {
    return {
      activeCorrelations: this.activeCorrelations.size,
      bufferedDetections: Array.from(this.detectionBuffer.values()).reduce(
        (sum, events) => sum + events.length,
        0
      ),
      correlationDetails: Array.from(this.activeCorrelations.values()).map(c => ({
        incidentId: c.incidentId,
        detectionCount: c.detectionCount,
        durationMinutes: Math.round(
          (c.lastDetectionAt.getTime() - c.firstDetectionAt.getTime()) / 60000
        ),
        status: c.status,
      })),
    };
  }
}
