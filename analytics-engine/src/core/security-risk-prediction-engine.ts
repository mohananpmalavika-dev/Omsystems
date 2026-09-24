/**
 * Security Risk Prediction Engine
 * 
 * Generates spatial-temporal risk predictions with 24-48 hour forecasting.
 * Creates 3D risk heat maps showing probability of incidents by location and time.
 * 
 * Features:
 * - Grid-based spatial risk calculation
 * - Temporal risk interpolation
 * - Multi-factor risk scoring (incidents, anomalies, patrol coverage, blind spots)
 * - Confidence-weighted predictions
 * - Real-time risk updates
 * 
 * Architecture:
 * - Historical Analysis: Learn incident patterns by location/time
 * - Spatial Modeling: Grid-based risk distribution with neighbor influence
 * - Temporal Forecasting: Time-series risk prediction using historical patterns
 * - Risk Fusion: Combine multiple risk signals into unified score
 * 
 * Zero-Cost ML: Statistical analysis and pattern matching, no external dependencies
 */

import type { Pool } from 'pg';

// =====================================================
// EMBEDDED GEOHASH IMPLEMENTATION (Zero external dependency)
// =====================================================

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
const BITS = [16, 8, 4, 2, 1] as const;

const geohash = {
  encode(latitude: number, longitude: number, precision: number = 9): string {
    let isEven = true;
    let minLat = -90.0;
    let maxLat = 90.0;
    let minLon = -180.0;
    let maxLon = 180.0;
    let bit = 0;
    let ch = 0;
    let hash = '';

    while (hash.length < precision) {
      if (isEven) {
        const mid = (minLon + maxLon) / 2;
        if (longitude > mid) {
          ch |= (BITS[bit] ?? 0);
          minLon = mid;
        } else {
          maxLon = mid;
        }
      } else {
        const mid = (minLat + maxLat) / 2;
        if (latitude > mid) {
          ch |= (BITS[bit] ?? 0);
          minLat = mid;
        } else {
          maxLat = mid;
        }
      }

      isEven = !isEven;
      if (bit < 4) {
        bit++;
      } else {
        hash += (BASE32[ch] ?? '');
        bit = 0;
        ch = 0;
      }
    }
    return hash;
  },

  decode_bbox(hash: string): [number, number, number, number] {
    let isEven = true;
    let minLat = -90.0;
    let maxLat = 90.0;
    let minLon = -180.0;
    let maxLon = 180.0;

    for (let i = 0; i < hash.length; i++) {
      const c = hash.charAt(i);
      const cd = BASE32.indexOf(c);
      if (cd === -1) continue;
      for (let j = 0; j < 5; j++) {
        const mask = BITS[j] ?? 0;
        if (isEven) {
          const mid = (minLon + maxLon) / 2;
          if ((cd & mask) !== 0) {
            minLon = mid;
          } else {
            maxLon = mid;
          }
        } else {
          const mid = (minLat + maxLat) / 2;
          if ((cd & mask) !== 0) {
            minLat = mid;
          } else {
            maxLat = mid;
          }
        }
        isEven = !isEven;
      }
    }
    return [minLat, minLon, maxLat, maxLon];
  },

  decode(hash: string): { latitude: number; longitude: number } {
    const [minLat, minLon, maxLat, maxLon] = this.decode_bbox(hash);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLon + maxLon) / 2,
    };
  },

  neighbors(hash: string): Record<string, string> {
    const [minLat, minLon, maxLat, maxLon] = this.decode_bbox(hash);
    const lat = (minLat + maxLat) / 2;
    const lon = (minLon + maxLon) / 2;
    const latDelta = maxLat - minLat;
    const lonDelta = maxLon - minLon;
    const precision = hash.length;

    return {
      north: this.encode(lat + latDelta, lon, precision),
      south: this.encode(lat - latDelta, lon, precision),
      east: this.encode(lat, lon + lonDelta, precision),
      west: this.encode(lat, lon - lonDelta, precision),
      northEast: this.encode(lat + latDelta, lon + lonDelta, precision),
      northWest: this.encode(lat + latDelta, lon - lonDelta, precision),
      southEast: this.encode(lat - latDelta, lon + lonDelta, precision),
      southWest: this.encode(lat - latDelta, lon - lonDelta, precision),
    };
  }
};

// =====================================================
// TYPES
// =====================================================

export interface RiskCell {
  gridCellId: string;
  centerPoint: { lat: number; lon: number };
  bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskComponents: {
    intrusionRisk: number;
    theftRisk: number;
    violenceRisk: number;
    unauthorizedAccessRisk: number;
    anomalyRisk: number;
  };
  confidence: number;
  dataQualityScore: number;
  contributingFactors: string[];
  historicalIncidentsCount: number;
  recentAnomaliesCount: number;
}

export interface RiskHeatMap {
  id: string;
  tenantId: string;
  branchId: string;
  predictionForTime: Date;
  cells: RiskCell[];
  overallRiskScore: number;
  highRiskAreasCount: number;
  generatedAt: Date;
  expiresAt: Date;
  modelVersion: string;
}

