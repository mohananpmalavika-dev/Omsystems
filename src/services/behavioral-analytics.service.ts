/**
 * Behavioral Analytics & Anomaly Detection Service
 * 
 * Features:
 * - Baseline behavior learning per camera/location
 * - Real-time anomaly detection
 * - Pattern recognition across time
 * - Predictive alerting
 * - Crowd behavior analysis
 * - Unusual activity detection
 */

import { z } from "zod";
import type { Pool } from "pg";

// Anomaly detection algorithms
interface BehaviorBaseline {
  cameraId: string;
  location: string;
  timeWindow: string; // "weekday-morning", "weekend-night", etc.
  averageDetectionsPerHour: number;
  averageOccupancy: number;
  commonObjectTypes: string[];
  peakHours: number[];
  quietHours: number[];
  typicalDuration: number;
  confidenceScore: number;
  learnedFrom: number; // Number of samples
  lastUpdated: string;
}

interface AnomalyEvent {
  id: string;
  cameraId: string;
  cameraName: string;
  timestamp: string;
  anomalyType: string;
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  description: string;
  expectedBehavior: string;
  actualBehavior: string;
  recommendation: string;
  metadata: {
    detectionCount?: number;
    occupancy?: number;
    duration?: number;
    objectTypes?: string[];
    timeOfDay?: string;
    dayOfWeek?: string;
  };
  reviewed: boolean;
  falsePositive: boolean;
}

interface PredictiveAlert {
  id: string;
  location: string;
  branchId: string;
  predictionType: string;
  probability: number;
  timeWindow: string;
  reasoning: string;
  suggestedActions: string[];
  basedOnPatterns: string[];
  createdAt: string;
}

export const behaviorAnalysisQuerySchema = z.object({
  cameraId: z.string().optional(),
  branchId: z.string().optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  anomalyType: z.string().optional(),
  minConfidence: z.number().min(0).max(1).default(0.7),
});

export class BehavioralAnalyticsService {
  constructor(private pool: Pool) {}

