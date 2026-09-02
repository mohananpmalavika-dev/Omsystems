/**
 * Enhanced Tamper Detection Engine
 * Multi-device tamper detection with AI classification: cameras, recorders, switches, cabinets
 */

import {
  TamperEvent,
  TamperType,
  TamperSeverity,
  TamperClassification,
  TamperAIAnalysis
} from '../types/security.types';
import crypto from 'crypto';

export class TamperDetectionService {
  private events: Map<string, TamperEvent> = new Map();
  private deviceLastSeen: Map<string, Date> = new Map();
  private deviceBaselines: Map<string, any> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startMonitoring();
  }

  /**
   * Report tamper event
   */
  async reportTamperEvent(
    deviceId: string,
    deviceType: string,
    deviceName: string,
    tamperType: TamperType,
    description: string,
    evidenceUrls: string[] = []
  ): Promise<TamperEvent> {
    const eventId = crypto.randomBytes(16).toString('hex');

    // Determine severity
    const severity = this.determineSeverity(tamperType, deviceType);

    // AI classification
    const aiAnalysis = await this.classifyTamper(tamperType, deviceType, description, evidenceUrls);

    const event: TamperEvent = {
      id: eventId,
      deviceId,
      deviceType,
      deviceName,
      tamperType,
      severity,
      classification: aiAnalysis.intent === 'INTENTIONAL' ? TamperClassification.MALICIOUS : TamperClassification.ACCIDENTAL,
      detectedAt: new Date(),
      description,
      evidenceUrls,
      aiAnalysis,
      responseActions: this.determineResponseActions(severity, tamperType),
      acknowledged: false
    };

    this.events.set(eventId, event);

    console.log(`⚠️ Tamper detected: ${deviceName} - ${tamperType} (${severity})`);

    // Trigger immediate response for critical events
    if (severity === TamperSeverity.CRITICAL) {
      await this.executeEmergencyResponse(event);
    }

    return event;
  }

  /**
   * Detect camera covered
   */
  async detectCameraCovered(cameraId: string, cameraName: string, currentFrame: Buffer): Promise<TamperEvent | null> {
    const baseline = this.deviceBaselines.get(cameraId);

    if (!baseline) {
      // Store baseline
      this.deviceBaselines.set(cameraId, {
        averageBrightness: this.calculateBrightness(currentFrame),
        timestamp: new Date()
      });
      return null;
    }

    const currentBrightness = this.calculateBrightness(currentFrame);
    const brightnessDrop = baseline.averageBrightness - currentBrightness;

    // If brightness dropped significantly (camera covered)
    if (brightnessDrop > 50 && currentBrightness < 20) {
      return await this.reportTamperEvent(
        cameraId,
        'camera',
        cameraName,
        TamperType.CAMERA_COVERED,
        `Camera appears to be covered. Brightness dropped from ${baseline.averageBrightness} to ${currentBrightness}`,
        []
      );
    }

    return null;
  }

  /**
   * Detect camera moved
   */
  async detectCameraMoved(cameraId: string, cameraName: string, currentFrame: Buffer): Promise<TamperEvent | null> {
    const baseline = this.deviceBaselines.get(cameraId);

    if (!baseline || !baseline.referenceFrame) {
      // Store baseline
      this.deviceBaselines.set(cameraId, {
        referenceFrame: currentFrame,
        timestamp: new Date()
      });
      return null;
    }

    // Calculate similarity between current frame and baseline
    const similarity = this.calculateFrameSimilarity(baseline.referenceFrame, currentFrame);

    // If similarity is low (camera was moved)
    if (similarity < 0.3) {
      return await this.reportTamperEvent(
        cameraId,
        'camera',
        cameraName,
        TamperType.CAMERA_MOVED,
        `Camera position changed. Similarity score: ${(similarity * 100).toFixed(1)}%`,
        []
      );
    }

    return null;
  }

  /**
   * Detect recorder tamper
   */
  async detectRecorderTamper(recorderId: string, recorderName: string, sensors: any): Promise<TamperEvent | null> {
    // Check physical sensors
    if (sensors.cabinetOpen) {
      return await this.reportTamperEvent(
        recorderId,
        'recorder',
        recorderName,
        TamperType.RECORDER_OPENED,
        'Recorder cabinet opened - physical sensor triggered',
        []
      );
    }

    if (sensors.hddMissing) {
      return await this.reportTamperEvent(
        recorderId,
        'recorder',
        recorderName,
        TamperType.HDD_REMOVED,
        'Hard drive removed from recorder',
        []
      );
    }

    if (sensors.usbInserted && !sensors.authorizedUSB) {
      return await this.reportTamperEvent(
        recorderId,
        'recorder',
        recorderName,
        TamperType.USB_INSERTED,
        'Unauthorized USB device inserted',
        []
      );
    }

    return null;
  }

  /**
   * Detect configuration change
   */
  async detectConfigChange(
    deviceId: string,
    deviceType: string,
    deviceName: string,
    oldConfig: any,
    newConfig: any
  ): Promise<TamperEvent | null> {
    const changes = this.compareConfigs(oldConfig, newConfig);

    if (changes.length > 0) {
      const criticalChanges = changes.filter(c => c.critical);

      if (criticalChanges.length > 0) {
        return await this.reportTamperEvent(
          deviceId,
          deviceType,
          deviceName,
          TamperType.CONFIG_CHANGED,
          `Critical configuration changes detected: ${criticalChanges.map(c => c.field).join(', ')}`,
          []
        );
      }
    }

    return null;
  }

  /**
   * Detect firmware modification
   */
  async detectFirmwareModification(
    deviceId: string,
    deviceType: string,
    deviceName: string,
    currentHash: string,
    expectedHash: string
  ): Promise<TamperEvent | null> {
    if (currentHash !== expectedHash) {
      return await this.reportTamperEvent(
        deviceId,
        deviceType,
        deviceName,
        TamperType.FIRMWARE_MODIFIED,
        `Firmware hash mismatch. Expected: ${expectedHash}, Got: ${currentHash}`,
        []
      );
    }

    return null;
  }

  /**
   * Detect clock tampering
   */
  async detectClockTampering(
    deviceId: string,
    deviceType: string,
    deviceName: string,
    deviceTime: Date,
    serverTime: Date
  ): Promise<TamperEvent | null> {
    const timeDiff = Math.abs(deviceTime.getTime() - serverTime.getTime());
    const maxDriftMs = 5 * 60 * 1000; // 5 minutes

    if (timeDiff > maxDriftMs) {
      return await this.reportTamperEvent(
        deviceId,
        deviceType,
        deviceName,
        TamperType.CLOCK_TAMPERING,
        `Clock drift detected: ${Math.round(timeDiff / 1000)} seconds`,
        []
      );
    }

    return null;
  }

  /**
   * Detect network disconnection
   */
  async detectNetworkDisconnection(
    deviceId: string,
    deviceType: string,
    deviceName: string
  ): Promise<TamperEvent | null> {
    const lastSeen = this.deviceLastSeen.get(deviceId);
    const now = new Date();

    if (lastSeen) {
      const offlineDuration = now.getTime() - lastSeen.getTime();
      const maxOfflineMs = 5 * 60 * 1000; // 5 minutes

      if (offlineDuration > maxOfflineMs) {
        return await this.reportTamperEvent(
          deviceId,
          deviceType,
          deviceName,
          TamperType.NETWORK_DISCONNECTED,
          `Device offline for ${Math.round(offlineDuration / 1000)} seconds`,
          []
        );
      }
    }

    return null;
  }

  /**
   * Detect cabinet opened
   */
  async detectCabinetOpened(
    cabinetId: string,
    cabinetName: string,
    doorSensor: boolean
  ): Promise<TamperEvent | null> {
    if (doorSensor) {
      return await this.reportTamperEvent(
        cabinetId,
        'cabinet',
        cabinetName,
        TamperType.CABINET_OPENED,
        'Cabinet door opened - sensor triggered',
        []
      );
    }

    return null;
  }

  /**
   * Update device heartbeat
   */
  async updateDeviceHeartbeat(deviceId: string): Promise<void> {
    this.deviceLastSeen.set(deviceId, new Date());
  }

  /**
   * Get tamper event
   */
  async getEvent(eventId: string): Promise<TamperEvent | null> {
    return this.events.get(eventId) || null;
  }

  /**
   * List tamper events
   */
  async listEvents(filter?: {
    deviceId?: string;
    severity?: TamperSeverity;
    classification?: TamperClassification;
    resolved?: boolean;
    startDate?: Date;
    endDate?: Date;
  }): Promise<TamperEvent[]> {
    let events = Array.from(this.events.values());

    if (filter?.deviceId) {
      events = events.filter(e => e.deviceId === filter.deviceId);
    }

    if (filter?.severity) {
      events = events.filter(e => e.severity === filter.severity);
    }

    if (filter?.classification) {
      events = events.filter(e => e.classification === filter.classification);
    }

    if (filter?.resolved !== undefined) {
      events = events.filter(e => (e.resolvedAt !== undefined) === filter.resolved);
    }

    if (filter?.startDate) {
      events = events.filter(e => e.detectedAt >= filter.startDate!);
    }

    if (filter?.endDate) {
      events = events.filter(e => e.detectedAt <= filter.endDate!);
    }

    return events.sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime());
  }

  /**
   * Acknowledge tamper event
   */
  async acknowledgeEvent(eventId: string, acknowledgedBy: string): Promise<boolean> {
    const event = this.events.get(eventId);

    if (!event) {
      return false;
    }

    event.acknowledged = true;
    event.acknowledgedBy = acknowledgedBy;

    console.log(`✓ Tamper event acknowledged: ${eventId} by ${acknowledgedBy}`);

    return true;
  }

  /**
   * Resolve tamper event
   */
  async resolveEvent(eventId: string): Promise<boolean> {
    const event = this.events.get(eventId);

    if (!event) {
      return false;
    }

    event.resolvedAt = new Date();

    console.log(`✓ Tamper event resolved: ${eventId}`);

    return true;
  }

  /**
   * Get tamper statistics
   */
  async getStatistics(): Promise<{
    total: number;
    active: number;
    resolved: number;
    bySeverity: Record<TamperSeverity, number>;
    byClassification: Record<TamperClassification, number>;
    byType: Record<TamperType, number>;
  }> {
    const events = Array.from(this.events.values());

    const bySeverity: any = {};
    const byClassification: any = {};
    const byType: any = {};

    for (const severity of Object.values(TamperSeverity)) {
      bySeverity[severity] = events.filter(e => e.severity === severity).length;
    }

    for (const classification of Object.values(TamperClassification)) {
      byClassification[classification] = events.filter(e => e.classification === classification).length;
    }

    for (const type of Object.values(TamperType)) {
      byType[type] = events.filter(e => e.tamperType === type).length;
    }

    return {
      total: events.length,
      active: events.filter(e => !e.resolvedAt).length,
      resolved: events.filter(e => e.resolvedAt).length,
      bySeverity,
      byClassification,
      byType
    };
  }

  // ============================================================================
  // AI Classification
  // ============================================================================

  private async classifyTamper(
    tamperType: TamperType,
    deviceType: string,
    description: string,
    evidenceUrls: string[]
  ): Promise<TamperAIAnalysis> {
    // Rule-based classification with confidence derived from actual evidence
    // Note: This is intent classification confidence, not model inference confidence
    
    let intent: 'ACCIDENTAL' | 'INTENTIONAL' = 'ACCIDENTAL';
    let confidence = 0; // Start from 0, build confidence based on actual evidence
    const patterns: string[] = [];
    const recommendations: string[] = [];

    // Base confidence from having tamper event with description
    if (description && description.length > 10) {
      confidence = 0.4; // Base confidence for having observable tamper event
    }

    // Critical tampers indicate intentional action with high confidence
    if ([
      TamperType.FIRMWARE_MODIFIED,
      TamperType.HDD_REMOVED,
      TamperType.USB_INSERTED
    ].includes(tamperType)) {
      intent = 'INTENTIONAL';
      confidence = 0.9; // High confidence - these actions require deliberate effort
      patterns.push('Physical device manipulation requiring deliberate action');
      recommendations.push('Investigate immediately - potential security breach');
      recommendations.push('Review security footage for 2 hours before event');
      recommendations.push('Check physical access logs and badge records');
      recommendations.push('Preserve forensic evidence');
    }

    // Time-based behavioral analysis
    const hour = new Date().getHours();
    if (hour < 6 || hour > 22) {
      confidence = Math.min(confidence + 0.15, 0.95);
      patterns.push('Occurred outside business hours (suspicious timing)');
      if (intent === 'ACCIDENTAL') {
        intent = 'INTENTIONAL'; // Off-hours tamper suggests deliberate action
      }
    }

    // Pattern detection - multiple tampers indicate coordinated action
    const recentEvents = await this.listEvents({
      startDate: new Date(Date.now() - 60 * 60 * 1000) // Last hour
    });

    if (recentEvents.length > 5) {
      confidence = Math.min(confidence + 0.2, 0.95);
      patterns.push(`Multiple tamper events in short period (${recentEvents.length} events in 1 hour)`);
      intent = 'INTENTIONAL';
      recommendations.push('CRITICAL: Possible coordinated attack in progress');
      recommendations.push('Activate incident response team immediately');
      recommendations.push('Lock down affected areas');
    }

    // Evidence-based confidence boost
    if (evidenceUrls && evidenceUrls.length > 0) {
      confidence = Math.min(confidence + 0.1, 0.95);
      patterns.push(`Visual evidence available (${evidenceUrls.length} sources)`);
    }

    const riskScore = Math.round((confidence * 100));

    return {
      confidence: Math.min(confidence, 0.95), // Cap at 95% - never 100% certain without human review
      intent,
      riskScore,
      patterns,
      recommendations
    };
  }

  // ============================================================================
  // Helper methods
  // ============================================================================

  private determineSeverity(tamperType: TamperType, deviceType: string): TamperSeverity {
    const criticalTampers = [
      TamperType.FIRMWARE_MODIFIED,
      TamperType.HDD_REMOVED,
      TamperType.CONFIG_CHANGED
    ];

    const highTampers = [
      TamperType.CAMERA_COVERED,
      TamperType.CAMERA_MOVED,
      TamperType.RECORDER_OPENED,
      TamperType.USB_INSERTED
    ];

    const mediumTampers = [
      TamperType.NETWORK_DISCONNECTED,
      TamperType.CABINET_OPENED,
      TamperType.CLOCK_TAMPERING
    ];

    if (criticalTampers.includes(tamperType)) {
      return TamperSeverity.CRITICAL;
    } else if (highTampers.includes(tamperType)) {
      return TamperSeverity.HIGH;
    } else if (mediumTampers.includes(tamperType)) {
      return TamperSeverity.MEDIUM;
    } else {
      return TamperSeverity.LOW;
    }
  }

  private determineResponseActions(severity: TamperSeverity, tamperType: TamperType): string[] {
    const actions: string[] = [];

    if (severity === TamperSeverity.CRITICAL) {
      actions.push('IMMEDIATE_ALERT');
      actions.push('NOTIFY_SECURITY');
      actions.push('LOCK_DEVICE');
      actions.push('CAPTURE_EVIDENCE');
      actions.push('DISPATCH_GUARD');
    } else if (severity === TamperSeverity.HIGH) {
      actions.push('ALERT_ADMIN');
      actions.push('RECORD_INCIDENT');
      actions.push('MONITOR_CLOSELY');
    } else {
      actions.push('LOG_EVENT');
      actions.push('SCHEDULE_INSPECTION');
    }

    return actions;
  }

  private async executeEmergencyResponse(event: TamperEvent): Promise<void> {
    console.log(`🚨 EMERGENCY RESPONSE: ${event.deviceName} - ${event.tamperType}`);

    // In production:
    // 1. Send alert to SOC
    // 2. Notify security personnel
    // 3. Lock down affected systems
    // 4. Start recording all nearby cameras
    // 5. Dispatch security guards
    // 6. Create incident ticket
  }

  private calculateBrightness(frame: Buffer): number {
    if (!frame || frame.length === 0) {
      throw new Error("Invalid frame buffer: cannot compute brightness on empty buffer");
    }
    // Calculate average pixel luminance across sample points in the buffer
    let sum = 0;
    const step = Math.max(1, Math.floor(frame.length / 1000));
    let sampleCount = 0;
    for (let i = 0; i < frame.length; i += step) {
      sum += frame[i]!;
      sampleCount++;
    }
    const avgByte = sampleCount > 0 ? sum / sampleCount : 0;
    return (avgByte / 255) * 100;
  }

  private calculateFrameSimilarity(frame1: Buffer, frame2: Buffer): number {
    if (!frame1 || frame1.length === 0 || !frame2 || frame2.length === 0) {
      throw new Error("Invalid frame buffer: cannot compute similarity with empty buffer");
    }
    const len = Math.min(frame1.length, frame2.length);
    if (len === 0) return 0;
    const step = Math.max(1, Math.floor(len / 1000));
    let diffSum = 0;
    let sampleCount = 0;
    for (let i = 0; i < len; i += step) {
      diffSum += Math.abs(frame1[i]! - frame2[i]!);
      sampleCount++;
    }
    const avgDiff = sampleCount > 0 ? diffSum / sampleCount : 255;
    return Math.max(0, Math.min(1, 1 - (avgDiff / 255)));
  }

  private compareConfigs(oldConfig: any, newConfig: any): Array<{ field: string; critical: boolean }> {
    const changes: Array<{ field: string; critical: boolean }> = [];

    // In production: deep comparison of configuration objects
    // Flag critical changes (IP address, credentials, security settings)

    return changes;
  }

  private startMonitoring(): void {
    // Monitor device heartbeats every minute
    this.monitoringInterval = setInterval(async () => {
      const devices = Array.from(this.deviceLastSeen.keys());

      for (const deviceId of devices) {
        // Check if device is offline
        const lastSeen = this.deviceLastSeen.get(deviceId);
        if (lastSeen) {
          const offlineTime = Date.now() - lastSeen.getTime();
          if (offlineTime > 5 * 60 * 1000) { // 5 minutes
            console.log(`⚠️ Device offline: ${deviceId}`);
          }
        }
      }
    }, 60 * 1000);

    console.log('✓ Tamper detection monitoring started');
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log('Tamper detection monitoring stopped');
    }
  }
}

// ============================================================================
// Singleton instance
// ============================================================================

export const tamperDetectionService = new TamperDetectionService();
