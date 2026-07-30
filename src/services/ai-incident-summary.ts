/**
 * AI Incident Summary Service
 * 
 * Correlates multiple alerts into meaningful incidents using:
 * - Time-window clustering
 * - Location proximity
 * - Event type relationships
 * - Root cause deduction
 * - Priority calculation
 */

import type { ControlPlaneStore } from "../control-plane-store.js";
import type { AnalyticsAlert } from "../domain/models.js";

// Helpers to adapt AnalyticsAlert shape (alerts in this codebase use
// firstDetectedAt/lastDetectedAt and severity codes like P1..P5). Keep
// these helpers local so the rest of the service can assume simple
// string-based detection types and an occurredAt timestamp.
function getOccurredAt(alert: AnalyticsAlert): string {
  // Prefer lastDetectedAt then firstDetectedAt for event time
  return (alert as any).occurredAt ?? alert.lastDetectedAt ?? alert.firstDetectedAt;
}

function getDetectionType(alert: AnalyticsAlert): string {
  // Some pipelines may attach `detectionType` to alerts; fall back to ruleId
  return (alert as any).detectionType ?? (alert.ruleId ? String(alert.ruleId) : "intrusion");
}

function getBranchId(alert: AnalyticsAlert): string | undefined {
  // Alerts do not currently include branchId; attempt to read if present.
  return (alert as any).branchId ?? undefined;
}

function alertSeverityLabel(sev: unknown): "critical" | "high" | "medium" | "low" {
  // Map project-specific severity codes (P1..P5) to human labels.
  const s = String(sev);
  if (s === "P1") return "critical";
  if (s === "P2") return "high";
  if (s === "P3") return "medium";
  return "low";
}
export interface AlertCluster {
  id: string;
  tenantId: string;
  clusterId: string;
  alertIds: string[];
  incidentType: string;
  severity: "critical" | "high" | "medium" | "low";
  branchId?: string;
  cameraIds: string[];
  firstOccurredAt: string;
  lastOccurredAt: string;
  durationSeconds: number;
  alertCount: number;
  uniqueCameras: number;
  confidence: number;
  correlationFactors: {
    timeBased: boolean;
    locationBased: boolean;
    typeBased: boolean;
    rootCauseBased: boolean;
    crossCamera: boolean;
  };
  rootCause?: string;
  impactLevel: string;
  autoResolved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IncidentSummary {
  tenantId: string;
  period: string;
  periodStart: string;
  periodEnd: string;
  totalAlerts: number;
  totalIncidents: number;
  reductionRatio: number;
  criticalIncidents: number;
  highPriorityIncidents: number;
  operationalIssues: number;
  securityIncidents: {
    intrusions: number;
    fireSmoke: number;
    suspiciousActivity: number;
    restrictedZone: number;
    tailgating: number;
    unattendedObjects: number;
  };
  infrastructureIncidents: {
    cameraFailures: number;
    camerasOffline: number;
    recordingInterruptions: number;
    storageIssues: number;
    networkIssues: number;
  };
  topIncidents: Array<{
    clusterId: string;
    incidentType: string;
    severity: string;
    branchId?: string;
    alertCount: number;
    occurredAt: string;
    description: string;
  }>;
  incidentsByType: Record<string, number>;
  incidentsBySeverity: Record<string, number>;
  incidentsByBranch: Record<string, number>;
  averageAlertsPerIncident: number;
  averageResponseTime?: number;
  generatedAt: string;
}

export interface CorrelationTimeWindow {
  intrusion: number;          // 30-120 seconds
  fireAlert: number;           // 10-60 seconds
  cameraFailure: number;       // 2-10 minutes
  networkOutage: number;       // 1-5 minutes
  vehicleJourney: number;      // 5-30 minutes
  personTracking: number;      // 1-5 minutes
}

export const DEFAULT_CORRELATION_WINDOWS: CorrelationTimeWindow = {
  intrusion: 90,               // 90 seconds
  fireAlert: 30,               // 30 seconds
  cameraFailure: 300,          // 5 minutes
  networkOutage: 180,          // 3 minutes
  vehicleJourney: 600,         // 10 minutes
  personTracking: 120,         // 2 minutes
};

export class AIIncidentSummaryService {
  constructor(private store: ControlPlaneStore) {}

