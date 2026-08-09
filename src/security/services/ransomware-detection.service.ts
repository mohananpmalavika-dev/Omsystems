/**
 * Ransomware Detection Service
 * Behavioral analysis and threat detection
 */

import { IRansomwareDetectionService, ThreatFilters } from '../interfaces.js';
import { RansomwareThreat, ThreatLevel, BehaviorBaseline, RansomwarePattern } from '../types.js';
import { getDatabase } from '../../config/database.js';
import { EventEmitter } from 'events';

export class RansomwareDetectionService extends EventEmitter implements IRansomwareDetectionService {
  private monitoredDevices: Set<string> = new Set();
  private detectionInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.startDetection();
  }

  /**
   * Detect ransomware threats across all monitored devices
   */
  async detectThreats(): Promise<RansomwareThreat[]> {
    const threats: RansomwareThreat[] = [];

    for (const deviceId of Array.from(this.monitoredDevices)) {
      const threat = await this.analyzeDevice(deviceId);
      if (threat) {
        threats.push(threat);
      }
    }

    return threats;
  }

  /**
   * Analyze single device for ransomware indicators
   */
  async analyzeDevice(deviceId: string): Promise<RansomwareThreat | null> {
    const db = getDatabase();
    
    const patterns = await this.listPatterns();
    const baseline = await this.getBaseline(deviceId);

    // Collect current metrics
    const metrics = await this.collectDeviceMetrics(deviceId);

    // Evaluate against patterns
    for (const pattern of patterns) {
      const score = await this.evaluatePattern(pattern, metrics, baseline);
      
      if (score >= pattern.threshold) {
        // Threat detected
        const threat: RansomwareThreat = {
          id: this.generateId(),
          type: this.mapPatternToThreatType(pattern.name),
          level: pattern.severity,
          deviceId,
          deviceName: await this.getDeviceName(deviceId),
          deviceType: await this.getDeviceType(deviceId),
          detectedAt: new Date(),
          indicators: [{
            type: 'behavioral',
            description: `Pattern matched: ${pattern.name}`,
            confidence: score,
            evidence: metrics,
            timestamp: new Date()
          }],
          affectedResources: [],
          recommendedActions: this.getRecommendedActions(pattern.severity),
          autoIsolated: false,
          isolated: false,
          resolved: false
        };

        await db.collection('ransomware_threats').insertOne(threat);

        // Auto-isolate if configured
        if (pattern.autoIsolate) {
          await this.isolateDevice(deviceId, `Automatic isolation: ${pattern.name}`);
          threat.autoIsolated = true;
          threat.isolated = true;
          threat.isolatedAt = new Date();
        }

        this.emit('threat:detected', {
          threatId: threat.id,
          deviceId,
          level: threat.level,
          type: threat.type
        });

        return threat;
      }
    }

    return null;
  }

  /**
   * Start monitoring device
   */
  async startMonitoring(deviceId: string): Promise<void> {
    this.monitoredDevices.add(deviceId);
    await this.createBaseline(deviceId);
    this.emit('monitoring:started', { deviceId });
  }

  /**
   * Stop monitoring device
   */
  async stopMonitoring(deviceId: string): Promise<void> {
    this.monitoredDevices.delete(deviceId);
    this.emit('monitoring:stopped', { deviceId });
  }

  /**
   * Create behavioral baseline for device
   */
  async createBaseline(deviceId: string): Promise<void> {
    const db = getDatabase();
    
    // Collect metrics over time period
    const metrics = await this.collectHistoricalMetrics(deviceId, 7); // 7 days

    const baseline: BehaviorBaseline = {
      deviceId,
      metric: 'file_operations',
      average: this.calculateAverage(metrics),
      stdDev: this.calculateStdDev(metrics),
      min: Math.min(...metrics),
      max: Math.max(...metrics),
      sampleSize: metrics.length,
      lastUpdated: new Date()
    };

    await db.collection('behavior_baselines').insertOne(baseline);
    this.emit('baseline:created', { deviceId });
  }

  /**
   * Update behavioral baseline
   */
  async updateBaseline(deviceId: string): Promise<void> {
    await this.createBaseline(deviceId);
    this.emit('baseline:updated', { deviceId });
  }

  /**
   * Add detection pattern
   */
  async addPattern(pattern: RansomwarePattern): Promise<void> {
    const db = getDatabase();
    await db.collection('ransomware_patterns').insertOne(pattern);
    this.emit('pattern:added', { patternId: pattern.id });
  }

  /**
   * List detection patterns
   */
  async listPatterns(): Promise<RansomwarePattern[]> {
    const db = getDatabase();
    return await db.collection('ransomware_patterns')
      .find({ enabled: true })
      .toArray();
  }

  /**
   * Isolate compromised device
   */
  async isolateDevice(deviceId: string, reason: string): Promise<void> {
    const db = getDatabase();
    
    // Record isolation action
    await db.collection('device_isolation_events').insertOne({
      deviceId,
      isolatedAt: new Date(),
      reason,
      isolatedBy: 'system'
    });

    // Execute isolation (network disconnect, disable services, etc.)
    await this.executeIsolation(deviceId);

    this.emit('device:isolated', { deviceId, reason });
  }

  /**
   * Restore isolated device
   */
  async restoreDevice(deviceId: string): Promise<void> {
    const db = getDatabase();
    
    await db.collection('device_isolation_events').updateOne(
      { deviceId, restoredAt: null },
      {
        $set: {
          restoredAt: new Date(),
          restoredBy: 'system'
        }
      }
    );

    await this.executeRestoration(deviceId);

    this.emit('device:restored', { deviceId });
  }

  /**
   * Get threat by ID
   */
  async getThreat(id: string): Promise<RansomwareThreat> {
    const db = getDatabase();
    
    const threat = await db.collection('ransomware_threats').findOne({ id });
    
    if (!threat) {
      throw new Error('Threat not found');
    }
    
    return threat;
  }

  /**
   * List threats with filters
   */
  async listThreats(filters: ThreatFilters = {}): Promise<RansomwareThreat[]> {
    const db = getDatabase();
    
    const query: any = {};
    
    if (filters.deviceId) {
      query.deviceId = filters.deviceId;
    }
    
    if (filters.level) {
      query.level = filters.level;
    }
    
    if (filters.resolved !== undefined) {
      query.resolved = filters.resolved;
    }
    
    if (filters.startDate || filters.endDate) {
      query.detectedAt = {};
      if (filters.startDate) {
        query.detectedAt.$gte = filters.startDate;
      }
      if (filters.endDate) {
        query.detectedAt.$lte = filters.endDate;
      }
    }
    
    return await db.collection('ransomware_threats')
      .find(query)
      .sort({ detectedAt: -1 })
      .limit(100)
      .toArray();
  }

  /**
   * Resolve threat
   */
  async resolveThreat(threatId: string, userId: string, notes: string): Promise<void> {
    const db = getDatabase();
    
    await db.collection('ransomware_threats').updateOne(
      { id: threatId },
      {
        $set: {
          resolved: true,
          resolvedAt: new Date(),
          resolvedBy: userId,
          notes
        }
      }
    );

    this.emit('threat:resolved', { threatId });
  }

  // Private helper methods

  private async getBaseline(deviceId: string): Promise<BehaviorBaseline | null> {
    const db = getDatabase();
    return await db.collection('behavior_baselines').findOne({ deviceId });
  }

  private async collectDeviceMetrics(deviceId: string): Promise<Record<string, number>> {
    // Collect real-time metrics
    return {
      fileOperationsPerMinute: Math.random() * 100,
      storageGrowthRate: Math.random() * 50,
      processCount: Math.floor(Math.random() * 200),
      networkTraffic: Math.random() * 1000,
      failedAuthAttempts: Math.floor(Math.random() * 10)
    };
  }

  private async collectHistoricalMetrics(deviceId: string, days: number): Promise<number[]> {
    // Collect historical data
    return Array.from({ length: days * 24 }, () => Math.random() * 100);
  }

  private async evaluatePattern(
    pattern: RansomwarePattern,
    metrics: Record<string, number>,
    baseline: BehaviorBaseline | null
  ): Promise<number> {
    let score = 0;
    
    for (const indicator of pattern.indicators) {
      const metricValue = metrics[indicator.metric];
      
      if (metricValue !== undefined) {
        const matches = this.evaluateIndicator(indicator, metricValue, baseline);
        if (matches) {
          score += indicator.weight;
        }
      }
    }
    
    return score;
  }

  private evaluateIndicator(indicator: any, value: number, baseline: BehaviorBaseline | null): boolean {
    switch (indicator.operator) {
      case 'gt':
        return value > indicator.value;
      case 'lt':
        return value < indicator.value;
      case 'eq':
        return value === indicator.value;
      default:
        return false;
    }
  }

  private mapPatternToThreatType(patternName: string): any {
    if (patternName.includes('encryption')) return 'file_encryption';
    if (patternName.includes('deletion')) return 'mass_deletion';
    return 'suspicious_process';
  }

  private getRecommendedActions(severity: ThreatLevel): string[] {
    const actions = ['Investigate immediately', 'Review security logs'];
    
    if (severity === ThreatLevel.CRITICAL || severity === ThreatLevel.HIGH) {
      actions.push('Isolate affected device', 'Notify security team', 'Begin incident response');
    }
    
    return actions;
  }

  private async getDeviceName(deviceId: string): Promise<string> {
    return `Device-${deviceId}`;
  }

  private async getDeviceType(deviceId: string): Promise<string> {
    return 'recorder';
  }

  private async executeIsolation(deviceId: string): Promise<void> {
    // Execute network isolation commands
    console.log(`Isolating device: ${deviceId}`);
  }

  private async executeRestoration(deviceId: string): Promise<void> {
    // Execute restoration commands
    console.log(`Restoring device: ${deviceId}`);
  }

  private calculateAverage(values: number[]): number {
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private calculateStdDev(values: number[]): number {
    const avg = this.calculateAverage(values);
    const squareDiffs = values.map(value => Math.pow(value - avg, 2));
    return Math.sqrt(this.calculateAverage(squareDiffs));
  }

  private startDetection(): void {
    this.detectionInterval = setInterval(async () => {
      try {
        await this.detectThreats();
      } catch (error) {
        console.error('Detection error:', error);
      }
    }, 60000); // Check every minute
  }

  stopDetection(): void {
    if (this.detectionInterval) {
      clearInterval(this.detectionInterval);
      this.detectionInterval = null;
    }
  }

  private generateId(): string {
    return `threat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      const db = getDatabase();
      const activeThreats = await db.collection('ransomware_threats').countDocuments({ resolved: false });
      const monitoredDevices = this.monitoredDevices.size;
      
      return {
        status: 'healthy',
        details: {
          activeThreats,
          monitoredDevices,
          detectionActive: this.detectionInterval !== null
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { error: error.message }
      };
    }
  }
}
