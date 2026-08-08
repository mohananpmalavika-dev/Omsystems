/**
 * Identity Provider
 * Verifies user identity, session validity, and account status
 */

import {
  IIdentityProvider,
  ProviderContext,
  IdentityVerificationResult,
  UserContext,
  IdentityClaim,
  SecurityVerdict,
  ThreatLevel
} from './types';
import crypto from 'crypto';

interface SessionRecord {
  sessionId: string;
  userId: string;
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
  ipAddress: string;
  userAgent: string;
  invalidated: boolean;
}

interface LoginAttempt {
  userId: string;
  timestamp: Date;
  success: boolean;
  ipAddress: string;
}

export class IdentityProvider implements IIdentityProvider {
  readonly name = 'IdentityProvider';
  readonly version = '1.0.0';

  private sessions: Map<string, SessionRecord> = new Map();
  private userContexts: Map<string, UserContext> = new Map();
  private loginAttempts: Map<string, LoginAttempt[]> = new Map();
  
  private readonly SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
  private readonly ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

  /**
   * Verify user identity and session
   */
  async verify(context: ProviderContext): Promise<IdentityVerificationResult> {
    const startTime = Date.now();
    let score = 0;
    const evidence: Record<string, any> = {};
    const reasons: string[] = [];

    // 1. Check if user exists
    const userContext = await this.getUserContext(context.userId);
    const userExists = userContext !== null;
    evidence.userExists = userExists;

    if (!userExists) {
      return {
        verdict: SecurityVerdict.DENY,
        score: 100,
        confidence: 1.0,
        reason: 'User does not exist',
        evidence,
        userExists: false,
        accountActive: false,
        accountLocked: false,
        passwordExpired: false,
        sessionValid: false,
        identityClaims: []
      };
    }

    // 2. Check account status
    const accountActive = userContext!.failedLoginAttempts < this.MAX_FAILED_ATTEMPTS;
    evidence.accountActive = accountActive;

    // 3. Check if account is locked
    const accountLocked = await this.isAccountLocked(context.userId);
    evidence.accountLocked = accountLocked;

    if (accountLocked) {
      score += 80;
      reasons.push('Account is locked due to failed login attempts');
    }

    // 4. Check password expiry
    const passwordExpired = this.isPasswordExpired(userContext!.lastPasswordChange);
    evidence.passwordExpired = passwordExpired;

    if (passwordExpired) {
      score += 30;
      reasons.push('Password has expired and needs reset');
    }

    // 5. Validate session
    const sessionValid = await this.validateSession(context.sessionId);
    evidence.sessionValid = sessionValid;

    if (!sessionValid) {
      score += 50;
      reasons.push('Session is invalid or expired');
    } else {
      // Verify session belongs to this user
      const session = this.sessions.get(context.sessionId);
      if (session && session.userId !== context.userId) {
        score += 100;
        reasons.push('Session does not belong to this user');
        evidence.sessionMismatch = true;
      } else if (session) {
        // Check for session hijacking indicators
        const hijackScore = this.detectSessionHijacking(session, context);
        score += hijackScore;
        evidence.hijackScore = hijackScore;
        
        if (hijackScore > 0) {
          reasons.push(`Possible session hijacking detected (score: ${hijackScore})`);
        }

        // Update session activity
        session.lastActivityAt = new Date();
      }
    }

    // 6. Verify identity claims
    const identityClaims = this.getIdentityClaims(userContext!);
    evidence.identityClaims = identityClaims;
    evidence.verifiedClaims = identityClaims.filter(c => c.verified).length;

    const unverifiedClaims = identityClaims.filter(c => !c.verified).length;
    if (unverifiedClaims > 0) {
      score += unverifiedClaims * 5;
      reasons.push(`${unverifiedClaims} unverified identity claims`);
    }

    // 7. Check recent failed login attempts
    const recentFailures = this.getRecentFailedAttempts(context.userId);
    evidence.recentFailedAttempts = recentFailures;

    if (recentFailures > 0) {
      score += Math.min(recentFailures * 10, 40);
      reasons.push(`${recentFailures} recent failed login attempts`);
    }

    // 8. Check time since last successful login
    if (userContext!.lastSuccessfulLogin) {
      const daysSinceLastLogin = (Date.now() - userContext!.lastSuccessfulLogin.getTime()) / (1000 * 60 * 60 * 24);
      evidence.daysSinceLastLogin = daysSinceLastLogin;

      if (daysSinceLastLogin > 90) {
        score += 15;
        reasons.push('No login activity for over 90 days');
      } else if (daysSinceLastLogin > 30) {
        score += 5;
        reasons.push('No login activity for over 30 days');
      }
    }

    // Determine verdict
    let verdict: SecurityVerdict;
    let confidence = 0.9;

    if (accountLocked || !accountActive) {
      verdict = SecurityVerdict.DENY;
      confidence = 1.0;
    } else if (passwordExpired) {
      verdict = SecurityVerdict.CHALLENGE;
      confidence = 0.95;
    } else if (score >= 70) {
      verdict = SecurityVerdict.DENY;
    } else if (score >= 40) {
      verdict = SecurityVerdict.CHALLENGE;
      confidence = 0.85;
    } else if (score >= 20) {
      verdict = SecurityVerdict.REVIEW;
      confidence = 0.8;
    } else {
      verdict = SecurityVerdict.ALLOW;
    }

    evidence.processingTimeMs = Date.now() - startTime;

    const requiredActions: string[] = [];
    if (passwordExpired) requiredActions.push('PASSWORD_RESET');
    if (accountLocked) requiredActions.push('CONTACT_ADMIN');
    if (recentFailures > 3) requiredActions.push('VERIFY_IDENTITY');

    return {
      verdict,
      score: Math.min(score, 100),
      confidence,
      reason: reasons.length > 0 ? reasons.join('; ') : 'Identity verification passed',
      evidence,
      userExists,
      accountActive,
      accountLocked,
      passwordExpired,
      sessionValid,
      identityClaims,
      requiredActions: requiredActions.length > 0 ? requiredActions : undefined
    };
  }

