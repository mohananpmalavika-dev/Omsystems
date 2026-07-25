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
    
    // TODO: Load person detection + counting model
    // Can use standard person detector + density estimation networks
    
    this.isModelLoaded = true;
    console.log("Crowd density detector initialized");
  }

  /**
   * Set zones for monitoring
   */
  setZones(zones: CrowdZone[]): void {
    this.zones = zones;
  }

  async detect(frame: DetectionFrame): Promise<DetectionResult[]> {
    if (!this.isModelLoaded) {
      return [];
    }

    // Detect persons in frame
    const persons = await this.detectPersonsInFrame(frame);

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
      results.push({
        detectionType: "crowd-density",
        confidence: 0.95,
        objects: this.createCrowdObjects(persons, crowdedZones),
        metadata: {
          zones: crowdedZones.map(z => ({
            zoneId: z.zoneId,
            count: z.personCount,
            level: z.densityLevel,
            occupancy: z.occupancyPercent,
          })),
          totalCount: measurements.reduce((sum, m) => sum + m.personCount, 0),
          bottlenecks: measurements.filter(m => m.isBottleneck).map(m => m.zoneId),
          trend: this.analyzeCrowdTrend(),
        },
        requiresAlert: crowdedZones.some(z => z.densityLevel === "dangerous"),
      });
    }

    // Also report overall crowd metrics (not just alerts)
    if (measurements.length > 0) {
      results.push({
        detectionType: "crowd-metrics",
        confidence: 0.90,
        objects: [],
        metadata: {
          totalPersons: measurements.reduce((sum, m) => sum + m.personCount, 0),
          zoneMetrics: measurements,
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
    // TODO: Use person detector
    // For crowd counting, can also use specialized crowd counting networks
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

    // TODO: Implement using optical flow or track history
    // For now, return placeholder
    return 0.5;
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
      confidence: person.confidence || 0.85,
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