  /**
   * Learn baseline behavior for a camera
   */
  async learnBaseline(cameraId: string, daysOfHistory: number = 7): Promise<BehaviorBaseline> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysOfHistory);

    // Query historical events for the camera
    const { rows: events } = await this.pool.query(
      `SELECT 
        timestamp,
        detection_type,
        confidence,
        metadata,
        EXTRACT(HOUR FROM timestamp) as hour,
        EXTRACT(DOW FROM timestamp) as day_of_week
      FROM analytics_events
      WHERE camera_id = $1 
        AND timestamp >= $2
        AND confidence >= 0.6
      ORDER BY timestamp ASC`,
      [cameraId, startDate.toISOString()]
    );

    if (events.length < 50) {
      // Not enough data to learn baseline
      return this.getDefaultBaseline(cameraId);
    }

    // Calculate statistics
    const hourlyDetections = new Map<number, number>();
    const objectTypeCounts = new Map<string, number>();
    const occupancyReadings: number[] = [];
    const durations: number[] = [];

    events.forEach((event: any) => {
      const hour = parseInt(event.hour);
      hourlyDetections.set(hour, (hourlyDetections.get(hour) || 0) + 1);
      
      const type = event.detection_type;
      objectTypeCounts.set(type, (objectTypeCounts.get(type) || 0) + 1);

      if (event.metadata?.occupancy) {
        occupancyReadings.push(event.metadata.occupancy);
      }

      if (event.metadata?.duration) {
        durations.push(event.metadata.duration);
      }
    });

    // Calculate average detections per hour
    const totalHours = daysOfHistory * 24;
    const averageDetectionsPerHour = events.length / totalHours;

    // Calculate average occupancy
    const averageOccupancy = occupancyReadings.length > 0
      ? occupancyReadings.reduce((sum, val) => sum + val, 0) / occupancyReadings.length
      : 0;

    // Find common object types (top 5)
    const commonObjectTypes = Array.from(objectTypeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type]) => type);

    // Find peak and quiet hours
    const hourlyAverages = Array.from(hourlyDetections.entries())
      .map(([hour, count]) => ({ hour, average: count / daysOfHistory }))
      .sort((a, b) => b.average - a.average);

    const peakHours = hourlyAverages.slice(0, 3).map(h => h.hour);
    const quietHours = hourlyAverages.slice(-3).map(h => h.hour);

    // Calculate typical duration
    const typicalDuration = durations.length > 0
      ? durations.reduce((sum, val) => sum + val, 0) / durations.length
      : 0;

    // Determine time window (weekday vs weekend, time of day)
    const timeWindow = this.categorizeTimeWindow(new Date());

    // Get camera location
    const { rows: cameras } = await this.pool.query(
      "SELECT location FROM cameras WHERE id = $1",
      [cameraId]
    );
    const location = cameras[0]?.location || "Unknown";

    // Calculate confidence based on sample size
    const confidenceScore = Math.min(events.length / 1000, 0.95);

    const baseline: BehaviorBaseline = {
      cameraId,
      location,
      timeWindow,
      averageDetectionsPerHour,
      averageOccupancy,
      commonObjectTypes,
      peakHours,
      quietHours,
      typicalDuration,
      confidenceScore,
      learnedFrom: events.length,
      lastUpdated: new Date().toISOString(),
    };

    // Store baseline in database
    await this.storeBaseline(baseline);

    return baseline;
  }

  /**
   * Detect anomalies in real-time
   */
  async detectAnomalies(
    cameraId: string,
    recentWindow: number = 60 // minutes
  ): Promise<AnomalyEvent[]> {
    const anomalies: AnomalyEvent[] = [];

    // Get baseline for camera
    const baseline = await this.getBaseline(cameraId);
    if (!baseline || baseline.confidenceScore < 0.5) {
      // Not enough baseline data yet
      return [];
    }

    // Get recent events
    const windowStart = new Date();
    windowStart.setMinutes(windowStart.getMinutes() - recentWindow);

    const { rows: recentEvents } = await this.pool.query(
      `SELECT 
        id,
        timestamp,
        detection_type,
        confidence,
        metadata
      FROM analytics_events
      WHERE camera_id = $1 
        AND timestamp >= $2
      ORDER BY timestamp DESC`,
      [cameraId, windowStart.toISOString()]
    );

    // Get camera info
    const { rows: cameras } = await this.pool.query(
      "SELECT name FROM cameras WHERE id = $1",
      [cameraId]
    );
    const cameraName = cameras[0]?.name || "Unknown Camera";

    // Analyze recent activity
    const currentHour = new Date().getHours();
    const eventsPerHour = (recentEvents.length / recentWindow) * 60;

    // Detection #1: Unusual detection rate
    if (Math.abs(eventsPerHour - baseline.averageDetectionsPerHour) > 
        baseline.averageDetectionsPerHour * 0.5) {
      
      const isHigher = eventsPerHour > baseline.averageDetectionsPerHour;
      const severity = isHigher && eventsPerHour > baseline.averageDetectionsPerHour * 2 
        ? "high" 
        : "medium";

      anomalies.push({
        id: `anomaly-${cameraId}-${Date.now()}-rate`,
        cameraId,
        cameraName,
        timestamp: new Date().toISOString(),
        anomalyType: "unusual_detection_rate",
        severity,
        confidence: baseline.confidenceScore * 0.9,
        description: isHigher
          ? "Significantly higher activity than normal"
          : "Unusually quiet - lower activity than normal",
        expectedBehavior: `${baseline.averageDetectionsPerHour.toFixed(1)} detections/hour`,
        actualBehavior: `${eventsPerHour.toFixed(1)} detections/hour`,
        recommendation: isHigher
          ? "Review camera feed for unusual activity or gathering"
          : "Check if camera is functioning properly",
        metadata: {
          detectionCount: recentEvents.length,
          timeOfDay: this.getTimeOfDayLabel(currentHour),
        },
        reviewed: false,
        falsePositive: false,
      });
    }

    // Detection #2: Unexpected object types
    const recentObjectTypes = new Set(recentEvents.map((e: any) => e.detection_type));
    const unexpectedTypes = Array.from(recentObjectTypes)
      .filter(type => !baseline.commonObjectTypes.includes(type));

    if (unexpectedTypes.length > 0 && unexpectedTypes.some(t => 
      ["weapon", "violence", "intrusion"].includes(t))) {
      anomalies.push({
        id: `anomaly-${cameraId}-${Date.now()}-object`,
        cameraId,
        cameraName,
        timestamp: new Date().toISOString(),
        anomalyType: "unexpected_object_type",
        severity: "critical",
        confidence: 0.95,
        description: `Detected unusual object types: ${unexpectedTypes.join(", ")}`,
        expectedBehavior: `Typical objects: ${baseline.commonObjectTypes.join(", ")}`,
        actualBehavior: `Detected: ${Array.from(recentObjectTypes).join(", ")}`,
        recommendation: "Immediate investigation required - potential security threat",
        metadata: {
          objectTypes: Array.from(recentObjectTypes),
        },
        reviewed: false,
        falsePositive: false,
      });
    }

    // Detection #3: Activity during quiet hours
    if (baseline.quietHours.includes(currentHour) && recentEvents.length > 5) {
      anomalies.push({
        id: `anomaly-${cameraId}-${Date.now()}-quiet`,
        cameraId,
        cameraName,
        timestamp: new Date().toISOString(),
        anomalyType: "activity_during_quiet_hours",
        severity: "medium",
        confidence: baseline.confidenceScore * 0.85,
        description: "Unusual activity during typically quiet hours",
        expectedBehavior: `Quiet period (${baseline.quietHours.join(", ")}:00)`,
        actualBehavior: `${recentEvents.length} detections in last ${recentWindow} minutes`,
        recommendation: "Review activity - may indicate unauthorized access",
        metadata: {
          detectionCount: recentEvents.length,
          timeOfDay: this.getTimeOfDayLabel(currentHour),
        },
        reviewed: false,
        falsePositive: false,
      });
    }

    // Detection #4: Loitering detection
    const loiteringEvents = recentEvents.filter((e: any) => 
      e.detection_type === "person" && e.metadata?.duration > 300 // 5+ minutes
    );

    if (loiteringEvents.length > 0) {
      const maxDuration = Math.max(...loiteringEvents.map((e: any) => e.metadata?.duration || 0));
      
      if (maxDuration > baseline.typicalDuration * 3) {
        anomalies.push({
          id: `anomaly-${cameraId}-${Date.now()}-loiter`,
          cameraId,
          cameraName,
          timestamp: new Date().toISOString(),
          anomalyType: "potential_loitering",
          severity: "medium",
          confidence: 0.8,
          description: "Person present for unusually long duration",
          expectedBehavior: `Typical duration: ${Math.round(baseline.typicalDuration / 60)} minutes`,
          actualBehavior: `Current duration: ${Math.round(maxDuration / 60)} minutes`,
          recommendation: "Monitor for suspicious behavior or intent",
          metadata: {
            duration: maxDuration,
          },
          reviewed: false,
          falsePositive: false,
        });
      }
    }

    // Store anomalies in database
    for (const anomaly of anomalies) {
      await this.storeAnomaly(anomaly);
    }

    return anomalies;
  }

  /**
   * Generate predictive alerts based on patterns
   */
  async generatePredictiveAlerts(
    branchId: string,
    lookAheadHours: number = 24
  ): Promise<PredictiveAlert[]> {
    const alerts: PredictiveAlert[] = [];

    // Get all cameras for branch
    const { rows: cameras } = await this.pool.query(
      "SELECT id, name, location FROM cameras WHERE branch_id = $1",
      [branchId]
    );

    // Analyze patterns for each camera
    for (const camera of cameras) {
      const baseline = await this.getBaseline(camera.id);
      if (!baseline || baseline.confidenceScore < 0.7) continue;

      // Get historical incidents at this location
      const { rows: historicalIncidents } = await this.pool.query(
        `SELECT 
          type,
          severity,
          EXTRACT(HOUR FROM created_at) as hour,
          EXTRACT(DOW FROM created_at) as day_of_week,
          COUNT(*) as incident_count
        FROM alerts
        WHERE camera_id = $1 
          AND created_at >= NOW() - INTERVAL '30 days'
          AND severity IN ('high', 'critical')
        GROUP BY type, severity, hour, day_of_week
        HAVING COUNT(*) > 2
        ORDER BY incident_count DESC`,
        [camera.id]
      );

      // Predict incidents based on time patterns
      const currentHour = new Date().getHours();
      const currentDayOfWeek = new Date().getDay();

      for (const incident of historicalIncidents) {
        const hourDiff = Math.abs(currentHour - parseInt(incident.hour));
        const sameDayOfWeek = currentDayOfWeek === parseInt(incident.day_of_week);

        if (hourDiff <= 2 && sameDayOfWeek) {
          const probability = Math.min(
            0.95,
            (parseInt(incident.incident_count) / 10) * (sameDayOfWeek ? 1.2 : 0.8)
          );

          if (probability >= 0.6) {
            alerts.push({
              id: `prediction-${camera.id}-${Date.now()}`,
              location: camera.location || camera.name,
              branchId,
              predictionType: incident.type,
              probability,
              timeWindow: `${currentHour}:00 - ${currentHour + 2}:00`,
              reasoning: `Historical pattern: ${incident.incident_count} similar incidents occurred at this time in the last 30 days`,
              suggestedActions: [
                "Increase monitoring of this area",
                "Consider preemptive security presence",
                "Enable enhanced analytics",
              ],
              basedOnPatterns: [
                `${incident.incident_count} incidents on ${this.getDayName(incident.day_of_week)} around ${incident.hour}:00`,
              ],
              createdAt: new Date().toISOString(),
            });
          }
        }
      }

      // Predict based on anomaly patterns
      const { rows: recentAnomalies } = await this.pool.query(
        `SELECT anomaly_type, COUNT(*) as count
        FROM behavior_anomalies
        WHERE camera_id = $1 
          AND timestamp >= NOW() - INTERVAL '7 days'
          AND false_positive = false
        GROUP BY anomaly_type
        HAVING COUNT(*) > 3`,
        [camera.id]
      );

      for (const anomalyPattern of recentAnomalies) {
        alerts.push({
          id: `prediction-${camera.id}-${Date.now()}-${anomalyPattern.anomaly_type}`,
          location: camera.location || camera.name,
          branchId,
          predictionType: `recurring_${anomalyPattern.anomaly_type}`,
          probability: Math.min(0.85, parseInt(anomalyPattern.count) / 10),
          timeWindow: "next 24 hours",
          reasoning: `Pattern detected: ${anomalyPattern.anomaly_type} occurred ${anomalyPattern.count} times recently`,
          suggestedActions: [
            "Review and update baseline behavior",
            "Investigate root cause of pattern",
            "Consider operational changes",
          ],
          basedOnPatterns: [
            `${anomalyPattern.count} occurrences of ${anomalyPattern.anomaly_type} in last 7 days`,
          ],
          createdAt: new Date().toISOString(),
        });
      }
    }

    // Store predictions
    for (const alert of alerts) {
      await this.storePrediction(alert);
    }

    return alerts;
  }

  /**
   * Analyze crowd behavior
   */
  async analyzeCrowdBehavior(cameraId: string): Promise<{
    currentOccupancy: number;
    trend: "increasing" | "decreasing" | "stable";
    density: "low" | "medium" | "high" | "critical";
    riskLevel: "low" | "medium" | "high";
    recommendation: string;
  }> {
    // Get recent occupancy data
    const { rows: recentData } = await this.pool.query(
      `SELECT 
        timestamp,
        metadata->>'occupancy' as occupancy
      FROM analytics_events
      WHERE camera_id = $1 
        AND timestamp >= NOW() - INTERVAL '30 minutes'
        AND metadata->>'occupancy' IS NOT NULL
      ORDER BY timestamp DESC
      LIMIT 30`,
      [cameraId]
    );

    if (recentData.length === 0) {
      return {
        currentOccupancy: 0,
        trend: "stable",
        density: "low",
        riskLevel: "low",
        recommendation: "No crowd detected",
      };
    }

    const occupancies = recentData.map((r: any) => parseInt(r.occupancy || "0"));
    const currentOccupancy = occupancies[0] || 0;
    const avgOccupancy = occupancies.reduce((sum, val) => sum + val, 0) / occupancies.length;

    // Determine trend
    const recentAvg = occupancies.slice(0, 5).reduce((sum, val) => sum + val, 0) / 5;
    const olderAvg = occupancies.slice(-5).reduce((sum, val) => sum + val, 0) / 5;
    const trend = recentAvg > olderAvg * 1.2 
      ? "increasing" 
      : recentAvg < olderAvg * 0.8 
      ? "decreasing" 
      : "stable";

    // Determine density
    let density: "low" | "medium" | "high" | "critical";
    let riskLevel: "low" | "medium" | "high";
    let recommendation: string;

    if (currentOccupancy < 10) {
      density = "low";
      riskLevel = "low";
      recommendation = "Normal crowd level";
    } else if (currentOccupancy < 30) {
      density = "medium";
      riskLevel = "low";
      recommendation = "Moderate crowd - continue monitoring";
    } else if (currentOccupancy < 50) {
      density = "high";
      riskLevel = "medium";
      recommendation = "High crowd density - increase monitoring";
    } else {
      density = "critical";
      riskLevel = "high";
      recommendation = "Critical crowd level - immediate action required";
    }

    // Adjust risk based on trend
    if (trend === "increasing" && density !== "low") {
      riskLevel = riskLevel === "low" ? "medium" : "high";
      recommendation += " - Crowd is growing rapidly";
    }

    return {
      currentOccupancy,
      trend,
      density,
      riskLevel,
      recommendation,
    };
  }

  /**
   * Helper methods
   */

  private async getBaseline(cameraId: string): Promise<BehaviorBaseline | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM behavior_baselines WHERE camera_id = $1 ORDER BY last_updated DESC LIMIT 1`,
      [cameraId]
    );

    if (rows.length === 0) return null;

    return {
      cameraId: rows[0].camera_id,
      location: rows[0].location,
      timeWindow: rows[0].time_window,
      averageDetectionsPerHour: parseFloat(rows[0].avg_detections_per_hour),
      averageOccupancy: parseFloat(rows[0].avg_occupancy),
      commonObjectTypes: rows[0].common_object_types,
      peakHours: rows[0].peak_hours,
      quietHours: rows[0].quiet_hours,
      typicalDuration: parseFloat(rows[0].typical_duration),
      confidenceScore: parseFloat(rows[0].confidence_score),
      learnedFrom: parseInt(rows[0].learned_from),
      lastUpdated: rows[0].last_updated,
    };
  }

  private async storeBaseline(baseline: BehaviorBaseline): Promise<void> {
    await this.pool.query(
      `INSERT INTO behavior_baselines (
        camera_id, location, time_window, avg_detections_per_hour, avg_occupancy,
        common_object_types, peak_hours, quiet_hours, typical_duration,
        confidence_score, learned_from, last_updated
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (camera_id, time_window) DO UPDATE SET
        avg_detections_per_hour = $4,
        avg_occupancy = $5,
        common_object_types = $6,
        peak_hours = $7,
        quiet_hours = $8,
        typical_duration = $9,
        confidence_score = $10,
        learned_from = $11,
        last_updated = $12`,
      [
        baseline.cameraId,
        baseline.location,
        baseline.timeWindow,
        baseline.averageDetectionsPerHour,
        baseline.averageOccupancy,
        baseline.commonObjectTypes,
        baseline.peakHours,
        baseline.quietHours,
        baseline.typicalDuration,
        baseline.confidenceScore,
        baseline.learnedFrom,
        baseline.lastUpdated,
      ]
    );
  }

  private async storeAnomaly(anomaly: AnomalyEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO behavior_anomalies (
        id, camera_id, camera_name, timestamp, anomaly_type, severity, confidence,
        description, expected_behavior, actual_behavior, recommendation,
        metadata, reviewed, false_positive
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        anomaly.id,
        anomaly.cameraId,
        anomaly.cameraName,
        anomaly.timestamp,
        anomaly.anomalyType,
        anomaly.severity,
        anomaly.confidence,
        anomaly.description,
        anomaly.expectedBehavior,
        anomaly.actualBehavior,
        anomaly.recommendation,
        JSON.stringify(anomaly.metadata),
        anomaly.reviewed,
        anomaly.falsePositive,
      ]
    );
  }

  private async storePrediction(prediction: PredictiveAlert): Promise<void> {
    await this.pool.query(
      `INSERT INTO predictive_alerts (
        id, location, branch_id, prediction_type, probability, time_window,
        reasoning, suggested_actions, based_on_patterns, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        prediction.id,
        prediction.location,
        prediction.branchId,
        prediction.predictionType,
        prediction.probability,
        prediction.timeWindow,
        prediction.reasoning,
        prediction.suggestedActions,
        prediction.basedOnPatterns,
        prediction.createdAt,
      ]
    );
  }

  private getDefaultBaseline(cameraId: string): BehaviorBaseline {
    return {
      cameraId,
      location: "Unknown",
      timeWindow: "default",
      averageDetectionsPerHour: 0,
      averageOccupancy: 0,
      commonObjectTypes: [],
      peakHours: [],
      quietHours: [],
      typicalDuration: 0,
      confidenceScore: 0,
      learnedFrom: 0,
      lastUpdated: new Date().toISOString(),
    };
  }

  private categorizeTimeWindow(date: Date): string {
    const hour = date.getHours();
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    const timeOfDay = hour >= 6 && hour < 12 
      ? "morning" 
      : hour >= 12 && hour < 18 
      ? "afternoon" 
      : hour >= 18 && hour < 22 
      ? "evening" 
      : "night";

    return `${isWeekend ? "weekend" : "weekday"}-${timeOfDay}`;
  }

  private getTimeOfDayLabel(hour: number): string {
    if (hour >= 6 && hour < 12) return "morning";
    if (hour >= 12 && hour < 18) return "afternoon";
    if (hour >= 18 && hour < 22) return "evening";
    return "night";
  }

  private getDayName(dayOfWeek: string | number): string {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return days[parseInt(String(dayOfWeek))] || "Unknown";
  }
}
