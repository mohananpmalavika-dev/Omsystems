/**
 * Spatial Geometry & Density Estimation Engine for Branch Halls
 * 
 * Provides deterministic point-in-polygon verification, area/spatial density calculations,
 * movement velocity monitoring, bottleneck choke-point detection, and crowd growth trend analysis.
 */

import type {
  Point,
  BoundingBox,
  DensityLevel,
  TrendDirection,
  CrowdZoneRecord,
  TrackedPerson,
  ZoneDensityResult,
  IncidentSeverity,
} from './types.js';

export class DensityEstimator {
  /**
   * Deterministic ray-casting algorithm to test whether a point is inside a polygon
   */
  public static isPointInPolygon(point: Point, polygon: Point[]): boolean {
    if (!polygon || polygon.length < 3) {
      return false;
    }

    let inside = false;
    const n = polygon.length;

    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = polygon[i]!.x;
      const yi = polygon[i]!.y;
      const xj = polygon[j]!.x;
      const yj = polygon[j]!.y;

      const intersect =
        yi > point.y !== yj > point.y &&
        point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;

      if (intersect) {
        inside = !inside;
      }
    }

    return inside;
  }

  /**
   * Calculate centroid coordinates from a bounding box
   */
  public static calculateCentroid(box: BoundingBox): Point {
    return {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    };
  }

  /**
   * Euclidean distance between two points
   */
  public static calculateDistance(p1: Point, p2: Point): number {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Calculate polygon centroid
   */
  public static calculatePolygonCentroid(polygon: Point[]): Point {
    if (!polygon || polygon.length === 0) {
      return { x: 0, y: 0 };
    }
    let totalX = 0;
    let totalY = 0;
    for (const p of polygon) {
      totalX += p.x;
      totalY += p.y;
    }
    return {
      x: Math.round((totalX / polygon.length) * 100) / 100,
      y: Math.round((totalY / polygon.length) * 100) / 100,
    };
  }

  /**
   * Classify density level based on person count and configured capacity thresholds
   */
  public static classifyDensityLevel(
    count: number,
    nominalCapacity: number,
    warningCapacity: number,
    maxCapacity: number
  ): DensityLevel {
    if (count <= 0) return 'empty';
    if (count > maxCapacity) return 'dangerous';
    if (count > warningCapacity) return 'overcrowded';
    if (count > nominalCapacity) return 'crowded';
    if (count >= Math.max(1, Math.floor(nominalCapacity * 0.3))) return 'normal';
    return 'sparse';
  }

  /**
   * Calculate average movement speed from tracked person velocities.
   * Returns -1 if velocity tracking is not available.
   */
  public static calculateAverageSpeed(persons: TrackedPerson[]): number {
    if (!persons || persons.length === 0) return -1;

    let totalSpeed = 0;
    let personsWithVelocity = 0;

    for (const p of persons) {
      if (p.velocity) {
        const speed = Math.sqrt(p.velocity.x * p.velocity.x + p.velocity.y * p.velocity.y);
        totalSpeed += speed;
        personsWithVelocity++;
      }
    }

    if (personsWithVelocity === 0) return -1;
    return Math.round((totalSpeed / personsWithVelocity) * 1000) / 1000;
  }

  /**
   * Detect choke-point stagnation / bottleneck
   */
  public static detectBottleneck(
    densityLevel: DensityLevel,
    avgSpeed: number,
    speedThreshold: number = 0.15
  ): boolean {
    if (avgSpeed < 0) return false; // Velocity data unavailable
    const isHighDensity =
      densityLevel === 'overcrowded' ||
      densityLevel === 'dangerous';

    return isHighDensity && avgSpeed < speedThreshold;
  }

  /**
   * Estimate crowd growth trend from rolling historical count samples
   */
  public static analyzeTrend(historyCounts: number[]): TrendDirection {
    if (!historyCounts || historyCounts.length < 3) {
      return 'stable';
    }

    const first = historyCounts[0]!;
    const last = historyCounts[historyCounts.length - 1]!;
    const delta = last - first;

    const base = Math.max(first, 1);
    const percentChange = (delta / base) * 100;

    if (percentChange >= 20) return 'increasing';
    if (percentChange <= -20) return 'decreasing';
    return 'stable';
  }

  /**
   * Estimate density for a specific zone from a list of frame person detections
   */
  public static estimateZoneDensity(
    zone: CrowdZoneRecord,
    allPersons: TrackedPerson[],
    recentCounts: number[] = [],
    speedThreshold: number = 0.15
  ): ZoneDensityResult {
    // Filter persons located inside the zone polygon
    const personsInZone = allPersons.filter(person => {
      const centroid = DensityEstimator.calculateCentroid(person.boundingBox);
      return DensityEstimator.isPointInPolygon(centroid, zone.polygon);
    });

    const count = personsInZone.length;
    const densityLevel = DensityEstimator.classifyDensityLevel(
      count,
      zone.nominal_capacity,
      zone.warning_capacity,
      zone.max_capacity
    );

    const occupancyPercentage = Math.round(
      (count / Math.max(zone.nominal_capacity, 1)) * 10000
    ) / 100;

    const areaSqm = Math.max(zone.area_sqm, 1);
    const densityPerSqm = Math.round((count / areaSqm) * 1000) / 1000;

    const avgSpeed = DensityEstimator.calculateAverageSpeed(personsInZone);
    const isBottleneck = DensityEstimator.detectBottleneck(densityLevel, avgSpeed, speedThreshold);

    // Heat intensity on 0.0 to 1.0 scale
    const heatIntensity = Math.min(1.0, Math.round((count / zone.max_capacity) * 1000) / 1000);

    const currentHistory = [...recentCounts, count];
    const trend = DensityEstimator.analyzeTrend(currentHistory);

    const requiresAlert = densityLevel === 'overcrowded' || densityLevel === 'dangerous' || isBottleneck;
    let alertSeverity: IncidentSeverity | undefined;

    if (densityLevel === 'dangerous') {
      alertSeverity = 'P1';
    } else if (densityLevel === 'overcrowded' || isBottleneck) {
      alertSeverity = 'P2';
    } else if (densityLevel === 'crowded') {
      alertSeverity = 'P3';
    }

    return {
      zoneId: zone.id,
      zoneName: zone.zone_name,
      zoneType: zone.zone_type,
      personCount: count,
      densityLevel,
      occupancyPercentage,
      densityPerSqm,
      averageSpeed: avgSpeed,
      isBottleneck,
      heatIntensity,
      trend,
      participantTrackIds: personsInZone.map(p => p.trackId),
      centroid: DensityEstimator.calculatePolygonCentroid(zone.polygon),
      requiresAlert,
      alertSeverity,
    };
  }
}