export interface IncidentPrediction {
  id: string;
  tenantId: string;
  branchId: string;
  incidentType: string;
  locationScope: 'branch' | 'zone' | 'camera';
  scopeId: string;
  predictionWindowStart: Date;
  predictionWindowEnd: Date;
  predictionHorizonHours: number;
  probability: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  expectedTimeRange?: { start: Date; end: Date; mostLikely: Date };
  contributingFactors: string[];
  historicalIncidentsCount: number;
  recentAnomaliesCount: number;
  similarPatternMatches: number;
  preventiveActions: string[];
  recommendedPatrolZones: string[];
  status: 'ACTIVE' | 'EXPIRED' | 'CLOSED';
  generatedAt: Date;
  expiresAt: Date;
}

export interface HistoricalIncident {
  id: string;
  occurredAt: Date;
  incidentType: string;
  location: { lat: number; lon: number };
  zoneId?: string;
  severity: string;
  resolved: boolean;
}

export interface SpatialRiskContext {
  gridCellId: string;
  location: { lat: number; lon: number };
  incidents: HistoricalIncident[];
  anomalies: number;
  patrolCoverage: number; // 0-1
  cameraBlindSpot: boolean;
  neighboringRisk: number; // Average risk from neighboring cells
}

export interface RiskPredictionOptions {
  horizonHours: number;
  gridPrecision: number; // Geohash precision (4-8)
  minIncidentsForPrediction: number;
  temporalWindowDays: number;
  includeSpatialSmoothing: boolean;
}

// =====================================================
// SECURITY RISK PREDICTION ENGINE
// =====================================================

export class SecurityRiskPredictionEngine {
  private readonly db: Pool;
  private readonly options: RiskPredictionOptions;
  
  // Caches
  private heatMapCache = new Map<string, RiskHeatMap>();
  private predictionCache = new Map<string, IncidentPrediction>();
  
  // Performance tracking
  private metrics = {
    totalPredictions: 0,
    totalHeatMaps: 0,
    avgGenerationTimeMs: 0,
    accuracyScore: 0,
  };
  
  constructor(db: Pool, options?: Partial<RiskPredictionOptions>) {
    this.db = db;
    this.options = {
      horizonHours: options?.horizonHours ?? 24,
      gridPrecision: options?.gridPrecision ?? 6, // ~600m x 600m cells
      minIncidentsForPrediction: options?.minIncidentsForPrediction ?? 3,
      temporalWindowDays: options?.temporalWindowDays ?? 30,
      includeSpatialSmoothing: options?.includeSpatialSmoothing ?? true,
    };
  }
  
  // =====================================================
  // RISK HEAT MAP GENERATION
  // =====================================================
  
