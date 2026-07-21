/**
 * Phase 3: Health Monitoring Service
 * Real-time health data collection from edge agents and components
 * Includes threshold alerting, trend analysis, and SLA tracking
 */

import type { ControlPlaneStore } from "../control-plane-store.js";
import type { ResourceNode } from "../domain/models.js";

export interface HealthMetric {
  componentType: "camera" | "storage" | "network" | "ups" | "recorder";
  componentId: string;
  metricName: string;
  value: number;
  unit: string;
  timestamp: Date;
  threshold?: {
    warning: number;
    critical: number;
  };
  status: "healthy" | "warning" | "critical";
}

export interface HealthThreshold {
  componentType: string;
  metricName: string;
  warningThreshold: number;
  criticalThreshold: number;
  comparisonOp: "gt" | "lt" | "gte" | "lte" | "eq" | "ne";
}

export interface HealthTrendAnalysis {
  componentId: string;
  metricName: string;
  trend: "improving" | "stable" | "degrading";
  averageValue: number;
  maxValue: number;
  minValue: number;
  percentChange: number;
  forecastedFailureDate?: Date;
}

export interface HealthAlert {
  id: string;
  componentId: string;
  componentType: string;
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  metric: string;
  currentValue: number;
  threshold: number;
  timestamp: Date;
  acknowledged: boolean;
  recommendedAction: string;
}

export class HealthMonitoringService {
  private store: ControlPlaneStore;
  private thresholds: Map<string, HealthThreshold[]> = new Map();
  private metricsBuffer: HealthMetric[] = [];
  private alerts: HealthAlert[] = [];
  private collectionInterval: NodeJS.Timer | null = null;
  private readonly BUFFER_SIZE = 1000;
  private readonly COLLECTION_INTERVAL_MS = 30000; // 30 seconds

  constructor(store: ControlPlaneStore) {
    this.store = store;
    this.initializeThresholds();
  }

  /**
   * Initialize default health thresholds for each component type
   */
  private initializeThresholds(): void {
    // Camera thresholds
    this.addThreshold({
      componentType: "camera",
      metricName: "fps",
      warningThreshold: 20,
      criticalThreshold: 10,
      comparisonOp: "lt",
    });
    this.addThreshold({
      componentType: "camera",
      metricName: "bitrate_kbps",
      warningThreshold: 500,
      criticalThreshold: 100,
      comparisonOp: "lt",
    });
    this.addThreshold({
      componentType: "camera",
      metricName: "temperature_celsius",
      warningThreshold: 55,
      criticalThreshold: 70,
      comparisonOp: "gt",
    });
    this.addThreshold({
      componentType: "camera",
      metricName: "uptime_percent",
      warningThreshold: 95,
      criticalThreshold: 90,
      comparisonOp: "lt",
    });

    // Storage thresholds
    this.addThreshold({
      componentType: "storage",
      metricName: "capacity_used_percent",
      warningThreshold: 80,
      criticalThreshold: 95,
      comparisonOp: "gte",
    });
    this.addThreshold({
      componentType: "storage",
      metricName: "smart_health_percent",
      warningThreshold: 80,
      criticalThreshold: 50,
      comparisonOp: "lte",
    });
    this.addThreshold({
      componentType: "storage",
      metricName: "io_latency_ms",
      warningThreshold: 50,
      criticalThreshold: 100,
      comparisonOp: "gt",
    });

    // Network thresholds
    this.addThreshold({
      componentType: "network",
      metricName: "latency_ms",
      warningThreshold: 100,
      criticalThreshold: 200,
      comparisonOp: "gt",
    });
    this.addThreshold({
      componentType: "network",
      metricName: "packet_loss_percent",
      warningThreshold: 1,
      criticalThreshold: 5,
      comparisonOp: "gt",
    });
    this.addThreshold({
      componentType: "network",
      metricName: "jitter_ms",
      warningThreshold: 50,
      criticalThreshold: 100,
      comparisonOp: "gt",
    });

    // UPS thresholds
    this.addThreshold({
      componentType: "ups",
      metricName: "battery_health_percent",
      warningThreshold: 80,
      criticalThreshold: 60,
      comparisonOp: "lt",
    });
    this.addThreshold({
      componentType: "ups",
      metricName: "battery_runtime_minutes",
      warningThreshold: 15,
      criticalThreshold: 5,
      comparisonOp: "lt",
    });
    this.addThreshold({
      componentType: "ups",
      metricName: "input_voltage_volts",
      warningThreshold: 200,
      criticalThreshold: 170,
      comparisonOp: "lt",
    });
  }

