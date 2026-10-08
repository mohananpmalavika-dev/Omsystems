/**
 * Crowd Density Detection
 * Monitors crowd size and density for safety and capacity management
 */

import { BaseDetector, type DetectionFrame, type DetectionResult, isPointInPolygon } from "./base-detector.js";

export type DensityLevel = "empty" | "sparse" | "normal" | "crowded" | "overcrowded" | "dangerous";

export interface CrowdZone {
  zoneId: string;
  name: string;
  polygon: Array<{ x: number; y: number }>;
  maxCapacity: number;
  warningThreshold: number; // Percentage of max capacity
  criticalThreshold: number;
}

export interface CrowdDensityMeasurement {
  zoneId: string;
  personCount: number;
  densityLevel: DensityLevel;
  occupancyPercent: number;
  averageSpeed: number; // Movement speed indicator
  isBottleneck: boolean;
  heatIntensity: number; // 0-1 scale
}

export class CrowdDensityDetector extends BaseDetector {
  private isModelLoaded = false;
  private zones: CrowdZone[] = [];
  private crowdHistory: Array<{ timestamp: Date; measurements: CrowdDensityMeasurement[] }> = [];

  private readonly HISTORY_SIZE = 30; // Keep last 30 measurements
  private readonly BOTTLENECK_SPEED_THRESHOLD = 0.1; // Very slow movement

  constructor() {
    super("crowd-density", "1.0.0");
  }

  async initialize(): Promise<void> {
    console.log("Initializing crowd density detector...");
    
    try {
      // Verify person detection model is available through unified inference pipeline
      const pipeline = await import('../inference/unified-inference-pipeline.js')
        .then(m => m.getInferencePipeline());
      
      // Test detection to verify model is loaded
      const testFrame: DetectionFrame = {
        imageData: Buffer.alloc(100),
        timestamp: new Date(),
        cameraId: 'test',
        tenantId: 'test-tenant',
        width: 100,
        height: 100,
      };
      
      await pipeline.detectObjects(testFrame, ['person']);
      
      this.isModelLoaded = true;
      console.log("Crowd density detector initialized - person detection model verified");
    } catch (error) {
      this.isModelLoaded = false;
      console.error("Crowd density detector initialization failed - person detection model unavailable:", error);
      throw new Error(`Crowd density detector requires person detection model: ${error}`);
    }
  }

  /**
   * Set zones for monitoring
   */
  setZones(zones: CrowdZone[]): void {
    this.zones = zones;
  }

