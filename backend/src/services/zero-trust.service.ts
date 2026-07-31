/**
 * Zero Trust Architecture Service
 * Implements continuous verification with Policy Decision Point (PDP)
 * Every request is verified: Identity + Device + Location + Behavior + Risk
 */

import {
  ZeroTrustContext,
  DeviceTrust,
  PolicyDecision,
  AccessCondition,
  TrustLevel,
  ComplianceStatus,
  SecurityPolicy,
  PolicyCondition,
  PolicyAction
} from '../types/security.types';
import crypto from 'crypto';

export class ZeroTrustService {
  private policies: SecurityPolicy[] = [];
  private deviceRegistry: Map<string, DeviceTrust> = new Map();
  private riskThresholds = {
    low: 30,
    medium: 50,
    high: 70,
    critical: 90
  };

  constructor() {
    this.initializeDefaultPolicies();
  }

  /**
   * Main Zero Trust evaluation
   * Every access request goes through this
   */
  async evaluateAccess(context: ZeroTrustContext, resource: string, action: string): Promise<PolicyDecision> {
    console.log(`🔐 Zero Trust: Evaluating access for user ${context.userId} to ${resource}`);

    // Step 1: Verify identity
    const identityScore = await this.verifyIdentity(context);

    // Step 2: Assess device trust
    const deviceTrust = await this.assessDeviceTrust(context);

    // Step 3: Verify location
    const locationScore = await this.verifyLocation(context);

    // Step 4: Analyze behavior
    const behaviorScore = await this.analyzeBehavior(context);

    // Step 5: Calculate overall risk score
    const riskScore = this.calculateRiskScore({
      identity: identityScore,
      device: deviceTrust.riskScore,
      location: locationScore,
      behavior: behaviorScore
    });

    // Step 6: Check conditions
    const conditions = await this.evaluateConditions(context, deviceTrust);

    // Step 7: Apply policies
    const decision = await this.applyPolicies(context, resource, action, riskScore, conditions);

    // Step 8: Log decision
    await this.logAccessDecision(context, resource, action, decision);

    return decision;
  }

  /**
   * Verify user identity
   */
  private async verifyIdentity(context: ZeroTrustContext): Promise<number> {
    let score = 100;

    // Check session validity
    if (!context.sessionId) {
      score -= 50;
    }

    // Check user agent consistency
    if (!context.userAgent) {
      score -= 20;
    }

    // Check TLS certificate
    if (!context.certificateHash) {
      score -= 10;
    }

    return Math.max(0, score);
  }

  /**
   * Assess device trust level
   */
  private async assessDeviceTrust(context: ZeroTrustContext): Promise<DeviceTrust> {
    let existingTrust = this.deviceRegistry.get(context.deviceId);

    if (!existingTrust) {
      // New device - create trust record
      existingTrust = {
        deviceId: context.deviceId,
        trustLevel: TrustLevel.UNKNOWN,
        certificateValid: false,
        tpmAttested: false,
        secureBootEnabled: false,
        osVersion: 'Unknown',
        lastSeen: new Date(),
        complianceStatus: ComplianceStatus.UNKNOWN,
        riskScore: 50
      };
      this.deviceRegistry.set(context.deviceId, existingTrust);
    }

    // Calculate device risk score
    let deviceRiskScore = 0;

    if (existingTrust.certificateValid) deviceRiskScore += 25;
    if (existingTrust.tpmAttested) deviceRiskScore += 25;
    if (existingTrust.secureBootEnabled) deviceRiskScore += 20;
    if (existingTrust.complianceStatus === ComplianceStatus.COMPLIANT) deviceRiskScore += 20;
    if (existingTrust.trustLevel >= TrustLevel.MEDIUM) deviceRiskScore += 10;

    existingTrust.riskScore = 100 - deviceRiskScore;
    existingTrust.lastSeen = new Date();

    return existingTrust;
  }

  /**
   * Verify location trust
   */
  private async verifyLocation(context: ZeroTrustContext): Promise<number> {
    let score = 100;

    // Check if location is from known branch
    const isKnownLocation = await this.isKnownLocation(context.location);
    if (!isKnownLocation) {
      score -= 30;
    }

    // Check if IP is suspicious
    const isSuspiciousIP = await this.isSuspiciousIP(context.ipAddress);
    if (isSuspiciousIP) {
      score -= 40;
    }

    // Check for rapid location changes (impossible travel)
    const impossibleTravel = await this.detectImpossibleTravel(context.userId, context.location);
    if (impossibleTravel) {
      score -= 50;
    }

    return Math.max(0, score);
  }

