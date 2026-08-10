/**
 * Alert Correlation Engine
 * 
 * Detects patterns in alerts and creates parent incidents with child alerts.
 * 
 * Problem:
 * - Branch 1: camera offline
 * - Branch 2: camera offline
 * - Branch 3: camera offline
 * ... (100 branches)
 * → 100 separate alerts flood the command center
 * 
 * Solution:
 * - Detect correlation pattern: "Regional network outage"
 * - Create 1 parent incident
 * - Link 100 child alerts
 * → 1 incident to investigate, with all context
 * 
 * Correlation Patterns:
 * - Regional outages (geography-based)
 * - Time-based clustering (multiple events in short window)
 * - Type-based clustering (same alert type across locations)
 * - Infrastructure failures (DVR/NVR affects multiple cameras)
 * - Cascade failures (one failure triggers others)
 */

import { Redis } from 'ioredis';

export interface Alert {
  id: string;
  type: string;
  severity: 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
  cameraId?: string;
  branchId?: string;
  dvrId?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface Incident {
  id: string;
  type: 'regional_outage' | 'infrastructure_failure' | 'cascade_failure' | 'mass_event';
  severity: 'P1' | 'P2' | 'P3';
  title: string;
  description: string;
  affectedBranches: string[];
  affectedCameras: string[];
  childAlerts: string[];
  detectedAt: Date;
  pattern: CorrelationPattern;
  metadata: Record<string, any>;
}

export interface CorrelationPattern {
  name: string;
  confidence: number; // 0-1
  evidence: string[];
  threshold: number;
  actualCount: number;
}

export interface CorrelationRule {
  name: string;
  description: string;
  enabled: boolean;
  
  // Matching criteria
  alertTypes: string[];
  timeWindowSeconds: number;
  minimumAlerts: number;
  
  // Correlation logic
  correlationKey: (alert: Alert) => string; // Group alerts by this key
  incidentDetector: (alerts: Alert[]) => CorrelationPattern | null;
  incidentBuilder: (pattern: CorrelationPattern, alerts: Alert[]) => Partial<Incident>;
}

export class AlertCorrelationService {
  private readonly redis: Redis;
  private readonly keyPrefix: string;
  private readonly rules: Map<string, CorrelationRule>;

  constructor(redis: Redis, keyPrefix: string = 'correlation') {
    this.redis = redis;
    this.keyPrefix = keyPrefix;
    this.rules = new Map();
    
    // Initialize default correlation rules
    this.initializeDefaultRules();
  }

  /**
   * Process new alert and check for correlations
   */
  async processAlert(alert: Alert): Promise<{
    incident: Incident | null;
    shouldSuppress: boolean;
  }> {
    // Track alert in time window
    await this.trackAlert(alert);

    // Check each correlation rule
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;
      if (!rule.alertTypes.includes(alert.type)) continue;

      const incident = await this.checkRule(rule, alert);
      if (incident) {
        return {
          incident,
          shouldSuppress: true, // Suppress individual alert, show incident instead
        };
      }
    }

    return {
      incident: null,
      shouldSuppress: false,
    };
  }

  /**
   * Check if alert matches a correlation rule
   */
  private async checkRule(rule: CorrelationRule, trigger: Alert): Promise<Incident | null> {
    // Get recent alerts matching this rule
    const recentAlerts = await this.getRecentAlerts(rule, trigger);

    if (recentAlerts.length < rule.minimumAlerts) {
      return null;
    }

    // Group alerts by correlation key
    const groups = this.groupAlerts(recentAlerts, rule.correlationKey);

    // Check each group for incident pattern
    for (const [groupKey, alerts] of groups.entries()) {
      const pattern = rule.incidentDetector(alerts);
      
      if (pattern && pattern.confidence >= 0.7) {
        // Create incident
        const incident = await this.createIncident(rule, pattern, alerts);
        
        // Mark alerts as part of this incident
        await this.linkAlertsToIncident(incident, alerts);
        
        return incident;
      }
    }

    return null;
  }

  /**
   * Track alert for correlation analysis
   */
  private async trackAlert(alert: Alert): Promise<void> {
    const key = `${this.keyPrefix}:alerts:${alert.type}`;
    const value = JSON.stringify({
      id: alert.id,
      type: alert.type,
      severity: alert.severity,
      cameraId: alert.cameraId,
      branchId: alert.branchId,
      dvrId: alert.dvrId,
      timestamp: alert.timestamp.toISOString(),
      metadata: alert.metadata,
    });

    try {
      // Use sorted set with timestamp as score
      await this.redis.zadd(key, alert.timestamp.getTime(), value);
      
      // Set expiry (keep for 1 hour)
      await this.redis.expire(key, 3600);
    } catch (error) {
      console.error('[AlertCorrelation] Error tracking alert:', error);
    }
  }

