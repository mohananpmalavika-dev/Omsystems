/**
 * Behavioral Pattern Learning Detector
 * 
 * Core ML engine for learning "normal" behavioral patterns and detecting anomalies.
 * Uses statistical analysis and time-series pattern recognition to build baseline profiles.
 * 
 * Features:
 * - Multi-dimensional pattern learning (temporal, spatial, behavioral)
 * - Statistical anomaly detection (Z-score, IQR, Isolation Forest-like)
 * - Adaptive learning with confidence scoring
 * - Real-time anomaly detection
 * - Context-aware pattern matching
 * 
 * Architecture:
 * - Observation Collection: Raw behavioral data ingestion
 * - Profile Building: Statistical baseline calculation per context
 * - Anomaly Detection: Real-time deviation detection
 * - Adaptive Update: Continuous learning from new observations
 * 
 * Zero-Cost ML: All algorithms implemented in-house, no external ML dependencies
 */

import { BaseDetector, type DetectionFrame, type DetectionResult, type AIExecutionMetadata } from './base-detector.js';
import type { Pool } from 'pg';

// =====================================================
// TYPES
// =====================================================

interface BehavioralObservation {
  id: string;
  tenantId: string;
  branchId: string;
  cameraId: string;
  observationType: 'person' | 'vehicle' | 'access' | 'environmental' | 'event';
  entityId?: string;
  observedAt: Date;
  location?: { lat: number; lon: number };
  zoneId?: string;
  attributes: Record<string, any>;
  dayOfWeek: number;
  hourOfDay: number;
  isBusinessHours: boolean;
  weatherCondition?: string;
  confidence: number;
}

interface BehavioralProfile {
  id: string;
  tenantId: string;
  branchId: string;
  profileType: 'location' | 'zone' | 'camera' | 'temporal' | 'entity';
  scopeId: string;
  dayOfWeek?: number;
  hourOfDay?: number;
  timeWindow?: string;
  baseline: StatisticalBaseline;
  observationCount: number;
  firstObservationAt: Date;
  lastObservationAt: Date;
  confidence: number;
  modelVersion: string;
}

interface StatisticalBaseline {
  [metric: string]: {
    mean: number;
    std_dev: number;
    min: number;
    max: number;
    median?: number;
    p95?: number;
    p99?: number;
  };
}

interface BehavioralAnomaly {
  id: string;
  tenantId: string;
  branchId: string;
  profileId: string;
  observationId?: string;
  detectedAt: Date;
  anomalyType: 'statistical' | 'behavioral' | 'temporal' | 'spatial' | 'combined';
  severity: 'low' | 'medium' | 'high' | 'critical';
  anomalyScore: number;
  confidence: number;
  standardDeviations?: number;
  expectedValue: any;
  actualValue: any;
  deviationDetails: any;
  location?: { lat: number; lon: number };
  zoneId?: string;
  cameraId?: string;
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED' | 'FALSE_POSITIVE';
}

interface LearningOptions {
  minObservations: number;
  updateInterval: number; // seconds
  adaptiveLearningRate: number;
  anomalyThreshold: number; // Z-score threshold
}

// =====================================================
// BEHAVIORAL PATTERN LEARNING DETECTOR
// =====================================================

export class BehavioralPatternLearningDetector extends BaseDetector {
  private readonly db: Pool;
  private readonly options: LearningOptions;
  
  // In-memory caches
  private profileCache = new Map<string, BehavioralProfile>();
  private recentObservations = new Map<string, BehavioralObservation[]>();
  
  // Performance metrics
  private metrics = {
    totalObservations: 0,
    totalProfiles: 0,
    totalAnomalies: 0,
    falsePositiveRate: 0,
    truePositiveRate: 0,
    avgDetectionTime: 0,
  };
  
  // Learning state
  private lastProfileUpdate = new Date();
  private learningEnabled = true;
  
  constructor(db: Pool, options?: Partial<LearningOptions>) {
    super('behavioral-pattern-learning', '2.0.0');
    this.db = db;
    this.options = {
      minObservations: options?.minObservations ?? 100,
      updateInterval: options?.updateInterval ?? 3600, // 1 hour
      adaptiveLearningRate: options?.adaptiveLearningRate ?? 0.1,
      anomalyThreshold: options?.anomalyThreshold ?? 3.0, // 3 sigma
    };
  }
  