  /**
   * Add or update a health threshold
   */
  addThreshold(threshold: HealthThreshold): void {
    const key = `${threshold.componentType}:${threshold.metricName}`;
    const thresholds = this.thresholds.get(key) || [];
    const index = thresholds.findIndex(
      (t) => t.componentType === threshold.componentType
    );
    if (index >= 0) {
      thresholds[index] = threshold;
    } else {
      thresholds.push(threshold);
    }
    this.thresholds.set(key, thresholds);
  }

  /**
   * Record a health metric and evaluate against thresholds
   */
  recordMetric(metric: Omit<HealthMetric, "status">): void {
    const threshold = this.getThreshold(
      metric.componentType,
      metric.metricName
    );

    const status = this.evaluateStatus(metric.value, threshold);
    const fullMetric: HealthMetric = {
      ...metric,
      status,
      timestamp: metric.timestamp || new Date(),
    };

    // Add to buffer
    this.metricsBuffer.push(fullMetric);
    if (this.metricsBuffer.length > this.BUFFER_SIZE) {
      this.metricsBuffer.shift();
    }

    // Check for threshold violations
    if (threshold) {
      this.checkThresholdViolation(fullMetric, threshold);
    }
  }

  /**
   * Get threshold for a component and metric
   */
  private getThreshold(
    componentType: string,
    metricName: string
  ): HealthThreshold | undefined {
    const key = `${componentType}:${metricName}`;
    const thresholds = this.thresholds.get(key);
    return thresholds?.[0];
  }

  /**
   * Evaluate health status based on metric value and threshold
   */
  private evaluateStatus(
    value: number,
    threshold?: HealthThreshold
  ): "healthy" | "warning" | "critical" {
    if (!threshold) return "healthy";

    const isCritical = this.compareValue(
      value,
      threshold.criticalThreshold,
      threshold.comparisonOp
    );
    if (isCritical) return "critical";

    const isWarning = this.compareValue(
      value,
      threshold.warningThreshold,
      threshold.comparisonOp
    );
    if (isWarning) return "warning";

    return "healthy";
  }

  /**
   * Compare value against threshold using specified operator
   */
  private compareValue(
    value: number,
    threshold: number,
    op: string
  ): boolean {
    switch (op) {
      case "gt":
        return value > threshold;
      case "lt":
        return value < threshold;
      case "gte":
        return value >= threshold;
      case "lte":
        return value <= threshold;
      case "eq":
        return value === threshold;
      case "ne":
        return value !== threshold;
      default:
        return false;
    }
  }

  /**
   * Check for threshold violations and create alerts
   */
  private checkThresholdViolation(
    metric: HealthMetric,
    threshold: HealthThreshold
  ): void {
    if (metric.status === "healthy") return;

    const existingAlert = this.alerts.find(
      (a) =>
        a.componentId === metric.componentId &&
        a.metric === metric.metricName &&
        !a.acknowledged
    );

    if (!existingAlert) {
      const alert: HealthAlert = {
        id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        componentId: metric.componentId,
        componentType: metric.componentType,
        severity: metric.status === "critical" ? "critical" : "warning",
        title: `${metric.componentType} ${metric.metricName} ${metric.status}`,
        description: `${metric.componentType} ${metric.componentId} - ${metric.metricName}: ${metric.value}${metric.unit} (threshold: ${threshold[metric.status === "critical" ? "criticalThreshold" : "warningThreshold"]}${metric.unit})`,
        metric: metric.metricName,
        currentValue: metric.value,
        threshold:
          metric.status === "critical"
            ? threshold.criticalThreshold
            : threshold.warningThreshold,
        timestamp: new Date(),
        acknowledged: false,
        recommendedAction: this.getRecommendedAction(
          metric.componentType,
          metric.metricName,
          metric.status
        ),
      };

      this.alerts.push(alert);
    }
  }

  /**
   * Get recommended action for health issue
   */
  private getRecommendedAction(
    componentType: string,
    metricName: string,
    status: string
  ): string {
    const recommendations: Record<string, Record<string, Record<string, string>>> = {
      camera: {
        fps: {
          critical: "Check camera connectivity and power supply immediately",
          warning: "Monitor FPS - may indicate network or processing issues",
        },
        temperature_celsius: {
          critical:
            "Camera overheating - check ventilation and consider replacement",
          warning: "Monitor temperature - ensure proper ventilation",
        },
      },
      storage: {
        capacity_used_percent: {
          critical: "Storage critically full - delete old recordings immediately",
          warning: "Storage approaching capacity - plan cleanup",
        },
        smart_health_percent: {
          critical: "Drive failure likely - replace immediately",
          warning: "Drive degradation detected - schedule replacement",
        },
      },
      ups: {
        battery_health_percent: {
          critical: "UPS battery critical - replace immediately",
          warning: "UPS battery degrading - schedule maintenance",
        },
      },
    };

    return (
      recommendations[componentType]?.[metricName]?.[status] ||
      "Check component status and contact support if issue persists"
    );
  }

