/**
 * Zero Trust Policy Engine
 * Continuous verification and risk-based access control
 */

import { IZeroTrustPolicyEngine } from '../interfaces.js';
import {
  ZeroTrustPolicy,
  AccessRequest,
  AccessResponse,
  ZeroTrustContext,
  AccessDecision,
  TrustLevel
} from '../types.js';
import { getDatabase } from '../../config/database.js';
import { EventEmitter } from 'events';

export class ZeroTrustPolicyEngine extends EventEmitter implements IZeroTrustPolicyEngine {
  private readonly MAX_RISK_SCORE = 100;
  private readonly SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

  /**
   * Create a new policy
   */
  async createPolicy(policy: Omit<ZeroTrustPolicy, 'id' | 'createdAt' | 'updatedAt'>): Promise<ZeroTrustPolicy> {
    const db = getDatabase();

    const newPolicy: ZeroTrustPolicy = {
      id: this.generateId(),
      ...policy,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await db.collection('zero_trust_policies').insertOne(newPolicy);

    this.emit('policy:created', { policyId: newPolicy.id, name: newPolicy.name });

    return newPolicy;
  }

  /**
   * Get policy by ID
   */
  async getPolicy(id: string): Promise<ZeroTrustPolicy> {
    const db = getDatabase();
    
    const policy = await db.collection('zero_trust_policies').findOne({ id });
    
    if (!policy) {
      throw new Error('Policy not found');
    }
    
    return policy;
  }

  /**
   * List policies
   */
  async listPolicies(enabled?: boolean): Promise<ZeroTrustPolicy[]> {
    const db = getDatabase();
    
    const query = enabled !== undefined ? { enabled } : {};
    
    return await db.collection('zero_trust_policies')
      .find(query)
      .sort({ priority: 1 })
      .toArray();
  }

  /**
   * Update policy
   */
  async updatePolicy(id: string, updates: Partial<ZeroTrustPolicy>): Promise<ZeroTrustPolicy> {
    const db = getDatabase();
    
    const result = await db.collection('zero_trust_policies').findOneAndUpdate(
      { id },
      { $set: { ...updates, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
    
    if (!result.value) {
      throw new Error('Policy not found');
    }
    
    this.emit('policy:updated', { policyId: id });
    
    return result.value;
  }

  /**
   * Delete policy
   */
  async deletePolicy(id: string): Promise<void> {
    const db = getDatabase();
    
    await db.collection('zero_trust_policies').deleteOne({ id });
    
    this.emit('policy:deleted', { policyId: id });
  }

  /**
   * Evaluate access request against all policies
   */
  async evaluateAccess(request: AccessRequest): Promise<AccessResponse> {
    const policies = await this.listPolicies(true);
    
    // Calculate risk score
    const riskScore = await this.calculateRiskScore(request.context);
    request.context.riskScore = riskScore;

    // Check device trust
    const deviceTrusted = await this.verifyDevice(request.context.deviceId);
    request.context.deviceTrusted = deviceTrusted;

    // Evaluate policies in priority order
    for (const policy of policies) {
      const matches = await this.evaluatePolicy(policy, request);
      
      if (matches) {
        const response: AccessResponse = {
          decision: policy.action,
          reason: `Matched policy: ${policy.name}`,
          policies: [policy.id],
          riskScore
        };

        // Additional checks based on policy
        if (policy.requireMFA && !request.context.mfaVerified) {
          response.decision = AccessDecision.CHALLENGE;
          response.requiresChallenge = true;
          response.challengeType = 'mfa';
        }

        if (policy.maxRiskScore && riskScore > policy.maxRiskScore) {
          response.decision = AccessDecision.DENY;
          response.reason = `Risk score ${riskScore} exceeds policy maximum ${policy.maxRiskScore}`;
        }

        // Log access decision
        await this.logAccessDecision(request, response);

        this.emit('access:evaluated', {
          userId: request.context.userId,
          resource: request.resource,
          decision: response.decision,
          riskScore
        });

        return response;
      }
    }

    // Default deny if no policy matches
    const response: AccessResponse = {
      decision: AccessDecision.DENY,
      reason: 'No matching policy found',
      policies: [],
      riskScore
    };

    await this.logAccessDecision(request, response);

    return response;
  }

  /**
   * Evaluate a single policy
   */
  private async evaluatePolicy(policy: ZeroTrustPolicy, request: AccessRequest): Promise<boolean> {
    for (const condition of policy.conditions) {
      if (!await this.evaluateCondition(condition, request)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Evaluate a single condition
   */
  private async evaluateCondition(condition: any, request: AccessRequest): Promise<boolean> {
    const { context } = request;
    
    switch (condition.type) {
      case 'user':
        return condition.operator === 'equals'
          ? context.userId === condition.value
          : condition.operator === 'in'
          ? condition.value.includes(context.userId)
          : false;
      
      case 'device':
        return context.deviceTrusted === condition.value;
      
      case 'location':
        if (condition.operator === 'equals') {
          return context.location?.country === condition.value;
        }
        return false;
      
      case 'risk':
        return this.compareValues(context.riskScore, condition.operator, condition.value);
      
      case 'time':
        return this.evaluateTimeCondition(condition, context.timestamp);
      
      default:
        return false;
    }
  }

  /**
   * Compare values based on operator
   */
  private compareValues(actual: any, operator: string, expected: any): boolean {
    switch (operator) {
      case 'equals':
        return actual === expected;
      case 'gt':
        return actual > expected;
      case 'lt':
        return actual < expected;
      case 'in':
        return Array.isArray(expected) && expected.includes(actual);
      default:
        return false;
    }
  }

  /**
   * Evaluate time-based condition
   */
  private evaluateTimeCondition(condition: any, timestamp: Date): boolean {
    const hour = timestamp.getHours();
    const day = timestamp.getDay();

    // Support operators: 'between' with [startHour, endHour], 'equals' with specific hour or day
    if (condition.operator === 'between' && Array.isArray(condition.value) && condition.value.length === 2) {
      const start = Number(condition.value[0]);
      const end = Number(condition.value[1]);
      if (start <= end) {
        return hour >= start && hour <= end;
      }
      // Wrap-around (e.g., 22 -> 4)
      return hour >= start || hour <= end;
    }

    if (condition.operator === 'equals') {
      // If value is a day name or day number, handle accordingly
      if (typeof condition.value === 'number') {
        return day === condition.value;
      }
      if (typeof condition.value === 'string') {
        const map: Record<string, number> = {
          sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6
        };
        const v = condition.value.toLowerCase();
        return map[v] === day || Number(v) === hour;
      }
    }

    if (condition.operator === 'in' && Array.isArray(condition.value)) {
      // Value may be array of allowed hours or days
      return condition.value.includes(hour) || condition.value.includes(day);
    }

    // Default deny for unknown time conditions
    return false;
  }

  /**
   * Calculate risk score based on context
   */
  async calculateRiskScore(context: ZeroTrustContext): Promise<number> {
    let score = 0;

    // Base risk: 20
    score += 20;

    // MFA verification
    if (!context.mfaVerified) {
      score += 30;
    }

    // Device trust
    if (!context.deviceTrusted) {
      score += 25;
    }

    // Location risk (check if known/trusted location)
    if (context.location) {
      const locationRisk = await this.assessLocationRisk(context.location);
      score += locationRisk;
    }

    // Time-based risk (unusual hours)
    const hour = context.timestamp.getHours();
    if (hour < 6 || hour > 22) {
      score += 10;
    }

    // Behavioral risk (velocity, impossible travel, etc.)
    const behavioralRisk = await this.assessBehavioralRisk(context);
    score += behavioralRisk;

    return Math.min(score, this.MAX_RISK_SCORE);
  }

  /**
   * Assess location risk
   */
  private async assessLocationRisk(location: any): Promise<number> {
    // Check against known good/bad locations
    // For now, return low risk
    return 5;
  }

  /**
   * Assess behavioral risk
   */
  private async assessBehavioralRisk(context: ZeroTrustContext): Promise<number> {
    // Check for:
    // - Impossible travel
    // - Unusual access patterns
    // - Velocity checks
    return 0;
  }

  /**
   * Verify device trust status
   */
  async verifyDevice(deviceId: string): Promise<boolean> {
    const db = getDatabase();
    
    const device = await db.collection('trusted_devices').findOne({ deviceId });
    
    return device && device.trusted === true;
  }

  /**
   * Register a trusted device
   */
  async registerDevice(deviceId: string, userId: string, metadata: Record<string, any>): Promise<void> {
    const db = getDatabase();
    
    await db.collection('trusted_devices').insertOne({
      deviceId,
      userId,
      trusted: true,
      registeredAt: new Date(),
      metadata
    });

    this.emit('device:registered', { deviceId, userId });
  }

  /**
   * Start continuous authentication for a session
   */
  async startContinuousAuth(sessionId: string, context: ZeroTrustContext): Promise<void> {
    const db = getDatabase();
    
    await db.collection('active_sessions').insertOne({
      sessionId,
      userId: context.userId,
      deviceId: context.deviceId,
      startedAt: new Date(),
      lastVerified: new Date(),
      context
    });

    this.emit('session:started', { sessionId, userId: context.userId });
  }

  /**
   * Check continuous authentication status
   */
  async checkAuthStatus(sessionId: string): Promise<boolean> {
    const db = getDatabase();
    
    const session = await db.collection('active_sessions').findOne({ sessionId });
    
    if (!session) {
      return false;
    }

    const now = Date.now();
    const lastVerified = new Date(session.lastVerified).getTime();
    
    if (now - lastVerified > this.SESSION_TIMEOUT_MS) {
      return false;
    }

    // Update last verified
    await db.collection('active_sessions').updateOne(
      { sessionId },
      { $set: { lastVerified: new Date() } }
    );

    return true;
  }

  /**
   * Log access decision
   */
  private async logAccessDecision(request: AccessRequest, response: AccessResponse): Promise<void> {
    const db = getDatabase();
    
    await db.collection('access_logs').insertOne({
      id: this.generateId(),
      userId: request.context.userId,
      deviceId: request.context.deviceId,
      resource: request.resource,
      action: request.action,
      decision: response.decision,
      reason: response.reason,
      riskScore: response.riskScore,
      timestamp: new Date()
    });
  }

  private generateId(): string {
    return `zt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      const db = getDatabase();
      const policyCount = await db.collection('zero_trust_policies').countDocuments({ enabled: true });
      const sessionCount = await db.collection('active_sessions').countDocuments();
      
      return {
        status: 'healthy',
        details: {
          activePolicies: policyCount,
          activeSessions: sessionCount
        }
      };
    } catch (error: unknown) {
      return {
        status: 'unhealthy',
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }
}
