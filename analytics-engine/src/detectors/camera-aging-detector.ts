/**
 * Camera Aging and Health Prediction Detector
 * Predicts camera failure risk and aging score
 * 
 * Features:
 * - Camera age estimation
 * - Failure risk prediction
 * - Health degradation tracking
 * - Maintenance recommendations
 * - Replacement priority scoring
 */

import { BaseDetector, type DetectionFrame, type DetectionResult } from "./base-detector.js";

export interface CameraAgingMetrics {
  estimatedAgeYears: number;
  failureRiskScore: number; // 0-100
  healthScore: number; // 0-100
  degradationRate: number; // Quality decline per month
  operationalHours?: number;
  restartCount?: number;
  temperatureAverageC?: number;
}

export interface MaintenanceRecommendation {
  priority: 'low' | 'medium' | 'high' | 'critical';
  action: string;
  estimatedCostUSD?: number;
  urgencyDays: number;
  reason: string;
}

interface CameraAgingHistory {
  cameraId: string;
  firstSeen: Date;
  qualityScoreHistory: Array<{ timestamp: Date; score: number }>;
  failureIndicators: {
    signalDropouts: number;
    qualityDegradationEvents: number;
    connectivityIssues: number;
    overheatingEvents: number;
  };
  lastMaintenanceDate?: Date;
  installationDate?: Date;
  estimatedAgeYears: number;
  failureRiskScore: number;
  healthScore: number;
  replacementPriority: number; // 0-100
}

export class CameraAgingDetector extends BaseDetector {
  private cameraHistory = new Map<string, CameraAgingHistory>();
  
  // Configuration
  private readonly QUALITY_HISTORY_DAYS = 90;
  private readonly DEGRADATION_THRESHOLD = 5; // Quality points per month
  private readonly HIGH_RISK_AGE_YEARS = 7;
  private readonly CRITICAL_RISK_AGE_YEARS = 10;
  private readonly HEALTH_CHECK_INTERVAL_MS = 3600000; // 1 hour

  constructor() {
    super("camera-aging", "1.0.0");
  }

  async initialize(): Promise<void> {
    console.log("Initializing camera aging detector...");
    
    // Start periodic health check
    this.startPeriodicHealthCheck();
  }

  async detect(frame: DetectionFrame): Promise<DetectionResult[]> {
    const results: DetectionResult[] = [];
    
    // Get or create camera history
    let history = this.cameraHistory.get(frame.cameraId);
    if (!history) {
      history = {
        cameraId: frame.cameraId,
        firstSeen: frame.timestamp,
        qualityScoreHistory: [],
        failureIndicators: {
          signalDropouts: 0,
          qualityDegradationEvents: 0,
          connectivityIssues: 0,
          overheatingEvents: 0,
        },
        estimatedAgeYears: 0,
        failureRiskScore: 0,
        healthScore: 100,
        replacementPriority: 0,
      };
      this.cameraHistory.set(frame.cameraId, history);
    }

    // Calculate current quality score from frame metadata
    const qualityScore = this.calculateFrameQualityScore(frame);
    
    // Add to quality history
    history.qualityScoreHistory.push({
      timestamp: frame.timestamp,
      score: qualityScore,
    });
    
    // Keep only recent history
    const cutoffDate = new Date(frame.timestamp.getTime() - this.QUALITY_HISTORY_DAYS * 24 * 60 * 60 * 1000);
    history.qualityScoreHistory = history.qualityScoreHistory.filter(
      h => h.timestamp >= cutoffDate
    );

    // Update aging metrics
    this.updateAgingMetrics(history, frame.timestamp);

    // Check for critical aging issues
    if (history.failureRiskScore > 80) {
      results.push({
        detectionType: "camera-critical-aging",
        confidence: 0.90,
        objects: [],
        metadata: {
          cameraId: frame.cameraId,
          failureRiskScore: history.failureRiskScore,
          healthScore: history.healthScore,
          estimatedAgeYears: history.estimatedAgeYears,
          recommendedAction: "Immediate replacement recommended",
          replacementPriority: history.replacementPriority,
        },
        requiresAlert: true,
      });
    } else if (history.failureRiskScore > 60) {
      results.push({
        detectionType: "camera-high-aging-risk",
        confidence: 0.85,
        objects: [],
        metadata: {
          cameraId: frame.cameraId,
          failureRiskScore: history.failureRiskScore,
          healthScore: history.healthScore,
          estimatedAgeYears: history.estimatedAgeYears,
          recommendedAction: "Plan replacement within 6 months",
          replacementPriority: history.replacementPriority,
        },
        requiresAlert: true,
      });
    }

    return results;
  }