  /**
   * Generate risk heat map for a branch at a specific time
   */
  async generateRiskHeatMap(
    tenantId: string,
    branchId: string,
    predictionForTime: Date
  ): Promise<RiskHeatMap> {
    const startTime = Date.now();
    
    // Get branch boundaries
    const branchBounds = await this.getBranchBounds(tenantId, branchId);
    
    // Generate spatial grid
    const grid = this.generateSpatialGrid(branchBounds);
    
    // Calculate risk for each cell
    const cells: RiskCell[] = [];
    
    for (const cellId of grid) {
      const cell = await this.calculateCellRisk(
        tenantId, branchId, cellId, predictionForTime
      );
      if (cell) cells.push(cell);
    }
    
    // Apply spatial smoothing (neighboring cell influence)
    if (this.options.includeSpatialSmoothing) {
      this.applySpatialSmoothing(cells);
    }
    
    // Calculate overall metrics
    const overallRiskScore = cells.length > 0
      ? cells.reduce((sum, c) => sum + c.riskScore, 0) / cells.length
      : 0;
    
    const highRiskAreasCount = cells.filter(c => 
      c.riskLevel === 'high' || c.riskLevel === 'critical'
    ).length;
    
    const now = new Date();
    const heatMap: RiskHeatMap = {
      id: `heatmap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      tenantId,
      branchId,
      predictionForTime,
      cells,
      overallRiskScore,
      highRiskAreasCount,
      generatedAt: now,
      expiresAt: new Date(now.getTime() + 3600000), // 1 hour expiry
      modelVersion: '2.0',
    };
    
    // Store heat map
    await this.storeHeatMap(heatMap);
    
    // Cache
    const cacheKey = `${tenantId}:${branchId}:${predictionForTime.toISOString()}`;
    this.heatMapCache.set(cacheKey, heatMap);
    
    this.metrics.totalHeatMaps++;
    this.metrics.avgGenerationTimeMs = 
      (this.metrics.avgGenerationTimeMs + (Date.now() - startTime)) / 2;
    
    return heatMap;
  }
  
  /**
   * Calculate risk score for a single grid cell
   */
  private async calculateCellRisk(
    tenantId: string,
    branchId: string,
    cellId: string,
    predictionForTime: Date
  ): Promise<RiskCell | null> {
    const decoded = geohash.decode(cellId);
    const bounds = geohash.decode_bbox(cellId);
    
    // Get spatial context
    const context = await this.getSpatialRiskContext(
      tenantId, branchId, cellId, predictionForTime
    );
    
    if (context.incidents.length === 0 && context.anomalies === 0) {
      return null; // No data for this cell
    }
    
    // Calculate temporal risk factor
    const temporalFactor = this.calculateTemporalRiskFactor(
      context.incidents, predictionForTime
    );
    
    // Calculate risk components
    const riskComponents = this.calculateRiskComponents(context, temporalFactor);
    
    // Calculate overall risk score (0-100)
    const riskScore = this.calculateOverallRiskScore(
      riskComponents, context, temporalFactor
    );
    
    // Determine risk level
    const riskLevel = this.getRiskLevel(riskScore);
    
    // Calculate confidence based on data availability
    const confidence = this.calculateConfidence(context);
    
    // Calculate data quality score
    const dataQualityScore = this.calculateDataQuality(context);
    
    // Identify contributing factors
    const contributingFactors = this.identifyContributingFactors(
      context, riskComponents
    );
    
    return {
      gridCellId: cellId,
      centerPoint: { lat: decoded.latitude, lon: decoded.longitude },
      bounds: {
        minLat: bounds[0]!,
        maxLat: bounds[2]!,
        minLon: bounds[1]!,
        maxLon: bounds[3]!,
      },
      riskScore,
      riskLevel,
      riskComponents,
      confidence,
      dataQualityScore,
      contributingFactors,
      historicalIncidentsCount: context.incidents.length,
      recentAnomaliesCount: context.anomalies,
    };
  }
  
  private calculateRiskComponents(
    context: SpatialRiskContext,
    temporalFactor: number
  ): RiskCell['riskComponents'] {
    // Count incidents by type
    const intrusionCount = context.incidents.filter(i => 
      i.incidentType.includes('intrusion') || i.incidentType.includes('breach')
    ).length;
    
    const theftCount = context.incidents.filter(i =>
      i.incidentType.includes('theft') || i.incidentType.includes('shoplifting')
    ).length;
    
    const violenceCount = context.incidents.filter(i =>
      i.incidentType.includes('violence') || i.incidentType.includes('assault')
    ).length;
    
    const accessCount = context.incidents.filter(i =>
      i.incidentType.includes('unauthorized') || i.incidentType.includes('access')
    ).length;
    
    // Calculate risk scores (0-1)
    const intrusionRisk = Math.min(intrusionCount / 10 * temporalFactor, 1.0);
    const theftRisk = Math.min(theftCount / 10 * temporalFactor, 1.0);
    const violenceRisk = Math.min(violenceCount / 5 * temporalFactor, 1.0);
    const unauthorizedAccessRisk = Math.min(accessCount / 10 * temporalFactor, 1.0);
    const anomalyRisk = Math.min(context.anomalies / 20 * temporalFactor, 1.0);
    
    return {
      intrusionRisk,
      theftRisk,
      violenceRisk,
      unauthorizedAccessRisk,
      anomalyRisk,
    };
  }
  
  private calculateOverallRiskScore(
    components: RiskCell['riskComponents'],
    context: SpatialRiskContext,
    temporalFactor: number
  ): number {
    // Weighted average of risk components
    const weights = {
      intrusion: 0.25,
      theft: 0.2,
      violence: 0.3, // Higher weight for violence
      access: 0.15,
      anomaly: 0.1,
    };
    
    let score = 
      components.intrusionRisk * weights.intrusion +
      components.theftRisk * weights.theft +
      components.violenceRisk * weights.violence +
      components.unauthorizedAccessRisk * weights.access +
      components.anomalyRisk * weights.anomaly;
    
    // Adjust for patrol coverage (less patrol = higher risk)
    score *= (1 + (1 - context.patrolCoverage) * 0.3);
    
    // Adjust for camera blind spot
    if (context.cameraBlindSpot) {
      score *= 1.2;
    }
    
    // Adjust for neighboring risk (spatial influence)
    score = score * 0.7 + context.neighboringRisk * 0.3;
    
    // Scale to 0-100
    return Math.min(score * 100, 100);
  }
  
  private calculateTemporalRiskFactor(
    incidents: HistoricalIncident[],
    targetTime: Date
  ): number {
    if (incidents.length === 0) return 0.5; // Default
    
    // Calculate time-of-day pattern
    const targetHour = targetTime.getHours();
    const targetDay = targetTime.getDay();
    
    // Count incidents at similar times
    const similarTimeIncidents = incidents.filter(inc => {
      const incHour = inc.occurredAt.getHours();
      const incDay = inc.occurredAt.getDay();
      
      return Math.abs(incHour - targetHour) <= 1 && incDay === targetDay;
    }).length;
    
    // Temporal risk factor (0.5-2.0)
    const factor = 0.5 + (similarTimeIncidents / Math.max(incidents.length, 1)) * 1.5;
    
    return Math.min(factor, 2.0);
  }
  
  private calculateConfidence(context: SpatialRiskContext): number {
    // Confidence based on data availability
    const incidentScore = Math.min(context.incidents.length / 10, 1.0);
    const anomalyScore = context.anomalies > 0 ? 0.3 : 0;
    const coverageScore = context.patrolCoverage * 0.2;
    
    return Math.min(incidentScore + anomalyScore + coverageScore, 1.0);
  }
  
  private calculateDataQuality(context: SpatialRiskContext): number {
    let quality = 0;
    
    // Historical data availability
    if (context.incidents.length >= 10) quality += 0.4;
    else if (context.incidents.length >= 5) quality += 0.2;
    else if (context.incidents.length >= 1) quality += 0.1;
    
    // Anomaly detection active
    if (context.anomalies > 0) quality += 0.2;
    
    // Patrol coverage
    quality += context.patrolCoverage * 0.2;
    
    // Camera coverage
    if (!context.cameraBlindSpot) quality += 0.2;
    
    return Math.min(quality, 1.0);
  }
  
  private identifyContributingFactors(
    context: SpatialRiskContext,
    components: RiskCell['riskComponents']
  ): string[] {
    const factors: string[] = [];
    
    if (context.incidents.length >= 5) {
      factors.push('high_incident_history');
    }
    
    if (context.anomalies >= 3) {
      factors.push('recent_anomalies');
    }
    
    if (context.patrolCoverage < 0.3) {
      factors.push('low_patrol_coverage');
    }
    
    if (context.cameraBlindSpot) {
      factors.push('camera_blind_spot');
    }
    
    if (components.violenceRisk > 0.7) {
      factors.push('violence_prone_area');
    }
    
    if (components.intrusionRisk > 0.7) {
      factors.push('intrusion_hotspot');
    }
    
    if (context.neighboringRisk > 70) {
      factors.push('high_risk_neighborhood');
    }
    
    return factors;
  }
  
  private getRiskLevel(score: number): RiskCell['riskLevel'] {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  }
  
  private applySpatialSmoothing(cells: RiskCell[]): void {
    // Apply Gaussian-like smoothing using neighboring cells
    const cellMap = new Map<string, RiskCell>();
    for (const cell of cells) {
      cellMap.set(cell.gridCellId, cell);
    }
    
    for (const cell of cells) {
      // Get neighbors
      const neighbors = geohash.neighbors(cell.gridCellId);
      const neighborRisks: number[] = [];
      
      for (const neighborHash of Object.values(neighbors) as string[]) {
        const neighbor = cellMap.get(neighborHash);
        if (neighbor) {
          neighborRisks.push(neighbor.riskScore);
        }
      }
      
      if (neighborRisks.length > 0) {
        const avgNeighborRisk = 
          neighborRisks.reduce((sum, r) => sum + r, 0) / neighborRisks.length;
        
        // Blend own risk with neighbor average (70/30)
        cell.riskScore = cell.riskScore * 0.7 + avgNeighborRisk * 0.3;
        cell.riskLevel = this.getRiskLevel(cell.riskScore);
      }
    }
  }
  
  // =====================================================
  // INCIDENT PREDICTION
  // =====================================================
  
  /**
   * Generate incident prediction for specific location/time
   */
  async generateIncidentPrediction(
    tenantId: string,
    branchId: string,
    incidentType: string,
    locationScope: 'branch' | 'zone' | 'camera',
    scopeId: string,
    horizonHours: number = 24
  ): Promise<IncidentPrediction | null> {
    const now = new Date();
    const predictionWindowStart = now;
    const predictionWindowEnd = new Date(now.getTime() + horizonHours * 3600000);
    
    // Get historical incidents
    const incidents = await this.getHistoricalIncidents(
      tenantId, branchId, incidentType, locationScope, scopeId
    );
    
    if (incidents.length < this.options.minIncidentsForPrediction) {
      console.log(`[RiskPrediction] Insufficient data for prediction (${incidents.length}/${this.options.minIncidentsForPrediction})`);
      return null;
    }
    
    // Get recent anomalies
    const anomalies = await this.getRecentAnomalies(
      tenantId, branchId, locationScope, scopeId
    );
    
    // Find similar patterns
    const similarPatterns = this.findSimilarPatterns(incidents, predictionWindowStart);
    
    // Calculate probability
    const probability = this.calculateIncidentProbability(
      incidents, anomalies, similarPatterns, horizonHours
    );
    
    // Determine risk level
    const riskLevel = this.getRiskLevel(probability * 100);
    
    // Calculate confidence
    const confidence = Math.min(incidents.length / 20, 0.9);
    
    // Calculate expected time range
    const expectedTimeRange = this.calculateExpectedTimeRange(
      incidents, predictionWindowStart, horizonHours
    );
    
    // Identify contributing factors
    const contributingFactors = this.identifyPredictionFactors(
      incidents, anomalies, similarPatterns
    );
    
    // Generate preventive actions
    const preventiveActions = this.generatePreventiveActions(
      incidentType, riskLevel, contributingFactors
    );
    
    // Recommend patrol zones
    const recommendedPatrolZones = await this.recommendPatrolZones(
      tenantId, branchId, incidentType
    );
    
    const prediction: IncidentPrediction = {
      id: `pred_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      tenantId,
      branchId,
      incidentType,
      locationScope,
      scopeId,
      predictionWindowStart,
      predictionWindowEnd,
      predictionHorizonHours: horizonHours,
      probability,
      riskLevel,
      confidence,
      expectedTimeRange,
      contributingFactors,
      historicalIncidentsCount: incidents.length,
      recentAnomaliesCount: anomalies,
      similarPatternMatches: similarPatterns,
      preventiveActions,
      recommendedPatrolZones,
      status: 'ACTIVE',
      generatedAt: now,
      expiresAt: predictionWindowEnd,
    };
    
    // Store prediction
    await this.storePrediction(prediction);
    
    // Cache
    this.predictionCache.set(prediction.id, prediction);
    this.metrics.totalPredictions++;
    
    return prediction;
  }
  
