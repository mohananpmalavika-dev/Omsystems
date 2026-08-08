/**
 * Device Identity Provider
 * Device fingerprinting, tracking, and anomaly detection
 */

import {
  IDeviceProvider,
  ProviderContext,
  DeviceVerificationResult,
  DeviceMetadata,
  DeviceFingerprint,
  DeviceAnomaly,
  SecurityVerdict,
  ThreatLevel
} from './types';
import crypto from 'crypto';

interface DeviceRecord {
  deviceId: string;
  userId: string;
  fingerprint: DeviceFingerprint;
  metadata: DeviceMetadata;
  trusted: boolean;
  registeredAt: Date;
  lastSeenAt: Date;
  accessCount: number;
  blockedAt?: Date;
  blockReason?: string;
}

interface DeviceAccessLog {
  deviceId: string;
  userId: string;
  timestamp: Date;
  ipAddress: string;
  metadata: DeviceMetadata;
}

export class DeviceProvider implements IDeviceProvider {
  readonly name = 'DeviceProvider';
  readonly version = '1.0.0';

  private devices: Map<string, DeviceRecord> = new Map();
  private accessLogs: Map<string, DeviceAccessLog[]> = new Map();
  private fingerprintIndex: Map<string, string> = new Map(); // fingerprint -> deviceId

  private readonly NEW_DEVICE_RISK = 40;
  private readonly UNKNOWN_DEVICE_RISK = 60;
  private readonly BLOCKED_DEVICE_RISK = 100;
  private readonly DEVICE_CHANGE_RISK = 35;
  private readonly MAX_ACCESS_LOGS = 100;