  /**
   * Get user context by ID
   */
  async getUserContext(userId: string): Promise<UserContext | null> {
    return this.userContexts.get(userId) || null;
  }

  /**
   * Validate session
   */
  async validateSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return false;
    }

    // Check if session is invalidated
    if (session.invalidated) {
      return false;
    }

    // Check if session has expired
    const now = Date.now();
    if (now > session.expiresAt.getTime()) {
      session.invalidated = true;
      return false;
    }

    // Check if session has timed out (no activity)
    const timeSinceActivity = now - session.lastActivityAt.getTime();
    if (timeSinceActivity > this.SESSION_TIMEOUT_MS) {
      session.invalidated = true;
      return false;
    }

    return true;
  }

  /**
   * Record login attempt
   */
  async recordLoginAttempt(userId: string, success: boolean, ipAddress?: string): Promise<void> {
    const attempts = this.loginAttempts.get(userId) || [];
    
    attempts.push({
      userId,
      timestamp: new Date(),
      success,
      ipAddress: ipAddress || 'unknown'
    });

    // Keep only recent attempts (within window)
    const cutoff = Date.now() - this.ATTEMPT_WINDOW_MS;
    const recentAttempts = attempts.filter(a => a.timestamp.getTime() > cutoff);
    this.loginAttempts.set(userId, recentAttempts);

    // Update user context
    const userContext = this.userContexts.get(userId);
    if (userContext) {
      if (success) {
        userContext.lastSuccessfulLogin = new Date();
        userContext.failedLoginAttempts = 0;
      } else {
        userContext.failedLoginAttempts = this.getRecentFailedAttempts(userId);
      }
    }
  }

  /**
   * Create a new session
   */
  async createSession(
    userId: string,
    ipAddress: string,
    userAgent: string,
    durationMs: number = 8 * 60 * 60 * 1000 // 8 hours default
  ): Promise<string> {
    const sessionId = this.generateSessionId();
    const now = new Date();

    const session: SessionRecord = {
      sessionId,
      userId,
      createdAt: now,
      lastActivityAt: now,
      expiresAt: new Date(Date.now() + durationMs),
      ipAddress,
      userAgent,
      invalidated: false
    };

    this.sessions.set(sessionId, session);

    return sessionId;
  }

  /**
   * Invalidate a session
   */
  async invalidateSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return false;
    }

    session.invalidated = true;
    return true;
  }

  /**
   * Invalidate all sessions for a user
   */
  async invalidateAllUserSessions(userId: string): Promise<number> {
    let count = 0;
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.userId === userId && !session.invalidated) {
        session.invalidated = true;
        count++;
      }
    }

    return count;
  }

  /**
   * Register or update user context
   */
  async registerUser(userContext: UserContext): Promise<void> {
    this.userContexts.set(userContext.userId, userContext);
  }

  /**
   * Update user context
   */
  async updateUserContext(userId: string, updates: Partial<UserContext>): Promise<boolean> {
    const userContext = this.userContexts.get(userId);
    
    if (!userContext) {
      return false;
    }

    Object.assign(userContext, updates);
    return true;
  }

  /**
   * Lock user account
   */
  async lockAccount(userId: string, reason: string): Promise<void> {
    const userContext = this.userContexts.get(userId);
    
    if (userContext) {
      userContext.failedLoginAttempts = this.MAX_FAILED_ATTEMPTS;
    }

    console.log(`🔒 Account locked: ${userId} - ${reason}`);
  }

  /**
   * Unlock user account
   */
  async unlockAccount(userId: string): Promise<boolean> {
    const userContext = this.userContexts.get(userId);
    
    if (!userContext) {
      return false;
    }

    userContext.failedLoginAttempts = 0;
    
    // Clear login attempts
    this.loginAttempts.delete(userId);

    console.log(`🔓 Account unlocked: ${userId}`);
    return true;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    // Clean up expired sessions
    await this.cleanupExpiredSessions();
    
    return true;
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private detectSessionHijacking(session: SessionRecord, context: ProviderContext): number {
    let score = 0;

    // Check if IP address changed
    if (session.ipAddress !== context.ipAddress) {
      score += 30;
    }

    // Check if user agent changed
    if (session.userAgent !== context.userAgent) {
      score += 40;
    }

    return score;
  }

  private isAccountLocked(userId: string): boolean {
    const userContext = this.userContexts.get(userId);
    
    if (!userContext) {
      return false;
    }

    const recentFailures = this.getRecentFailedAttempts(userId);
    
    return recentFailures >= this.MAX_FAILED_ATTEMPTS;
  }

  private isPasswordExpired(lastPasswordChange: Date): boolean {
    const daysSinceChange = (Date.now() - lastPasswordChange.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceChange > 90; // 90-day password policy
  }

  private getIdentityClaims(userContext: UserContext): IdentityClaim[] {
    const claims: IdentityClaim[] = [];

    // Email claim
    if (userContext.email) {
      claims.push({
        type: 'email',
        value: userContext.email,
        verified: true, // Assume verified for now
        verifiedAt: userContext.accountCreatedAt
      });
    }

    // Employee ID claim
    if (userContext.employeeId) {
      claims.push({
        type: 'employee_id',
        value: userContext.employeeId,
        verified: true,
        verifiedAt: userContext.accountCreatedAt
      });
    }

    // Role claims
    userContext.roles.forEach(role => {
      claims.push({
        type: 'role',
        value: role,
        verified: true,
        verifiedAt: userContext.accountCreatedAt
      });
    });

    // Department claims
    userContext.departments.forEach(dept => {
      claims.push({
        type: 'department',
        value: dept,
        verified: true,
        verifiedAt: userContext.accountCreatedAt
      });
    });

    return claims;
  }

  private getRecentFailedAttempts(userId: string): number {
    const attempts = this.loginAttempts.get(userId) || [];
    const cutoff = Date.now() - this.ATTEMPT_WINDOW_MS;
    
    return attempts.filter(a => !a.success && a.timestamp.getTime() > cutoff).length;
  }

  private generateSessionId(): string {
    return `sess_${Date.now()}_${crypto.randomBytes(16).toString('hex')}`;
  }

  private async cleanupExpiredSessions(): Promise<void> {
    const now = Date.now();
    const expiredSessions: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.invalidated || now > session.expiresAt.getTime()) {
        expiredSessions.push(sessionId);
      }
    }

    expiredSessions.forEach(sessionId => this.sessions.delete(sessionId));

    if (expiredSessions.length > 0) {
      console.log(`🧹 Cleaned up ${expiredSessions.length} expired sessions`);
    }
  }

  /**
   * Get session statistics
   */
  async getSessionStats(): Promise<{
    totalSessions: number;
    activeSessions: number;
    expiredSessions: number;
  }> {
    let activeSessions = 0;
    let expiredSessions = 0;
    const now = Date.now();

    for (const session of this.sessions.values()) {
      if (session.invalidated || now > session.expiresAt.getTime()) {
        expiredSessions++;
      } else {
        activeSessions++;
      }
    }

    return {
      totalSessions: this.sessions.size,
      activeSessions,
      expiredSessions
    };
  }

  /**
   * Get user sessions
   */
  async getUserSessions(userId: string): Promise<SessionRecord[]> {
    const sessions: SessionRecord[] = [];

    for (const session of this.sessions.values()) {
      if (session.userId === userId && !session.invalidated) {
        sessions.push(session);
      }
    }

    return sessions;
  }
}