  private calculateIncidentProbability(
    incidents: HistoricalIncident[],
    anomalies: number,
    similarPatterns: number,
    horizonHours: number
  ): number {
    // Base probability from historical frequency
    const incidentRate = incidents.length / this.options.temporalWindowDays; // per day
    const expectedIncidentsInWindow = incidentRate * (horizonHours / 24);
    let probability = Math.min(expectedIncidentsInWindow, 1.0);
    
    // Adjust for recent anomalies
    if (anomalies >= 5) probability = Math.min(probability + 0.3, 1.0);
    else if (anomalies >= 3) probability = Math.min(probability + 0.2, 1.0);
    else if (anomalies >= 1) probability = Math.min(probability + 0.1, 1.0);
    
    // Adjust for similar patterns
    if (similarPatterns >= 5) probability = Math.min(probability + 0.2, 1.0);
    else if (similarPatterns >= 3) probability = Math.min(probability + 0.1, 1.0);
    
    return Math.min(probability, 0.95); // Cap at 95%
  }
  
  private findSimilarPatterns(
    incidents: HistoricalIncident[],
    targetTime: Date
  ): number {
    const targetHour = targetTime.getHours();
    const targetDay = targetTime.getDay();
    
    return incidents.filter(inc => {
      const incHour = inc.occurredAt.getHours();
      const incDay = inc.occurredAt.getDay();
      
      // Same day of week and similar hour
      return incDay === targetDay && Math.abs(incHour - targetHour) <= 2;
    }).length;
  }
  