  /**
   * Analyze user behavior
   */
  private async analyzeBehavior(context: ZeroTrustContext): Promise<number> {
    let score = 100;

    // Check access patterns
    const unusualTime = await this.isUnusualAccessTime(context.userId, context.timestamp);
    if (unusualTime) {
      score -= 20;
    }

    // Check for rapid requests (potential bot)
    const rapidRequests = await this.detectRapidRequests(context.userId, context.sessionId);
    if (rapidRequests) {
      score -= 30;
    }

    // Check for privilege escalation attempts
    const escalationAttempt = await this.detectEscalationAttempt(context.userId);
    if (escalationAttempt) {
      score -= 50;
    }

    return Math.max(0, score);
  }

  /**
   * Calculate overall risk score
   */
  private calculateRiskScore(scores: {
    identity: number;
    device: number;
    location: number;
    behavior: number;
  }): number {
    // Weighted average
    const weights = {
      identity: 0.3,
      device: 0.25,
      location: 0.2,
      behavior: 0.25
    };

    const riskScore = 
      (100 - scores.identity) * weights.identity +
      scores.device * weights.device +
      (100 - scores.location) * weights.location +
      (100 - scores.behavior) * weights.behavior;

    return Math.round(riskScore);
  }

  /**
   * Evaluate access conditions
   */
  private async evaluateConditions(context: ZeroTrustContext, deviceTrust: DeviceTrust): Promise<AccessCondition[]> {
    const conditions: AccessCondition[] = [];

    // MFA condition
    conditions.push({
      type: 'MFA',
      required: true,
      satisfied: this.checkMFAStatus(context),
      details: 'Multi-factor authentication required'
    });

    // VPN condition for remote access
    conditions.push({
      type: 'VPN',
      required: !await this.isKnownLocation(context.location),
      satisfied: this.checkVPNStatus(context),
      details: 'VPN required for remote access'
    });

    // Time-based condition
    const isBusinessHours = this.isBusinessHours(context.timestamp);
    conditions.push({
      type: 'TIME',
      required: false,
      satisfied: isBusinessHours,
      details: isBusinessHours ? 'Access during business hours' : 'Access outside business hours'
    });

    // Device compliance
    conditions.push({
      type: 'DEVICE',
      required: true,
      satisfied: deviceTrust.complianceStatus === ComplianceStatus.COMPLIANT,
      details: 'Device must be compliant'
    });

    // Behavior condition
    conditions.push({
      type: 'BEHAVIOR',
      required: true,
      satisfied: deviceTrust.riskScore < this.riskThresholds.medium,
      details: 'Normal behavior pattern required'
    });

    return conditions;
  }

  /**
   * Apply security policies
   */
  private async applyPolicies(
    context: ZeroTrustContext,
    resource: string,
    action: string,
    riskScore: number,
    conditions: AccessCondition[]
  ): Promise<PolicyDecision> {
    // Check if all required conditions are satisfied
    const unsatisfiedConditions = conditions.filter(c => c.required && !c.satisfied);

    // Default decision
    let decision: PolicyDecision = {
      allowed: false,
      reason: 'Default deny',
      riskScore,
      requiredActions: [],
      conditions,
      expiresAt: new Date(Date.now() + 3600000) // 1 hour
    };

    // Low risk - allow
    if (riskScore < this.riskThresholds.low && unsatisfiedConditions.length === 0) {
      decision.allowed = true;
      decision.reason = 'Low risk - access granted';
      return decision;
    }

    // Medium risk - allow with monitoring
    if (riskScore < this.riskThresholds.medium && unsatisfiedConditions.length === 0) {
      decision.allowed = true;
      decision.reason = 'Medium risk - access granted with enhanced monitoring';
      decision.requiredActions = ['ENHANCED_LOGGING', 'CONTINUOUS_MONITORING'];
      return decision;
    }

    // High risk - challenge required
    if (riskScore < this.riskThresholds.high) {
      decision.allowed = false;
      decision.reason = 'High risk - additional verification required';
      decision.requiredActions = ['MFA_CHALLENGE', 'MANAGER_APPROVAL', 'DEVICE_VERIFICATION'];
      return decision;
    }

    // Critical risk - deny
    if (riskScore >= this.riskThresholds.critical) {
      decision.allowed = false;
      decision.reason = 'Critical risk - access denied';
      decision.requiredActions = ['SECURITY_REVIEW', 'DEVICE_QUARANTINE', 'INCIDENT_REPORT'];
      return decision;
    }

    // Unsatisfied conditions
    if (unsatisfiedConditions.length > 0) {
      decision.allowed = false;
      decision.reason = `Missing required conditions: ${unsatisfiedConditions.map(c => c.type).join(', ')}`;
      decision.requiredActions = unsatisfiedConditions.map(c => `SATISFY_${c.type}`);
      return decision;
    }

    return decision;
  }