  async detect(frame: DetectionFrame): Promise<DetectionResult[]> {
    if (!this.isModelLoaded) {
      return [{
        detectionType: "crowd-density",
        status: "MODEL_UNAVAILABLE",
        provenance: "LIVE_INFERENCE",
        confidence: null,
        objects: [],
        metadata: {
          status: "MODEL_UNAVAILABLE",
          error: "Person detection model not loaded",
          reason: "Crowd density detection requires person detection model to be initialized",
        },
        executionMetadata: {
          status: "MODEL_UNAVAILABLE",
          provenance: "LIVE_INFERENCE",
          reason: "Person detection model not loaded",
          simulated: false,
          timestamp: new Date().toISOString(),
        },
        requiresAlert: false,
      }];
    }

    // Detect persons in frame
    let persons: any[];
    try {
      persons = await this.detectPersonsInFrame(frame);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return [{
        detectionType: "crowd-density",
        status: "INFERENCE_FAILED",
        provenance: "LIVE_INFERENCE",
        confidence: null,
        objects: [],
        metadata: {
          error: reason,
        },
        executionMetadata: {
          status: "INFERENCE_FAILED",
          provenance: "LIVE_INFERENCE",
          reason,
          simulated: false,
          timestamp: new Date().toISOString(),
        },
        requiresAlert: false,
      }];
    }

    // Measure density for each zone
    const measurements = this.measureDensityByZone(persons, frame.timestamp);

    // Store in history
    this.crowdHistory.push({
      timestamp: frame.timestamp,
      measurements,
    });

    if (this.crowdHistory.length > this.HISTORY_SIZE) {
      this.crowdHistory.shift();
    }

    const results: DetectionResult[] = [];

    // Check for crowding issues
    const crowdedZones = measurements.filter(m => 
      m.densityLevel === "crowded" || 
      m.densityLevel === "overcrowded" ||
      m.densityLevel === "dangerous"
    );

    if (crowdedZones.length > 0) {
      const heuristicScore = this.calculateCrowdConfidence(crowdedZones, persons.length);
      
      results.push({
        detectionType: "crowd-density",
        status: "SUCCESS",
        provenance: "HEURISTIC_RULE_ENGINE",
        confidence: null, // Confidence is null for heuristic aggregation
        objects: this.createCrowdObjects(persons, crowdedZones),
        metadata: {
          heuristicScore,
          zones: crowdedZones.map(z => ({
            zoneId: z.zoneId,
            count: z.personCount,
            level: z.densityLevel,
            occupancy: z.occupancyPercent,
          })),
          totalCount: measurements.reduce((sum, m) => sum + m.personCount, 0),
          bottlenecks: measurements.filter(m => m.isBottleneck).map(m => m.zoneId),
          trend: this.analyzeCrowdTrend(),
          confidenceFactors: {
            personDetectionQuality: persons.length > 0 ? 0.9 : 0.5,
            severityLevel: crowdedZones.some(z => z.densityLevel === "dangerous") ? 1.0 : 0.8,
            historicalConsistency: this.crowdHistory.length >= 5 ? 0.95 : 0.7,
          },
        },
        executionMetadata: {
          status: "SUCCESS",
          provenance: "HEURISTIC_RULE_ENGINE",
          heuristicScore,
          simulated: false,
          timestamp: frame.timestamp.toISOString(),
        },
        requiresAlert: crowdedZones.some(z => z.densityLevel === "dangerous"),
      });
    }

    // Also report overall crowd metrics (not just alerts)
    if (measurements.length > 0) {
      results.push({
        detectionType: "crowd-metrics",
        status: "SUCCESS",
        provenance: "HEURISTIC_RULE_ENGINE",
        confidence: null,
        objects: [],
        metadata: {
          totalPersons: measurements.reduce((sum, m) => sum + m.personCount, 0),
          zoneMetrics: measurements,
          timestamp: frame.timestamp.toISOString(),
        },
        executionMetadata: {
          status: "SUCCESS",
          provenance: "HEURISTIC_RULE_ENGINE",
          simulated: false,
          timestamp: frame.timestamp.toISOString(),
        },
        requiresAlert: false,
      });
    }

    return results;
  }

  /**
   * Detect persons in frame
   */
  private async detectPersonsInFrame(frame: DetectionFrame): Promise<any[]> {
    const { getInferenceObjects, hasInferenceObjects } = await import("./base-detector.js");
    const pipeline = await import('../inference/unified-inference-pipeline.js').then(m => m.getInferencePipeline());
    try {
      const persons = await pipeline.detectObjects(frame, ['person']);
      if (persons && persons.length > 0) return persons;
    } catch (error) {
      if (!hasInferenceObjects(frame)) {
        throw error;
      }
    }
    if (hasInferenceObjects(frame)) {
      return getInferenceObjects(frame, ['person']);
    }
    return [];
  }

  /**
   * Measure density for each zone
   */
  private measureDensityByZone(
    persons: any[],
    timestamp: Date
  ): CrowdDensityMeasurement[] {
    if (this.zones.length === 0) {
      // No zones defined, measure entire frame
      return [{
        zoneId: "default",
        personCount: persons.length,
        densityLevel: this.calculateDensityLevel(persons.length, 100),
        occupancyPercent: persons.length,
        averageSpeed: this.calculateAverageSpeed(persons),
        isBottleneck: false,
        heatIntensity: Math.min(persons.length / 50, 1),
      }];
    }

    return this.zones.map(zone => {
      // Count persons in zone
      const personsInZone = persons.filter(person => {
        const center = {
          x: person.boundingBox.x + person.boundingBox.width / 2,
          y: person.boundingBox.y + person.boundingBox.height / 2,
        };
        return isPointInPolygon(center, zone.polygon);
      });

      const count = personsInZone.length;
      const occupancyPercent = (count / zone.maxCapacity) * 100;
      const avgSpeed = this.calculateAverageSpeed(personsInZone);

      return {
        zoneId: zone.zoneId,
        personCount: count,
        densityLevel: this.calculateDensityLevel(count, zone.maxCapacity),
        occupancyPercent,
        averageSpeed: avgSpeed,
        isBottleneck: avgSpeed < this.BOTTLENECK_SPEED_THRESHOLD && count > zone.maxCapacity * 0.7,
        heatIntensity: Math.min(occupancyPercent / 100, 1),
      };
    });
  }