  private calculateExpectedTimeRange(
    incidents: HistoricalIncident[],
    windowStart: Date,
    horizonHours: number
  ): IncidentPrediction['expectedTimeRange'] {
    // Find peak incident hours
    const hourCounts = new Map<number, number>();
    
    for (const incident of incidents) {
      const hour = incident.occurredAt.getHours();
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
    }
    
    // Find most likely hour
    let peakHour = 12; // Default to noon
    let maxCount = 0;
    
    for (const [hour, count] of hourCounts.entries()) {
      if (count > maxCount) {
        maxCount = count;
        peakHour = hour;
      }
    }
    
    const start = new Date(windowStart);
    const mostLikely = new Date(windowStart);
    mostLikely.setHours(peakHour, 0, 0, 0);
    
    // If most likely time is in the past, move to next day
    if (mostLikely <= windowStart) {
      mostLikely.setDate(mostLikely.getDate() + 1);
    }
    
    const end = new Date(start.getTime() + horizonHours * 3600000);
    
    return { start, end, mostLikely };
  }
  
  private identifyPredictionFactors(
    incidents: HistoricalIncident[],
    anomalies: number,
    similarPatterns: number
  ): string[] {
    const factors: string[] = [];
    
    if (incidents.length >= 10) {
      factors.push('high_historical_frequency');
    }
    
    if (anomalies >= 3) {
      factors.push('recent_anomaly_spike');
    }
    
    if (similarPatterns >= 5) {
      factors.push('strong_temporal_pattern');
    }
    
    // Check for trend
    const recentIncidents = incidents.slice(-7); // Last 7 incidents
    const olderIncidents = incidents.slice(0, Math.max(incidents.length - 7, 0));
    
    if (recentIncidents.length > olderIncidents.length) {
      factors.push('increasing_trend');
    }
    
    return factors;
  }
  
  private generatePreventiveActions(
    incidentType: string,
    riskLevel: string,
    factors: string[]
  ): string[] {
    const actions: string[] = [];
    
    if (riskLevel === 'critical' || riskLevel === 'high') {
      actions.push('Deploy security personnel immediately');
      actions.push('Increase monitoring frequency');
    }
    
    if (incidentType.includes('intrusion')) {
      actions.push('Check perimeter barriers and locks');
      actions.push('Verify alarm system functionality');
      actions.push('Review access logs');
    } else if (incidentType.includes('theft')) {
      actions.push('Increase visible security presence');
      actions.push('Review high-value asset security');
      actions.push('Check surveillance coverage');
    } else if (incidentType.includes('violence')) {
      actions.push('Ensure panic buttons are operational');
      actions.push('Brief staff on de-escalation procedures');
      actions.push('Have emergency contacts ready');
    }
    
    if (factors.includes('low_patrol_coverage')) {
      actions.push('Increase patrol frequency in this area');
    }
    
    if (factors.includes('camera_blind_spot')) {
      actions.push('Deploy mobile surveillance or adjust camera angles');
    }
    
    return actions;
  }
  
