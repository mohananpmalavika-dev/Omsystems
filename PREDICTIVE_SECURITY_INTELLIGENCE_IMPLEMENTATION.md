# AI-Powered Predictive Security Intelligence ("SecurityGPT")
## Crime Prevention Before It Happens - Complete Implementation Guide

---

## Executive Summary

This document provides a comprehensive guide to implementing **SecurityGPT**, an AI-powered predictive security intelligence system that shifts from reactive to **proactive security**. The system learns normal behavioral patterns for each location, predicts anomalies 24-48 hours before incidents occur, generates real-time 3D risk heat maps, and auto-suggests optimal security patrol routes based on predicted high-risk zones.

### Core Value Proposition
- **Predictive, not reactive**: Prevent incidents before they happen
- **Data-driven patrol optimization**: Deploy resources where they're needed most
- **Real-time risk visualization**: 3D heat maps showing probability of incidents
- **Behavioral learning**: Understands what's normal for each location and time
- **24-48 hour advance warning**: Sufficient time for preventive action

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Core Components](#2-core-components)
3. [Behavioral Pattern Learning Engine](#3-behavioral-pattern-learning-engine)
4. [Risk Heat Map Generation](#4-risk-heat-map-generation)
5. [Proactive Dispatch System](#5-proactive-dispatch-system)
6. [Database Schema](#6-database-schema)
7. [API Implementation](#7-api-implementation)
8. [Analytics Engine Integration](#8-analytics-engine-integration)
9. [Dashboard & Visualization](#9-dashboard--visualization)
10. [Deployment Guide](#10-deployment-guide)
11. [Performance Optimization](#11-performance-optimization)
12. [Security & Privacy](#12-security--privacy)

---

## 1. Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     SecurityGPT System                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │  Behavioral  │───▶│   Pattern    │───▶│   Anomaly    │      │
│  │   Learning   │    │  Extraction  │    │  Detection   │      │
│  │   Engine     │    │              │    │              │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│         │                    │                    │              │
│         ▼                    ▼                    ▼              │
│  ┌──────────────────────────────────────────────────────┐      │
│  │          Predictive Risk Engine                      │      │
│  │  • Incident Probability Forecasting                  │      │
│  │  • Time-series Analysis                              │      │
│  │  • Multi-factor Risk Scoring                         │      │
│  └──────────────────────────────────────────────────────┘      │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   3D Risk    │    │  Proactive   │    │   Alert &    │      │
│  │   Heat Map   │    │   Dispatch   │    │Notification  │      │
│  │  Generator   │    │   Optimizer  │    │   System     │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
Raw Events → Behavioral Learning → Pattern Database → Risk Calculation
                                                            ↓
3D Visualization ← Patrol Routes ← Risk Predictions ← Anomaly Detection
```

### Technology Stack

- **ML Framework**: TensorFlow.js / ONNX Runtime (zero-cost, local inference)
- **Time-series Analysis**: Custom ARIMA-like implementation
- **Anomaly Detection**: Isolation Forest (manual implementation)
- **3D Visualization**: Three.js / Babylon.js
- **Real-time Updates**: WebSocket + Server-Sent Events
- **Storage**: PostgreSQL with TimescaleDB extension (time-series optimization)
- **Caching**: Redis for real-time risk scores
- **Background Jobs**: BullMQ for periodic predictions

---

## 2. Core Components

### 2.1 Behavioral Pattern Learning Engine

**Purpose**: Learn what's "normal" for each location, time, and day.

**Key Features**:
- Per-location baseline establishment
- Temporal pattern recognition (hourly, daily, weekly, seasonal)
- Multi-dimensional feature extraction
- Continuous learning and adaptation

**Implementation Location**: `analytics-engine/src/detectors/behavioral-learning-engine.ts`

### 2.2 Risk Prediction Engine

**Purpose**: Calculate incident probability 24-48 hours in advance.

**Key Features**:
- Multi-horizon forecasting (24h, 48h, 72h)
- Confidence scoring
- Risk level categorization
- Contributing factor identification

**Implementation Location**: `analytics-engine/src/detectors/risk-prediction-engine.ts`

### 2.3 Heat Map Generator

**Purpose**: Create real-time 3D risk visualizations.

**Key Features**:
- Grid-based spatial analysis
- Temporal interpolation
- Real-time updates
- Interactive 3D rendering

**Implementation Location**: `analytics-engine/src/services/risk-heatmap.service.ts`

### 2.4 Proactive Dispatch Optimizer

**Purpose**: Suggest optimal patrol routes based on predicted risks.

**Key Features**:
- Route optimization algorithms
- Multi-officer coordination
- Priority-based allocation
- Dynamic re-routing

**Implementation Location**: `analytics-engine/src/services/patrol-optimizer.service.ts`

---

## 3. Behavioral Pattern Learning Engine

### 3.1 Implementation

Create `analytics-engine/src/detectors/behavioral-learning-engine.ts`:

```typescript
/**
 * Behavioral Pattern Learning Engine
 * 
 * Learns normal patterns for each location and detects deviations.
 * Uses time-series analysis and anomaly detection to establish baselines.
 * 
 * Features:
 * - Per-location behavioral profiles
 * - Temporal pattern recognition (hourly, daily, weekly)
 * - Multi-dimensional feature extraction
 * - Continuous learning and adaptation
 * - Anomaly scoring with confidence levels
 */

import { BaseDetector, type DetectionFrame, DetectionResult } from './base-detector.js';

/**
 * Behavioral observation
 */
interface BehaviorObservation {
  timestamp: Date;
  location: string;
  cameraId: string;
  
  // Activity metrics
  personCount: number;
  vehicleCount: number;
  motionLevel: number; // 0-100
  crowdDensity: number; // 0-100
  
  // Contextual features
  hour: number;
  dayOfWeek: number;
  isWeekend: boolean;
  isHoliday: boolean;
  weather?: string;
  
  // Detected events
  events: Array<{
    type: string;
    severity: string;
    confidence: number;
  }>;
}

/**
 * Behavioral profile for a location
 */
interface BehaviorProfile {
  locationId: string;
  cameraId: string;
  
  // Baseline statistics
  baseline: {
    avgPersonCount: number;
    stdDevPersonCount: number;
    avgVehicleCount: number;
    stdDevVehicleCount: number;
    avgMotionLevel: number;
    stdDevMotionLevel: number;
    avgCrowdDensity: number;
    stdDevCrowdDensity: number;
  };
  
  // Temporal patterns (hour of day)
  hourlyPatterns: Map<number, {
    avgPersonCount: number;
    avgMotionLevel: number;
    typicalEvents: string[];
    incidentRate: number;
  }>;
  
  // Day of week patterns
  dailyPatterns: Map<number, {
    avgActivity: number;
    peakHours: number[];
    typicalBehavior: string;
  }>;
  
  // Historical incidents
  incidentHistory: Array<{
    timestamp: Date;
    type: string;
    severity: string;
    precursors?: string[]; // What happened before
  }>;
  
  // Learning metadata
  observationCount: number;
  lastUpdated: Date;
  confidence: number; // 0-1 (based on data quantity)
}

/**
 * Anomaly detection result
 */
interface AnomalyResult {
  timestamp: Date;
  locationId: string;
  cameraId: string;
  
  isAnomaly: boolean;
  anomalyScore: number; // 0-100 (higher = more unusual)
  confidence: number; // 0-1
  
  // What's unusual
  deviations: Array<{
    feature: string;
    expected: number;
    observed: number;
    deviation: number; // Standard deviations from mean
    severity: 'low' | 'medium' | 'high' | 'critical';
  }>;
  
  // Context
  expectedBehavior: string;
  observedBehavior: string;
  
  // Risk indicators
  riskFactors: string[];
  similarPastIncidents: Array<{
    date: Date;
    type: string;
    outcome: string;
  }>;
}

/**
 * Behavioral Learning Engine
 */
export class BehavioralLearningEngine extends BaseDetector {
  // Behavioral profiles per location
  private profiles = new Map<string, BehaviorProfile>();
  
  // Recent observations buffer
  private observationBuffer = new Map<string, BehaviorObservation[]>();
  
  // Configuration
  private readonly ANOMALY_THRESHOLD = 2.5; // Standard deviations
  private readonly LEARNING_WINDOW_DAYS = 30;
  private readonly MIN_OBSERVATIONS = 100; // Minimum for reliable baseline
  
  constructor() {
    super('behavioral-learning-engine', '1.0.0');
  }
  
  async initialize(): Promise<void> {
    console.log('[BehavioralLearningEngine] Initializing...');
    
    // Load existing profiles from database
    await this.loadProfiles();
    
    // Start background learning loop
    this.startLearningLoop();
  }
  
  async cleanup(): Promise<void> {
    this.profiles.clear();
    this.observationBuffer.clear();
  }
  
  getHealth() {
    return {
      status: 'healthy' as const,
      details: `Learning ${this.profiles.size} locations`,
      profileCount: this.profiles.size,
      avgConfidence: this.getAverageConfidence()
    };
  }
  
  /**
   * Record a behavioral observation
   */
  recordObservation(observation: BehaviorObservation): void {
    const key = `${observation.location}_${observation.cameraId}`;
    
    // Add to buffer
    if (!this.observationBuffer.has(key)) {
      this.observationBuffer.set(key, []);
    }
    this.observationBuffer.get(key)!.push(observation);
    
    // Keep last 1000 observations per location
    const buffer = this.observationBuffer.get(key)!;
    if (buffer.length > 1000) {
      buffer.shift();
    }
    
    // Update profile
    this.updateProfile(observation);
  }
  
  /**
   * Detect anomalies in current observation
   */
  detectAnomaly(observation: BehaviorObservation): AnomalyResult | null {
    const key = `${observation.location}_${observation.cameraId}`;
    const profile = this.profiles.get(key);
    
    if (!profile || profile.observationCount < this.MIN_OBSERVATIONS) {
      // Not enough data to establish baseline
      return null;
    }
    
    const deviations: AnomalyResult['deviations'] = [];
    let anomalyScore = 0;
    
    // Get expected values for this hour/day
    const hourPattern = profile.hourlyPatterns.get(observation.hour);
    const dayPattern = profile.dailyPatterns.get(observation.dayOfWeek);
    
    // Check person count deviation
    const expectedPersonCount = hourPattern?.avgPersonCount ?? profile.baseline.avgPersonCount;
    const personDeviation = Math.abs(observation.personCount - expectedPersonCount) / 
                           (profile.baseline.stdDevPersonCount || 1);
    
    if (personDeviation > this.ANOMALY_THRESHOLD) {
      deviations.push({
        feature: 'Person Count',
        expected: expectedPersonCount,
        observed: observation.personCount,
        deviation: personDeviation,
        severity: this.getDeviationSeverity(personDeviation)
      });
      anomalyScore += personDeviation * 10;
    }
    
    // Check motion level deviation
    const expectedMotion = hourPattern?.avgMotionLevel ?? profile.baseline.avgMotionLevel;
    const motionDeviation = Math.abs(observation.motionLevel - expectedMotion) / 
                           (profile.baseline.stdDevMotionLevel || 1);
    
    if (motionDeviation > this.ANOMALY_THRESHOLD) {
      deviations.push({
        feature: 'Motion Level',
        expected: expectedMotion,
        observed: observation.motionLevel,
        deviation: motionDeviation,
        severity: this.getDeviationSeverity(motionDeviation)
      });
      anomalyScore += motionDeviation * 10;
    }
    
    // Check crowd density deviation
    const expectedDensity = profile.baseline.avgCrowdDensity;
    const densityDeviation = Math.abs(observation.crowdDensity - expectedDensity) / 
                            (profile.baseline.stdDevCrowdDensity || 1);
    
    if (densityDeviation > this.ANOMALY_THRESHOLD) {
      deviations.push({
        feature: 'Crowd Density',
        expected: expectedDensity,
        observed: observation.crowdDensity,
        deviation: densityDeviation,
        severity: this.getDeviationSeverity(densityDeviation)
      });
      anomalyScore += densityDeviation * 10;
    }
    
    // Check for event anomalies (unusual event types for this time/location)
    const typicalEvents = hourPattern?.typicalEvents ?? [];
    const unusualEvents = observation.events.filter(e => 
      !typicalEvents.includes(e.type) && e.severity !== 'P5'
    );
    
    if (unusualEvents.length > 0) {
      anomalyScore += unusualEvents.length * 15;
    }
    
    // Normalize anomaly score (0-100)
    anomalyScore = Math.min(100, anomalyScore);
    
    const isAnomaly = deviations.length > 0 || unusualEvents.length > 0;
    
    if (!isAnomaly) {
      return null;
    }
    
    // Find similar past incidents
    const similarIncidents = this.findSimilarIncidents(profile, observation);
    
    // Generate risk factors
    const riskFactors = this.identifyRiskFactors(observation, deviations, unusualEvents);
    
    return {
      timestamp: observation.timestamp,
      locationId: observation.location,
      cameraId: observation.cameraId,
      isAnomaly,
      anomalyScore,
      confidence: profile.confidence,
      deviations,
      expectedBehavior: this.describeExpectedBehavior(profile, observation.hour, observation.dayOfWeek),
      observedBehavior: this.describeObservedBehavior(observation),
      riskFactors,
      similarPastIncidents: similarIncidents
    };
  }
  
  /**
   * Get behavioral profile for a location
   */
  getProfile(locationId: string, cameraId: string): BehaviorProfile | undefined {
    return this.profiles.get(`${locationId}_${cameraId}`);
  }
  
  /**
   * Get all profiles
   */
  getAllProfiles(): BehaviorProfile[] {
    return Array.from(this.profiles.values());
  }
  
  // ===========================
  // Private Methods
  // ===========================
  
  private async updateProfile(observation: BehaviorObservation): Promise<void> {
    const key = `${observation.location}_${observation.cameraId}`;
    let profile = this.profiles.get(key);
    
    if (!profile) {
      // Create new profile
      profile = {
        locationId: observation.location,
        cameraId: observation.cameraId,
        baseline: {
          avgPersonCount: 0,
          stdDevPersonCount: 0,
          avgVehicleCount: 0,
          stdDevVehicleCount: 0,
          avgMotionLevel: 0,
          stdDevMotionLevel: 0,
          avgCrowdDensity: 0,
          stdDevCrowdDensity: 0
        },
        hourlyPatterns: new Map(),
        dailyPatterns: new Map(),
        incidentHistory: [],
        observationCount: 0,
        lastUpdated: new Date(),
        confidence: 0
      };
      this.profiles.set(key, profile);
    }
    
    // Update observation count
    profile.observationCount++;
    profile.lastUpdated = new Date();
    
    // Recalculate baseline statistics
    const observations = this.observationBuffer.get(key) || [];
    if (observations.length > 0) {
      profile.baseline = this.calculateBaseline(observations);
    }
    
    // Update hourly patterns
    this.updateHourlyPattern(profile, observation);
    
    // Update daily patterns
    this.updateDailyPattern(profile, observation);
    
    // Update confidence (based on observation count)
    profile.confidence = Math.min(1.0, profile.observationCount / 1000);
  }
  
  private calculateBaseline(observations: BehaviorObservation[]) {
    const personCounts = observations.map(o => o.personCount);
    const vehicleCounts = observations.map(o => o.vehicleCount);
    const motionLevels = observations.map(o => o.motionLevel);
    const crowdDensities = observations.map(o => o.crowdDensity);
    
    return {
      avgPersonCount: this.mean(personCounts),
      stdDevPersonCount: this.standardDeviation(personCounts),
      avgVehicleCount: this.mean(vehicleCounts),
      stdDevVehicleCount: this.standardDeviation(vehicleCounts),
      avgMotionLevel: this.mean(motionLevels),
      stdDevMotionLevel: this.standardDeviation(motionLevels),
      avgCrowdDensity: this.mean(crowdDensities),
      stdDevCrowdDensity: this.standardDeviation(crowdDensities)
    };
  }
  
  private updateHourlyPattern(profile: BehaviorProfile, observation: BehaviorObservation): void {
    const hour = observation.hour;
    let pattern = profile.hourlyPatterns.get(hour);
    
    if (!pattern) {
      pattern = {
        avgPersonCount: observation.personCount,
        avgMotionLevel: observation.motionLevel,
        typicalEvents: observation.events.map(e => e.type),
        incidentRate: 0
      };
      profile.hourlyPatterns.set(hour, pattern);
    } else {
      // Exponential moving average
      const alpha = 0.1; // Learning rate
      pattern.avgPersonCount = alpha * observation.personCount + (1 - alpha) * pattern.avgPersonCount;
      pattern.avgMotionLevel = alpha * observation.motionLevel + (1 - alpha) * pattern.avgMotionLevel;
      
      // Update typical events
      observation.events.forEach(e => {
        if (!pattern!.typicalEvents.includes(e.type)) {
          pattern!.typicalEvents.push(e.type);
        }
      });
    }
  }
  
  private updateDailyPattern(profile: BehaviorProfile, observation: BehaviorObservation): void {
    const day = observation.dayOfWeek;
    let pattern = profile.dailyPatterns.get(day);
    
    if (!pattern) {
      pattern = {
        avgActivity: observation.motionLevel,
        peakHours: [observation.hour],
        typicalBehavior: 'Learning...'
      };
      profile.dailyPatterns.set(day, pattern);
    } else {
      const alpha = 0.1;
      pattern.avgActivity = alpha * observation.motionLevel + (1 - alpha) * pattern.avgActivity;
    }
  }
  
  private findSimilarIncidents(
    profile: BehaviorProfile, 
    observation: BehaviorObservation
  ): AnomalyResult['similarPastIncidents'] {
    return profile.incidentHistory
      .filter(inc => {
        const incHour = inc.timestamp.getHours();
        const incDay = inc.timestamp.getDay();
        return Math.abs(incHour - observation.hour) <= 2 && incDay === observation.dayOfWeek;
      })
      .slice(-3)
      .map(inc => ({
        date: inc.timestamp,
        type: inc.type,
        outcome: inc.severity
      }));
  }
  
  private identifyRiskFactors(
    observation: BehaviorObservation,
    deviations: AnomalyResult['deviations'],
    unusualEvents: BehaviorObservation['events']
  ): string[] {
    const factors: string[] = [];
    
    if (deviations.some(d => d.feature === 'Person Count' && d.observed > d.expected * 1.5)) {
      factors.push('Unusually high crowd density');
    }
    
    if (deviations.some(d => d.feature === 'Motion Level' && d.observed > d.expected * 2)) {
      factors.push('Elevated activity levels');
    }
    
    if (unusualEvents.some(e => e.type === 'loitering')) {
      factors.push('Unusual loitering behavior');
    }
    
    if (observation.hour >= 22 || observation.hour <= 5) {
      factors.push('After-hours activity');
    }
    
    if (unusualEvents.length > 2) {
      factors.push('Multiple unusual events detected');
    }
    
    return factors;
  }
  
  private describeExpectedBehavior(profile: BehaviorProfile, hour: number, day: number): string {
    const hourPattern = profile.hourlyPatterns.get(hour);
    const avgPerson = hourPattern?.avgPersonCount ?? profile.baseline.avgPersonCount;
    const avgMotion = hourPattern?.avgMotionLevel ?? profile.baseline.avgMotionLevel;
    
    return `Expected ${Math.round(avgPerson)} people with ${Math.round(avgMotion)}% activity level`;
  }
  
  private describeObservedBehavior(observation: BehaviorObservation): string {
    return `Observed ${observation.personCount} people with ${Math.round(observation.motionLevel)}% activity level`;
  }
  
  private getDeviationSeverity(deviation: number): 'low' | 'medium' | 'high' | 'critical' {
    if (deviation > 4) return 'critical';
    if (deviation > 3) return 'high';
    if (deviation > 2.5) return 'medium';
    return 'low';
  }
  
  private mean(values: number[]): number {
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  }
  
  private standardDeviation(values: number[]): number {
    const avg = this.mean(values);
    const squareDiffs = values.map(value => Math.pow(value - avg, 2));
    return Math.sqrt(this.mean(squareDiffs));
  }
  
  private getAverageConfidence(): number {
    const profiles = Array.from(this.profiles.values());
    return profiles.length > 0
      ? profiles.reduce((sum, p) => sum + p.confidence, 0) / profiles.length
      : 0;
  }
  
  private async loadProfiles(): Promise<void> {
    // TODO: Load from database
    console.log('[BehavioralLearningEngine] Profiles loaded');
  }
  
  private startLearningLoop(): void {
    // Periodic profile updates and anomaly detection
    setInterval(() => {
      this.performBackgroundLearning();
    }, 300000); // Every 5 minutes
  }
  
  private async performBackgroundLearning(): Promise<void> {
    // Recalculate patterns, update confidence scores, etc.
    console.log('[BehavioralLearningEngine] Background learning cycle');
  }
  
  // ===========================
  // BaseDetector Implementation
  // ===========================
  
  async detect(frame: DetectionFrame): Promise<DetectionResult[]> {
    // Extract behavioral features from frame
    const observation: BehaviorObservation = {
      timestamp: new Date(),
      location: frame.location || 'unknown',
      cameraId: frame.cameraId,
      personCount: frame.detections?.filter(d => d.class === 'person').length || 0,
      vehicleCount: frame.detections?.filter(d => d.class === 'vehicle').length || 0,
      motionLevel: frame.motionScore || 0,
      crowdDensity: this.calculateCrowdDensity(frame),
      hour: new Date().getHours(),
      dayOfWeek: new Date().getDay(),
      isWeekend: new Date().getDay() % 6 === 0,
      isHoliday: false, // TODO: Check holiday calendar
      events: []
    };
    
    // Record observation
    this.recordObservation(observation);
    
    // Detect anomalies
    const anomaly = this.detectAnomaly(observation);
    
    if (!anomaly) {
      return [];
    }
    
    // Create detection result
    return [{
      id: `anomaly_${Date.now()}`,
      type: 'behavioral-anomaly',
      confidence: anomaly.confidence,
      timestamp: anomaly.timestamp,
      metadata: {
        anomalyScore: anomaly.anomalyScore,
        deviations: anomaly.deviations,
        riskFactors: anomaly.riskFactors,
        similarIncidents: anomaly.similarPastIncidents
      }
    }];
  }
  
  async processStream(streamUrl: string): Promise<void> {
    // Not applicable - operates on frame basis
  }
  
  private calculateCrowdDensity(frame: DetectionFrame): number {
    const personCount = frame.detections?.filter(d => d.class === 'person').length || 0;
    const frameArea = (frame.width || 1920) * (frame.height || 1080);
    const personsPerPixel = personCount / frameArea;
    return Math.min(100, personsPerPixel * 1000000); // Normalize to 0-100
  }
}

export function createBehavioralLearningEngine(): BehavioralLearningEngine {
  return new BehavioralLearningEngine();
}
```

### 3.2 Capability Registration

Add to `src/analytics/capability-catalog.ts` in the prediction domain:

```typescript
c("behavioral-anomaly", "Behavioral anomaly detection", "derived", "P2"),
c("pattern-baseline-learning", "Pattern baseline learning", "derived"),
c("temporal-pattern-recognition", "Temporal pattern recognition", "derived"),
```

---

## 4. Risk Heat Map Generation

### 4.1 Heat Map Service Implementation

Create `analytics-engine/src/services/risk-heatmap.service.ts`:

```typescript
/**
 * Risk Heat Map Service
 * 
 * Generates real-time 3D risk heat maps showing incident probability
 * by location and time. Provides spatial risk analysis and visualization.
 * 
 * Features:
 * - Grid-based spatial risk calculation
 * - Temporal interpolation (risk changes over time)
 * - Real-time updates via WebSocket
 * - 3D visualization-ready data format
 * - Historical risk trending
 */

export interface RiskGridCell {
  x: number;
  y: number;
  z: number; // Floor/level
  
  // Risk metrics
  riskScore: number; // 0-100
  incidentProbability: number; // 0-1
  confidence: number; // 0-1
  
  // Breakdown by risk type
  riskFactors: {
    intrusion: number;
    theft: number;
    violence: number;
    fire: number;
    medical: number;
    other: number;
  };
  
  // Temporal
  timestamp: Date;
  forecastHorizon: number; // hours
  
  // Contributing factors
  contributingFactors: string[];
  recentIncidents: number;
  
  // Location context
  locationName?: string;
  cameraIds: string[];
  areaType: 'entrance' | 'parking' | 'corridor' | 'office' | 'restricted' | 'public';
}

export interface RiskHeatMap {
  tenantId: string;
  branchId: string;
  generatedAt: Date;
  forecastHorizon: number; // hours (24, 48, etc.)
  
  // Grid configuration
  gridResolution: {
    x: number;
    y: number;
    z: number;
  };
  
  // Physical dimensions (meters)
  dimensions: {
    width: number;
    height: number;
    floors: number;
  };
  
  // Risk grid
  cells: RiskGridCell[];
  
  // Summary statistics
  summary: {
    maxRisk: number;
    avgRisk: number;
    highRiskCells: number;
    criticalRiskCells: number;
    totalCells: number;
  };
  
  // Hotspots (areas of concern)
  hotspots: Array<{
    location: string;
    riskScore: number;
    reason: string;
    recommendedAction: string;
  }>;
}

export interface TemporalRiskProfile {
  locationId: string;
  hourlyRisk: Map<number, number>; // Hour -> risk score
  dailyRisk: Map<number, number>; // Day of week -> risk score
  peakRiskTimes: Array<{
    hour: number;
    day: number;
    riskScore: number;
  }>;
}

export class RiskHeatMapService {
  private heatMaps = new Map<string, RiskHeatMap>();
  private temporalProfiles = new Map<string, TemporalRiskProfile>();
  
  constructor(
    private readonly behavioralEngine: any,
    private readonly predictionEngine: any
  ) {}
  
  /**
   * Generate risk heat map for a branch
   */
  async generateHeatMap(
    tenantId: string,
    branchId: string,
    forecastHorizon: number = 24,
    options: {
      gridResolution?: { x: number; y: number; z: number };
      includeHistorical?: boolean;
    } = {}
  ): Promise<RiskHeatMap> {
    // Get branch layout/dimensions (from database or config)
    const branchLayout = await this.getBranchLayout(tenantId, branchId);
    
    const resolution = options.gridResolution || { x: 10, y: 10, z: 1 };
    
    // Create grid cells
    const cells: RiskGridCell[] = [];
    
    for (let z = 0; z < resolution.z; z++) {
      for (let y = 0; y < resolution.y; y++) {
        for (let x = 0; x < resolution.x; x++) {
          const cell = await this.calculateCellRisk(
            tenantId,
            branchId,
            { x, y, z },
            forecastHorizon,
            branchLayout
          );
          cells.push(cell);
        }
      }
    }
    
    // Calculate summary statistics
    const riskScores = cells.map(c => c.riskScore);
    const summary = {
      maxRisk: Math.max(...riskScores),
      avgRisk: riskScores.reduce((a, b) => a + b, 0) / riskScores.length,
      highRiskCells: cells.filter(c => c.riskScore >= 60).length,
      criticalRiskCells: cells.filter(c => c.riskScore >= 80).length,
      totalCells: cells.length
    };
    
    // Identify hotspots
    const hotspots = this.identifyHotspots(cells, branchLayout);
    
    const heatMap: RiskHeatMap = {
      tenantId,
      branchId,
      generatedAt: new Date(),
      forecastHorizon,
      gridResolution: resolution,
      dimensions: {
        width: branchLayout.width,
        height: branchLayout.height,
        floors: branchLayout.floors
      },
      cells,
      summary,
      hotspots
    };
    
    // Cache heat map
    this.heatMaps.set(`${tenantId}:${branchId}:${forecastHorizon}`, heatMap);
    
    return heatMap;
  }
  
  /**
   * Calculate risk for a single grid cell
   */
  private async calculateCellRisk(
    tenantId: string,
    branchId: string,
    position: { x: number; y: number; z: number },
    forecastHorizon: number,
    branchLayout: any
  ): Promise<RiskGridCell> {
    // Get cameras covering this cell
    const coveringCameras = this.getCamerasForCell(position, branchLayout);
    
    // Get predictions for these cameras
    const predictions = await Promise.all(
      coveringCameras.map(camId =>
        this.predictionEngine.getPredictionsForCamera(camId, forecastHorizon)
      )
    );
    
    // Aggregate risk scores
    let totalRisk = 0;
    let totalConfidence = 0;
    const riskFactors = {
      intrusion: 0,
      theft: 0,
      violence: 0,
      fire: 0,
      medical: 0,
      other: 0
    };
    
    for (const prediction of predictions) {
      if (!prediction) continue;
      
      totalRisk += prediction.probability * 100;
      totalConfidence += prediction.confidence;
      
      // Categorize risk factors
      if (prediction.type === 'intrusion' || prediction.type === 'unauthorized_access') {
        riskFactors.intrusion += prediction.probability * 100;
      } else if (prediction.type === 'theft' || prediction.type === 'shoplifting') {
        riskFactors.theft += prediction.probability * 100;
      } else if (prediction.type === 'violence' || prediction.type === 'weapon') {
        riskFactors.violence += prediction.probability * 100;
      } else if (prediction.type === 'fire' || prediction.type === 'smoke') {
        riskFactors.fire += prediction.probability * 100;
      } else if (prediction.type === 'fall' || prediction.type === 'medical_emergency') {
        riskFactors.medical += prediction.probability * 100;
      } else {
        riskFactors.other += prediction.probability * 100;
      }
    }
    
    const avgRisk = predictions.length > 0 ? totalRisk / predictions.length : 0;
    const avgConfidence = predictions.length > 0 ? totalConfidence / predictions.length : 0;
    
    // Adjust risk based on area type
    const areaType = this.getAreaType(position, branchLayout);
    const areaMultiplier = this.getAreaRiskMultiplier(areaType);
    
    const riskScore = Math.min(100, avgRisk * areaMultiplier);
    
    return {
      x: position.x,
      y: position.y,
      z: position.z,
      riskScore,
      incidentProbability: riskScore / 100,
      confidence: avgConfidence,
      riskFactors,
      timestamp: new Date(),
      forecastHorizon,
      contributingFactors: this.extractContributingFactors(predictions),
      recentIncidents: 0, // TODO: Query from database
      cameraIds: coveringCameras,
      areaType
    };
  }
  
  /**
   * Identify high-risk hotspots
   */
  private identifyHotspots(
    cells: RiskGridCell[],
    branchLayout: any
  ): RiskHeatMap['hotspots'] {
    const hotspots: RiskHeatMap['hotspots'] = [];
    
    // Sort cells by risk score
    const highRiskCells = cells
      .filter(c => c.riskScore >= 60)
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 10); // Top 10 hotspots
    
    for (const cell of highRiskCells) {
      hotspots.push({
        location: cell.locationName || `Grid (${cell.x}, ${cell.y}, ${cell.z})`,
        riskScore: cell.riskScore,
        reason: this.generateHotspotReason(cell),
        recommendedAction: this.getRecommendedAction(cell)
      });
    }
    
    return hotspots;
  }
  
  /**
   * Get temporal risk profile for a location
   */
  async getTemporalRiskProfile(
    tenantId: string,
    branchId: string,
    locationId: string
  ): Promise<TemporalRiskProfile> {
    // TODO: Implement temporal analysis
    return {
      locationId,
      hourlyRisk: new Map(),
      dailyRisk: new Map(),
      peakRiskTimes: []
    };
  }
  
  // ===========================
  // Helper Methods
  // ===========================
  
  private async getBranchLayout(tenantId: string, branchId: string): Promise<any> {
    // TODO: Load from database or config
    return {
      width: 100, // meters
      height: 80,
      floors: 2,
      cameras: [],
      zones: []
    };
  }
  
  private getCamerasForCell(position: { x: number; y: number; z: number }, layout: any): string[] {
    // TODO: Spatial query to find cameras covering this cell
    return [];
  }
  
  private getAreaType(
    position: { x: number; y: number; z: number },
    layout: any
  ): RiskGridCell['areaType'] {
    // TODO: Lookup from branch layout
    return 'public';
  }
  
  private getAreaRiskMultiplier(areaType: RiskGridCell['areaType']): number {
    const multipliers: Record<RiskGridCell['areaType'], number> = {
      restricted: 1.5, // Higher risk in restricted areas
      entrance: 1.2,
      parking: 1.1,
      corridor: 1.0,
      office: 0.9,
      public: 1.0
    };
    return multipliers[areaType] || 1.0;
  }
  
  private extractContributingFactors(predictions: any[]): string[] {
    const factors = new Set<string>();
    for (const pred of predictions) {
      if (pred?.contributingFactors) {
        pred.contributingFactors.forEach((f: string) => factors.add(f));
      }
    }
    return Array.from(factors);
  }
  
  private generateHotspotReason(cell: RiskGridCell): string {
    const topRisk = Object.entries(cell.riskFactors)
      .sort(([, a], [, b]) => b - a)[0];
    
    if (!topRisk) return 'Elevated risk detected';
    
    const [type, score] = topRisk;
    return `${type.charAt(0).toUpperCase() + type.slice(1)} risk: ${Math.round(score)}%`;
  }
  
  private getRecommendedAction(cell: RiskGridCell): string {
    if (cell.riskScore >= 80) {
      return 'Deploy security patrol immediately';
    } else if (cell.riskScore >= 60) {
      return 'Increase monitoring and patrols';
    } else {
      return 'Continue standard monitoring';
    }
  }
}
```

---

## 5. Proactive Dispatch System

### 5.1 Patrol Optimizer Implementation

Create `analytics-engine/src/services/patrol-optimizer.service.ts`:

```typescript
/**
 * Proactive Patrol Optimizer
 * 
 * Generates optimal security patrol routes based on predicted risk scores.
 * Uses algorithms to balance coverage, response time, and resource allocation.
 * 
 * Features:
 * - Multi-officer route optimization
 * - Priority-based waypoint selection
 * - Dynamic re-routing on risk changes
 * - Coverage gap detection
 * - Real-time route updates
 */

export interface PatrolWaypoint {
  id: string;
  location: {
    x: number;
    y: number;
    z: number; // Floor
    name: string;
  };
  riskScore: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
  estimatedDuration: number; // minutes
  actions: string[]; // What to do at this waypoint
  cameraIds: string[];
}

export interface PatrolRoute {
  id: string;
  officerId: string;
  officerName: string;
  
  // Route configuration
  waypoints: PatrolWaypoint[];
  totalDuration: number; // minutes
  totalDistance: number; // meters
  
  // Schedule
  startTime: Date;
  estimatedEndTime: Date;
  
  // Coverage
  areasCooverage: string[];
  riskMitigation: number; // Total risk mitigated (0-100)
  
  // Status
  status: 'pending' | 'active' | 'completed' | 'modified';
  progress?: {
    currentWaypointIndex: number;
    completedWaypoints: number;
    eta: Date;
  };
}

export interface PatrolPlan {
  tenantId: string;
  branchId: string;
  generatedAt: Date;
  validUntil: Date;
  
  routes: PatrolRoute[];
  
  // Coverage analysis
  coverage: {
    totalArea: number; // square meters
    coveredArea: number;
    coveragePercent: number;
    uncoveredHotspots: Array<{
      location: string;
      riskScore: number;
      reason: string;
    }>;
  };
  
  // Resource allocation
  resources: {
    officersAssigned: number;
    officersAvailable: number;
    optimalOfficerCount: number;
  };
}

export class PatrolOptimizerService {
  private activeRoutes = new Map<string, PatrolRoute>();
  
  constructor(
    private readonly heatMapService: any,
    private readonly branchStore: any
  ) {}
  
  /**
   * Generate optimal patrol plan for a branch
   */
  async generatePatrolPlan(
    tenantId: string,
    branchId: string,
    options: {
      forecastHorizon?: number; // hours
      numOfficers?: number;
      duration?: number; // minutes per patrol
    } = {}
  ): Promise<PatrolPlan> {
    const forecastHorizon = options.forecastHorizon || 24;
    const duration = options.duration || 60;
    
    // Get risk heat map
    const heatMap = await this.heatMapService.generateHeatMap(
      tenantId,
      branchId,
      forecastHorizon
    );
    
    // Identify high-priority waypoints
    const waypoints = this.extractWaypoints(heatMap);
    
    // Get available officers
    const availableOfficers = await this.getAvailableOfficers(tenantId, branchId);
    const numOfficers = Math.min(
      options.numOfficers || availableOfficers.length,
      availableOfficers.length
    );
    
    // Optimize routes
    const routes = this.optimizeRoutes(
      waypoints,
      availableOfficers.slice(0, numOfficers),
      duration
    );
    
    // Calculate coverage
    const coverage = this.calculateCoverage(routes, heatMap);
    
    return {
      tenantId,
      branchId,
      generatedAt: new Date(),
      validUntil: new Date(Date.now() + forecastHorizon * 3600000),
      routes,
      coverage,
      resources: {
        officersAssigned: numOfficers,
        officersAvailable: availableOfficers.length,
        optimalOfficerCount: Math.ceil(waypoints.length / 10) // Rule of thumb
      }
    };
  }
  
  /**
   * Extract high-priority waypoints from heat map
   */
  private extractWaypoints(heatMap: RiskHeatMap): PatrolWaypoint[] {
    const waypoints: PatrolWaypoint[] = [];
    
    // Get high-risk cells (risk score >= 50)
    const highRiskCells = heatMap.cells
      .filter(cell => cell.riskScore >= 50)
      .sort((a, b) => b.riskScore - a.riskScore);
    
    // Group nearby cells into waypoints
    const clusters = this.clusterCells(highRiskCells);
    
    for (const cluster of clusters) {
      const avgRisk = cluster.reduce((sum, c) => sum + c.riskScore, 0) / cluster.length;
      const center = this.calculateClusterCenter(cluster);
      
      waypoints.push({
        id: `waypoint_${waypoints.length + 1}`,
        location: {
          x: center.x,
          y: center.y,
          z: center.z,
          name: cluster[0]?.locationName || `Area ${waypoints.length + 1}`
        },
        riskScore: avgRisk,
        priority: this.calculatePriority(avgRisk),
        estimatedDuration: this.estimateDuration(avgRisk),
        actions: this.generateActions(cluster),
        cameraIds: cluster.flatMap(c => c.cameraIds)
      });
    }
    
    return waypoints;
  }
  
  /**
   * Optimize patrol routes using greedy nearest-neighbor with priorities
   */
  private optimizeRoutes(
    waypoints: PatrolWaypoint[],
    officers: any[],
    maxDuration: number
  ): PatrolRoute[] {
    const routes: PatrolRoute[] = [];
    const unassignedWaypoints = [...waypoints];
    
    // Sort waypoints by priority and risk
    unassignedWaypoints.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      return priorityDiff !== 0 ? priorityDiff : b.riskScore - a.riskScore;
    });
    
    for (const officer of officers) {
      const route: PatrolRoute = {
        id: `route_${routes.length + 1}`,
        officerId: officer.id,
        officerName: officer.name,
        waypoints: [],
        totalDuration: 0,
        totalDistance: 0,
        startTime: new Date(),
        estimatedEndTime: new Date(),
        areasCooverage: [],
        riskMitigation: 0,
        status: 'pending'
      };
      
      // Start from officer's current location (or branch entrance)
      let currentLocation = officer.location || { x: 0, y: 0, z: 0 };
      
      while (unassignedWaypoints.length > 0 && route.totalDuration < maxDuration) {
        // Find nearest high-priority waypoint
        let bestWaypoint: PatrolWaypoint | null = null;
        let bestDistance = Infinity;
        let bestIndex = -1;
        
        for (let i = 0; i < unassignedWaypoints.length; i++) {
          const waypoint = unassignedWaypoints[i]!;
          const distance = this.calculateDistance(currentLocation, waypoint.location);
          const travelTime = distance / 1.4; // Assume 1.4 m/s walking speed
          
          if (route.totalDuration + travelTime + waypoint.estimatedDuration <= maxDuration) {
            // Prioritize closer critical/high waypoints
            const priorityWeight = waypoint.priority === 'critical' ? 0.5 : 
                                  waypoint.priority === 'high' ? 0.7 : 1.0;
            const weightedDistance = distance * priorityWeight;
            
            if (weightedDistance < bestDistance) {
              bestDistance = weightedDistance;
              bestWaypoint = waypoint;
              bestIndex = i;
            }
          }
        }
        
        if (!bestWaypoint) break; // No more waypoints fit
        
        // Add waypoint to route
        route.waypoints.push(bestWaypoint);
        route.totalDistance += bestDistance;
        route.totalDuration += (bestDistance / 1.4) + bestWaypoint.estimatedDuration;
        route.riskMitigation += bestWaypoint.riskScore;
        
        // Remove from unassigned
        unassignedWaypoints.splice(bestIndex, 1);
        
        // Update current location
        currentLocation = bestWaypoint.location;
      }
      
      // Set estimated end time
      route.estimatedEndTime = new Date(route.startTime.getTime() + route.totalDuration * 60000);
      
      // Extract covered areas
      route.areasCooverage = Array.from(new Set(route.waypoints.map(w => w.location.name)));
      
      routes.push(route);
    }
    
    return routes;
  }
  
  /**
   * Calculate coverage metrics
   */
  private calculateCoverage(routes: PatrolRoute[], heatMap: RiskHeatMap): PatrolPlan['coverage'] {
    const coveredCells = new Set<string>();
    
    for (const route of routes) {
      for (const waypoint of route.waypoints) {
        // Mark cells within patrol radius as covered
        const radius = 20; // meters
        heatMap.cells.forEach(cell => {
          const distance = this.calculateDistance(
            { x: cell.x, y: cell.y, z: cell.z },
            waypoint.location
          );
          if (distance <= radius) {
            coveredCells.add(`${cell.x}_${cell.y}_${cell.z}`);
          }
        });
      }
    }
    
    const totalCells = heatMap.cells.length;
    const coveredCount = coveredCells.size;
    
    // Find uncovered hotspots
    const uncoveredHotspots = heatMap.hotspots
      .filter(hotspot => {
        // Check if any route covers this hotspot
        return !routes.some(route =>
          route.areasCooverage.includes(hotspot.location)
        );
      })
      .map(hotspot => ({
        location: hotspot.location,
        riskScore: hotspot.riskScore,
        reason: hotspot.reason
      }));
    
    return {
      totalArea: totalCells * 10, // Assume 10 m² per cell
      coveredArea: coveredCount * 10,
      coveragePercent: (coveredCount / totalCells) * 100,
      uncoveredHotspots
    };
  }
  
  // ===========================
  // Helper Methods
  // ===========================
  
  private clusterCells(cells: RiskGridCell[]): RiskGridCell[][] {
    const clusters: RiskGridCell[][] = [];
    const visited = new Set<string>();
    const clusterRadius = 15; // meters
    
    for (const cell of cells) {
      const key = `${cell.x}_${cell.y}_${cell.z}`;
      if (visited.has(key)) continue;
      
      const cluster: RiskGridCell[] = [cell];
      visited.add(key);
      
      // Find nearby cells
      for (const other of cells) {
        const otherKey = `${other.x}_${other.y}_${other.z}`;
        if (visited.has(otherKey)) continue;
        
        const distance = this.calculateDistance(
          { x: cell.x, y: cell.y, z: cell.z },
          { x: other.x, y: other.y, z: other.z }
        );
        
        if (distance <= clusterRadius) {
          cluster.push(other);
          visited.add(otherKey);
        }
      }
      
      clusters.push(cluster);
    }
    
    return clusters;
  }
  
  private calculateClusterCenter(cluster: RiskGridCell[]): { x: number; y: number; z: number } {
    const sum = cluster.reduce((acc, cell) => ({
      x: acc.x + cell.x,
      y: acc.y + cell.y,
      z: acc.z + cell.z
    }), { x: 0, y: 0, z: 0 });
    
    return {
      x: Math.round(sum.x / cluster.length),
      y: Math.round(sum.y / cluster.length),
      z: Math.round(sum.z / cluster.length)
    };
  }
  
  private calculatePriority(riskScore: number): PatrolWaypoint['priority'] {
    if (riskScore >= 80) return 'critical';
    if (riskScore >= 65) return 'high';
    if (riskScore >= 50) return 'medium';
    return 'low';
  }
  
  private estimateDuration(riskScore: number): number {
    // Higher risk = longer inspection
    if (riskScore >= 80) return 10; // minutes
    if (riskScore >= 65) return 7;
    if (riskScore >= 50) return 5;
    return 3;
  }
  
  private generateActions(cluster: RiskGridCell[]): string[] {
    const actions = new Set<string>();
    
    const hasHighIntrusion = cluster.some(c => c.riskFactors.intrusion >= 60);
    const hasHighFire = cluster.some(c => c.riskFactors.fire >= 60);
    
    if (hasHighIntrusion) {
      actions.add('Check all access points and doors');
      actions.add('Verify camera functionality');
    }
    
    if (hasHighFire) {
      actions.add('Check fire extinguisher and alarm');
      actions.add('Verify exit routes are clear');
    }
    
    actions.add('Visual inspection of area');
    actions.add('Report any anomalies');
    
    return Array.from(actions);
  }
  
  private calculateDistance(
    a: { x: number; y: number; z: number },
    b: { x: number; y: number; z: number }
  ): number {
    // 2D Euclidean distance (ignoring z for now)
    return Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2));
  }
  
  private async getAvailableOfficers(tenantId: string, branchId: string): Promise<any[]> {
    // TODO: Query from database or roster system
    return [
      { id: 'officer_1', name: 'Officer Smith', location: { x: 0, y: 0, z: 0 } },
      { id: 'officer_2', name: 'Officer Jones', location: { x: 0, y: 0, z: 0 } }
    ];
  }
}
```

---

## 6. Database Schema

### 6.1 Create Migration

Create `database/migrations/060_predictive_security_intelligence.sql`:

```sql
-- Predictive Security Intelligence Schema
-- Behavioral patterns, risk predictions, heat maps, and patrol planning

-- ============================================================
-- Behavioral Learning Tables
-- ============================================================

-- Behavioral observations
CREATE TABLE behavioral_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  camera_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  
  -- Timestamp
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Activity metrics
  person_count INTEGER NOT NULL DEFAULT 0,
  vehicle_count INTEGER NOT NULL DEFAULT 0,
  motion_level INTEGER NOT NULL DEFAULT 0 CHECK (motion_level BETWEEN 0 AND 100),
  crowd_density INTEGER NOT NULL DEFAULT 0 CHECK (crowd_density BETWEEN 0 AND 100),
  
  -- Temporal context
  hour_of_day INTEGER NOT NULL CHECK (hour_of_day BETWEEN 0 AND 23),
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  is_weekend BOOLEAN NOT NULL DEFAULT false,
  is_holiday BOOLEAN NOT NULL DEFAULT false,
  
  -- Events detected
  events JSONB DEFAULT '[]'::jsonb,
  
  -- Metadata
  weather TEXT,
  temperature NUMERIC,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_behavioral_observations_tenant_branch ON behavioral_observations(tenant_id, branch_id);
CREATE INDEX idx_behavioral_observations_location ON behavioral_observations(location_id, observed_at DESC);
CREATE INDEX idx_behavioral_observations_camera ON behavioral_observations(camera_id, observed_at DESC);
CREATE INDEX idx_behavioral_observations_temporal ON behavioral_observations(hour_of_day, day_of_week);

-- Behavioral profiles (learned patterns)
CREATE TABLE behavioral_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  location_id TEXT NOT NULL,
  camera_id TEXT NOT NULL,
  
  -- Baseline statistics
  baseline_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Temporal patterns
  hourly_patterns JSONB NOT NULL DEFAULT '{}'::jsonb,
  daily_patterns JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Incident history
  incident_history JSONB DEFAULT '[]'::jsonb,
  
  -- Learning metrics
  observation_count INTEGER NOT NULL DEFAULT 0,
  confidence NUMERIC NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
  
  -- Timestamps
  first_observation_at TIMESTAMPTZ,
  last_observation_at TIMESTAMPTZ,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(tenant_id, location_id, camera_id)
);

CREATE INDEX idx_behavioral_profiles_tenant_branch ON behavioral_profiles(tenant_id, branch_id);
CREATE INDEX idx_behavioral_profiles_confidence ON behavioral_profiles(confidence DESC);

-- Behavioral anomalies
CREATE TABLE behavioral_anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  location_id TEXT NOT NULL,
  camera_id TEXT NOT NULL,
  
  -- Detection
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  anomaly_score INTEGER NOT NULL CHECK (anomaly_score BETWEEN 0 AND 100),
  confidence NUMERIC NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  
  -- Deviations
  deviations JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Context
  expected_behavior TEXT,
  observed_behavior TEXT,
  
  -- Risk assessment
  risk_factors JSONB DEFAULT '[]'::jsonb,
  similar_incidents JSONB DEFAULT '[]'::jsonb,
  
  -- Resolution
  reviewed BOOLEAN NOT NULL DEFAULT false,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  false_positive BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_behavioral_anomalies_tenant_branch ON behavioral_anomalies(tenant_id, branch_id);
CREATE INDEX idx_behavioral_anomalies_detected_at ON behavioral_anomalies(detected_at DESC);
CREATE INDEX idx_behavioral_anomalies_score ON behavioral_anomalies(anomaly_score DESC);
CREATE INDEX idx_behavioral_anomalies_unreviewed ON behavioral_anomalies(reviewed) WHERE NOT reviewed;

-- ============================================================
-- Risk Heat Maps
-- ============================================================

-- Heat map snapshots
CREATE TABLE risk_heat_maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  
  -- Forecast
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  forecast_horizon_hours INTEGER NOT NULL,
  valid_until TIMESTAMPTZ NOT NULL,
  
  -- Grid configuration
  grid_resolution JSONB NOT NULL,
  dimensions JSONB NOT NULL,
  
  -- Risk grid (compressed)
  cells JSONB NOT NULL,
  
  -- Summary
  summary JSONB NOT NULL,
  hotspots JSONB DEFAULT '[]'::jsonb,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_risk_heat_maps_tenant_branch ON risk_heat_maps(tenant_id, branch_id);
CREATE INDEX idx_risk_heat_maps_valid ON risk_heat_maps(valid_until DESC) WHERE valid_until > now();
CREATE INDEX idx_risk_heat_maps_generated ON risk_heat_maps(generated_at DESC);

-- ============================================================
-- Patrol Planning
-- ============================================================

-- Patrol plans
CREATE TABLE patrol_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  
  -- Schedule
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ NOT NULL,
  
  -- Routes (serialized)
  routes JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Coverage analysis
  coverage JSONB NOT NULL,
  resources JSONB NOT NULL,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'cancelled')),
  activated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_patrol_plans_tenant_branch ON patrol_plans(tenant_id, branch_id);
CREATE INDEX idx_patrol_plans_status ON patrol_plans(status) WHERE status IN ('pending', 'active');
CREATE INDEX idx_patrol_plans_valid ON patrol_plans(valid_until DESC);

-- Patrol routes (individual)
CREATE TABLE patrol_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES patrol_plans(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Officer assignment
  officer_id TEXT NOT NULL,
  officer_name TEXT NOT NULL,
  
  -- Route details
  waypoints JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_duration INTEGER NOT NULL, -- minutes
  total_distance NUMERIC NOT NULL, -- meters
  
  -- Schedule
  start_time TIMESTAMPTZ NOT NULL,
  estimated_end_time TIMESTAMPTZ NOT NULL,
  actual_end_time TIMESTAMPTZ,
  
  -- Coverage
  areas_covered JSONB DEFAULT '[]'::jsonb,
  risk_mitigation_score NUMERIC NOT NULL DEFAULT 0,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'modified')),
  progress JSONB,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_patrol_routes_plan ON patrol_routes(plan_id);
CREATE INDEX idx_patrol_routes_officer ON patrol_routes(officer_id, start_time DESC);
CREATE INDEX idx_patrol_routes_status ON patrol_routes(status) WHERE status IN ('pending', 'active');

-- Patrol checkpoints (waypoint completion tracking)
CREATE TABLE patrol_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES patrol_routes(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Waypoint
  waypoint_id TEXT NOT NULL,
  waypoint_index INTEGER NOT NULL,
  location JSONB NOT NULL,
  
  -- Completion
  arrived_at TIMESTAMPTZ,
  departed_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  
  -- Observations
  observations TEXT,
  anomalies_found JSONB DEFAULT '[]'::jsonb,
  photos_taken INTEGER DEFAULT 0,
  
  -- Actions
  actions_completed JSONB DEFAULT '[]'::jsonb,
  issues_reported TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_patrol_checkpoints_route ON patrol_checkpoints(route_id, waypoint_index);
CREATE INDEX idx_patrol_checkpoints_arrival ON patrol_checkpoints(arrived_at DESC);

-- ============================================================
-- Security Intelligence Analytics
-- ============================================================

-- Incident predictions (time-series)
CREATE TABLE incident_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  location_id TEXT NOT NULL,
  
  -- Prediction
  predicted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  prediction_window_start TIMESTAMPTZ NOT NULL,
  prediction_window_end TIMESTAMPTZ NOT NULL,
  
  -- Risk assessment
  incident_probability NUMERIC NOT NULL CHECK (incident_probability BETWEEN 0 AND 1),
  risk_score INTEGER NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
  confidence NUMERIC NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  
  -- Incident type
  incident_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  
  -- Contributing factors
  risk_factors JSONB DEFAULT '[]'::jsonb,
  behavioral_indicators JSONB DEFAULT '[]'::jsonb,
  
  -- Recommendations
  recommended_actions JSONB DEFAULT '[]'::jsonb,
  
  -- Validation (was prediction accurate?)
  actual_incident_occurred BOOLEAN,
  actual_incident_id UUID,
  prediction_accuracy NUMERIC,
  validated_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_incident_predictions_tenant_branch ON incident_predictions(tenant_id, branch_id);
CREATE INDEX idx_incident_predictions_window ON incident_predictions(prediction_window_start, prediction_window_end);
CREATE INDEX idx_incident_predictions_probability ON incident_predictions(incident_probability DESC);
CREATE INDEX idx_incident_predictions_validation ON incident_predictions(actual_incident_occurred) WHERE actual_incident_occurred IS NOT NULL;

-- Security intelligence reports (daily summaries)
CREATE TABLE security_intelligence_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID,
  
  -- Report period
  report_date DATE NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('daily', 'weekly', 'monthly')),
  
  -- Risk summary
  overall_risk_score INTEGER NOT NULL CHECK (overall_risk_score BETWEEN 0 AND 100),
  risk_trend TEXT CHECK (risk_trend IN ('increasing', 'stable', 'decreasing')),
  
  -- Key metrics
  total_anomalies INTEGER NOT NULL DEFAULT 0,
  high_risk_predictions INTEGER NOT NULL DEFAULT 0,
  incidents_prevented INTEGER DEFAULT 0,
  patrol_effectiveness NUMERIC,
  
  -- Insights
  top_risk_areas JSONB DEFAULT '[]'::jsonb,
  behavioral_trends JSONB DEFAULT '[]'::jsonb,
  recommendations JSONB DEFAULT '[]'::jsonb,
  
  -- Full report (JSON)
  report_data JSONB NOT NULL,
  
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(tenant_id, branch_id, report_date, report_type)
);

CREATE INDEX idx_security_intelligence_reports_tenant ON security_intelligence_reports(tenant_id, report_date DESC);
CREATE INDEX idx_security_intelligence_reports_branch ON security_intelligence_reports(branch_id, report_date DESC);
CREATE INDEX idx_security_intelligence_reports_risk ON security_intelligence_reports(overall_risk_score DESC);

-- ============================================================
-- Comments
-- ============================================================

COMMENT ON TABLE behavioral_observations IS 'Raw behavioral observations from cameras for pattern learning';
COMMENT ON TABLE behavioral_profiles IS 'Learned behavioral patterns and baselines for each location';
COMMENT ON TABLE behavioral_anomalies IS 'Detected behavioral anomalies that deviate from learned patterns';
COMMENT ON TABLE risk_heat_maps IS 'Spatial risk heat maps showing incident probability by location';
COMMENT ON TABLE patrol_plans IS 'Optimized patrol plans based on predicted risk';
COMMENT ON TABLE patrol_routes IS 'Individual officer patrol routes with waypoints';
COMMENT ON TABLE patrol_checkpoints IS 'Checkpoint completion tracking for patrol routes';
COMMENT ON TABLE incident_predictions IS 'Time-series predictions of future incidents';
COMMENT ON TABLE security_intelligence_reports IS 'Periodic security intelligence summary reports';
```

---

## 7. API Implementation

### 7.1 REST API Routes

Create `src/routes/security-intelligence.routes.ts`:

```typescript
/**
 * Security Intelligence API Routes
 * 
 * Endpoints for predictive security intelligence, heat maps, and patrol planning
 */

import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { SecurityIntelligenceController } from '../controllers/security-intelligence.controller.js';

const router = Router();
const controller = new SecurityIntelligenceController();

// ============================================================
// Behavioral Learning
// ============================================================

/**
 * GET /api/security-intelligence/behavioral-profiles/:branchId
 * Get behavioral profiles for a branch
 */
router.get(
  '/behavioral-profiles/:branchId',
  authenticate,
  authorize('analytics:view'),
  controller.getBehavioralProfiles
);

/**
 * GET /api/security-intelligence/anomalies/:branchId
 * Get recent behavioral anomalies
 */
router.get(
  '/anomalies/:branchId',
  authenticate,
  authorize('analytics:view'),
  controller.getAnomalies
);

// ============================================================
// Risk Heat Maps
// ============================================================

/**
 * POST /api/security-intelligence/heat-map/generate
 * Generate risk heat map for a branch
 * 
 * Body:
 * {
 *   branchId: string;
 *   forecastHorizon?: number; // hours (default: 24)
 *   gridResolution?: { x: number; y: number; z: number };
 * }
 */
router.post(
  '/heat-map/generate',
  authenticate,
  authorize('analytics:view'),
  controller.generateHeatMap
);

/**
 * GET /api/security-intelligence/heat-map/:branchId/latest
 * Get latest heat map for a branch
 */
router.get(
  '/heat-map/:branchId/latest',
  authenticate,
  authorize('analytics:view'),
  controller.getLatestHeatMap
);

/**
 * GET /api/security-intelligence/heat-map/:heatMapId
 * Get specific heat map by ID
 */
router.get(
  '/heat-map/:heatMapId',
  authenticate,
  authorize('analytics:view'),
  controller.getHeatMap
);

// ============================================================
// Patrol Planning
// ============================================================

/**
 * POST /api/security-intelligence/patrol/generate
 * Generate optimal patrol plan
 * 
 * Body:
 * {
 *   branchId: string;
 *   forecastHorizon?: number;
 *   numOfficers?: number;
 *   duration?: number; // minutes
 * }
 */
router.post(
  '/patrol/generate',
  authenticate,
  authorize('analytics:manage'),
  controller.generatePatrolPlan
);

/**
 * GET /api/security-intelligence/patrol/plans/:branchId
 * Get patrol plans for a branch
 */
router.get(
  '/patrol/plans/:branchId',
  authenticate,
  authorize('analytics:view'),
  controller.getPatrolPlans
);

/**
 * POST /api/security-intelligence/patrol/routes/:routeId/activate
 * Activate a patrol route
 */
router.post(
  '/patrol/routes/:routeId/activate',
  authenticate,
  authorize('analytics:manage'),
  controller.activatePatrolRoute
);

/**
 * POST /api/security-intelligence/patrol/checkpoints/:routeId/complete
 * Complete a patrol checkpoint
 * 
 * Body:
 * {
 *   waypointId: string;
 *   observations?: string;
 *   anomaliesFound?: any[];
 *   actionsCompleted?: string[];
 * }
 */
router.post(
  '/patrol/checkpoints/:routeId/complete',
  authenticate,
  authorize('analytics:manage'),
  controller.completeCheckpoint
);

// ============================================================
// Predictions
// ============================================================

/**
 * GET /api/security-intelligence/predictions/:branchId
 * Get incident predictions for a branch
 */
router.get(
  '/predictions/:branchId',
  authenticate,
  authorize('analytics:view'),
  controller.getIncidentPredictions
);

/**
 * POST /api/security-intelligence/predictions/validate
 * Validate a prediction after incident occurs (or doesn't)
 * 
 * Body:
 * {
 *   predictionId: string;
 *   incidentOccurred: boolean;
 *   actualIncidentId?: string;
 * }
 */
router.post(
  '/predictions/validate',
  authenticate,
  authorize('analytics:manage'),
  controller.validatePrediction
);

// ============================================================
// Intelligence Reports
// ============================================================

/**
 * GET /api/security-intelligence/reports/:branchId
 * Get security intelligence reports
 */
router.get(
  '/reports/:branchId',
  authenticate,
  authorize('analytics:view'),
  controller.getReports
);

/**
 * POST /api/security-intelligence/reports/generate
 * Generate a new intelligence report
 */
router.post(
  '/reports/generate',
  authenticate,
  authorize('analytics:manage'),
  controller.generateReport
);

// ============================================================
// Real-time WebSocket
// ============================================================

/**
 * WebSocket endpoint for real-time risk updates
 * ws://server/api/security-intelligence/realtime/:branchId
 */

export default router;
```

---

## 8. Analytics Engine Integration

Update `analytics-engine/src/app.ts` to integrate SecurityGPT:

```typescript
// Import new engines
import { createBehavioralLearningEngine } from './detectors/behavioral-learning-engine.js';
import { RiskHeatMapService } from './services/risk-heatmap.service.js';
import { PatrolOptimizerService } from './services/patrol-optimizer.service.js';

// Initialize engines
const behavioralEngine = createBehavioralLearningEngine();
const heatMapService = new RiskHeatMapService(behavioralEngine, predictionEngine);
const patrolOptimizer = new PatrolOptimizerService(heatMapService, branchStore);

// Register with analytics pipeline
analyticsPipeline.registerDetector(behavioralEngine);

// Start background jobs
startSecurityIntelligenceJobs();

function startSecurityIntelligenceJobs() {
  // Generate heat maps every hour
  setInterval(async () => {
    const branches = await getAllActiveBranches();
    for (const branch of branches) {
      await heatMapService.generateHeatMap(branch.tenantId, branch.id, 24);
    }
  }, 3600000); // 1 hour
  
  // Generate patrol plans twice per day
  setInterval(async () => {
    const branches = await getAllActiveBranches();
    for (const branch of branches) {
      await patrolOptimizer.generatePatrolPlan(branch.tenantId, branch.id, {
        forecastHorizon: 12,
        duration: 60
      });
    }
  }, 43200000); // 12 hours
}
```

---

## 9. Dashboard & Visualization

### 9.1 3D Heat Map Component

Create `dashboard/components/security-intelligence/RiskHeatMap3D.tsx`:

```typescript
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

interface Props {
  heatMap: any; // RiskHeatMap type
  onCellClick?: (cell: any) => void;
}

export function RiskHeatMap3D({ heatMap, onCellClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  
  useEffect(() => {
    if (!containerRef.current) return;
    
    // Initialize Three.js scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    sceneRef.current = scene;
    
    const camera = new THREE.PerspectiveCamera(
      75,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(50, 50, 50);
    
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    
    // Add controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    
    // Add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 10);
    scene.add(directionalLight);
    
    // Render heat map cells
    renderHeatMap(scene, heatMap);
    
    // Animation loop
    function animate() {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();
    
    // Cleanup
    return () => {
      renderer.dispose();
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, [heatMap]);
  
  function renderHeatMap(scene: THREE.Scene, heatMap: any) {
    const cellSize = 5; // meters
    
    for (const cell of heatMap.cells) {
      const geometry = new THREE.BoxGeometry(cellSize, cell.riskScore / 10, cellSize);
      
      // Color based on risk score
      const color = getRiskColor(cell.riskScore);
      const material = new THREE.MeshPhongMaterial({
        color,
        transparent: true,
        opacity: 0.8
      });
      
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(
        cell.x * cellSize,
        (cell.riskScore / 10) / 2,
        cell.y * cellSize
      );
      
      mesh.userData = cell;
      scene.add(mesh);
    }
  }
  
  function getRiskColor(riskScore: number): number {
    if (riskScore >= 80) return 0xff0000; // Red
    if (riskScore >= 65) return 0xff6600; // Orange
    if (riskScore >= 50) return 0xffcc00; // Yellow
    return 0x00ff00; // Green
  }
  
  return (
    <div ref={containerRef} style={{ width: '100%', height: '600px' }} />
  );
}
```

### 9.2 Patrol Route Visualizer

Create `dashboard/components/security-intelligence/PatrolRouteMap.tsx`:

```typescript
import React from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

interface Props {
  patrolPlan: any; // PatrolPlan type
  onWaypointClick?: (waypoint: any) => void;
}

export function PatrolRouteMap({ patrolPlan, onWaypointClick }: Props) {
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
  
  return (
    <MapContainer
      center={[0, 0]} // TODO: Use branch coordinates
      zoom={18}
      style={{ height: '500px', width: '100%' }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap contributors'
      />
      
      {patrolPlan.routes.map((route: any, index: number) => (
        <React.Fragment key={route.id}>
          {/* Route polyline */}
          <Polyline
            positions={route.waypoints.map((w: any) => [w.location.y, w.location.x])}
            color={colors[index % colors.length]}
            weight={3}
          />
          
          {/* Waypoint markers */}
          {route.waypoints.map((waypoint: any, wpIndex: number) => (
            <Marker
              key={waypoint.id}
              position={[waypoint.location.y, waypoint.location.x]}
              eventHandlers={{
                click: () => onWaypointClick?.(waypoint)
              }}
            >
              <Popup>
                <div>
                  <h3>{waypoint.location.name}</h3>
                  <p>Risk Score: {waypoint.riskScore}</p>
                  <p>Priority: {waypoint.priority}</p>
                  <p>Duration: {waypoint.estimatedDuration} min</p>
                  <ul>
                    {waypoint.actions.map((action: string, i: number) => (
                      <li key={i}>{action}</li>
                    ))}
                  </ul>
                </div>
              </Popup>
            </Marker>
          ))}
        </React.Fragment>
      ))}
    </MapContainer>
  );
}
```

---

## 10. Deployment Guide

### 10.1 Prerequisites

- PostgreSQL 14+ with TimescaleDB extension
- Node.js 18+
- Redis 6+
- Docker (optional)

### 10.2 Installation Steps

```bash
# 1. Install dependencies
npm install three three-stdlib leaflet react-leaflet

# 2. Run database migration
npm run migrate up

# 3. Build analytics engine
cd analytics-engine
npm run build

# 4. Start services
npm run start:analytics-engine

# 5. Start API server
npm run start:api

# 6. Start dashboard
npm run start:dashboard
```

### 10.3 Configuration

Create `.env` file:

```env
# Behavioral Learning
BEHAVIORAL_LEARNING_ENABLED=true
BEHAVIORAL_MIN_OBSERVATIONS=100
BEHAVIORAL_ANOMALY_THRESHOLD=2.5

# Risk Prediction
RISK_PREDICTION_HORIZONS=24,48,72
RISK_UPDATE_INTERVAL=3600

# Heat Maps
HEATMAP_GRID_RESOLUTION_X=10
HEATMAP_GRID_RESOLUTION_Y=10
HEATMAP_GRID_RESOLUTION_Z=1
HEATMAP_UPDATE_INTERVAL=3600

# Patrol Planning
PATROL_OPTIMIZATION_ENABLED=true
PATROL_DEFAULT_DURATION=60
PATROL_PLAN_FREQUENCY=43200

# Performance
WORKER_THREADS=4
MAX_CONCURRENT_PREDICTIONS=10
```

---

## 11. Performance Optimization

### 11.1 Caching Strategy

```typescript
// Redis caching for heat maps
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

async function getCachedHeatMap(key: string): Promise<RiskHeatMap | null> {
  const cached = await redis.get(`heatmap:${key}`);
  return cached ? JSON.parse(cached) : null;
}

async function cacheHeatMap(key: string, heatMap: RiskHeatMap): Promise<void> {
  await redis.setex(
    `heatmap:${key}`,
    3600, // 1 hour TTL
    JSON.stringify(heatMap)
  );
}
```

### 11.2 Query Optimization

```sql
-- Index for fast behavioral lookups
CREATE INDEX CONCURRENTLY idx_behavioral_obs_location_time 
ON behavioral_observations(location_id, observed_at DESC) 
INCLUDE (person_count, motion_level);

-- Partitioning for large tables
CREATE TABLE behavioral_observations_y2024m01 PARTITION OF behavioral_observations
FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
```

---

## 12. Security & Privacy

### 12.1 Data Retention

```typescript
// Auto-delete old observations (keep 90 days)
async function pruneOldObservations() {
  await db.query(`
    DELETE FROM behavioral_observations
    WHERE observed_at < now() - interval '90 days'
  `);
}

// Schedule daily cleanup
cron.schedule('0 2 * * *', pruneOldObservations);
```

### 12.2 Access Control

```typescript
// Role-based access
const permissions = {
  'security-intelligence:view': ['admin', 'security-manager', 'operator'],
  'security-intelligence:manage': ['admin', 'security-manager'],
  'patrol:manage': ['admin', 'security-manager', 'patrol-supervisor']
};
```

---

## Summary

This implementation provides:

1. **Behavioral Learning Engine** - Learns normal patterns for each location
2. **Risk Prediction** - Forecasts incidents 24-48 hours in advance
3. **3D Risk Heat Maps** - Real-time spatial risk visualization
4. **Patrol Optimization** - Auto-generates optimal patrol routes
5. **Real-time Intelligence** - WebSocket updates for dynamic risk changes
6. **Comprehensive Analytics** - Reports, trends, and actionable insights

### Next Steps

1. Implement the behavioral learning engine
2. Create database migration and run it
3. Integrate with existing analytics pipeline
4. Build dashboard visualizations
5. Test with real-world data
6. Train security teams on the system
7. Monitor and refine prediction accuracy

The system shifts security from reactive to **predictive**, enabling prevention rather than response.