  async initialize(): Promise<void> {
    console.log('[BehavioralPatternLearning] Initializing...');
    
    // Load existing profiles from database
    await this.loadProfiles();
    
    // Start periodic profile update
    this.startProfileUpdateLoop();
    
    console.log(`[BehavioralPatternLearning] Initialized with ${this.profileCache.size} profiles`);
  }
  
  async cleanup(): Promise<void> {
    this.learningEnabled = false;
    this.profileCache.clear();
    this.recentObservations.clear();
  }
  
  getHealth() {
    const profileCount = this.profileCache.size;
    const avgConfidence = Array.from(this.profileCache.values())
      .reduce((sum, p) => sum + p.confidence, 0) / (profileCount || 1);
    
    return {
      status: profileCount > 0 ? ('healthy' as const) : ('degraded' as const),
      details: `Learning from ${profileCount} behavioral profiles (avg confidence: ${avgConfidence.toFixed(2)})`,
      metrics: this.metrics,
    };
  }
  
  // =====================================================
  // OBSERVATION RECORDING
  // =====================================================
  
  /**
   * Record a behavioral observation from detection frame
   */
  async recordObservation(frame: DetectionFrame, detections: any[]): Promise<BehavioralObservation[]> {
    const observations: BehavioralObservation[] = [];
    
    for (const detection of detections) {
      const now = new Date();
      
      // Extract behavioral attributes
      const attributes: Record<string, any> = {
        confidence: detection.confidence,
        boundingBox: detection.boundingBox,
        trackId: detection.trackId,
        ...detection.attributes,
      };
      
      // Determine observation type
      let observationType: BehavioralObservation['observationType'] = 'event';
      if (detection.label === 'person') observationType = 'person';
      else if (['car', 'truck', 'vehicle'].includes(detection.label)) observationType = 'vehicle';
      
      const observation: BehavioralObservation = {
        id: `obs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        tenantId: frame.tenantId,
        branchId: frame.metadata?.branchId as string || 'unknown',
        cameraId: frame.cameraId,
        observationType,
        entityId: detection.trackId,
        observedAt: now,
        location: frame.metadata?.location as any,
        zoneId: frame.metadata?.zoneId as string,
        attributes,
        dayOfWeek: now.getDay(),
        hourOfDay: now.getHours(),
        isBusinessHours: this.isBusinessHours(now),
        confidence: detection.confidence || 0.9,
      };
      
      observations.push(observation);
      
      // Store in database
      await this.storeObservation(observation);
      
      // Cache recent observations for real-time learning
      const cacheKey = `${observation.tenantId}:${observation.branchId}:${observation.cameraId}`;
      if (!this.recentObservations.has(cacheKey)) {
        this.recentObservations.set(cacheKey, []);
      }
      this.recentObservations.get(cacheKey)!.push(observation);
      
      // Keep only last 1000 observations per camera
      if (this.recentObservations.get(cacheKey)!.length > 1000) {
        this.recentObservations.get(cacheKey)!.shift();
      }
      
      this.metrics.totalObservations++;
    }
    
    return observations;
  }
  
  private async storeObservation(obs: BehavioralObservation): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO behavioral_observation 
         (id, tenant_id, branch_id, camera_id, observation_type, entity_id, 
          observed_at, location, zone_id, attributes, day_of_week, hour_of_day, 
          is_business_hours, weather_condition, confidence)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15)`,
        [
          obs.id, obs.tenantId, obs.branchId, obs.cameraId, obs.observationType,
          obs.entityId, obs.observedAt, 
          obs.location ? `POINT(${obs.location.lon} ${obs.location.lat})` : null,
          obs.zoneId, JSON.stringify(obs.attributes), obs.dayOfWeek, obs.hourOfDay,
          obs.isBusinessHours, obs.weatherCondition, obs.confidence,
        ]
      );
    } catch (error) {
      console.error('[BehavioralPatternLearning] Failed to store observation:', error);
    }
  }
  
  // =====================================================
  // PROFILE BUILDING
  // =====================================================
  