  private async recommendPatrolZones(
    tenantId: string,
    branchId: string,
    incidentType: string
  ): Promise<string[]> {
    try {
      // Get zones with high incident rates for this type
      const result = await this.db.query(
        `SELECT zone_id, COUNT(*) as incident_count
         FROM behavioral_observation
         WHERE tenant_id = $1 AND branch_id = $2
         AND zone_id IS NOT NULL
         AND observed_at >= NOW() - INTERVAL '30 days'
         GROUP BY zone_id
         ORDER BY incident_count DESC
         LIMIT 5`,
        [tenantId, branchId]
      );
      
      return result.rows.map(row => row.zone_id);
    } catch (error) {
      console.error('[RiskPrediction] Failed to recommend patrol zones:', error);
      return [];
    }
  }
  
  // =====================================================
  // DATA RETRIEVAL
  // =====================================================
  
  private async getBranchBounds(
    tenantId: string,
    branchId: string
  ): Promise<{ minLat: number; maxLat: number; minLon: number; maxLon: number }> {
    try {
      // Get bounding box from all observations in this branch
      const result = await this.db.query(
        `SELECT 
           ST_YMin(ST_Extent(location::geometry)) as min_lat,
           ST_YMax(ST_Extent(location::geometry)) as max_lat,
           ST_XMin(ST_Extent(location::geometry)) as min_lon,
           ST_XMax(ST_Extent(location::geometry)) as max_lon
         FROM behavioral_observation
         WHERE tenant_id = $1 AND branch_id = $2 AND location IS NOT NULL`,
        [tenantId, branchId]
      );
      
      if (result.rows.length > 0 && result.rows[0]!.min_lat) {
        return {
          minLat: parseFloat(result.rows[0]!.min_lat),
          maxLat: parseFloat(result.rows[0]!.max_lat),
          minLon: parseFloat(result.rows[0]!.min_lon),
          maxLon: parseFloat(result.rows[0]!.max_lon),
        };
      }
    } catch (error) {
      console.error('[RiskPrediction] Failed to get branch bounds:', error);
    }
    
    // Default bounds (small area)
    return { minLat: 40.7, maxLat: 40.71, minLon: -74.0, maxLon: -73.99 };
  }
  