  /**
   * Correlate alerts into incident clusters
   */
  async correlateAlerts(
    tenantId: string,
    alerts: AnalyticsAlert[],
    options?: {
      timeWindows?: Partial<CorrelationTimeWindow>;
      minClusterSize?: number;
      maxClusterAge?: number;
    }
  ): Promise<AlertCluster[]> {
    const timeWindows = { ...DEFAULT_CORRELATION_WINDOWS, ...options?.timeWindows };
    const minClusterSize = options?.minClusterSize ?? 1;
    const maxClusterAge = options?.maxClusterAge ?? 3600; // 1 hour default

    // Sort alerts by time
    const sortedAlerts = [...alerts].sort(
      (a, b) => new Date(getOccurredAt(a)).getTime() - new Date(getOccurredAt(b)).getTime()
    );

    const clusters: AlertCluster[] = [];
    const processedAlerts = new Set<string>();

    for (const alert of sortedAlerts) {
      if (processedAlerts.has(alert.id)) continue;

      // Find related alerts within time window
      const relatedAlerts = this.findRelatedAlerts(
        alert,
        sortedAlerts,
        timeWindows,
        maxClusterAge
      );

      if (relatedAlerts.length >= minClusterSize) {
        const cluster = this.createCluster(tenantId, [alert, ...relatedAlerts]);
        clusters.push(cluster);

        // Mark all alerts in cluster as processed
        processedAlerts.add(alert.id);
        relatedAlerts.forEach((a) => processedAlerts.add(a.id));
      }
    }

    return clusters;
  }

  /**
   * Find alerts related to a given alert within correlation windows
   */
  private findRelatedAlerts(
    baseAlert: AnalyticsAlert,
    allAlerts: AnalyticsAlert[],
    timeWindows: CorrelationTimeWindow,
    maxAge: number
  ): AnalyticsAlert[] {
    const baseTime = new Date(getOccurredAt(baseAlert)).getTime();
    const relatedAlerts: AnalyticsAlert[] = [];

    // Determine time window based on detection type
    const window = this.getTimeWindow(getDetectionType(baseAlert), timeWindows);

    for (const alert of allAlerts) {
      if (alert.id === baseAlert.id) continue;

      const alertTime = new Date(getOccurredAt(alert)).getTime();
      const timeDiff = Math.abs(alertTime - baseTime) / 1000; // in seconds

      // Check if within time window
      if (timeDiff > window || timeDiff > maxAge) continue;

      // Check correlation factors
      const isRelated = this.checkCorrelation(baseAlert, alert, timeDiff);

      if (isRelated) {
        relatedAlerts.push(alert);
      }
    }

    return relatedAlerts;
  }

  /**
   * Get appropriate time window for alert type
   */
  private getTimeWindow(detectionType: string, windows: CorrelationTimeWindow): number {
    const typeMap: Record<string, keyof CorrelationTimeWindow> = {
      "intrusion": "intrusion",
      "line-crossing": "intrusion",
      "zone-violation": "intrusion",
      "fire-detection": "fireAlert",
      "smoke-detection": "fireAlert",
      "camera-offline": "cameraFailure",
      "camera-tamper": "cameraFailure",
      "recording-failure": "cameraFailure",
      "network-loss": "networkOutage",
      "vehicle-detection": "vehicleJourney",
      "person-detection": "personTracking",
    };

    const windowKey = typeMap[detectionType] || "intrusion";
    return windows[windowKey];
  }