  /**
   * Calculate density level based on count and capacity
   */
  private calculateDensityLevel(count: number, maxCapacity: number): DensityLevel {
    const percent = (count / maxCapacity) * 100;

    if (percent >= 120) return "dangerous";
    if (percent >= 90) return "overcrowded";
    if (percent >= 70) return "crowded";
    if (percent >= 30) return "normal";
    if (percent >= 10) return "sparse";
    return "empty";
  }

  /**
   * Calculate average movement speed of persons
   */
  private calculateAverageSpeed(persons: any[]): number {
    if (persons.length === 0) return 0;

    // Calculate speed from track history if available
    let totalSpeed = 0;
    let countWithSpeed = 0;

    for (const person of persons) {
      if (person.trackId && person.velocity) {
        const speed = Math.sqrt(
          person.velocity.x ** 2 + person.velocity.y ** 2
        );
        totalSpeed += speed;
        countWithSpeed++;
      }
    }

    // If no tracking data available, return null to indicate unavailable
    if (countWithSpeed === 0) {
      return 0; // No movement data available
    }

    return totalSpeed / countWithSpeed;
  }

  /**
   * Calculate crowd detection confidence based on evidence
   */
  private calculateCrowdConfidence(
    crowdedZones: CrowdDensityMeasurement[],
    totalPersons: number
  ): number {
    if (totalPersons === 0) return 0;

    // Base confidence from person detection
    let confidence = 0.85;

    // Increase confidence with more severe crowding
    const hasDangerous = crowdedZones.some(z => z.densityLevel === "dangerous");
    const hasOvercrowded = crowdedZones.some(z => z.densityLevel === "overcrowded");
    
    if (hasDangerous) {
      confidence = 0.95;
    } else if (hasOvercrowded) {
      confidence = 0.90;
    }

    // Increase confidence with historical consistency
    if (this.crowdHistory.length >= 5) {
      const recentCounts = this.crowdHistory.slice(-5).map(h =>
        h.measurements.reduce((sum, m) => sum + m.personCount, 0)
      );
      const avgCount = recentCounts.reduce((a, b) => a + b, 0) / recentCounts.length;
      const variance = recentCounts.reduce((sum, count) => 
        sum + Math.abs(count - avgCount), 0
      ) / recentCounts.length;
      
      // Low variance = consistent detection = higher confidence
      if (variance < avgCount * 0.2) {
        confidence = Math.min(confidence + 0.05, 0.98);
      }
    }

    // Reduce confidence if person count is very low (might be false positive)
    if (totalPersons < 3) {
      confidence *= 0.8;
    }

    return Math.max(0, Math.min(confidence, 0.98));
  }

  /**
   * Analyze crowd trend (increasing, decreasing, stable)
   */
  private analyzeCrowdTrend(): "increasing" | "decreasing" | "stable" {
    if (this.crowdHistory.length < 5) return "stable";

    const recent = this.crowdHistory.slice(-5);
    const counts = recent.map(h => 
      h.measurements.reduce((sum, m) => sum + m.personCount, 0)
    );

    const firstCount = counts[0]!;
    const lastCount = counts[counts.length - 1]!;
    const change = lastCount - firstCount;
    const changePercent = (change / Math.max(firstCount, 1)) * 100;

    if (changePercent > 20) return "increasing";
    if (changePercent < -20) return "decreasing";
    return "stable";
  }

  /**
   * Create object representations for crowded zones
   */
  private createCrowdObjects(persons: any[], crowdedZones: CrowdDensityMeasurement[]): any[] {
    // Group persons by zone and create bounding boxes
    return persons.slice(0, 50).map(person => ({
      label: "person",
      confidence: person.confidence !== undefined ? person.confidence : null,
      trackId: person.trackId,
      boundingBox: person.boundingBox,
    }));
  }

  /**
   * Get current crowd metrics
   */
  getCurrentMetrics(): CrowdDensityMeasurement[] {
    if (this.crowdHistory.length === 0) return [];
    return this.crowdHistory[this.crowdHistory.length - 1]!.measurements;
  }

  async cleanup(): Promise<void> {
    this.isModelLoaded = false;
    this.zones = [];
    this.crowdHistory = [];
    console.log("Crowd density detector cleaned up");
  }

  getHealth() {
    return {
      status: this.isModelLoaded ? ("healthy" as const) : ("unhealthy" as const),
      details: `Monitoring ${this.zones.length} zones`,
    };
  }
}