  private generateSpatialGrid(bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  }): string[] {
    const cells: string[] = [];
    const precision = this.options.gridPrecision;
    
    // Generate geohashes for the bounding box
    const latStep = (bounds.maxLat - bounds.minLat) / 10; // 10x10 grid
    const lonStep = (bounds.maxLon - bounds.minLon) / 10;
    
    for (let lat = bounds.minLat; lat < bounds.maxLat; lat += latStep) {
      for (let lon = bounds.minLon; lon < bounds.maxLon; lon += lonStep) {
        const cellId = geohash.encode(lat, lon, precision);
        if (!cells.includes(cellId)) {
          cells.push(cellId);
        }
      }
    }
    
    return cells;
  }
  
  private async getSpatialRiskContext(
    tenantId: string,
    branchId: string,
    cellId: string,
    targetTime: Date
  ): Promise<SpatialRiskContext> {
    const decoded = geohash.decode(cellId);
    const bounds = geohash.decode_bbox(cellId);
    
    // Get incidents in this cell
    const incidents = await this.getIncidentsInBounds(
      tenantId, branchId, bounds, targetTime
    );
    
    // Get anomalies in this cell
    const anomalies = await this.getAnomaliesInBounds(
      tenantId, branchId, bounds, targetTime
    );
    
    // Calculate patrol coverage (placeholder - would integrate with patrol tracking)
    const patrolCoverage = 0.5; // TODO: Integrate with patrol system
    
    // Check if camera blind spot (placeholder - would integrate with camera coverage)
    const cameraBlindSpot = false; // TODO: Integrate with camera system
    
    // Calculate neighboring risk
    const neighbors = geohash.neighbors(cellId);
    let neighboringRisk = 0;
    let neighborCount = 0;
    
    for (const neighborHash of Object.values(neighbors) as string[]) {
      const cached = this.heatMapCache.get(`${tenantId}:${branchId}:${targetTime.toISOString()}`);
      const neighborCell = cached?.cells.find(c => c.gridCellId === neighborHash);
      if (neighborCell) {
        neighboringRisk += neighborCell.riskScore;
        neighborCount++;
      }
    }
    
    neighboringRisk = neighborCount > 0 ? neighboringRisk / neighborCount : 0;
    
    return {
      gridCellId: cellId,
      location: { lat: decoded.latitude, lon: decoded.longitude },
      incidents,
      anomalies,
      patrolCoverage,
      cameraBlindSpot,
      neighboringRisk,
    };
  }
  
  private async getIncidentsInBounds(
    tenantId: string,
    branchId: string,
    bounds: [number, number, number, number],
    targetTime: Date
  ): Promise<HistoricalIncident[]> {
    try {
      const lookbackDate = new Date(targetTime.getTime() - this.options.temporalWindowDays * 86400000);
      
      const result = await this.db.query(
        `SELECT 
           id, observed_at as occurred_at, observation_type as incident_type,
           location, zone_id, confidence
         FROM behavioral_observation
         WHERE tenant_id = $1 AND branch_id = $2
         AND location IS NOT NULL
         AND ST_Contains(
           ST_MakeEnvelope($3, $4, $5, $6, 4326),
           location::geometry
         )
         AND observed_at >= $7
         ORDER BY observed_at DESC
         LIMIT 100`,
        [tenantId, branchId, bounds[1], bounds[0], bounds[3], bounds[2], lookbackDate]
      );
      
      return result.rows.map(row => ({
        id: row.id,
        occurredAt: row.occurred_at,
        incidentType: row.incident_type,
        location: this.parseLocation(row.location),
        zoneId: row.zone_id,
        severity: 'medium',
        resolved: true,
      }));
    } catch (error) {
      console.error('[RiskPrediction] Failed to get incidents in bounds:', error);
      return [];
    }
  }
  
  private async getAnomaliesInBounds(
    tenantId: string,
    branchId: string,
    bounds: [number, number, number, number],
    targetTime: Date
  ): Promise<number> {
    try {
      const lookbackDate = new Date(targetTime.getTime() - 7 * 86400000); // Last 7 days
      
      const result = await this.db.query(
        `SELECT COUNT(*) as count
         FROM behavioral_anomaly
         WHERE tenant_id = $1 AND branch_id = $2
         AND location IS NOT NULL
         AND ST_Contains(
           ST_MakeEnvelope($3, $4, $5, $6, 4326),
           location::geometry
         )
         AND detected_at >= $7
         AND status = 'ACTIVE'`,
        [tenantId, branchId, bounds[1], bounds[0], bounds[3], bounds[2], lookbackDate]
      );
      
      return parseInt(result.rows[0]?.count || '0');
    } catch (error) {
      console.error('[RiskPrediction] Failed to get anomalies in bounds:', error);
      return 0;
    }
  }
  
  private async getHistoricalIncidents(
    tenantId: string,
    branchId: string,
    incidentType: string,
    locationScope: string,
    scopeId: string
  ): Promise<HistoricalIncident[]> {
    try {
      const lookbackDate = new Date(Date.now() - this.options.temporalWindowDays * 86400000);
      
      let query = `
        SELECT id, observed_at as occurred_at, observation_type as incident_type,
               location, zone_id, confidence
        FROM behavioral_observation
        WHERE tenant_id = $1 AND branch_id = $2
        AND observation_type = $3
        AND observed_at >= $4
      `;
      const params: any[] = [tenantId, branchId, incidentType, lookbackDate];
      
      if (locationScope === 'zone') {
        query += ` AND zone_id = $${params.length + 1}`;
        params.push(scopeId);
      } else if (locationScope === 'camera') {
        query += ` AND camera_id = $${params.length + 1}`;
        params.push(scopeId);
      }
      
      query += ` ORDER BY observed_at DESC LIMIT 100`;
      
      const result = await this.db.query(query, params);
      
      return result.rows.map(row => ({
        id: row.id,
        occurredAt: row.occurred_at,
        incidentType: row.incident_type,
        location: row.location ? this.parseLocation(row.location) : { lat: 0, lon: 0 },
        zoneId: row.zone_id,
        severity: 'medium',
        resolved: true,
      }));
    } catch (error) {
      console.error('[RiskPrediction] Failed to get historical incidents:', error);
      return [];
    }
  }
  
  private async getRecentAnomalies(
    tenantId: string,
    branchId: string,
    locationScope: string,
    scopeId: string
  ): Promise<number> {
    try {
      const lookbackDate = new Date(Date.now() - 7 * 86400000); // Last 7 days
      
      let query = `
        SELECT COUNT(*) as count
        FROM behavioral_anomaly
        WHERE tenant_id = $1 AND branch_id = $2
        AND detected_at >= $3
        AND status = 'ACTIVE'
      `;
      const params: any[] = [tenantId, branchId, lookbackDate];
      
      if (locationScope === 'zone') {
        query += ` AND zone_id = $${params.length + 1}`;
        params.push(scopeId);
      } else if (locationScope === 'camera') {
        query += ` AND camera_id = $${params.length + 1}`;
        params.push(scopeId);
      }
      
      const result = await this.db.query(query, params);
      return parseInt(result.rows[0]?.count || '0');
    } catch (error) {
      console.error('[RiskPrediction] Failed to get recent anomalies:', error);
      return 0;
    }
  }
  
  // =====================================================
  // STORAGE
  // =====================================================
  
  private async storeHeatMap(heatMap: RiskHeatMap): Promise<void> {
    try {
      // Store each cell
      for (const cell of heatMap.cells) {
        await this.db.query(
          `INSERT INTO security_risk_heatmap 
           (tenant_id, branch_id, grid_cell_id, grid_bounds, center_point,
            prediction_for_time, day_of_week, hour_of_day, risk_score, risk_level,
            risk_components, confidence, data_quality_score, contributing_factors,
            historical_incidents_count, recent_anomalies_count, model_version,
            generated_at, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14::jsonb, $15, $16, $17, $18, $19)`,
          [
            heatMap.tenantId, heatMap.branchId, cell.gridCellId,
            `POLYGON((${cell.bounds.minLon} ${cell.bounds.minLat},${cell.bounds.maxLon} ${cell.bounds.minLat},${cell.bounds.maxLon} ${cell.bounds.maxLat},${cell.bounds.minLon} ${cell.bounds.maxLat},${cell.bounds.minLon} ${cell.bounds.minLat}))`,
            `POINT(${cell.centerPoint.lon} ${cell.centerPoint.lat})`,
            heatMap.predictionForTime, heatMap.predictionForTime.getDay(),
            heatMap.predictionForTime.getHours(), cell.riskScore, cell.riskLevel,
            JSON.stringify(cell.riskComponents), cell.confidence, cell.dataQualityScore,
            JSON.stringify(cell.contributingFactors), cell.historicalIncidentsCount,
            cell.recentAnomaliesCount, heatMap.modelVersion, heatMap.generatedAt,
            heatMap.expiresAt,
          ]
        );
      }
    } catch (error) {
      console.error('[RiskPrediction] Failed to store heat map:', error);
    }
  }
  
  private async storePrediction(prediction: IncidentPrediction): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO security_incident_prediction 
         (id, tenant_id, branch_id, incident_type, location_scope, scope_id,
          prediction_window_start, prediction_window_end, prediction_horizon_hours,
          probability, risk_level, confidence, expected_time_range, contributing_factors,
          historical_incidents_count, recent_anomalies_count, similar_pattern_matches,
          preventive_actions, recommended_patrol_zones, status, model_version,
          generated_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, $16, $17, $18::jsonb, $19::jsonb, $20, $21, $22, $23)`,
        [
          prediction.id, prediction.tenantId, prediction.branchId,
          prediction.incidentType, prediction.locationScope, prediction.scopeId,
          prediction.predictionWindowStart, prediction.predictionWindowEnd,
          prediction.predictionHorizonHours, prediction.probability, prediction.riskLevel,
          prediction.confidence,
          prediction.expectedTimeRange ? `[${prediction.expectedTimeRange.start.toISOString()},${prediction.expectedTimeRange.end.toISOString()})` : null,
          JSON.stringify(prediction.contributingFactors),
          prediction.historicalIncidentsCount, prediction.recentAnomaliesCount,
          prediction.similarPatternMatches, JSON.stringify(prediction.preventiveActions),
          JSON.stringify(prediction.recommendedPatrolZones), prediction.status,
          '2.0', prediction.generatedAt, prediction.expiresAt,
        ]
      );
    } catch (error) {
      console.error('[RiskPrediction] Failed to store prediction:', error);
    }
  }
  
  private parseLocation(postgisPoint: string): { lat: number; lon: number } {
    const match = postgisPoint.match(/POINT\(([-\d.]+) ([-\d.]+)\)/);
    if (!match) return { lat: 0, lon: 0 };
    return { lon: parseFloat(match[1]!), lat: parseFloat(match[2]!) };
  }
  
  // =====================================================
  // PUBLIC API
  // =====================================================
  
  async getLatestHeatMap(
    tenantId: string,
    branchId: string
  ): Promise<RiskHeatMap | null> {
    const cacheKey = `${tenantId}:${branchId}:latest`;
    const cached = this.heatMapCache.get(cacheKey);
    if (cached && cached.expiresAt > new Date()) {
      return cached;
    }
    
    // Generate new heat map
    const now = new Date();
    return await this.generateRiskHeatMap(tenantId, branchId, now);
  }
  
  async getActivePredictions(
    tenantId: string,
    branchId: string
  ): Promise<IncidentPrediction[]> {
    try {
      const result = await this.db.query(
        `SELECT * FROM security_incident_prediction
         WHERE tenant_id = $1 AND branch_id = $2
         AND status = 'ACTIVE' AND expires_at > NOW()
         ORDER BY probability DESC, generated_at DESC`,
        [tenantId, branchId]
      );
      
      return result.rows.map(row => this.hydratePrediction(row));
    } catch (error) {
      console.error('[RiskPrediction] Failed to get active predictions:', error);
      return [];
    }
  }
  
  private hydratePrediction(row: any): IncidentPrediction {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      branchId: row.branch_id,
      incidentType: row.incident_type,
      locationScope: row.location_scope,
      scopeId: row.scope_id,
      predictionWindowStart: row.prediction_window_start,
      predictionWindowEnd: row.prediction_window_end,
      predictionHorizonHours: row.prediction_horizon_hours,
      probability: parseFloat(row.probability),
      riskLevel: row.risk_level,
      confidence: parseFloat(row.confidence),
      contributingFactors: row.contributing_factors,
      historicalIncidentsCount: row.historical_incidents_count,
      recentAnomaliesCount: row.recent_anomalies_count,
      similarPatternMatches: row.similar_pattern_matches,
      preventiveActions: row.preventive_actions,
      recommendedPatrolZones: row.recommended_patrol_zones,
      status: row.status,
      generatedAt: row.generated_at,
      expiresAt: row.expires_at,
    };
  }
  
  getMetrics() {
    return this.metrics;
  }
}

/**
 * Factory function
 */
export function createSecurityRiskPredictionEngine(db: Pool): SecurityRiskPredictionEngine {
  return new SecurityRiskPredictionEngine(db);
}
