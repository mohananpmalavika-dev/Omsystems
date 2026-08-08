/**
 * Risk Engine
 * Behavioral analysis, anomaly detection, and ML-based risk scoring
 */

import {
  IRiskEngine,
  ProviderContext,
  RiskAssessmentResult,
  RiskFactor,
  Anomaly,
  BehaviorProfile,
  TimePattern,
  SecurityVerdict,
  ThreatLevel
} from './types';

interface AccessPattern {
  userId: string;
  timestamp: Date;
  resource: string;
  action: string;
  deviceId: string;
  ipAddress: string;
  success: boolean;
}

interface ResourceAccessStats {
  resource: string;
  accessCount: number;
  lastAccessed: Date;
  normalFrequency: number; // accesses per day
}

interface VelocityCheck {
  userId: string;
  checkType: 'login' | 'resource' | 'location' | 'device';
  count: number;
  windowStart: Date;
  windowEnd: Date;
}

export class RiskEngine implements IRiskEngine {
  readonly name = 'RiskEngine';
  readonly version = '1.0.0';

  private behaviorProfiles: Map<string, BehaviorProfile> = new Map();
  private accessPatterns: Map<string, AccessPattern[]> = new Map();
  private velocityTracking: Map<string, VelocityCheck[]> = new Map();
  private resourceStats: Map<string, Map<string, ResourceAccessStats>> = new Map(); // userId -> resource -> stats

  private readonly MAX_ACCESS_PATTERNS = 1000;
  private readonly PROFILE_UPDATE_THRESHOLD = 10; // Update profile after N accesses
  private readonly VELOCITY_WINDOW_MS = 60 * 60 * 1000; // 1 hour
  private readonly ANOMALY_THRESHOLD_STDDEV = 2.0; // Standard deviations