  /**
   * Verify device identity and trust
   */
  async verify(context: ProviderContext): Promise<DeviceVerificationResult> {
    const startTime = Date.now();
    let score = 0;
    const evidence: Record<string, any> = {};
    const reasons: string[] = [];
    const anomalies: DeviceAnomaly[] = [];

    // 1. Extract device metadata from context
    const metadata = this.extractDeviceMetadata(context);
    evidence.metadata = metadata;

    // 2. Generate device fingerprint
    const fingerprint = this.generateFingerprint(metadata, context.ipAddress);
    evidence.fingerprint = fingerprint;

    // 3. Check if device is known
    let deviceRecord = this.devices.get(context.deviceId);
    const deviceKnown = deviceRecord !== undefined;
    evidence.deviceKnown = deviceKnown;

    // 4. Check if device is blocked
    if (deviceRecord?.blockedAt) {
      score = this.BLOCKED_DEVICE_RISK;
      reasons.push(`Device blocked: ${deviceRecord.blockReason || 'Unknown reason'}`);
      
      return {
        verdict: SecurityVerdict.DENY,
        score: 100,
        confidence: 1.0,
        reason: reasons.join('; '),
        evidence,
        deviceKnown,
        deviceTrusted: false,
        deviceFingerprint: fingerprint,
        deviceMetadata: metadata,
        firstSeen: deviceRecord.registeredAt,
        lastSeen: deviceRecord.lastSeenAt,
        anomalies: [{
          type: 'new_device',
          severity: ThreatLevel.CRITICAL,
          description: `Device is blocked: ${deviceRecord.blockReason}`,
          detectedAt: new Date()
        }]
      };
    }

    // 5. Handle new device
    if (!deviceKnown) {
      score += this.NEW_DEVICE_RISK;
      reasons.push('New device - not previously registered');
      
      anomalies.push({
        type: 'new_device',
        severity: ThreatLevel.MEDIUM,
        description: 'Device has not been seen before',
        detectedAt: new Date()
      });

      evidence.isNewDevice = true;
    } else {
      evidence.isNewDevice = false;
      evidence.firstSeen = deviceRecord.registeredAt;
      evidence.lastSeen = deviceRecord.lastSeenAt;
      evidence.accessCount = deviceRecord.accessCount;
      evidence.daysSinceRegistration = Math.floor(
        (Date.now() - deviceRecord.registeredAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      // 6. Detect device anomalies
      const detectedAnomalies = await this.detectAnomalies(context, deviceRecord.metadata);
      anomalies.push(...detectedAnomalies);

      // Add risk score based on anomalies
      detectedAnomalies.forEach(anomaly => {
        const anomalyScore = this.getAnomalyRiskScore(anomaly.severity);
        score += anomalyScore;
        reasons.push(`${anomaly.type}: ${anomaly.description}`);
      });

      // 7. Check fingerprint consistency
      if (deviceRecord.fingerprint.fingerprint !== fingerprint) {
        const fingerprintScore = this.DEVICE_CHANGE_RISK;
        score += fingerprintScore;
        reasons.push('Device fingerprint has changed');
        
        anomalies.push({
          type: 'new_device',
          severity: ThreatLevel.HIGH,
          description: 'Device fingerprint mismatch - possible device spoofing',
          detectedAt: new Date()
        });
      }

      // 8. Check user consistency
      if (deviceRecord.userId !== context.userId) {
        score += 30;
        reasons.push('Device associated with different user');
        
        anomalies.push({
          type: 'new_device',
          severity: ThreatLevel.HIGH,
          description: `Device previously used by user ${deviceRecord.userId}`,
          detectedAt: new Date()
        });
      }

      // 9. Check access frequency
      const recentAccess = this.getRecentAccessCount(context.deviceId, 24 * 60 * 60 * 1000); // 24 hours
      evidence.recentAccessCount = recentAccess;

      if (recentAccess > 100) {
        score += 20;
        reasons.push(`Unusually high access frequency: ${recentAccess} in 24h`);
        
        anomalies.push({
          type: 'rapid_device_switch',
          severity: ThreatLevel.MEDIUM,
          description: `High access rate: ${recentAccess} requests in 24 hours`,
          detectedAt: new Date()
        });
      }

      // 10. Update device record
      deviceRecord.lastSeenAt = new Date();
      deviceRecord.accessCount++;
      deviceRecord.metadata = metadata; // Update metadata
    }

    // 11. Check for rapid device switching
    const userDevices = this.getUserDevices(context.userId);
    const recentDeviceSwitch = this.detectRapidDeviceSwitch(context.userId, context.deviceId);
    evidence.userDeviceCount = userDevices.length;
    evidence.rapidDeviceSwitch = recentDeviceSwitch;

    if (recentDeviceSwitch) {
      score += 25;
      reasons.push('Rapid device switching detected');
      
      anomalies.push({
        type: 'rapid_device_switch',
        severity: ThreatLevel.HIGH,
        description: 'User switched devices multiple times in short period',
        detectedAt: new Date()
      });
    }

    // 12. Log access
    await this.logAccess(context.deviceId, context.userId, context.ipAddress, metadata);

    // 13. Determine device trust
    const deviceTrusted = deviceKnown && 
                         deviceRecord!.trusted && 
                         score < 50 && 
                         anomalies.every(a => a.severity < ThreatLevel.HIGH);
    evidence.deviceTrusted = deviceTrusted;

    // Determine verdict
    let verdict: SecurityVerdict;
    let confidence = 0.85;
    const requiredActions: string[] = [];

    if (score >= 80) {
      verdict = SecurityVerdict.DENY;
      confidence = 0.95;
      requiredActions.push('BLOCK_DEVICE', 'SECURITY_REVIEW');
    } else if (score >= 50) {
      verdict = SecurityVerdict.CHALLENGE;
      confidence = 0.9;
      requiredActions.push('VERIFY_DEVICE_OWNERSHIP', 'ADDITIONAL_MFA');
    } else if (score >= 30) {
      verdict = SecurityVerdict.REVIEW;
      confidence = 0.8;
      requiredActions.push('MONITOR_DEVICE');
    } else if (!deviceKnown) {
      verdict = SecurityVerdict.CHALLENGE;
      confidence = 0.85;
      requiredActions.push('REGISTER_DEVICE');
    } else {
      verdict = SecurityVerdict.ALLOW;
      confidence = 0.9;
    }

    evidence.processingTimeMs = Date.now() - startTime;

    return {
      verdict,
      score: Math.min(score, 100),
      confidence,
      reason: reasons.length > 0 ? reasons.join('; ') : 'Device verification passed',
      evidence,
      deviceKnown,
      deviceTrusted,
      deviceFingerprint: fingerprint,
      deviceMetadata: metadata,
      firstSeen: deviceRecord?.registeredAt,
      lastSeen: deviceRecord?.lastSeenAt,
      anomalies,
      requiredActions: requiredActions.length > 0 ? requiredActions : undefined
    };
  }

  /**
   * Register a new device
   */
  async registerDevice(deviceId: string, userId: string, metadata: DeviceMetadata): Promise<void> {
    const fingerprint = this.generateFingerprint(metadata, 'unknown');
    
    const deviceFingerprint: DeviceFingerprint = {
      deviceId,
      userId,
      fingerprint,
      components: this.extractFingerprintComponents(metadata),
      createdAt: new Date(),
      lastUpdated: new Date()
    };

    const deviceRecord: DeviceRecord = {
      deviceId,
      userId,
      fingerprint: deviceFingerprint,
      metadata,
      trusted: true, // Trust new registered devices by default
      registeredAt: new Date(),
      lastSeenAt: new Date(),
      accessCount: 0
    };

    this.devices.set(deviceId, deviceRecord);
    this.fingerprintIndex.set(fingerprint, deviceId);

    console.log(`✓ Device registered: ${deviceId} for user ${userId}`);
  }

  /**
   * Get device fingerprint
   */
  async getDeviceFingerprint(deviceId: string): Promise<DeviceFingerprint | null> {
    const device = this.devices.get(deviceId);
    return device?.fingerprint || null;
  }

  /**
   * Detect device anomalies
   */
  async detectAnomalies(context: ProviderContext, previousMetadata?: DeviceMetadata): Promise<DeviceAnomaly[]> {
    const anomalies: DeviceAnomaly[] = [];

    if (!previousMetadata) {
      return anomalies;
    }

    const currentMetadata = this.extractDeviceMetadata(context);

    // Check user agent change
    if (previousMetadata.userAgent !== currentMetadata.userAgent) {
      anomalies.push({
        type: 'user_agent_change',
        severity: ThreatLevel.MEDIUM,
        description: `User agent changed from "${previousMetadata.userAgent}" to "${currentMetadata.userAgent}"`,
        detectedAt: new Date()
      });
    }

    // Check timezone change
    if (previousMetadata.timezone && currentMetadata.timezone && 
        previousMetadata.timezone !== currentMetadata.timezone) {
      anomalies.push({
        type: 'timezone_change',
        severity: ThreatLevel.LOW,
        description: `Timezone changed from ${previousMetadata.timezone} to ${currentMetadata.timezone}`,
        detectedAt: new Date()
      });
    }

    // Check screen resolution change
    if (previousMetadata.screenResolution && currentMetadata.screenResolution &&
        previousMetadata.screenResolution !== currentMetadata.screenResolution) {
      anomalies.push({
        type: 'screen_change',
        severity: ThreatLevel.LOW,
        description: `Screen resolution changed from ${previousMetadata.screenResolution} to ${currentMetadata.screenResolution}`,
        detectedAt: new Date()
      });
    }

    // Check OS version change
    if (previousMetadata.os !== currentMetadata.os || 
        previousMetadata.osVersion !== currentMetadata.osVersion) {
      anomalies.push({
        type: 'user_agent_change',
        severity: ThreatLevel.MEDIUM,
        description: `OS changed from ${previousMetadata.os} ${previousMetadata.osVersion} to ${currentMetadata.os} ${currentMetadata.osVersion}`,
        detectedAt: new Date()
      });
    }

    // Check browser change
    if (previousMetadata.browser && currentMetadata.browser &&
        previousMetadata.browser !== currentMetadata.browser) {
      anomalies.push({
        type: 'user_agent_change',
        severity: ThreatLevel.LOW,
        description: `Browser changed from ${previousMetadata.browser} to ${currentMetadata.browser}`,
        detectedAt: new Date()
      });
    }

    return anomalies;
  }

  /**
   * Trust a device
   */
  async trustDevice(deviceId: string): Promise<boolean> {
    const device = this.devices.get(deviceId);
    
    if (!device) {
      return false;
    }

    device.trusted = true;
    console.log(`✓ Device trusted: ${deviceId}`);
    
    return true;
  }

  /**
   * Block a device
   */
  async blockDevice(deviceId: string, reason: string): Promise<boolean> {
    const device = this.devices.get(deviceId);
    
    if (!device) {
      return false;
    }

    device.trusted = false;
    device.blockedAt = new Date();
    device.blockReason = reason;

    console.log(`🚫 Device blocked: ${deviceId} - ${reason}`);
    
    return true;
  }

  /**
   * Unblock a device
   */
  async unblockDevice(deviceId: string): Promise<boolean> {
    const device = this.devices.get(deviceId);
    
    if (!device) {
      return false;
    }

    device.blockedAt = undefined;
    device.blockReason = undefined;

    console.log(`✓ Device unblocked: ${deviceId}`);
    
    return true;
  }

  /**
   * Get user's devices
   */
  getUserDevices(userId: string): DeviceRecord[] {
    const devices: DeviceRecord[] = [];

    for (const device of this.devices.values()) {
      if (device.userId === userId) {
        devices.push(device);
      }
    }

    return devices;
  }

  /**
   * Revoke device access
   */
  async revokeDevice(deviceId: string): Promise<boolean> {
    const device = this.devices.get(deviceId);
    
    if (!device) {
      return false;
    }

    // Remove from maps
    this.devices.delete(deviceId);
    this.fingerprintIndex.delete(device.fingerprint.fingerprint);
    this.accessLogs.delete(deviceId);

    console.log(`✓ Device revoked: ${deviceId}`);
    
    return true;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    // Clean up old access logs
    await this.cleanupOldLogs();
    
    return true;
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private extractDeviceMetadata(context: ProviderContext): DeviceMetadata {
    // Parse user agent
    const ua = context.userAgent;
    const parsed = this.parseUserAgent(ua);

    return {
      deviceId: context.deviceId,
      deviceType: parsed.deviceType,
      os: parsed.os,
      osVersion: parsed.osVersion,
      browser: parsed.browser,
      browserVersion: parsed.browserVersion,
      userAgent: ua,
      timezone: context.metadata?.timezone,
      language: context.metadata?.language,
      screenResolution: context.metadata?.screenResolution,
      platform: context.metadata?.platform
    };
  }

  private parseUserAgent(userAgent: string): {
    deviceType: DeviceMetadata['deviceType'];
    os: string;
    osVersion: string;
    browser?: string;
    browserVersion?: string;
  } {
    const ua = userAgent.toLowerCase();

    // Detect device type
    let deviceType: DeviceMetadata['deviceType'] = 'unknown';
    if (ua.includes('mobile')) deviceType = 'mobile';
    else if (ua.includes('tablet') || ua.includes('ipad')) deviceType = 'tablet';
    else if (ua.includes('windows') || ua.includes('mac') || ua.includes('linux')) deviceType = 'desktop';

    // Detect OS
    let os = 'unknown';
    let osVersion = 'unknown';
    
    if (ua.includes('windows nt 10')) { os = 'Windows'; osVersion = '10'; }
    else if (ua.includes('windows nt 6.3')) { os = 'Windows'; osVersion = '8.1'; }
    else if (ua.includes('windows nt 6.2')) { os = 'Windows'; osVersion = '8'; }
    else if (ua.includes('windows nt 6.1')) { os = 'Windows'; osVersion = '7'; }
    else if (ua.includes('mac os x')) {
      os = 'macOS';
      const match = ua.match(/mac os x ([\d_]+)/);
      if (match) osVersion = match[1].replace(/_/g, '.');
    }
    else if (ua.includes('android')) {
      os = 'Android';
      const match = ua.match(/android ([\d.]+)/);
      if (match) osVersion = match[1];
    }
    else if (ua.includes('iphone') || ua.includes('ipad')) {
      os = 'iOS';
      const match = ua.match(/os ([\d_]+)/);
      if (match) osVersion = match[1].replace(/_/g, '.');
    }
    else if (ua.includes('linux')) { os = 'Linux'; }

    // Detect browser
    let browser: string | undefined;
    let browserVersion: string | undefined;

    if (ua.includes('edg/')) {
      browser = 'Edge';
      const match = ua.match(/edg\/([\d.]+)/);
      if (match) browserVersion = match[1];
    } else if (ua.includes('chrome/')) {
      browser = 'Chrome';
      const match = ua.match(/chrome\/([\d.]+)/);
      if (match) browserVersion = match[1];
    } else if (ua.includes('firefox/')) {
      browser = 'Firefox';
      const match = ua.match(/firefox\/([\d.]+)/);
      if (match) browserVersion = match[1];
    } else if (ua.includes('safari/')) {
      browser = 'Safari';
      const match = ua.match(/version\/([\d.]+)/);
      if (match) browserVersion = match[1];
    }

    return { deviceType, os, osVersion, browser, browserVersion };
  }

  private generateFingerprint(metadata: DeviceMetadata, ipAddress: string): string {
    const components = [
      metadata.userAgent,
      metadata.os,
      metadata.osVersion,
      metadata.browser || '',
      metadata.browserVersion || '',
      metadata.platform || '',
      metadata.screenResolution || '',
      metadata.timezone || '',
      metadata.language || ''
    ];

    const data = components.join('|');
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private extractFingerprintComponents(metadata: DeviceMetadata): DeviceFingerprint['components'] {
    return {
      hardware: `${metadata.deviceType}|${metadata.platform || ''}|${metadata.screenResolution || ''}`,
      fonts: [], // Would be populated from browser fingerprinting
      plugins: [] // Would be populated from browser fingerprinting
    };
  }

  private getAnomalyRiskScore(severity: ThreatLevel): number {
    switch (severity) {
      case ThreatLevel.CRITICAL: return 40;
      case ThreatLevel.HIGH: return 25;
      case ThreatLevel.MEDIUM: return 15;
      case ThreatLevel.LOW: return 5;
      default: return 0;
    }
  }

  private async logAccess(deviceId: string, userId: string, ipAddress: string, metadata: DeviceMetadata): Promise<void> {
    const logs = this.accessLogs.get(deviceId) || [];
    
    logs.push({
      deviceId,
      userId,
      timestamp: new Date(),
      ipAddress,
      metadata
    });

    // Keep only recent logs
    if (logs.length > this.MAX_ACCESS_LOGS) {
      logs.splice(0, logs.length - this.MAX_ACCESS_LOGS);
    }

    this.accessLogs.set(deviceId, logs);
  }

  private getRecentAccessCount(deviceId: string, windowMs: number): number {
    const logs = this.accessLogs.get(deviceId) || [];
    const cutoff = Date.now() - windowMs;
    
    return logs.filter(log => log.timestamp.getTime() > cutoff).length;
  }

  private detectRapidDeviceSwitch(userId: string, currentDeviceId: string): boolean {
    const userDevices = this.getUserDevices(userId);
    
    if (userDevices.length <= 1) {
      return false;
    }

    // Check if user accessed from different device in last 5 minutes
    const recentWindow = 5 * 60 * 1000; // 5 minutes
    const cutoff = Date.now() - recentWindow;

    const recentDevices = userDevices.filter(d => 
      d.deviceId !== currentDeviceId &&
      d.lastSeenAt.getTime() > cutoff
    );

    return recentDevices.length > 0;
  }

  private async cleanupOldLogs(): Promise<void> {
    const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30 days

    for (const [deviceId, logs] of this.accessLogs.entries()) {
      const recentLogs = logs.filter(log => log.timestamp.getTime() > cutoff);
      
      if (recentLogs.length === 0) {
        this.accessLogs.delete(deviceId);
      } else if (recentLogs.length < logs.length) {
        this.accessLogs.set(deviceId, recentLogs);
      }
    }
  }

  /**
   * Get device statistics
   */
  async getDeviceStats(): Promise<{
    totalDevices: number;
    trustedDevices: number;
    blockedDevices: number;
    byDeviceType: Record<string, number>;
    byOS: Record<string, number>;
  }> {
    const stats = {
      totalDevices: this.devices.size,
      trustedDevices: 0,
      blockedDevices: 0,
      byDeviceType: {} as Record<string, number>,
      byOS: {} as Record<string, number>
    };

    for (const device of this.devices.values()) {
      if (device.trusted) stats.trustedDevices++;
      if (device.blockedAt) stats.blockedDevices++;

      const deviceType = device.metadata.deviceType;
      stats.byDeviceType[deviceType] = (stats.byDeviceType[deviceType] || 0) + 1;

      const os = device.metadata.os;
      stats.byOS[os] = (stats.byOS[os] || 0) + 1;
    }

    return stats;
  }
}
