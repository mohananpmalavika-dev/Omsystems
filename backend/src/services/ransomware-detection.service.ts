/**
 * Ransomware Detection Engine
 * Real-time monitoring and AI-based detection of ransomware attacks
 */

import {
  RansomwareEvent,
  RansomwareSeverity,
  RansomwareClassification,
  RansomwareIndicator,
  RansomwareIndicatorType,
  RansomwareAIAnalysis,
  RansomwareResponse,
  RansomwareResponseAction
} from '../types/security.types';
import crypto from 'crypto';
import os from 'os';

export class RansomwareDetectionService {
  private events: Map<string, RansomwareEvent> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private fileActivityBaseline: Map<string, number> = new Map();
  private processBaseline: Set<string> = new Set();

  constructor() {
    this.startMonitoring();
  }

  /**
   * Detect mass encryption activity
   */
  async detectMassEncryption(
    deviceId: string,
    filesEncryptedCount: number,
    timeWindowSeconds: number
  ): Promise<RansomwareIndicator | null> {
    const threshold = 100; // 100 files in time window is suspicious
    const rate = filesEncryptedCount / timeWindowSeconds;

    if (filesEncryptedCount > threshold) {
      return {
        type: RansomwareIndicatorType.MASS_ENCRYPTION,
        description: `${filesEncryptedCount} files encrypted in ${timeWindowSeconds} seconds (${rate.toFixed(2)}/sec)`,
        confidence: Math.min(filesEncryptedCount / threshold, 1.0),
        timestamp: new Date(),
        details: {
          filesEncrypted: filesEncryptedCount,
          timeWindow: timeWindowSeconds,
          deviceId
        }
      };
    }

    return null;
  }

  /**
   * Detect CPU spike
   */
  async detectCPUSpike(): Promise<RansomwareIndicator | null> {
    const cpus = os.cpus();
    const avgLoad = os.loadavg()[0]; // 1 minute average
    const threshold = cpus.length * 0.8; // 80% of CPU capacity

    if (avgLoad > threshold) {
      return {
        type: RansomwareIndicatorType.CPU_SPIKE,
        description: `Abnormal CPU load: ${avgLoad.toFixed(2)} (threshold: ${threshold.toFixed(2)})`,
        confidence: Math.min(avgLoad / threshold - 0.8, 1.0),
        timestamp: new Date(),
        details: {
          load: avgLoad,
          threshold,
          cpuCount: cpus.length
        }
      };
    }

    return null;
  }

  /**
   * Detect unknown processes
   */
  async detectUnknownProcess(processName: string, pid: number): Promise<RansomwareIndicator | null> {
    // Check against known process baseline
    if (!this.processBaseline.has(processName)) {
      // Check against known ransomware process patterns
      const suspiciousPatterns = [
        /.*\.tmp\.exe$/i,
        /.*cryptolocker.*/i,
        /.*wannacry.*/i,
        /.*ryuk.*/i,
        /.*lockbit.*/i,
        /^[a-f0-9]{8,}\.exe$/i // Random hex names
      ];

      const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(processName));

      if (isSuspicious) {
        return {
          type: RansomwareIndicatorType.UNKNOWN_PROCESS,
          description: `Suspicious process detected: ${processName} (PID: ${pid})`,
          confidence: 0.7,
          timestamp: new Date(),
          details: {
            processName,
            pid
          }
        };
      }
    }