  /**
   * Get recent metrics for a component
   */
  getRecentMetrics(
    componentId: string,
    minutes: number = 60
  ): HealthMetric[] {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    return this.metricsBuffer.filter(
      (m) => m.componentId === componentId && m.timestamp > cutoff
    );
  }

  /**
   * Analyze trend for a component and metric
   */
  analyzeTrend(
    componentId: string,
    metricName: string,
    minutes: number = 120
  ): HealthTrendAnalysis | null {
    const metrics = this.getRecentMetrics(componentId, minutes).filter(
      (m) => m.metricName === metricName
    );

    if (metrics.length < 2) return null;

    const values = metrics.map((m) => m.value);
    const avgValue = values.reduce((a, b) => a + b) / values.length;
    const maxValue = Math.max(...values);
    const minValue = Math.min(...values);

    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));
    const firstAvg = firstHalf.reduce((a, b) => a + b) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b) / secondHalf.length;

    let trend: "improving" | "stable" | "degrading" = "stable";
    if (secondAvg < firstAvg * 0.95) trend = "improving";
    if (secondAvg > firstAvg * 1.05) trend = "degrading";

    const percentChange = ((secondAvg - firstAvg) / firstAvg) * 100;

    return {
      componentId,
      metricName,
      trend,
      averageValue: avgValue,
      maxValue,
      minValue,
      percentChange,
    };
  }

  /**
   * Get all active alerts
   */
  getActiveAlerts(): HealthAlert[] {
    return this.alerts.filter((a) => !a.acknowledged);
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): void {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
    }
  }

  /**
   * Start background health monitoring service
   */
  start(): void {
    if (this.collectionInterval) return;

    this.collectionInterval = setInterval(() => {
      this.collectHealthMetrics();
    }, this.COLLECTION_INTERVAL_MS);
  }

  /**
   * Stop background health monitoring service
   */
  stop(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = null;
    }
  }

  /**
   * Collect health metrics from edge agents
   */
  private async collectHealthMetrics(): Promise<void> {
    try {
      // This will be called by the scheduler
      // In a real implementation, this would:
      // 1. Query edge agents for health metrics
      // 2. Process metrics through thresholds
      // 3. Generate alerts
      // 4. Update database
    } catch (error) {
      console.error("Error collecting health metrics:", error);
    }
  }

  /**
   * Get health dashboard summary
   */
  async getHealthSummary(tenantId: string): Promise<{
    totalComponents: number;
    healthyCount: number;
    warningCount: number;
    criticalCount: number;
    overallStatus: "healthy" | "degraded" | "critical";
    activeAlerts: number;
    lastCollected: Date;
  }> {
    const alerts = this.alerts.filter((a) => !a.acknowledged);
    const criticalCount = alerts.filter((a) => a.severity === "critical").length;
    const warningCount = alerts.filter((a) => a.severity === "warning").length;

    const overallStatus =
      criticalCount > 0 ? "critical" : warningCount > 0 ? "degraded" : "healthy";

    return {
      totalComponents: this.metricsBuffer.length,
      healthyCount: this.metricsBuffer.filter((m) => m.status === "healthy")
        .length,
      warningCount: this.metricsBuffer.filter((m) => m.status === "warning")
        .length,
      criticalCount: this.metricsBuffer.filter((m) => m.status === "critical")
        .length,
      overallStatus,
      activeAlerts: alerts.length,
      lastCollected: new Date(),
    };
  }
}

// Export singleton instance
let healthMonitoringService: HealthMonitoringService | null = null;

export function initializeHealthMonitoring(
  store: ControlPlaneStore
): HealthMonitoringService {
  if (!healthMonitoringService) {
    healthMonitoringService = new HealthMonitoringService(store);
  }
  return healthMonitoringService;
}

export function getHealthMonitoring(): HealthMonitoringService {
  if (!healthMonitoringService) {
    throw new Error(
      "Health monitoring service not initialized. Call initializeHealthMonitoring first."
    );
  }
  return healthMonitoringService;
}