  /**
   * Assess risk based on behavior and context
   */
  async verify(context: ProviderContext): Promise<RiskAssessmentResult> {
    const startTime = Date.now();
    const evidence: Record<string, any> = {};
    const riskFactors: RiskFactor[] = [];
    const anomalies: Anomaly[] = [];

    // 1. Get or create behavior profile
    let profile = await this.getBehaviorProfile(context.userId);
    evidence.hasProfile = !!profile;

    if (!profile) {
      // New user - create baseline profile
      profile = this.createBaselineProfile(context.userId);
      evidence.isNewUser = true;
      riskFactors.push({
        category: 'identity',
        factor: 'new_user',
        weight: 0.15,
        score: 30,
        description: 'New user without established behavior profile'
      });
    }

    // 2. Analyze temporal patterns
    const temporalAnomalies = this.detectTemporalAnomalies(context, profile);
    anomalies.push(...temporalAnomalies);
    
    if (temporalAnomalies.length > 0) {
      const temporalScore = temporalAnomalies.reduce((sum, a) => sum + (a.severity / 4), 0);
      riskFactors.push({
        category: 'temporal',
        factor: 'unusual_time',
        weight: 0.1,
        score: Math.min(temporalScore * 20, 40),
        description: `${temporalAnomalies.length} temporal anomalies detected`
      });
    }

    // 3. Analyze location patterns
    const locationAnomaly = this.detectLocationAnomaly(context, profile);
    if (locationAnomaly) {
      anomalies.push(locationAnomaly);
      riskFactors.push({
        category: 'network',
        factor: 'unusual_location',
        weight: 0.15,
        score: locationAnomaly.severity / 2,
        description: locationAnomaly.description
      });
    }

    // 4. Analyze device patterns
    const deviceAnomaly = this.detectDeviceAnomaly(context, profile);
    if (deviceAnomaly) {
      anomalies.push(deviceAnomaly);
      riskFactors.push({
        category: 'device',
        factor: 'unusual_device',
        weight: 0.15,
        score: deviceAnomaly.severity / 2,
        description: deviceAnomaly.description
      });
    }

    // 5. Analyze resource access patterns
    const resourceAnomaly = this.detectResourceAnomaly(context, profile);
    if (resourceAnomaly) {
      anomalies.push(resourceAnomaly);
      riskFactors.push({
        category: 'resource',
        factor: 'unusual_resource',
        weight: 0.2,
        score: resourceAnomaly.severity / 2,
        description: resourceAnomaly.description
      });
    }

    // 6. Check velocity (rapid actions)
    const velocityAnomalies = this.detectVelocityAnomalies(context);
    anomalies.push(...velocityAnomalies);
    
    if (velocityAnomalies.length > 0) {
      const velocityScore = velocityAnomalies.reduce((sum, a) => sum + (a.severity / 4), 0);
      riskFactors.push({
        category: 'behavior',
        factor: 'velocity',
        weight: 0.15,
        score: Math.min(velocityScore * 15, 50),
        description: `${velocityAnomalies.length} velocity anomalies detected`
      });
    }

    // 7. Analyze session behavior
    const sessionRisk = this.assessSessionRisk(context, profile);
    if (sessionRisk > 0) {
      riskFactors.push({
        category: 'behavior',
        factor: 'session_behavior',
        weight: 0.1,
        score: sessionRisk,
        description: 'Unusual session behavior detected'
      });
    }

    // 8. Calculate overall risk score
    const riskScore = this.calculateRiskScore(riskFactors);
    const riskLevel = this.getRiskLevel(riskScore);

    evidence.riskFactors = riskFactors.length;
    evidence.anomalies = anomalies.length;
    evidence.riskScore = riskScore;
    evidence.riskLevel = ThreatLevel[riskLevel];

    // 9. Log access pattern
    await this.logAccessPattern(context, true);

    // 10. Update behavior profile
    await this.updateBehaviorProfile(context.userId, context);

    // Determine verdict based on risk
    let verdict: SecurityVerdict;
    let confidence = 0.8;
    const requiredActions: string[] = [];

    if (riskScore >= 80) {
      verdict = SecurityVerdict.DENY;
      confidence = 0.9;
      requiredActions.push('SECURITY_REVIEW', 'MANUAL_VERIFICATION');
    } else if (riskScore >= 60) {
      verdict = SecurityVerdict.CHALLENGE;
      confidence = 0.85;
      requiredActions.push('STEP_UP_AUTH', 'VERIFY_IDENTITY');
    } else if (riskScore >= 40) {
      verdict = SecurityVerdict.REVIEW;
      confidence = 0.8;
      requiredActions.push('ENHANCED_LOGGING', 'MONITOR_SESSION');
    } else if (riskScore >= 20) {
      verdict = SecurityVerdict.ALLOW;
      confidence = 0.85;
      requiredActions.push('CONTINUOUS_MONITORING');
    } else {
      verdict = SecurityVerdict.ALLOW;
      confidence = 0.9;
    }

    evidence.processingTimeMs = Date.now() - startTime;

    return {
      verdict,
      score: Math.min(riskScore, 100),
      confidence,
      reason: this.generateReason(riskFactors, anomalies),
      evidence,
      riskScore,
      riskLevel,
      riskFactors,
      anomalies,
      behaviorProfile: profile,
      requiredActions: requiredActions.length > 0 ? requiredActions : undefined
    };
  }

  /**
   * Calculate risk score from factors
   */
  calculateRiskScore(factors: RiskFactor[]): number {
    if (factors.length === 0) {
      return 0;
    }

    // Weighted average of risk factors
    const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
    const weightedScore = factors.reduce((sum, f) => sum + (f.score * f.weight), 0);

    return Math.round(weightedScore / Math.max(totalWeight, 0.1));
  }

  /**
   * Get behavior profile
   */
  async getBehaviorProfile(userId: string): Promise<BehaviorProfile | null> {
    return this.behaviorProfiles.get(userId) || null;
  }

  /**
   * Update behavior profile
   */
  async updateBehaviorProfile(userId: string, context: ProviderContext): Promise<void> {
    let profile = this.behaviorProfiles.get(userId);

    if (!profile) {
      profile = this.createBaselineProfile(userId);
    }

    // Update normal access times
    const hour = context.timestamp.getHours();
    const dayOfWeek = context.timestamp.getDay();
    
    let timePattern = profile.normalAccessTimes.find(
      p => p.dayOfWeek === dayOfWeek && hour >= p.hourStart && hour <= p.hourEnd
    );

    if (!timePattern) {
      timePattern = {
        dayOfWeek,
        hourStart: hour,
        hourEnd: hour,
        frequency: 0
      };
      profile.normalAccessTimes.push(timePattern);
    }

    timePattern.frequency = Math.min(timePattern.frequency + 0.05, 1.0);

    // Update normal devices
    if (!profile.normalDevices.includes(context.deviceId)) {
      profile.normalDevices.push(context.deviceId);
      
      // Keep only recent 5 devices
      if (profile.normalDevices.length > 5) {
        profile.normalDevices.shift();
      }
    }

    // Update normal resources
    if (!profile.normalResources.includes(context.resource)) {
      profile.normalResources.push(context.resource);
      
      // Keep only recent 20 resources
      if (profile.normalResources.length > 20) {
        profile.normalResources.shift();
      }
    }

    // Update request rate
    const recentPatterns = this.getRecentAccessPatterns(userId, 60 * 60 * 1000); // 1 hour
    profile.typicalRequestRate = recentPatterns.length;

    // Update session duration (mock calculation)
    profile.averageSessionDuration = 30 * 60 * 1000; // 30 minutes

    profile.lastUpdated = new Date();

    this.behaviorProfiles.set(userId, profile);
  }