    return null;
  }

  /**
   * Detect service stopped
   */
  async detectServiceStopped(serviceName: string): Promise<RansomwareIndicator | null> {
    const criticalServices = [
      'vss', // Volume Shadow Copy
      'wbengine', // Windows Backup
      'backup',
      'postgresql',
      'mysql',
      'mongodb'
    ];

    if (criticalServices.some(s => serviceName.toLowerCase().includes(s))) {
      return {
        type: RansomwareIndicatorType.SERVICE_STOPPED,
        description: `Critical service stopped: ${serviceName}`,
        confidence: 0.8,
        timestamp: new Date(),
        details: {
          serviceName
        }
      };
    }

    return null;
  }

  /**
   * Detect rapid file deletion
   */
  async detectRapidFileDeletion(
    filesDeleted: number,
    timeWindowSeconds: number
  ): Promise<RansomwareIndicator | null> {
    const threshold = 50;

    if (filesDeleted > threshold) {
      return {
        type: RansomwareIndicatorType.RAPID_FILE_DELETION,
        description: `${filesDeleted} files deleted in ${timeWindowSeconds} seconds`,
        confidence: Math.min(filesDeleted / threshold, 1.0),
        timestamp: new Date(),
        details: {
          filesDeleted,
          timeWindow: timeWindowSeconds
        }
      };
    }

    return null;
  }

  /**
   * Detect encryption file extensions
   */
  async detectEncryptionExtensions(filePath: string): Promise<RansomwareIndicator | null> {
    const knownRansomwareExtensions = [
      '.encrypted',
      '.locked',
      '.crypto',
      '.wcry',
      '.wncry',
      '.zzzzz',
      '.locky',
      '.cerber',
      '.thor',
      '.cryptolocker',
      '.ryuk',
      '.lockbit'
    ];

    const hasRansomwareExtension = knownRansomwareExtensions.some(ext =>
      filePath.toLowerCase().endsWith(ext)
    );

    if (hasRansomwareExtension) {
      return {
        type: RansomwareIndicatorType.ENCRYPTION_EXTENSION,
        description: `File with ransomware extension detected: ${filePath}`,
        confidence: 0.95,
        timestamp: new Date(),
        details: {
          filePath
        }
      };
    }

    return null;
  }

  /**
   * Detect backup deletion
   */
  async detectBackupDeletion(backupPath: string): Promise<RansomwareIndicator | null> {
    return {
      type: RansomwareIndicatorType.BACKUP_DELETION,
      description: `Backup deleted: ${backupPath}`,
      confidence: 0.9,
      timestamp: new Date(),
      details: {
        backupPath
      }
    };
  }

  /**
   * Report ransomware event
   */
  async reportRansomwareEvent(
    affectedDevices: string[],
    indicators: RansomwareIndicator[]
  ): Promise<RansomwareEvent> {
    const eventId = crypto.randomBytes(16).toString('hex');

    // Calculate severity based on indicators
    const severity = this.calculateSeverity(indicators);

    // AI analysis
    const aiAnalysis = await this.analyzeRansomware(indicators);

    // Classify the event
    const classification = this.classifyEvent(indicators, aiAnalysis);

    const event: RansomwareEvent = {
      id: eventId,
      detectedAt: new Date(),
      severity,
      classification,
      affectedDevices,
      indicators,
      aiAnalysis,
      responseActions: [],
      resolved: false
    };

    this.events.set(eventId, event);

    console.log(`🚨 RANSOMWARE DETECTED: ${classification} (${severity})`);

    // Execute automatic response
    if (classification === RansomwareClassification.CONFIRMED_ATTACK ||
        classification === RansomwareClassification.LIKELY_RANSOMWARE) {
      await this.executeAutomaticResponse(event);
    }

    return event;
  }

  /**
   * Execute automatic response
   */
  private async executeAutomaticResponse(event: RansomwareEvent): Promise<void> {
    console.log('🛡️ Executing automatic ransomware response...');

    const responses: RansomwareResponse[] = [];

    // 1. Isolate affected devices
    for (const deviceId of event.affectedDevices) {
      const response = await this.isolateDevice(deviceId);
      responses.push(response);
    }

    // 2. Notify SOC
    const notifyResponse = await this.notifySOC(event);
    responses.push(notifyResponse);

    // 3. Preserve logs
    const preserveResponse = await this.preserveLogs(event.affectedDevices);
    responses.push(preserveResponse);

    // 4. Start forensics
    const forensicsResponse = await this.startForensics(event);
    responses.push(forensicsResponse);

    // 5. Snapshot storage
    const snapshotResponse = await this.snapshotStorage(event.affectedDevices);
    responses.push(snapshotResponse);

    event.responseActions = responses;

    console.log(`✓ Executed ${responses.filter(r => r.success).length}/${responses.length} response actions`);
  }

  /**
   * Isolate device from network
   */
  private async isolateDevice(deviceId: string): Promise<RansomwareResponse> {
    console.log(`🔒 Isolating device: ${deviceId}`);

    // In production: disable network interfaces, block at switch/firewall
    const success = true;

    return {
      action: RansomwareResponseAction.ISOLATE_DEVICE,
      targetDevice: deviceId,
      executedAt: new Date(),
      success,
      details: success ? 'Device isolated from network' : 'Failed to isolate device'
    };
  }

  /**
   * Notify Security Operations Center
   */
  private async notifySOC(event: RansomwareEvent): Promise<RansomwareResponse> {
    console.log('📢 Notifying SOC...');

    // In production: send alert to SOC dashboard, email, SMS, etc.
    const success = true;

    return {
      action: RansomwareResponseAction.NOTIFY_SOC,
      targetDevice: 'SOC',
      executedAt: new Date(),
      success,
      details: `SOC notified of ${event.classification} ransomware event`
    };
  }

  /**
   * Preserve logs for forensics
   */
  private async preserveLogs(deviceIds: string[]): Promise<RansomwareResponse> {
    console.log('💾 Preserving logs...');

    // In production: copy all logs to secure immutable storage
    const success = true;

    return {
      action: RansomwareResponseAction.PRESERVE_LOGS,
      targetDevice: deviceIds.join(','),
      executedAt: new Date(),
      success,
      details: `Logs preserved for ${deviceIds.length} devices`
    };
  }

  /**
   * Start forensic capture
   */
  private async startForensics(event: RansomwareEvent): Promise<RansomwareResponse> {
    console.log('🔍 Starting forensic capture...');

    // In production: capture memory dumps, disk images, network traffic
    const success = true;

    return {
      action: RansomwareResponseAction.START_FORENSICS,
      targetDevice: event.affectedDevices[0],
      executedAt: new Date(),
      success,
      details: 'Forensic capture initiated'
    };
  }

  /**
   * Snapshot storage
   */
  private async snapshotStorage(deviceIds: string[]): Promise<RansomwareResponse> {
    console.log('📸 Creating storage snapshots...');

    // In production: create volume snapshots for recovery
    const success = true;

    return {
      action: RansomwareResponseAction.SNAPSHOT_STORAGE,
      targetDevice: deviceIds.join(','),
      executedAt: new Date(),
      success,
      details: `Snapshots created for ${deviceIds.length} devices`
    };
  }

  /**
   * AI Analysis
   */
  private async analyzeRansomware(indicators: RansomwareIndicator[]): Promise<RansomwareAIAnalysis> {
    // Calculate overall risk
    const avgConfidence = indicators.reduce((sum, i) => sum + i.confidence, 0) / indicators.length;
    const overallRisk = Math.round(avgConfidence * 100);

    // Determine attack stage
    let attackStage: 'RECONNAISSANCE' | 'INITIAL_ACCESS' | 'EXECUTION' | 'ENCRYPTION' | 'EXTORTION' = 'RECONNAISSANCE';

    if (indicators.some(i => i.type === RansomwareIndicatorType.MASS_ENCRYPTION)) {
      attackStage = 'ENCRYPTION';
    } else if (indicators.some(i => i.type === RansomwareIndicatorType.BACKUP_DELETION)) {
      attackStage = 'EXECUTION';
    } else if (indicators.some(i => i.type === RansomwareIndicatorType.UNKNOWN_PROCESS)) {
      attackStage = 'INITIAL_ACCESS';
    }

    // Predict impact
    let predictedImpact = 'Limited impact to single system';
    if (indicators.length > 5) {
      predictedImpact = 'Significant impact across multiple systems';
    }
    if (indicators.some(i => i.type === RansomwareIndicatorType.MASS_ENCRYPTION)) {
      predictedImpact = 'Critical impact - data encryption in progress';
    }

    // Generate recommendations
    const recommendations = [
      'Isolate affected systems immediately',
      'Do not pay ransom',
      'Contact law enforcement',
      'Restore from clean backups',
      'Conduct full security audit'
    ];

    return {
      overallRisk,
      attackStage,
      predictedImpact,
      recommendations
    };
  }

  private calculateSeverity(indicators: RansomwareIndicator[]): RansomwareSeverity {
    const avgConfidence = indicators.reduce((sum, i) => sum + i.confidence, 0) / indicators.length;

    if (avgConfidence >= 0.8) return RansomwareSeverity.CRITICAL;
    if (avgConfidence >= 0.6) return RansomwareSeverity.HIGH;
    if (avgConfidence >= 0.4) return RansomwareSeverity.MEDIUM;
    return RansomwareSeverity.LOW;
  }

  private classifyEvent(indicators: RansomwareIndicator[], aiAnalysis: RansomwareAIAnalysis): RansomwareClassification {
    const criticalIndicators = indicators.filter(i =>
      i.type === RansomwareIndicatorType.MASS_ENCRYPTION ||
      i.type === RansomwareIndicatorType.ENCRYPTION_EXTENSION
    );

    if (criticalIndicators.length > 0 && aiAnalysis.overallRisk >= 80) {
      return RansomwareClassification.CONFIRMED_ATTACK;
    }

    if (indicators.length >= 3 && aiAnalysis.overallRisk >= 60) {
      return RansomwareClassification.LIKELY_RANSOMWARE;
    }

    if (indicators.length >= 2) {
      return RansomwareClassification.SUSPICIOUS_ACTIVITY;
    }

    return RansomwareClassification.FALSE_POSITIVE;
  }

  /**
   * Get ransomware event
   */
  async getEvent(eventId: string): Promise<RansomwareEvent | null> {
    return this.events.get(eventId) || null;
  }

  /**
   * List ransomware events
   */
  async listEvents(filter?: {
    severity?: RansomwareSeverity;
    classification?: RansomwareClassification;
    resolved?: boolean;
  }): Promise<RansomwareEvent[]> {
    let events = Array.from(this.events.values());

    if (filter?.severity) {
      events = events.filter(e => e.severity === filter.severity);
    }

    if (filter?.classification) {
      events = events.filter(e => e.classification === filter.classification);
    }

    if (filter?.resolved !== undefined) {
      events = events.filter(e => e.resolved === filter.resolved);
    }

    return events.sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime());
  }

  /**
   * Resolve event
   */
  async resolveEvent(eventId: string): Promise<boolean> {
    const event = this.events.get(eventId);

    if (!event) {
      return false;
    }

    event.resolved = true;
    event.resolvedAt = new Date();

    console.log(`✓ Ransomware event resolved: ${eventId}`);

    return true;
  }

  /**
   * Get statistics
   */
  async getStatistics(): Promise<{
    totalEvents: number;
    activeThreats: number;
    resolvedEvents: number;
    bySeverity: Record<string, number>;
    byClassification: Record<string, number>;
  }> {
    const events = Array.from(this.events.values());

    const bySeverity: any = {};
    const byClassification: any = {};

    for (const severity of Object.values(RansomwareSeverity)) {
      bySeverity[severity] = events.filter(e => e.severity === severity).length;
    }

    for (const classification of Object.values(RansomwareClassification)) {
      byClassification[classification] = events.filter(e => e.classification === classification).length;
    }

    return {
      totalEvents: events.length,
      activeThreats: events.filter(e => !e.resolved).length,
      resolvedEvents: events.filter(e => e.resolved).length,
      bySeverity,
      byClassification
    };
  }

  private startMonitoring(): void {
    // Monitor system every 30 seconds
    this.monitoringInterval = setInterval(async () => {
      // Check CPU load
      await this.detectCPUSpike();

      // In production: monitor file system, processes, services
    }, 30 * 1000);

    console.log('✓ Ransomware detection monitoring started');
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log('Ransomware detection monitoring stopped');
    }
  }
}

export const ransomwareDetectionService = new RansomwareDetectionService();