  /**
   * Calculate frame quality score
   */
  private calculateFrameQualityScore(frame: DetectionFrame): number {
    let score = 100;
    
    // Check for quality indicators in metadata
    const metadata = frame.metadata as any;
    
    // Brightness issues
    if (metadata?.brightness !== undefined) {
      if (metadata.brightness < 20 || metadata.brightness > 235) {
        score -= 15;
      }
    }
    
    // Noise/snow
    if (metadata?.noise !== undefined) {
      if (metadata.noise > 30) {
        score -= 20;
      } else if (metadata.noise > 15) {
        score -= 10;
      }
    }
    
    // Sharpness
    if (metadata?.sharpness !== undefined) {
      if (metadata.sharpness < 20) {
        score -= 15;
      }
    }
    
    // Signal quality
    if (metadata?.signalStrength !== undefined) {
      if (metadata.signalStrength < 50) {
        score -= 20;
      } else if (metadata.signalStrength < 70) {
        score -= 10;
      }
    }
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Update aging metrics
   */
  private updateAgingMetrics(history: CameraAgingHistory, currentTime: Date): void {
    // Estimate camera age
    if (history.installationDate) {
      const ageMs = currentTime.getTime() - history.installationDate.getTime();
      history.estimatedAgeYears = ageMs / (365.25 * 24 * 60 * 60 * 1000);
    } else {
      // Estimate based on first seen
      const observedMs = currentTime.getTime() - history.firstSeen.getTime();
      const observedYears = observedMs / (365.25 * 24 * 60 * 60 * 1000);
      // Assume camera was already in use when first observed
      history.estimatedAgeYears = observedYears + 2; // Add 2 years baseline
    }

    // Calculate degradation rate
    const degradationRate = this.calculateDegradationRate(history);

    // Calculate health score
    history.healthScore = this.calculateHealthScore(history, degradationRate);

    // Calculate failure risk score
    history.failureRiskScore = this.calculateFailureRisk(history, degradationRate);

    // Calculate replacement priority
    history.replacementPriority = this.calculateReplacementPriority(history);
  }

  /**
   * Calculate quality degradation rate (points per month)
   */
  private calculateDegradationRate(history: CameraAgingHistory): number {
    if (history.qualityScoreHistory.length < 10) return 0;

    // Compare recent vs older quality scores
    const recent = history.qualityScoreHistory.slice(-30); // Last 30 frames
    const older = history.qualityScoreHistory.slice(-90, -30); // Previous 60 frames

    if (older.length === 0 || recent.length === 0) return 0;

    const recentAvg = recent.reduce((sum, h) => sum + h.score, 0) / recent.length;
    const olderAvg = older.reduce((sum, h) => sum + h.score, 0) / older.length;

    // Calculate time span in months
    const timeSpanMs = recent[recent.length - 1]!.timestamp.getTime() - older[0]!.timestamp.getTime();
    const timeSpanMonths = timeSpanMs / (30.44 * 24 * 60 * 60 * 1000);

    if (timeSpanMonths < 0.1) return 0;

    const qualityDrop = olderAvg - recentAvg;
    return qualityDrop / timeSpanMonths;
  }

  /**
   * Calculate overall health score
   */
  private calculateHealthScore(history: CameraAgingHistory, degradationRate: number): number {
    let healthScore = 100;

    // Age factor
    if (history.estimatedAgeYears > this.CRITICAL_RISK_AGE_YEARS) {
      healthScore -= 40;
    } else if (history.estimatedAgeYears > this.HIGH_RISK_AGE_YEARS) {
      healthScore -= 25;
    } else if (history.estimatedAgeYears > 5) {
      healthScore -= 10;
    }

    // Degradation rate factor
    if (degradationRate > 10) {
      healthScore -= 30;
    } else if (degradationRate > this.DEGRADATION_THRESHOLD) {
      healthScore -= 15;
    }

    // Failure indicators
    healthScore -= history.failureIndicators.signalDropouts * 2;
    healthScore -= history.failureIndicators.qualityDegradationEvents * 3;
    healthScore -= history.failureIndicators.connectivityIssues * 2;
    healthScore -= history.failureIndicators.overheatingEvents * 5;

    // Current quality
    if (history.qualityScoreHistory.length > 0) {
      const recentScores = history.qualityScoreHistory.slice(-5);
      const avgRecentQuality = recentScores.reduce((sum, h) => sum + h.score, 0) / recentScores.length;
      
      if (avgRecentQuality < 50) {
        healthScore -= 20;
      } else if (avgRecentQuality < 70) {
        healthScore -= 10;
      }
    }

    return Math.max(0, Math.min(100, healthScore));
  }

  /**
   * Calculate failure risk score (0-100)
   */
  private calculateFailureRisk(history: CameraAgingHistory, degradationRate: number): number {
    let riskScore = 0;

    // Age is the primary risk factor
    if (history.estimatedAgeYears > this.CRITICAL_RISK_AGE_YEARS) {
      riskScore += 50;
    } else if (history.estimatedAgeYears > this.HIGH_RISK_AGE_YEARS) {
      riskScore += 30;
    } else if (history.estimatedAgeYears > 5) {
      riskScore += 15;
    } else {
      riskScore += history.estimatedAgeYears * 2;
    }

    // Rapid degradation indicates imminent failure
    if (degradationRate > 15) {
      riskScore += 30;
    } else if (degradationRate > this.DEGRADATION_THRESHOLD) {
      riskScore += 15;
    }

    // Failure indicators
    riskScore += Math.min(20, history.failureIndicators.signalDropouts * 3);
    riskScore += Math.min(20, history.failureIndicators.qualityDegradationEvents * 2);
    riskScore += Math.min(15, history.failureIndicators.connectivityIssues * 2);
    riskScore += Math.min(15, history.failureIndicators.overheatingEvents * 4);

    // Low health score increases risk
    if (history.healthScore < 40) {
      riskScore += 20;
    } else if (history.healthScore < 60) {
      riskScore += 10;
    }

    return Math.max(0, Math.min(100, riskScore));
  }

  /**
   * Calculate replacement priority (0-100)
   */
  private calculateReplacementPriority(history: CameraAgingHistory): number {
    let priority = 0;

    // Failure risk is primary factor
    priority += history.failureRiskScore * 0.6;

    // Health score (inverse)
    priority += (100 - history.healthScore) * 0.3;

    // Age factor
    if (history.estimatedAgeYears > this.CRITICAL_RISK_AGE_YEARS) {
      priority += 10;
    }

    return Math.max(0, Math.min(100, priority));
  }

  /**
   * Get maintenance recommendations
   */
  getMaintenanceRecommendations(cameraId: string): MaintenanceRecommendation[] {
    const history = this.cameraHistory.get(cameraId);
    if (!history) return [];

    const recommendations: MaintenanceRecommendation[] = [];

    // Critical replacement
    if (history.failureRiskScore > 80) {
      recommendations.push({
        priority: 'critical',
        action: 'Replace camera immediately',
        estimatedCostUSD: 150,
        urgencyDays: 7,
        reason: `Camera age: ${history.estimatedAgeYears.toFixed(1)} years, failure risk: ${history.failureRiskScore}%`,
      });
    }

    // High priority replacement
    else if (history.failureRiskScore > 60) {
      recommendations.push({
        priority: 'high',
        action: 'Plan camera replacement',
        estimatedCostUSD: 150,
        urgencyDays: 180,
        reason: `High failure risk (${history.failureRiskScore}%), plan replacement within 6 months`,
      });
    }

    // Medium priority inspection
    else if (history.failureRiskScore > 40 || history.healthScore < 70) {
      recommendations.push({
        priority: 'medium',
        action: 'Schedule maintenance inspection',
        estimatedCostUSD: 50,
        urgencyDays: 90,
        reason: `Moderate health decline, inspection recommended`,
      });
    }

    // Signal quality issues
    if (history.failureIndicators.signalDropouts > 5) {
      recommendations.push({
        priority: 'high',
        action: 'Check cable connections and signal quality',
        estimatedCostUSD: 75,
        urgencyDays: 30,
        reason: `${history.failureIndicators.signalDropouts} signal dropout events detected`,
      });
    }

    // Overheating issues
    if (history.failureIndicators.overheatingEvents > 2) {
      recommendations.push({
        priority: 'high',
        action: 'Inspect camera housing and ventilation',
        estimatedCostUSD: 100,
        urgencyDays: 14,
        reason: `${history.failureIndicators.overheatingEvents} overheating events - may damage camera`,
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * Record failure indicator
   */
  recordFailureIndicator(
    cameraId: string,
    type: 'signalDropout' | 'qualityDegradation' | 'connectivity' | 'overheating'
  ): void {
    const history = this.cameraHistory.get(cameraId);
    if (!history) return;

    switch (type) {
      case 'signalDropout':
        history.failureIndicators.signalDropouts++;
        break;
      case 'qualityDegradation':
        history.failureIndicators.qualityDegradationEvents++;
        break;
      case 'connectivity':
        history.failureIndicators.connectivityIssues++;
        break;
      case 'overheating':
        history.failureIndicators.overheatingEvents++;
        break;
    }
  }

  /**
   * Set camera installation date
   */
  setCameraInstallationDate(cameraId: string, installationDate: Date): void {
    let history = this.cameraHistory.get(cameraId);
    if (!history) {
      history = {
        cameraId,
        firstSeen: new Date(),
        qualityScoreHistory: [],
        failureIndicators: {
          signalDropouts: 0,
          qualityDegradationEvents: 0,
          connectivityIssues: 0,
          overheatingEvents: 0,
        },
        estimatedAgeYears: 0,
        failureRiskScore: 0,
        healthScore: 100,
        replacementPriority: 0,
      };
      this.cameraHistory.set(cameraId, history);
    }
    history.installationDate = installationDate;
  }

  /**
   * Get aging metrics for camera
   */
  getCameraAgingMetrics(cameraId: string): CameraAgingMetrics | null {
    const history = this.cameraHistory.get(cameraId);
    if (!history) return null;

    const degradationRate = this.calculateDegradationRate(history);

    return {
      estimatedAgeYears: history.estimatedAgeYears,
      failureRiskScore: history.failureRiskScore,
      healthScore: history.healthScore,
      degradationRate,
    };
  }

  /**
   * Get all cameras sorted by replacement priority
   */
  getCamerasByReplacementPriority(): Array<{
    cameraId: string;
    replacementPriority: number;
    failureRiskScore: number;
    healthScore: number;
    estimatedAgeYears: number;
  }> {
    const cameras: Array<{
      cameraId: string;
      replacementPriority: number;
      failureRiskScore: number;
      healthScore: number;
      estimatedAgeYears: number;
    }> = [];

    for (const [cameraId, history] of this.cameraHistory.entries()) {
      cameras.push({
        cameraId,
        replacementPriority: history.replacementPriority,
        failureRiskScore: history.failureRiskScore,
        healthScore: history.healthScore,
        estimatedAgeYears: history.estimatedAgeYears,
      });
    }

    return cameras.sort((a, b) => b.replacementPriority - a.replacementPriority);
  }

  /**
   * Start periodic health check
   */
  private startPeriodicHealthCheck(): void {
    setInterval(() => {
      const now = new Date();
      
      // Update all camera metrics
      for (const history of this.cameraHistory.values()) {
        this.updateAgingMetrics(history, now);
      }
    }, this.HEALTH_CHECK_INTERVAL_MS);
  }

  async cleanup(): Promise<void> {
    this.cameraHistory.clear();
    console.log("Camera aging detector cleaned up");
  }

  getHealth() {
    const criticalCameras = Array.from(this.cameraHistory.values()).filter(
      h => h.failureRiskScore > 80
    ).length;

    return {
      status: criticalCameras > 0 ? ("degraded" as const) : ("healthy" as const),
      details: `Monitoring ${this.cameraHistory.size} cameras, ${criticalCameras} at critical risk`,
    };
  }
}