  /**
   * Register a device with certificate and TPM attestation
   */
  async registerDevice(
    deviceId: string,
    certificate: string,
    tpmAttestation?: any,
    secureBootStatus?: boolean
  ): Promise<DeviceTrust> {
    const certificateValid = this.verifyCertificate(certificate);
    const tpmAttested = tpmAttestation ? this.verifyTPMAttestation(tpmAttestation) : false;

    const trustLevel = this.calculateTrustLevel(certificateValid, tpmAttested, secureBootStatus);

    const deviceTrust: DeviceTrust = {
      deviceId,
      trustLevel,
      certificateValid,
      tpmAttested,
      secureBootEnabled: secureBootStatus || false,
      osVersion: 'Unknown',
      lastSeen: new Date(),
      complianceStatus: certificateValid && tpmAttested ? ComplianceStatus.COMPLIANT : ComplianceStatus.NON_COMPLIANT,
      riskScore: this.calculateDeviceRiskScore(certificateValid, tpmAttested, secureBootStatus)
    };

    this.deviceRegistry.set(deviceId, deviceTrust);

    console.log(`✓ Device registered: ${deviceId} with trust level ${trustLevel}`);

    return deviceTrust;
  }

  /**
   * Update device trust status
   */
  async updateDeviceTrust(deviceId: string, updates: Partial<DeviceTrust>): Promise<DeviceTrust | null> {
    const device = this.deviceRegistry.get(deviceId);
    
    if (!device) {
      return null;
    }

    Object.assign(device, updates);
    device.lastSeen = new Date();

    // Recalculate trust level
    device.trustLevel = this.calculateTrustLevel(
      device.certificateValid,
      device.tpmAttested,
      device.secureBootEnabled
    );

    // Recalculate risk score
    device.riskScore = this.calculateDeviceRiskScore(
      device.certificateValid,
      device.tpmAttested,
      device.secureBootEnabled
    );

    return device;
  }

  /**
   * Get device trust status
   */
  async getDeviceTrust(deviceId: string): Promise<DeviceTrust | null> {
    return this.deviceRegistry.get(deviceId) || null;
  }

  /**
   * List all devices
   */
  async listDevices(filter?: { trustLevel?: TrustLevel; complianceStatus?: ComplianceStatus }): Promise<DeviceTrust[]> {
    let devices = Array.from(this.deviceRegistry.values());

    if (filter?.trustLevel !== undefined) {
      devices = devices.filter(d => d.trustLevel === filter.trustLevel);
    }

    if (filter?.complianceStatus) {
      devices = devices.filter(d => d.complianceStatus === filter.complianceStatus);
    }

    return devices;
  }

  /**
   * Revoke device trust
   */
  async revokeDeviceTrust(deviceId: string, reason: string): Promise<boolean> {
    const device = this.deviceRegistry.get(deviceId);
    
    if (!device) {
      return false;
    }

    device.trustLevel = TrustLevel.UNKNOWN;
    device.complianceStatus = ComplianceStatus.NON_COMPLIANT;
    device.riskScore = 100;

    console.log(`⚠️ Device trust revoked: ${deviceId} - ${reason}`);

    return true;
  }

  // ============================================================================
  // Helper methods
  // ============================================================================

  private calculateTrustLevel(certificateValid: boolean, tpmAttested: boolean, secureBootEnabled?: boolean): TrustLevel {
    let score = 0;
    if (certificateValid) score += 2;
    if (tpmAttested) score += 2;
    if (secureBootEnabled) score += 1;

    if (score >= 5) return TrustLevel.FULL;
    if (score >= 4) return TrustLevel.HIGH;
    if (score >= 2) return TrustLevel.MEDIUM;
    if (score >= 1) return TrustLevel.LOW;
    return TrustLevel.UNKNOWN;
  }