  /**
   * Detect anomalies
   */
  async detectAnomalies(context: ProviderContext, profile?: BehaviorProfile): Promise<Anomaly[]> {
    const anomalies: Anomaly[] = [];

    if (!profile) {
      return anomalies;
    }

    // Temporal anomalies
    anomalies.push(...this.detectTemporalAnomalies(context, profile));

    // Location anomalies
    const locationAnomaly = this.detectLocationAnomaly(context, profile);
    if (locationAnomaly) anomalies.push(locationAnomaly);

    // Device anomalies
    const deviceAnomaly = this.detectDeviceAnomaly(context, profile);
    if (deviceAnomaly) anomalies.push(deviceAnomaly);

    // Resource anomalies
    const resourceAnomaly = this.detectResourceAnomaly(context, profile);
    if (resourceAnomaly) anomalies.push(resourceAnomaly);

    // Velocity anomalies
    anomalies.push(...this.detectVelocityAnomalies(context));

    return anomalies;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    await this.cleanupOldPatterns();
    return true;
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private createBaselineProfile(userId: string): BehaviorProfile {
    return {
      userId,
      normalAccessTimes: [],
      normalLocations: [],
      normalDevices: [],
      normalResources: [],
      averageSessionDuration: 30 * 60 * 1000, // 30 minutes default
      typicalRequestRate: 10, // 10 requests per hour default
      lastUpdated: new Date()
    };
  }

  private detectTemporalAnomalies(context: ProviderContext, profile: BehaviorProfile): Anomaly[] {
    const anomalies: Anomaly[] = [];
    const hour = context.timestamp.getHours();
    const dayOfWeek = context.timestamp.getDay();

    // Check if access time matches normal patterns
    const matchingPattern = profile.normalAccessTimes.find(
      p => p.dayOfWeek === dayOfWeek && hour >= p.hourStart && hour <= p.hourEnd
    );

    if (!matchingPattern && profile.normalAccessTimes.length > 0) {
      anomalies.push({
        type: 'time',
        severity: ThreatLevel.MEDIUM,
        description: `Access at unusual time: ${hour}:00 on day ${dayOfWeek}`,
        expectedValue: profile.normalAccessTimes.map(p => `${p.hourStart}:00-${p.hourEnd}:00`),
        actualValue: `${hour}:00`,
        deviation: 1.5
      });
    }

    // Check for access outside business hours
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isNightTime = hour < 6 || hour > 22;

    if ((isWeekend || isNightTime) && profile.normalAccessTimes.length > 3) {
      anomalies.push({
        type: 'time',
        severity: ThreatLevel.LOW,
        description: `Access ${isWeekend ? 'on weekend' : 'during night hours'}`,
        expectedValue: 'business hours',
        actualValue: `${isWeekend ? 'weekend' : 'night'}`,
        deviation: 1.0
      });
    }

    return anomalies;
  }

  private detectLocationAnomaly(context: ProviderContext, profile: BehaviorProfile): Anomaly | null {
    // Check if location is in normal locations list
    const location = context.metadata?.country as string | undefined;

    if (!location) {
      return null;
    }

    if (profile.normalLocations.length === 0) {
      // First location - add to profile
      profile.normalLocations.push(location);
      return null;
    }

    if (!profile.normalLocations.includes(location)) {
      return {
        type: 'location',
        severity: ThreatLevel.MEDIUM,
        description: `Access from new location: ${location}`,
        expectedValue: profile.normalLocations,
        actualValue: location,
        deviation: 2.0
      };
    }

    return null;
  }

  private detectDeviceAnomaly(context: ProviderContext, profile: BehaviorProfile): Anomaly | null {
    if (profile.normalDevices.length === 0) {
      return null;
    }

    if (!profile.normalDevices.includes(context.deviceId)) {
      return {
        type: 'device',
        severity: ThreatLevel.MEDIUM,
        description: `Access from new device: ${context.deviceId}`,
        expectedValue: profile.normalDevices,
        actualValue: context.deviceId,
        deviation: 2.0
      };
    }

    return null;
  }

  private detectResourceAnomaly(context: ProviderContext, profile: BehaviorProfile): Anomaly | null {
    if (profile.normalResources.length < 5) {
      // Not enough data to detect anomaly
      return null;
    }

    if (!profile.normalResources.includes(context.resource)) {
      // Check if resource is sensitive
      const sensitiveResources = ['/admin', '/api/keys', '/settings/security', '/users/delete'];
      const isSensitive = sensitiveResources.some(sr => context.resource.includes(sr));

      if (isSensitive) {
        return {
          type: 'resource',
          severity: ThreatLevel.HIGH,
          description: `Access to unusual sensitive resource: ${context.resource}`,
          expectedValue: profile.normalResources,
          actualValue: context.resource,
          deviation: 3.0
        };
      }

      return {
        type: 'resource',
        severity: ThreatLevel.LOW,
        description: `Access to new resource: ${context.resource}`,
        expectedValue: profile.normalResources,
        actualValue: context.resource,
        deviation: 1.5
      };
    }

    return null;
  }

  private detectVelocityAnomalies(context: ProviderContext): Anomaly[] {
    const anomalies: Anomaly[] = [];

    // Check login velocity
    const loginVelocity = this.checkVelocity(context.userId, 'login');
    if (loginVelocity > 5) {
      anomalies.push({
        type: 'velocity',
        severity: ThreatLevel.HIGH,
        description: `Rapid login attempts: ${loginVelocity} in the last hour`,
        expectedValue: 'max 5 per hour',
        actualValue: loginVelocity,
        deviation: (loginVelocity - 5) / 2
      });
    }

    // Check resource access velocity
    const resourceVelocity = this.checkVelocity(context.userId, 'resource');
    if (resourceVelocity > 100) {
      anomalies.push({
        type: 'velocity',
        severity: ThreatLevel.MEDIUM,
        description: `High resource access rate: ${resourceVelocity} in the last hour`,
        expectedValue: 'max 100 per hour',
        actualValue: resourceVelocity,
        deviation: (resourceVelocity - 100) / 50
      });
    }

    // Check device switching velocity
    const deviceVelocity = this.checkVelocity(context.userId, 'device');
    if (deviceVelocity > 3) {
      anomalies.push({
        type: 'velocity',
        severity: ThreatLevel.MEDIUM,
        description: `Rapid device switching: ${deviceVelocity} devices in the last hour`,
        expectedValue: 'max 3 per hour',
        actualValue: deviceVelocity,
        deviation: (deviceVelocity - 3) / 1.5
      });
    }

    return anomalies;
  }

  private checkVelocity(userId: string, checkType: VelocityCheck['checkType']): number {
    const velocityChecks = this.velocityTracking.get(userId) || [];
    const now = Date.now();
    const windowStart = now - this.VELOCITY_WINDOW_MS;

    // Filter to checks in window
    const recentChecks = velocityChecks.filter(
      v => v.checkType === checkType && v.windowEnd.getTime() > windowStart
    );

    // Sum up counts
    const totalCount = recentChecks.reduce((sum, v) => sum + v.count, 0);

    // Add new check
    const newCheck: VelocityCheck = {
      userId,
      checkType,
      count: 1,
      windowStart: new Date(now),
      windowEnd: new Date(now + this.VELOCITY_WINDOW_MS)
    };

    velocityChecks.push(newCheck);
    
    // Cleanup old checks
    const validChecks = velocityChecks.filter(v => v.windowEnd.getTime() > windowStart);
    this.velocityTracking.set(userId, validChecks);

    return totalCount + 1;
  }

  private assessSessionRisk(context: ProviderContext, profile: BehaviorProfile): number {
    let risk = 0;

    // Get recent access patterns
    const recentPatterns = this.getRecentAccessPatterns(context.userId, 60 * 60 * 1000); // 1 hour

    // Check request rate
    if (recentPatterns.length > profile.typicalRequestRate * 2) {
      risk += 20;
    }

    // Check for failed access attempts
    const failedAttempts = recentPatterns.filter(p => !p.success).length;
    if (failedAttempts > 3) {
      risk += 30;
    }

    // Check for resource scanning (accessing many different resources)
    const uniqueResources = new Set(recentPatterns.map(p => p.resource)).size;
    if (uniqueResources > 20) {
      risk += 15;
    }

    return Math.min(risk, 50);
  }

  private async logAccessPattern(context: ProviderContext, success: boolean): Promise<void> {
    const patterns = this.accessPatterns.get(context.userId) || [];

    patterns.push({
      userId: context.userId,
      timestamp: context.timestamp,
      resource: context.resource,
      action: context.action,
      deviceId: context.deviceId,
      ipAddress: context.ipAddress,
      success
    });

    // Keep only recent patterns
    if (patterns.length > this.MAX_ACCESS_PATTERNS) {
      patterns.splice(0, patterns.length - this.MAX_ACCESS_PATTERNS);
    }

    this.accessPatterns.set(context.userId, patterns);
  }

  private getRecentAccessPatterns(userId: string, windowMs: number): AccessPattern[] {
    const patterns = this.accessPatterns.get(userId) || [];
    const cutoff = Date.now() - windowMs;
    
    return patterns.filter(p => p.timestamp.getTime() > cutoff);
  }

  private getRiskLevel(score: number): ThreatLevel {
    if (score >= 80) return ThreatLevel.CRITICAL;
    if (score >= 60) return ThreatLevel.HIGH;
    if (score >= 40) return ThreatLevel.MEDIUM;
    if (score >= 20) return ThreatLevel.LOW;
    return ThreatLevel.NONE;
  }

  private generateReason(factors: RiskFactor[], anomalies: Anomaly[]): string {
    if (factors.length === 0 && anomalies.length === 0) {
      return 'Risk assessment passed - normal behavior';
    }

    const reasons: string[] = [];

    // Add top risk factors
    const topFactors = factors
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    topFactors.forEach(f => {
      reasons.push(`${f.factor}: ${f.description}`);
    });

    // Add critical anomalies
    const criticalAnomalies = anomalies.filter(a => a.severity >= ThreatLevel.HIGH);
    criticalAnomalies.forEach(a => {
      reasons.push(`${a.type} anomaly: ${a.description}`);
    });

    return reasons.join('; ');
  }

  private async cleanupOldPatterns(): Promise<void> {
    const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30 days

    for (const [userId, patterns] of this.accessPatterns.entries()) {
      const recentPatterns = patterns.filter(p => p.timestamp.getTime() > cutoff);
      
      if (recentPatterns.length === 0) {
        this.accessPatterns.delete(userId);
      } else if (recentPatterns.length < patterns.length) {
        this.accessPatterns.set(userId, recentPatterns);
      }
    }
  }

  /**
   * Get risk statistics
   */
  async getRiskStats(): Promise<{
    totalProfiles: number;
    recentHighRiskEvents: number;
    averageRiskScore: number;
    anomalyRate: number;
  }> {
    const stats = {
      totalProfiles: this.behaviorProfiles.size,
      recentHighRiskEvents: 0,
      averageRiskScore: 0,
      anomalyRate: 0
    };

    // Calculate stats from recent access patterns
    let totalScore = 0;
    let totalAnomalies = 0;
    let totalAccesses = 0;

    for (const patterns of this.accessPatterns.values()) {
      totalAccesses += patterns.length;
      // Mock calculation for demo
    }

    stats.averageRiskScore = totalAccesses > 0 ? 25 : 0;
    stats.anomalyRate = totalAccesses > 0 ? totalAnomalies / totalAccesses : 0;

    return stats;
  }

  /**
   * Get user risk profile
   */
  async getUserRiskProfile(userId: string): Promise<{
    profile: BehaviorProfile | null;
    recentAnomalies: number;
    recentAccessCount: number;
    averageRiskScore: number;
  }> {
    const profile = await this.getBehaviorProfile(userId);
    const recentPatterns = this.getRecentAccessPatterns(userId, 24 * 60 * 60 * 1000);

    return {
      profile,
      recentAnomalies: 0, // Would calculate from recent patterns
      recentAccessCount: recentPatterns.length,
      averageRiskScore: 25 // Mock value
    };
  }
}