  /**
   * Check if two alerts are correlated
   */
  private checkCorrelation(alert1: AnalyticsAlert, alert2: AnalyticsAlert, timeDiffSeconds: number): boolean {
    let correlationScore = 0;

    // Same branch/location (+3)
    if (getBranchId(alert1) && getBranchId(alert1) === getBranchId(alert2)) {
      correlationScore += 3;
    }

    // Same camera (+5)
    if (alert1.cameraId === alert2.cameraId) {
      correlationScore += 5;
    }

    // Related detection types (+4)
    if (this.areRelatedTypes(getDetectionType(alert1), getDetectionType(alert2))) {
      correlationScore += 4;
    }

    // Close in time (+2)
    if (timeDiffSeconds < 30) {
      correlationScore += 2;
    }

    // Same severity (+1)
    if (alert1.severity === alert2.severity) {
      correlationScore += 1;
    }

    // Threshold: require score >= 5 for correlation
    return correlationScore >= 5;
  }

  /**
   * Check if detection types are related
   */
  private areRelatedTypes(type1: string, type2: string): boolean {
    const relatedGroups = [
      ["intrusion", "line-crossing", "zone-violation", "person-detection"],
      ["fire-detection", "smoke-detection"],
      ["camera-offline", "camera-tamper", "recording-failure"],
      ["network-loss", "camera-offline"],
      ["vehicle-detection", "anpr"],
      ["tailgating", "person-detection"],
      ["unattended-object", "person-detection"],
    ];

    return relatedGroups.some((group) => group.includes(type1) && group.includes(type2));
  }