  /**
   * Get recent alerts matching rule
   */
  private async getRecentAlerts(rule: CorrelationRule, trigger: Alert): Promise<Alert[]> {
    const alerts: Alert[] = [];
    const now = Date.now();
    const windowStart = now - (rule.timeWindowSeconds * 1000);

    for (const alertType of rule.alertTypes) {
      const key = `${this.keyPrefix}:alerts:${alertType}`;
      
      try {
        const results = await this.redis.zrangebyscore(
          key,
          windowStart,
          now,
          'WITHSCORES',
        );

        for (let i = 0; i < results.length; i += 2) {
          const data = JSON.parse(results[i]);
          alerts.push({
            ...data,
            timestamp: new Date(data.timestamp),
          });
        }
      } catch (error) {
        console.error('[AlertCorrelation] Error getting recent alerts:', error);
      }
    }

    return alerts;
  }

  /**
   * Group alerts by correlation key
   */
  private groupAlerts(
    alerts: Alert[],
    keyFn: (alert: Alert) => string,
  ): Map<string, Alert[]> {
    const groups = new Map<string, Alert[]>();

    for (const alert of alerts) {
      const key = keyFn(alert);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(alert);
    }

    return groups;
  }

  /**
   * Create incident from pattern
   */
  private async createIncident(
    rule: CorrelationRule,
    pattern: CorrelationPattern,
    alerts: Alert[],
  ): Promise<Incident> {
    const incidentId = `incident-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    const partial = rule.incidentBuilder(pattern, alerts);
    
    const incident: Incident = {
      id: incidentId,
      type: partial.type ?? 'mass_event',
      severity: this.calculateIncidentSeverity(alerts),
      title: partial.title ?? `${pattern.name} (${alerts.length} alerts)`,
      description: partial.description ?? `Detected ${pattern.name} affecting ${alerts.length} resources`,
      affectedBranches: Array.from(new Set(alerts.map(a => a.branchId).filter(Boolean) as string[])),
      affectedCameras: Array.from(new Set(alerts.map(a => a.cameraId).filter(Boolean) as string[])),
      childAlerts: alerts.map(a => a.id),
      detectedAt: new Date(),
      pattern,
      metadata: partial.metadata ?? {},
    };

    // Store incident in Redis
    await this.storeIncident(incident);

    return incident;
  }

  /**
   * Calculate incident severity based on child alerts
   */
  private calculateIncidentSeverity(alerts: Alert[]): 'P1' | 'P2' | 'P3' {
    const p1Count = alerts.filter(a => a.severity === 'P1').length;
    const p2Count = alerts.filter(a => a.severity === 'P2').length;

    if (p1Count >= 5 || alerts.length >= 50) return 'P1';
    if (p2Count >= 10 || alerts.length >= 20) return 'P2';
    return 'P3';
  }

  /**
   * Store incident in Redis
   */
  private async storeIncident(incident: Incident): Promise<void> {
    const key = `${this.keyPrefix}:incidents:${incident.id}`;
    
    try {
      await this.redis.set(
        key,
        JSON.stringify(incident),
        'EX',
        86400, // 24 hours
      );
    } catch (error) {
      console.error('[AlertCorrelation] Error storing incident:', error);
    }
  }

  /**
   * Link alerts to incident
   */
  private async linkAlertsToIncident(incident: Incident, alerts: Alert[]): Promise<void> {
    for (const alert of alerts) {
      const key = `${this.keyPrefix}:alert:${alert.id}:incident`;
      
      try {
        await this.redis.set(
          key,
          incident.id,
          'EX',
          86400, // 24 hours
        );
      } catch (error) {
        console.error('[AlertCorrelation] Error linking alert to incident:', error);
      }
    }
  }

  /**
   * Get incident for alert
   */
  async getIncidentForAlert(alertId: string): Promise<string | null> {
    const key = `${this.keyPrefix}:alert:${alertId}:incident`;
    
    try {
      return await this.redis.get(key);
    } catch (error) {
      console.error('[AlertCorrelation] Error getting incident for alert:', error);
      return null;
    }
  }

  /**
   * Get incident details
   */
  async getIncident(incidentId: string): Promise<Incident | null> {
    const key = `${this.keyPrefix}:incidents:${incidentId}`;
    
    try {
      const data = await this.redis.get(key);
      if (!data) return null;
      
      const parsed = JSON.parse(data);
      return {
        ...parsed,
        detectedAt: new Date(parsed.detectedAt),
      };
    } catch (error) {
      console.error('[AlertCorrelation] Error getting incident:', error);
      return null;
    }
  }

  /**
   * Initialize default correlation rules
   */
  private initializeDefaultRules(): void {
    // Rule 1: Regional Camera Outage
    this.rules.set('regional-camera-outage', {
      name: 'Regional Camera Outage',
      description: 'Multiple cameras offline in different branches',
      enabled: true,
      alertTypes: ['camera_offline', 'camera_disconnected', 'camera_unreachable'],
      timeWindowSeconds: 300, // 5 minutes
      minimumAlerts: 10,
      
      correlationKey: (alert) => 'all', // Correlate all camera offline alerts
      
      incidentDetector: (alerts) => {
        const branches = new Set(alerts.map(a => a.branchId).filter(Boolean));
        
        if (branches.size >= 3 && alerts.length >= 10) {
          return {
            name: 'Regional Network Outage',
            confidence: Math.min(0.7 + (branches.size / 100), 1.0),
            evidence: [
              `${alerts.length} cameras offline`,
              `${branches.size} branches affected`,
              `Occurred within 5 minutes`,
            ],
            threshold: 10,
            actualCount: alerts.length,
          };
        }
        
        return null;
      },
      
      incidentBuilder: (pattern, alerts) => {
        const branches = Array.from(new Set(alerts.map(a => a.branchId).filter(Boolean)));
        
        return {
          type: 'regional_outage',
          title: `Regional Network Outage (${alerts.length} cameras, ${branches.length} branches)`,
          description: `Detected mass camera connectivity failure across ${branches.length} branches. This may indicate a regional network issue, ISP outage, or control plane connectivity problem.`,
          metadata: {
            pattern: 'regional_outage',
            branches: branches.length,
            cameras: alerts.length,
            confidence: pattern.confidence,
          },
        };
      },
    });

    // Rule 2: DVR/NVR Infrastructure Failure
    this.rules.set('dvr-infrastructure-failure', {
      name: 'DVR/NVR Infrastructure Failure',
      description: 'Multiple cameras offline from same DVR/NVR',
      enabled: true,
      alertTypes: ['camera_offline', 'camera_disconnected'],
      timeWindowSeconds: 120, // 2 minutes
      minimumAlerts: 4,
      
      correlationKey: (alert) => alert.dvrId ?? alert.branchId ?? 'unknown',
      
      incidentDetector: (alerts) => {
        const dvrs = new Set(alerts.map(a => a.dvrId).filter(Boolean));
        
        if (alerts.length >= 4) {
          return {
            name: 'DVR/NVR Failure',
            confidence: 0.9,
            evidence: [
              `${alerts.length} cameras from same DVR/NVR offline`,
              `Occurred within 2 minutes`,
              dvrs.size === 1 ? 'All from single device' : `${dvrs.size} devices affected`,
            ],
            threshold: 4,
            actualCount: alerts.length,
          };
        }
        
        return null;
      },
      
      incidentBuilder: (pattern, alerts) => {
        const dvrId = alerts[0].dvrId;
        const branchId = alerts[0].branchId;
        
        return {
          type: 'infrastructure_failure',
          title: `DVR/NVR Failure (${alerts.length} cameras)`,
          description: `All cameras from DVR/NVR ${dvrId ?? 'unknown'} in branch ${branchId ?? 'unknown'} have gone offline. This indicates a recorder hardware failure, power loss, or network issue.`,
          metadata: {
            pattern: 'dvr_failure',
            dvrId,
            branchId,
            cameras: alerts.length,
          },
        };
      },
    });

    // Rule 3: Mass Fire/Smoke Detection
    this.rules.set('mass-fire-smoke', {
      name: 'Mass Fire/Smoke Detection',
      description: 'Multiple fire/smoke alerts in same location',
      enabled: true,
      alertTypes: ['fire_detected', 'smoke_detected'],
      timeWindowSeconds: 60, // 1 minute
      minimumAlerts: 3,
      
      correlationKey: (alert) => alert.branchId ?? 'unknown',
      
      incidentDetector: (alerts) => {
        if (alerts.length >= 3) {
          return {
            name: 'Building Fire Emergency',
            confidence: 0.95,
            evidence: [
              `${alerts.length} fire/smoke detections`,
              'Multiple cameras in same location',
              'Requires immediate emergency response',
            ],
            threshold: 3,
            actualCount: alerts.length,
          };
        }
        
        return null;
      },
      
      incidentBuilder: (pattern, alerts) => {
        const branchId = alerts[0].branchId;
        
        return {
          type: 'mass_event',
          title: `🔥 BUILDING FIRE - ${alerts.length} detections`,
          description: `CRITICAL: Multiple cameras detected fire/smoke in branch ${branchId ?? 'unknown'}. Immediate evacuation and emergency services required.`,
          metadata: {
            pattern: 'building_fire',
            branchId,
            detections: alerts.length,
            emergency: true,
          },
        };
      },
    });

    // Rule 4: Mass Intrusion Detection
    this.rules.set('mass-intrusion', {
      name: 'Mass Intrusion Detection',
      description: 'Multiple intrusion alerts across branches',
      enabled: true,
      alertTypes: ['intrusion_detected', 'unauthorized_access'],
      timeWindowSeconds: 300, // 5 minutes
      minimumAlerts: 5,
      
      correlationKey: (alert) => 'all',
      
      incidentDetector: (alerts) => {
        const branches = new Set(alerts.map(a => a.branchId).filter(Boolean));
        
        if (branches.size >= 2 && alerts.length >= 5) {
          return {
            name: 'Coordinated Security Breach',
            confidence: 0.85,
            evidence: [
              `${alerts.length} intrusion detections`,
              `${branches.size} branches affected`,
              'Potential coordinated attack',
            ],
            threshold: 5,
            actualCount: alerts.length,
          };
        }
        
        return null;
      },
      
      incidentBuilder: (pattern, alerts) => {
        const branches = Array.from(new Set(alerts.map(a => a.branchId).filter(Boolean)));
        
        return {
          type: 'mass_event',
          title: `⚠️ Coordinated Security Breach (${branches.length} branches)`,
          description: `Detected ${alerts.length} intrusion alerts across ${branches.length} branches within 5 minutes. This may indicate a coordinated attack or security compromise.`,
          metadata: {
            pattern: 'coordinated_breach',
            branches: branches.length,
            alerts: alerts.length,
          },
        };
      },
    });

    // Rule 5: Storage Failure Cascade
    this.rules.set('storage-cascade', {
      name: 'Storage Failure Cascade',
      description: 'Multiple storage/recording failures',
      enabled: true,
      alertTypes: ['storage_full', 'disk_failure', 'recording_failure'],
      timeWindowSeconds: 600, // 10 minutes
      minimumAlerts: 5,
      
      correlationKey: (alert) => 'all',
      
      incidentDetector: (alerts) => {
        if (alerts.length >= 5) {
          return {
            name: 'System-Wide Storage Crisis',
            confidence: 0.8,
            evidence: [
              `${alerts.length} storage-related failures`,
              'Multiple branches affected',
              'Recording capability compromised',
            ],
            threshold: 5,
            actualCount: alerts.length,
          };
        }
        
        return null;
      },
      
      incidentBuilder: (pattern, alerts) => {
        return {
          type: 'cascade_failure',
          title: `Storage Crisis (${alerts.length} failures)`,
          description: `Multiple branches experiencing storage or recording failures. This may indicate a systemic issue with storage infrastructure or capacity planning.`,
          metadata: {
            pattern: 'storage_crisis',
            failures: alerts.length,
          },
        };
      },
    });
  }

  /**
   * Add custom correlation rule
   */
  addRule(ruleId: string, rule: CorrelationRule): void {
    this.rules.set(ruleId, rule);
  }

  /**
   * Enable/disable rule
   */
  setRuleEnabled(ruleId: string, enabled: boolean): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = enabled;
    }
  }

  /**
   * Get all rules
   */
  getRules(): Map<string, CorrelationRule> {
    return new Map(this.rules);
  }

  /**
   * Get correlation statistics
   */
  async getStats(): Promise<{
    activeIncidents: number;
    totalIncidents: number;
    alertsCorrelated: number;
  }> {
    try {
      const pattern = `${this.keyPrefix}:incidents:*`;
      let cursor = '0';
      let incidentCount = 0;
      let alertCount = 0;

      do {
        const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        incidentCount += keys.length;

        for (const key of keys) {
          const data = await this.redis.get(key);
          if (data) {
            const incident = JSON.parse(data);
            alertCount += incident.childAlerts?.length ?? 0;
          }
        }
      } while (cursor !== '0');

      return {
        activeIncidents: incidentCount,
        totalIncidents: incidentCount,
        alertsCorrelated: alertCount,
      };
    } catch (error) {
      console.error('[AlertCorrelation] Error getting stats:', error);
      return {
        activeIncidents: 0,
        totalIncidents: 0,
        alertsCorrelated: 0,
      };
    }
  }
}

/**
 * Singleton instance
 */
let instance: AlertCorrelationService | null = null;

export function getAlertCorrelationService(redis: Redis): AlertCorrelationService {
  if (!instance) {
    instance = new AlertCorrelationService(redis);
  }
  return instance;
}