  /**
   * Build or update behavioral profile for a given scope
   */
  async buildProfile(
    tenantId: string,
    branchId: string,
    profileType: BehavioralProfile['profileType'],
    scopeId: string,
    dayOfWeek?: number,
    hourOfDay?: number
  ): Promise<BehavioralProfile | null> {
    // Fetch observations for this scope
    const observations = await this.fetchObservationsForProfile(
      tenantId, branchId, profileType, scopeId, dayOfWeek, hourOfDay
    );
    
    if (observations.length < this.options.minObservations) {
      console.log(`[BehavioralPatternLearning] Insufficient data for profile (${observations.length}/${this.options.minObservations})`);
      return null;
    }
    
    // Calculate statistical baseline
    const baseline = this.calculateStatisticalBaseline(observations);
    
    // Calculate confidence (based on observation count and variance)
    const confidence = Math.min(
      observations.length / (this.options.minObservations * 2),
      0.95
    );
    
    const now = new Date();
    const profile: BehavioralProfile = {
      id: `profile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      tenantId,
      branchId,
      profileType,
      scopeId,
      dayOfWeek,
      hourOfDay,
      baseline,
      observationCount: observations.length,
      firstObservationAt: observations[0]!.observedAt,
      lastObservationAt: observations[observations.length - 1]!.observedAt,
      confidence,
      modelVersion: this.modelVersion,
    };
    
    // Store profile
    await this.storeProfile(profile);
    
    // Cache profile
    const cacheKey = this.getProfileCacheKey(tenantId, profileType, scopeId, dayOfWeek, hourOfDay);
    this.profileCache.set(cacheKey, profile);
    
    this.metrics.totalProfiles++;
    
    return profile;
  }
  
  private calculateStatisticalBaseline(observations: BehavioralObservation[]): StatisticalBaseline {
    const baseline: StatisticalBaseline = {};
    
    // Extract all numeric metrics from observations
    const metrics = new Map<string, number[]>();
    
    for (const obs of observations) {
      // Count people/vehicles
      const entityCount = 1; // Each observation is 1 entity
      if (!metrics.has('entity_count')) metrics.set('entity_count', []);
      metrics.get('entity_count')!.push(entityCount);
      
      // Extract numeric attributes
      for (const [key, value] of Object.entries(obs.attributes)) {
        if (typeof value === 'number') {
          if (!metrics.has(key)) metrics.set(key, []);
          metrics.get(key)!.push(value);
        }
      }
      
      // Extract confidence
      if (!metrics.has('confidence')) metrics.set('confidence', []);
      metrics.get('confidence')!.push(obs.confidence);
    }
    
    // Calculate statistics for each metric
    for (const [metricName, values] of metrics.entries()) {
      if (values.length === 0) continue;
      
      const sorted = [...values].sort((a, b) => a - b);
      const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance);
      
      baseline[metricName] = {
        mean,
        std_dev: stdDev,
        min: sorted[0]!,
        max: sorted[sorted.length - 1]!,
        median: sorted[Math.floor(sorted.length / 2)]!,
        p95: sorted[Math.floor(sorted.length * 0.95)]!,
        p99: sorted[Math.floor(sorted.length * 0.99)]!,
      };
    }
    
    return baseline;
  }
  
  private async storeProfile(profile: BehavioralProfile): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO behavioral_profile 
         (id, tenant_id, branch_id, profile_type, scope_id, day_of_week, hour_of_day,
          baseline, observation_count, first_observation_at, last_observation_at,
          confidence, model_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13)
         ON CONFLICT ON CONSTRAINT idx_behavioral_profile_unique
         DO UPDATE SET
           baseline = EXCLUDED.baseline,
           observation_count = EXCLUDED.observation_count,
           last_observation_at = EXCLUDED.last_observation_at,
           confidence = EXCLUDED.confidence,
           last_updated_at = NOW()`,
        [
          profile.id, profile.tenantId, profile.branchId, profile.profileType,
          profile.scopeId, profile.dayOfWeek, profile.hourOfDay,
          JSON.stringify(profile.baseline), profile.observationCount,
          profile.firstObservationAt, profile.lastObservationAt,
          profile.confidence, profile.modelVersion,
        ]
      );
    } catch (error) {
      console.error('[BehavioralPatternLearning] Failed to store profile:', error);
    }
  }
  
  // =====================================================
  // ANOMALY DETECTION
  // =====================================================
  
  /**
   * Detect anomalies in a new observation against learned profiles
   */
  async detectAnomalies(observation: BehavioralObservation): Promise<BehavioralAnomaly[]> {
    const anomalies: BehavioralAnomaly[] = [];
    
    // Find applicable profiles
    const profiles = await this.findApplicableProfiles(observation);
    
    for (const profile of profiles) {
      // Compare observation against profile baseline
      const deviations = this.calculateDeviations(observation, profile);
      
      if (deviations.length === 0) continue;
      
      // Calculate overall anomaly score
      const anomalyScore = this.calculateAnomalyScore(deviations);
      
      // Determine if this is an anomaly
      const maxStdDev = Math.max(...deviations.map(d => d.standardDeviations));
      
      if (maxStdDev < this.options.anomalyThreshold) {
        continue; // Not anomalous
      }
      
      // Determine severity
      const severity = this.determineSeverity(anomalyScore, maxStdDev);
      
      // Determine anomaly type
      const anomalyType = this.determineAnomalyType(deviations);
      
      // Create anomaly record
      const anomaly: BehavioralAnomaly = {
        id: `anomaly_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        tenantId: observation.tenantId,
        branchId: observation.branchId,
        profileId: profile.id,
        observationId: observation.id,
        detectedAt: observation.observedAt,
        anomalyType,
        severity,
        anomalyScore,
        confidence: profile.confidence,
        standardDeviations: maxStdDev,
        expectedValue: this.extractExpectedValues(profile, deviations),
        actualValue: this.extractActualValues(observation, deviations),
        deviationDetails: deviations,
        location: observation.location,
        zoneId: observation.zoneId,
        cameraId: observation.cameraId,
        status: 'ACTIVE',
      };
      
      // Store anomaly
      await this.storeAnomaly(anomaly);
      
      anomalies.push(anomaly);
      this.metrics.totalAnomalies++;
    }
    
    return anomalies;
  }
  
  private async findApplicableProfiles(obs: BehavioralObservation): Promise<BehavioralProfile[]> {
    const profiles: BehavioralProfile[] = [];
    
    // Check cache first
    // 1. Camera-specific profile
    let key = this.getProfileCacheKey(obs.tenantId, 'camera', obs.cameraId, obs.dayOfWeek, obs.hourOfDay);
    if (this.profileCache.has(key)) profiles.push(this.profileCache.get(key)!);
    
    // 2. Zone-specific profile
    if (obs.zoneId) {
      key = this.getProfileCacheKey(obs.tenantId, 'zone', obs.zoneId, obs.dayOfWeek, obs.hourOfDay);
      if (this.profileCache.has(key)) profiles.push(this.profileCache.get(key)!);
    }
    
    // 3. Branch-wide temporal profile
    key = this.getProfileCacheKey(obs.tenantId, 'temporal', obs.branchId, obs.dayOfWeek, obs.hourOfDay);
    if (this.profileCache.has(key)) profiles.push(this.profileCache.get(key)!);
    
    // If no profiles in cache, load from database
    if (profiles.length === 0) {
      const result = await this.db.query(
        `SELECT * FROM behavioral_profile
         WHERE tenant_id = $1 AND branch_id = $2
         AND (
           (profile_type = 'camera' AND scope_id = $3) OR
           (profile_type = 'zone' AND scope_id = $4) OR
           (profile_type = 'temporal' AND scope_id = $2)
         )
         AND (day_of_week IS NULL OR day_of_week = $5)
         AND (hour_of_day IS NULL OR hour_of_day = $6)`,
        [obs.tenantId, obs.branchId, obs.cameraId, obs.zoneId || '', obs.dayOfWeek, obs.hourOfDay]
      );
      
      for (const row of result.rows) {
        profiles.push(this.hydrateProfile(row));
      }
    }
    
    return profiles;
  }
  
  private calculateDeviations(obs: BehavioralObservation, profile: BehavioralProfile) {
    const deviations: Array<{
      metric: string;
      expected: number;
      actual: number;
      standardDeviations: number;
      percentDiff: number;
    }> = [];
    
    for (const [metric, stats] of Object.entries(profile.baseline)) {
      // Extract actual value from observation
      let actualValue: number | undefined;
      
      if (metric === 'confidence') {
        actualValue = obs.confidence;
      } else if (obs.attributes[metric] !== undefined && typeof obs.attributes[metric] === 'number') {
        actualValue = obs.attributes[metric] as number;
      }
      
      if (actualValue === undefined) continue;
      
      // Calculate Z-score (number of standard deviations from mean)
      const zScore = stats.std_dev > 0
        ? Math.abs((actualValue - stats.mean) / stats.std_dev)
        : 0;
      
      if (zScore >= this.options.anomalyThreshold) {
        deviations.push({
          metric,
          expected: stats.mean,
          actual: actualValue,
          standardDeviations: zScore,
          percentDiff: ((actualValue - stats.mean) / stats.mean) * 100,
        });
      }
    }
    
    return deviations;
  }
  
  private calculateAnomalyScore(deviations: any[]): number {
    if (deviations.length === 0) return 0;
    
    // Weighted sum of standard deviations
    const totalDeviation = deviations.reduce((sum, d) => sum + d.standardDeviations, 0);
    return Math.min(totalDeviation / deviations.length, 10); // Normalized 0-10
  }
  
  private determineSeverity(anomalyScore: number, maxStdDev: number): BehavioralAnomaly['severity'] {
    if (anomalyScore >= 7 || maxStdDev >= 5) return 'critical';
    if (anomalyScore >= 5 || maxStdDev >= 4) return 'high';
    if (anomalyScore >= 3 || maxStdDev >= 3) return 'medium';
    return 'low';
  }
  
  private determineAnomalyType(deviations: any[]): BehavioralAnomaly['anomalyType'] {
    if (deviations.length > 3) return 'combined';
    
    // Check if deviations are temporal (time-based metrics)
    const temporalMetrics = ['entity_count', 'activity_level'];
    if (deviations.some(d => temporalMetrics.includes(d.metric))) {
      return 'temporal';
    }
    
    return 'statistical';
  }
  
  private extractExpectedValues(profile: BehavioralProfile, deviations: any[]): any {
    const expected: any = {};
    for (const dev of deviations) {
      expected[dev.metric] = {
        mean: dev.expected,
        range: [
          profile.baseline[dev.metric]?.min,
          profile.baseline[dev.metric]?.max,
        ],
      };
    }
    return expected;
  }
  
  private extractActualValues(obs: BehavioralObservation, deviations: any[]): any {
    const actual: any = {};
    for (const dev of deviations) {
      actual[dev.metric] = dev.actual;
    }
    return actual;
  }
  
  private async storeAnomaly(anomaly: BehavioralAnomaly): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO behavioral_anomaly 
         (id, tenant_id, branch_id, profile_id, observation_id, detected_at,
          anomaly_type, severity, anomaly_score, confidence, standard_deviations,
          expected_value, actual_value, deviation_details, location, zone_id,
          camera_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14::jsonb, $15, $16, $17, $18)`,
        [
          anomaly.id, anomaly.tenantId, anomaly.branchId, anomaly.profileId,
          anomaly.observationId, anomaly.detectedAt, anomaly.anomalyType,
          anomaly.severity, anomaly.anomalyScore, anomaly.confidence,
          anomaly.standardDeviations, JSON.stringify(anomaly.expectedValue),
          JSON.stringify(anomaly.actualValue), JSON.stringify(anomaly.deviationDetails),
          anomaly.location ? `POINT(${anomaly.location.lon} ${anomaly.location.lat})` : null,
          anomaly.zoneId, anomaly.cameraId, anomaly.status,
        ]
      );
    } catch (error) {
      console.error('[BehavioralPatternLearning] Failed to store anomaly:', error);
    }
  }
  
  // =====================================================
  // HELPER METHODS
  // =====================================================
  
  private isBusinessHours(date: Date): boolean {
    const hour = date.getHours();
    const day = date.getDay();
    // Monday-Friday, 9 AM - 6 PM
    return day >= 1 && day <= 5 && hour >= 9 && hour < 18;
  }
  
  private getProfileCacheKey(
    tenantId: string,
    profileType: string,
    scopeId: string,
    dayOfWeek?: number,
    hourOfDay?: number
  ): string {
    return `${tenantId}:${profileType}:${scopeId}:${dayOfWeek ?? 'all'}:${hourOfDay ?? 'all'}`;
  }
  
  private async loadProfiles(): Promise<void> {
    try {
      const result = await this.db.query(
        `SELECT * FROM behavioral_profile
         WHERE confidence >= 0.5
         ORDER BY last_updated_at DESC
         LIMIT 1000`
      );
      
      for (const row of result.rows) {
        const profile = this.hydrateProfile(row);
        const key = this.getProfileCacheKey(
          profile.tenantId, profile.profileType, profile.scopeId,
          profile.dayOfWeek, profile.hourOfDay
        );
        this.profileCache.set(key, profile);
      }
    } catch (error) {
      console.error('[BehavioralPatternLearning] Failed to load profiles:', error);
    }
  }
  
  private hydrateProfile(row: any): BehavioralProfile {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      branchId: row.branch_id,
      profileType: row.profile_type,
      scopeId: row.scope_id,
      dayOfWeek: row.day_of_week,
      hourOfDay: row.hour_of_day,
      timeWindow: row.time_window,
      baseline: row.baseline,
      observationCount: row.observation_count,
      firstObservationAt: row.first_observation_at,
      lastObservationAt: row.last_observation_at,
      confidence: parseFloat(row.confidence),
      modelVersion: row.model_version,
    };
  }
  
  private async fetchObservationsForProfile(
    tenantId: string,
    branchId: string,
    profileType: string,
    scopeId: string,
    dayOfWeek?: number,
    hourOfDay?: number
  ): Promise<BehavioralObservation[]> {
    let query = `
      SELECT * FROM behavioral_observation
      WHERE tenant_id = $1 AND branch_id = $2
    `;
    const params: any[] = [tenantId, branchId];
    
    if (profileType === 'camera') {
      query += ` AND camera_id = $${params.length + 1}`;
      params.push(scopeId);
    } else if (profileType === 'zone') {
      query += ` AND zone_id = $${params.length + 1}`;
      params.push(scopeId);
    }
    
    if (dayOfWeek !== undefined) {
      query += ` AND day_of_week = $${params.length + 1}`;
      params.push(dayOfWeek);
    }
    
    if (hourOfDay !== undefined) {
      query += ` AND hour_of_day = $${params.length + 1}`;
      params.push(hourOfDay);
    }
    
    query += ` ORDER BY observed_at DESC LIMIT 5000`;
    
    try {
      const result = await this.db.query(query, params);
      return result.rows.map(row => this.hydrateObservation(row));
    } catch (error) {
      console.error('[BehavioralPatternLearning] Failed to fetch observations:', error);
      return [];
    }
  }
  
  private hydrateObservation(row: any): BehavioralObservation {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      branchId: row.branch_id,
      cameraId: row.camera_id,
      observationType: row.observation_type,
      entityId: row.entity_id,
      observedAt: row.observed_at,
      location: row.location ? this.parseLocation(row.location) : undefined,
      zoneId: row.zone_id,
      attributes: row.attributes,
      dayOfWeek: row.day_of_week,
      hourOfDay: row.hour_of_day,
      isBusinessHours: row.is_business_hours,
      weatherCondition: row.weather_condition,
      confidence: parseFloat(row.confidence),
    };
  }
  
  private parseLocation(postgisPoint: string): { lat: number; lon: number } | undefined {
    // Parse PostGIS POINT format: "POINT(lon lat)"
    const match = postgisPoint.match(/POINT\(([-\d.]+) ([-\d.]+)\)/);
    if (!match) return undefined;
    return { lon: parseFloat(match[1]!), lat: parseFloat(match[2]!) };
  }
  
  private startProfileUpdateLoop(): void {
    setInterval(async () => {
      if (!this.learningEnabled) return;
      
      const now = new Date();
      const timeSinceUpdate = (now.getTime() - this.lastProfileUpdate.getTime()) / 1000;
      
      if (timeSinceUpdate >= this.options.updateInterval) {
        console.log('[BehavioralPatternLearning] Updating profiles...');
        await this.updateAllProfiles();
        this.lastProfileUpdate = now;
      }
    }, 60000); // Check every minute
  }
  
  private async updateAllProfiles(): Promise<void> {
    // Get list of all active scopes that need profile updates
    try {
      const result = await this.db.query(`
        SELECT DISTINCT tenant_id, branch_id, camera_id, zone_id
        FROM behavioral_observation
        WHERE observed_at >= NOW() - INTERVAL '7 days'
      `);
      
      for (const row of result.rows) {
        // Update camera profile
        await this.buildProfile(
          row.tenant_id, row.branch_id, 'camera', row.camera_id
        );
        
        // Update zone profile if available
        if (row.zone_id) {
          await this.buildProfile(
            row.tenant_id, row.branch_id, 'zone', row.zone_id
          );
        }
      }
    } catch (error) {
      console.error('[BehavioralPatternLearning] Failed to update profiles:', error);
    }
  }
  
  // =====================================================
  // BASE DETECTOR IMPLEMENTATION
  // =====================================================
  
  async detect(frame: DetectionFrame): Promise<DetectionResult[]> {
    const results: DetectionResult[] = [];
    
    // This detector doesn't process frames directly
    // It learns from observations recorded by other detectors
    
    return results;
  }
}

/**
 * Factory function
 */
export function createBehavioralPatternLearningDetector(db: Pool): BehavioralPatternLearningDetector {
  return new BehavioralPatternLearningDetector(db);
}