  /**
   * Create incident cluster from alerts
   */
  private createCluster(tenantId: string, alerts: AnalyticsAlert[]): AlertCluster {
    const sortedAlerts = [...alerts].sort(
      (a, b) => new Date(getOccurredAt(a)).getTime() - new Date(getOccurredAt(b)).getTime()
    );

    const firstAlert = sortedAlerts[0];
    const lastAlert = sortedAlerts[sortedAlerts.length - 1];

    const firstTime = new Date(getOccurredAt(firstAlert)).getTime();
    const lastTime = new Date(getOccurredAt(lastAlert)).getTime();
    const durationSeconds = (lastTime - firstTime) / 1000;

    const cameraIds = [...new Set(alerts.map((a) => a.cameraId))];
    const uniqueCameras = cameraIds.length;

    // Determine incident type
    const incidentType = this.determineIncidentType(alerts);

    // Calculate severity
    const severity = this.calculateClusterSeverity(alerts);

    // Detect root cause
    const rootCause = this.detectRootCause(alerts);

    // Determine correlation factors
    const correlationFactors = this.analyzeCorrelationFactors(alerts);

    // Calculate confidence
    const confidence = this.calculateConfidence(alerts, correlationFactors);

    const now = new Date().toISOString();

    return {
      id: this.generateClusterId(tenantId, firstAlert),
      tenantId,
      clusterId: this.generateClusterId(tenantId, firstAlert),
      alertIds: alerts.map((a) => a.id),
      incidentType,
      severity,
      branchId: getBranchId(firstAlert),
      cameraIds,
      firstOccurredAt: getOccurredAt(firstAlert),
      lastOccurredAt: getOccurredAt(lastAlert),
      durationSeconds,
      alertCount: alerts.length,
      uniqueCameras,
      confidence,
      correlationFactors,
      rootCause,
      impactLevel: this.calculateImpactLevel(alerts),
      autoResolved: this.isAutoResolved(alerts),
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Determine primary incident type from alerts
   */
  private determineIncidentType(alerts: AnalyticsAlert[]): string {
    const typeCounts: Record<string, number> = {};

    alerts.forEach((alert) => {
      const t = getDetectionType(alert);
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    });

    // Find most common type
    const sortedTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);

    // Map to incident category
    const primaryType = sortedTypes[0][0];
    return this.mapToIncidentCategory(primaryType);
  }

  /**
   * Map detection type to incident category
   */
  private mapToIncidentCategory(detectionType: string): string {
    const mapping: Record<string, string> = {
      "intrusion": "security-intrusion",
      "line-crossing": "security-intrusion",
      "zone-violation": "restricted-access",
      "fire-detection": "fire-emergency",
      "smoke-detection": "fire-emergency",
      "camera-offline": "infrastructure-failure",
      "camera-tamper": "security-tamper",
      "recording-failure": "infrastructure-failure",
      "network-loss": "infrastructure-network",
      "vehicle-detection": "vehicle-incident",
      "person-detection": "person-of-interest",
      "tailgating": "security-breach",
      "unattended-object": "security-suspicious",
      "crowd-density": "safety-crowd",
      "fall-detection": "safety-medical",
    };

    return mapping[detectionType] || "general-alert";
  }

  /**
   * Calculate cluster severity
   */
  private calculateClusterSeverity(alerts: AnalyticsAlert[]): "critical" | "high" | "medium" | "low" {
    const criticalTypes = ["fire-detection", "smoke-detection", "intrusion", "fall-detection"];
    const highTypes = ["zone-violation", "camera-tamper", "tailgating", "unattended-object"];

    // Check if any alert is critical type
    if (alerts.some((a) => criticalTypes.includes(getDetectionType(a)))) {
      return "critical";
    }
    // Check if any alert is high severity
    if (alerts.some((a) => alertSeverityLabel(a.severity) === "critical" || highTypes.includes(getDetectionType(a)))) {
      return "high";
    }

    // Check average confidence
    const avgConfidence = alerts.reduce((sum, a) => sum + a.confidence, 0) / alerts.length;
    if (avgConfidence > 0.85) {
      return "high";
    }

    // Check alert count
    if (alerts.length >= 10) {
      return "high";
    }

    if (alerts.length >= 5) {
      return "medium";
    }

    return "low";
  }

  /**
   * Detect root cause of incident
   */
  private detectRootCause(alerts: AnalyticsAlert[]): string | undefined {
    // Camera offline leading to other alerts
    if (alerts.some((a) => getDetectionType(a) === "camera-offline")) {
      return "camera-hardware-failure";
    }

    // Network issues causing multiple failures
    if (alerts.some((a) => getDetectionType(a) === "network-loss")) {
      return "network-connectivity-issue";
    }

    // Multiple cameras offline in same location
    const offlineCameras = alerts.filter((a) => getDetectionType(a) === "camera-offline");
    if (offlineCameras.length >= 3) {
      return "power-failure-or-network-switch-down";
    }

    // Sequential person detections suggest tracking
    const personAlerts = alerts.filter((a) => getDetectionType(a) === "person-detection");
    if (personAlerts.length >= 3 && this.isSequential(personAlerts)) {
      return "person-movement-across-cameras";
    }

    return undefined;
  }

  /**
   * Check if alerts are sequential (ordered by time)
   */
  private isSequential(alerts: AnalyticsAlert[]): boolean {
    if (alerts.length < 2) return false;

    const sorted = [...alerts].sort(
      (a, b) => new Date(getOccurredAt(a)).getTime() - new Date(getOccurredAt(b)).getTime()
    );

    // Check if cameras are different
    const uniqueCameras = new Set(sorted.map((a) => a.cameraId));
    return uniqueCameras.size === sorted.length;
  }

  /**
   * Analyze correlation factors
   */
  private analyzeCorrelationFactors(alerts: AnalyticsAlert[]) {
    const branchIds = new Set(alerts.map((a) => getBranchId(a)).filter(Boolean));
    const cameraIds = new Set(alerts.map((a) => a.cameraId));
    const types = new Set(alerts.map((a) => getDetectionType(a)));

    const times = alerts.map((a) => new Date(getOccurredAt(a)).getTime());
    const timeSpread = Math.max(...times) - Math.min(...times);

    return {
      timeBased: timeSpread < 120000, // Within 2 minutes
      locationBased: branchIds.size === 1,
      typeBased: types.size <= 3, // Related types
      rootCauseBased: this.detectRootCause(alerts) !== undefined,
      crossCamera: cameraIds.size > 1,
    };
  }

  /**
   * Calculate correlation confidence
   */
  private calculateConfidence(
    alerts: AnalyticsAlert[],
    factors: ReturnType<typeof this.analyzeCorrelationFactors>
  ): number {
    let confidence = 0.5; // Base confidence

    if (factors.timeBased) confidence += 0.15;
    if (factors.locationBased) confidence += 0.15;
    if (factors.typeBased) confidence += 0.1;
    if (factors.rootCauseBased) confidence += 0.2;
    if (factors.crossCamera) confidence += 0.1;

    // Adjust by alert count
    if (alerts.length >= 5) confidence += 0.05;
    if (alerts.length >= 10) confidence += 0.1;

    return Math.min(confidence, 0.95);
  }

  /**
   * Calculate impact level
   */
  private calculateImpactLevel(alerts: AnalyticsAlert[]): string {
    const severity = this.calculateClusterSeverity(alerts);
    const uniqueCameras = new Set(alerts.map((a) => a.cameraId)).size;

    if (severity === "critical") return "critical-impact";
    if (severity === "high" && uniqueCameras >= 5) return "high-impact";
    if (uniqueCameras >= 10) return "high-impact";

    return "medium-impact";
  }

  /**
   * Check if incident auto-resolved
   */
  private isAutoResolved(alerts: AnalyticsAlert[]): boolean {
    // Check if all alerts are acknowledged/resolved
    return alerts.every((a) => a.status === "acknowledged" || a.status === "resolved");
  }

  /**
   * Generate cluster ID
   */
  private generateClusterId(tenantId: string, alert: AnalyticsAlert): string {
    const date = new Date(getOccurredAt(alert));
    const dateStr = date.toISOString().split("T")[0].replace(/-/g, "");
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();

    return `CLU-${tenantId.substring(0, 3).toUpperCase()}-${dateStr}-${random}`;
  }

  /**
   * Generate shift summary (8-hour period)
   */
  async generateShiftSummary(
    tenantId: string,
    shiftStart: string,
    shiftEnd: string,
    branchId?: string
  ): Promise<IncidentSummary> {
    const filters: Parameters<ControlPlaneStore["listAnalyticsAlerts"]>[1] = {
      from: shiftStart,
      to: shiftEnd,
      limit: 10000,
    };

    if (branchId) {
      filters.branchId = branchId;
    }

    const alerts = await this.store.listAnalyticsAlerts(tenantId, filters);

    return this.generateSummary(tenantId, "shift", shiftStart, shiftEnd, alerts);
  }

  /**
   * Generate daily summary
   */
  async generateDailySummary(
    tenantId: string,
    date: string,
    branchId?: string
  ): Promise<IncidentSummary> {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    return this.generateShiftSummary(
      tenantId,
      dayStart.toISOString(),
      dayEnd.toISOString(),
      branchId
    );
  }

  /**
   * Generate summary from alerts
   */
  private async generateSummary(
    tenantId: string,
    period: string,
    periodStart: string,
    periodEnd: string,
    alerts: AnalyticsAlert[]
  ): Promise<IncidentSummary> {
    // Correlate alerts into clusters
    const clusters = await this.correlateAlerts(tenantId, alerts);

    // Calculate metrics
    const totalAlerts = alerts.length;
    const totalIncidents = clusters.length;
    const reductionRatio = totalAlerts > 0 ? totalAlerts / Math.max(totalIncidents, 1) : 0;

    const criticalIncidents = clusters.filter((c) => c.severity === "critical").length;
    const highPriorityIncidents = clusters.filter((c) => c.severity === "high").length;
    const operationalIssues = clusters.filter((c) =>
      c.incidentType.startsWith("infrastructure-")
    ).length;

    // Categorize incidents
    const securityIncidents = {
      intrusions: this.countByType(clusters, "security-intrusion"),
      fireSmoke: this.countByType(clusters, "fire-emergency"),
      suspiciousActivity: this.countByType(clusters, "security-suspicious"),
      restrictedZone: this.countByType(clusters, "restricted-access"),
      tailgating: this.countByType(clusters, "security-breach"),
      unattendedObjects: this.countByType(clusters, "security-suspicious"),
    };

    const infrastructureIncidents = {
      cameraFailures: this.countByType(clusters, "infrastructure-failure"),
      camerasOffline: alerts.filter((a) => getDetectionType(a) === "camera-offline").length,
      recordingInterruptions: alerts.filter((a) => getDetectionType(a) === "recording-failure")
        .length,
      storageIssues: 0, // TODO: Add storage monitoring
      networkIssues: this.countByType(clusters, "infrastructure-network"),
    };

    // Top incidents
    const topIncidents = clusters
      .sort((a, b) => {
        // Sort by severity first, then alert count
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
        if (severityDiff !== 0) return severityDiff;
        return b.alertCount - a.alertCount;
      })
      .slice(0, 10)
      .map((c) => ({
        clusterId: c.clusterId,
        incidentType: c.incidentType,
        severity: c.severity,
        branchId: c.branchId,
        alertCount: c.alertCount,
        occurredAt: c.firstOccurredAt,
        description: this.generateClusterDescription(c),
      }));

    // Group by type
    const incidentsByType: Record<string, number> = {};
    clusters.forEach((c) => {
      incidentsByType[c.incidentType] = (incidentsByType[c.incidentType] || 0) + 1;
    });

    // Group by severity
    const incidentsBySeverity: Record<string, number> = {};
    clusters.forEach((c) => {
      incidentsBySeverity[c.severity] = (incidentsBySeverity[c.severity] || 0) + 1;
    });

    // Group by branch
    const incidentsByBranch: Record<string, number> = {};
    clusters.forEach((c) => {
      if (c.branchId) {
        incidentsByBranch[c.branchId] = (incidentsByBranch[c.branchId] || 0) + 1;
      }
    });

    const averageAlertsPerIncident = totalIncidents > 0 ? totalAlerts / totalIncidents : 0;

    return {
      tenantId,
      period,
      periodStart,
      periodEnd,
      totalAlerts,
      totalIncidents,
      reductionRatio: Math.round(reductionRatio * 10) / 10,
      criticalIncidents,
      highPriorityIncidents,
      operationalIssues,
      securityIncidents,
      infrastructureIncidents,
      topIncidents,
      incidentsByType,
      incidentsBySeverity,
      incidentsByBranch,
      averageAlertsPerIncident: Math.round(averageAlertsPerIncident * 10) / 10,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Count clusters by incident type
   */
  private countByType(clusters: AlertCluster[], type: string): number {
    return clusters.filter((c) => c.incidentType === type).length;
  }

  /**
   * Generate human-readable description for cluster
   */
  private generateClusterDescription(cluster: AlertCluster): string {
    const cameraText = cluster.uniqueCameras === 1 ? "1 camera" : `${cluster.uniqueCameras} cameras`;
    const alertText = cluster.alertCount === 1 ? "1 alert" : `${cluster.alertCount} alerts`;
    const durationText =
      cluster.durationSeconds < 60
        ? `${Math.round(cluster.durationSeconds)}s`
        : `${Math.round(cluster.durationSeconds / 60)}min`;

    return `${alertText} across ${cameraText} over ${durationText}`;
  }

  /**
   * Generate executive summary (weekly/monthly)
   */
  async generateExecutiveSummary(
    tenantId: string,
    periodType: "week" | "month",
    startDate: string
  ): Promise<IncidentSummary> {
    const start = new Date(startDate);
    const end = new Date(startDate);

    if (periodType === "week") {
      end.setDate(start.getDate() + 7);
    } else {
      end.setMonth(start.getMonth() + 1);
    }

    return this.generateShiftSummary(tenantId, start.toISOString(), end.toISOString());
  }
}