  private calculateDeviceRiskScore(certificateValid: boolean, tpmAttested: boolean, secureBootEnabled?: boolean): number {
    let risk = 100;
    if (certificateValid) risk -= 30;
    if (tpmAttested) risk -= 30;
    if (secureBootEnabled) risk -= 20;
    return Math.max(0, risk);
  }

  private verifyCertificate(certificate: string): boolean {
    // In production, verify against CA
    return certificate.length > 0;
  }

  private verifyTPMAttestation(attestation: any): boolean {
    // In production, verify TPM attestation
    return attestation !== null;
  }

  private checkMFAStatus(context: ZeroTrustContext): boolean {
    // Check if MFA was completed for this session
    // In production, verify with auth service
    return true; // Placeholder
  }

  private checkVPNStatus(context: ZeroTrustContext): boolean {
    // Check if connection is through VPN
    // In production, check IP ranges or VPN markers
    return context.ipAddress.startsWith('10.') || context.ipAddress.startsWith('192.168.');
  }

  private isBusinessHours(timestamp: Date): boolean {
    const hour = timestamp.getHours();
    const day = timestamp.getDay();
    return day >= 1 && day <= 5 && hour >= 8 && hour <= 18;
  }

  private async isKnownLocation(location: any): Promise<boolean> {
    // In production, check against branch locations
    return true; // Placeholder
  }

  private async isSuspiciousIP(ip: string): Promise<boolean> {
    // In production, check against threat intelligence
    return false; // Placeholder
  }

  private async detectImpossibleTravel(userId: string, location: any): Promise<boolean> {
    // Check if user accessed from different location too quickly
    return false; // Placeholder
  }

  private async isUnusualAccessTime(userId: string, timestamp: Date): Promise<boolean> {
    // Check against user's normal access patterns
    const hour = timestamp.getHours();
    return hour < 6 || hour > 22;
  }

  private async detectRapidRequests(userId: string, sessionId: string): Promise<boolean> {
    // Check request rate
    return false; // Placeholder
  }

  private async detectEscalationAttempt(userId: string): Promise<boolean> {
    // Check for privilege escalation patterns
    return false; // Placeholder
  }

  private async logAccessDecision(context: ZeroTrustContext, resource: string, action: string, decision: PolicyDecision): Promise<void> {
    console.log({
      timestamp: new Date(),
      userId: context.userId,
      deviceId: context.deviceId,
      resource,
      action,
      allowed: decision.allowed,
      riskScore: decision.riskScore,
      reason: decision.reason
    });
  }

  private initializeDefaultPolicies(): void {
    // Initialize default security policies
    this.policies = [
      {
        id: 'default-deny',
        name: 'Default Deny',
        description: 'Deny all access by default',
        enabled: true,
        priority: 999,
        conditions: [],
        actions: [{ type: 'DENY', parameters: {} }],
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];
  }

  /**
   * Get Zero Trust metrics
   */
  async getMetrics(): Promise<any> {
    const devices = Array.from(this.deviceRegistry.values());
    const compliantDevices = devices.filter(d => d.complianceStatus === ComplianceStatus.COMPLIANT);
    const highRiskDevices = devices.filter(d => d.riskScore > this.riskThresholds.high);

    return {
      totalDevices: devices.length,
      compliantDevices: compliantDevices.length,
      nonCompliantDevices: devices.length - compliantDevices.length,
      highRiskDevices: highRiskDevices.length,
      averageRiskScore: devices.reduce((sum, d) => sum + d.riskScore, 0) / devices.length || 0,
      trustLevelDistribution: {
        unknown: devices.filter(d => d.trustLevel === TrustLevel.UNKNOWN).length,
        low: devices.filter(d => d.trustLevel === TrustLevel.LOW).length,
        medium: devices.filter(d => d.trustLevel === TrustLevel.MEDIUM).length,
        high: devices.filter(d => d.trustLevel === TrustLevel.HIGH).length,
        full: devices.filter(d => d.trustLevel === TrustLevel.FULL).length
      }
    };
  }
}

// ============================================================================
// Singleton instance
// ============================================================================

export const zeroTrustService = new ZeroTrustService();
