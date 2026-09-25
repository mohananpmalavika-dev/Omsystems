/**
 * KryptoVision Connect - WebRTC Media Provider Abstraction
 * 
 * Vendor-neutral abstraction for WebRTC session management.
 * Supports self-hosted TURN servers and SFU architectures.
 * 
 * Design principles:
 * - Do not tightly couple to one WebRTC provider
 * - Support self-hosted infrastructure (preferred)
 * - Opus codec for audio
 * - Encrypted WebRTC media (DTLS-SRTP)
 * - TURN support mandatory for NAT traversal
 */

import type { RedisClientType } from 'redis';
import type { Logger } from 'pino';
import type {
  TurnServer,
  MediaSession,
  ParticipantToken,
  SessionMetrics,
  QualityMetrics
} from '../domain/types.js';
import { MEDIA_SESSION_TTL_SECONDS, PARTICIPANT_TOKEN_TTL_SECONDS } from '../domain/constants.js';

// ============================================================================
// PROVIDER INTERFACE
// ============================================================================

export interface CreateMediaSessionInput {
  callId: string;
  tenantId: string;
  maxParticipants?: number;
  recordingEnabled?: boolean;
}

export interface CreateParticipantTokenInput {
  sessionId: string;
  participantId: string;
  participantType: 'device' | 'operator';
  canPublish: boolean;
  canSubscribe: boolean;
}

/**
 * WebRTC Media Provider Interface
 * 
 * Implementations must provide:
 * - Session lifecycle management
 * - Participant token generation
 * - TURN server credentials
 * - Quality metrics collection
 */
export interface VoiceMediaProvider {
  /**
   * Create a new media session for a call
   */
  createSession(input: CreateMediaSessionInput): Promise<MediaSession>;
  
  /**
   * Generate a token for a participant to join the session
   */
  createParticipantToken(input: CreateParticipantTokenInput): Promise<ParticipantToken>;
  
  /**
   * Disconnect a participant from the session
   */
  disconnectParticipant(sessionId: string, participantId: string): Promise<void>;
  
  /**
   * Close the media session entirely
   */
  closeSession(sessionId: string): Promise<void>;
  
  /**
   * Get quality metrics for a session
   */
  getSessionMetrics(sessionId: string): Promise<SessionMetrics | null>;
  
  /**
   * Report quality metrics from client
   */
  reportQualityMetrics(sessionId: string, participantId: string, metrics: QualityMetrics): Promise<void>;
}

// ============================================================================
// SELF-HOSTED TURN IMPLEMENTATION
// ============================================================================

interface SelfHostedVoiceMediaConfig {
  turnServerUrl: string;
  turnUsername: string;
  turnCredential: string;
  turnCredentialTtlSeconds?: number;
  redis: RedisClientType;
  logger: Logger;
}

/**
 * Self-Hosted WebRTC Media Provider
 * 
 * Uses simple peer-to-peer WebRTC with TURN fallback.
 * No external SFU dependency - clients negotiate directly.
 * 
 * Architecture:
 * - Peer-to-peer WebRTC media (no centralized SFU)
 * - TURN server for NAT traversal
 * - Redis for session state coordination
 * - JWT tokens for TURN authentication
 * 
 * Suitable for:
 * - Two-party calls (branch <-> VMS)
 * - Low-latency requirements
 * - Self-hosted infrastructure
 */
export class SelfHostedVoiceMediaProvider implements VoiceMediaProvider {
  private readonly turnServerUrl: string;
  private readonly turnUsername: string;
  private readonly turnCredential: string;
  private readonly turnCredentialTtl: number;
  private readonly redis: RedisClientType;
  private readonly logger: Logger;

  constructor(config: SelfHostedVoiceMediaConfig) {
    this.turnServerUrl = config.turnServerUrl;
    this.turnUsername = config.turnUsername;
    this.turnCredential = config.turnCredential;
    this.turnCredentialTtl = config.turnCredentialTtlSeconds ?? PARTICIPANT_TOKEN_TTL_SECONDS;
    this.redis = config.redis;
    this.logger = config.logger.child({ component: 'SelfHostedVoiceMediaProvider' });
  }

  /**
   * Create media session
   * 
   * For self-hosted P2P:
   * - Session ID is just the call ID
   * - TURN credentials are generated
   * - Session metadata stored in Redis
   */
  async createSession(input: CreateMediaSessionInput): Promise<MediaSession> {
    const sessionId = input.callId;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + MEDIA_SESSION_TTL_SECONDS * 1000);

    // Generate TURN server credentials
    const turnServers = this.generateTurnServers();

    // Store session metadata in Redis
    const sessionKey = `comm:media-session:${input.tenantId}:${sessionId}`;
    await this.redis.setEx(
      sessionKey,
      MEDIA_SESSION_TTL_SECONDS,
      JSON.stringify({
        sessionId,
        callId: input.callId,
        tenantId: input.tenantId,
        maxParticipants: input.maxParticipants ?? 10,
        recordingEnabled: input.recordingEnabled ?? false,
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        participantCount: 0
      })
    );

    this.logger.info({ sessionId, callId: input.callId }, 'Media session created');

    return {
      sessionId,
      callId: input.callId,
      turnServers,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString()
    };
  }

  /**
   * Generate participant token
   * 
   * For P2P architecture:
   * - Token is just an authorization JWT
   * - Contains participant identity and permissions
   * - Used to validate WebSocket signaling access
   */
  async createParticipantToken(input: CreateParticipantTokenInput): Promise<ParticipantToken> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.turnCredentialTtl * 1000);

    // Generate participant token (simple base64-encoded JSON for self-hosted)
    // In production, use proper JWT signing with secret key
    const tokenPayload = {
      sessionId: input.sessionId,
      participantId: input.participantId,
      participantType: input.participantType,
      canPublish: input.canPublish,
      canSubscribe: input.canSubscribe,
      iat: Math.floor(now.getTime() / 1000),
      exp: Math.floor(expiresAt.getTime() / 1000)
    };

    // TODO: Replace with proper JWT signing in production
    const token = Buffer.from(JSON.stringify(tokenPayload)).toString('base64url');

    // Store participant in session
    const participantKey = `comm:media-participant:${input.sessionId}:${input.participantId}`;
    await this.redis.setEx(
      participantKey,
      this.turnCredentialTtl,
      JSON.stringify({
        participantId: input.participantId,
        participantType: input.participantType,
        canPublish: input.canPublish,
        canSubscribe: input.canSubscribe,
        joinedAt: now.toISOString()
      })
    );

    // Increment participant count
    const sessionKey = `comm:media-session:${input.sessionId}`;
    const sessionData = await this.redis.get(sessionKey);
    if (sessionData) {
      const session = JSON.parse(sessionData);
      session.participantCount = (session.participantCount || 0) + 1;
      await this.redis.setEx(sessionKey, MEDIA_SESSION_TTL_SECONDS, JSON.stringify(session));
    }

    this.logger.info(
      { sessionId: input.sessionId, participantId: input.participantId },
      'Participant token created'
    );

    return {
      token,
      sessionId: input.sessionId,
      participantId: input.participantId,
      canPublish: input.canPublish,
      canSubscribe: input.canSubscribe,
      expiresAt: expiresAt.toISOString()
    };
  }

  /**
   * Disconnect participant
   */
  async disconnectParticipant(sessionId: string, participantId: string): Promise<void> {
    const participantKey = `comm:media-participant:${sessionId}:${participantId}`;
    await this.redis.del(participantKey);

    // Decrement participant count
    const sessionKey = `comm:media-session:${sessionId}`;
    const sessionData = await this.redis.get(sessionKey);
    if (sessionData) {
      const session = JSON.parse(sessionData);
      session.participantCount = Math.max(0, (session.participantCount || 1) - 1);
      await this.redis.setEx(sessionKey, MEDIA_SESSION_TTL_SECONDS, JSON.stringify(session));
    }

    this.logger.info({ sessionId, participantId }, 'Participant disconnected');
  }

  /**
   * Close session
   */
  async closeSession(sessionId: string): Promise<void> {
    // Delete session metadata
    const sessionKey = `comm:media-session:${sessionId}`;
    await this.redis.del(sessionKey);

    // Delete all participant keys (scan and delete)
    const participantPattern = `comm:media-participant:${sessionId}:*`;
    const participantKeys: string[] = [];
    
    for await (const key of this.redis.scanIterator({ MATCH: participantPattern, COUNT: 100 })) {
      participantKeys.push(key);
    }

    if (participantKeys.length > 0) {
      await this.redis.del(participantKeys);
    }

    // Delete metrics
    const metricsKey = `comm:media-metrics:${sessionId}`;
    await this.redis.del(metricsKey);

    this.logger.info({ sessionId, participantsRemoved: participantKeys.length }, 'Media session closed');
  }

  /**
   * Get session metrics
   */
  async getSessionMetrics(sessionId: string): Promise<SessionMetrics | null> {
    const metricsKey = `comm:media-metrics:${sessionId}`;
    const metricsData = await this.redis.get(metricsKey);

    if (!metricsData) {
      return null;
    }

    try {
      const metrics = JSON.parse(metricsData);
      return {
        sessionId,
        participantCount: metrics.participantCount || 0,
        avgRtt: metrics.avgRtt || 0,
        avgJitter: metrics.avgJitter || 0,
        avgPacketLoss: metrics.avgPacketLoss || 0,
        timestamp: metrics.timestamp || new Date().toISOString()
      };
    } catch (error) {
      this.logger.error({ error, sessionId }, 'Failed to parse session metrics');
      return null;
    }
  }

  /**
   * Report quality metrics from client
   * 
   * Aggregates metrics from all participants
   */
  async reportQualityMetrics(
    sessionId: string,
    participantId: string,
    metrics: QualityMetrics
  ): Promise<void> {
    // Store individual participant metrics
    const participantMetricsKey = `comm:media-metrics:${sessionId}:${participantId}`;
    await this.redis.setEx(
      participantMetricsKey,
      300, // 5 minutes
      JSON.stringify({
        rttMs: metrics.rttMs,
        jitterMs: metrics.jitterMs,
        packetLossPercent: metrics.packetLossPercent,
        bitrateKbps: metrics.bitrateKbps,
        timestamp: metrics.timestamp
      })
    );

    // Update aggregated session metrics
    await this.updateAggregatedMetrics(sessionId);

    this.logger.debug(
      { sessionId, participantId, rtt: metrics.rttMs, jitter: metrics.jitterMs },
      'Quality metrics reported'
    );
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Generate TURN server configuration
   */
  private generateTurnServers(): TurnServer[] {
    // For self-hosted TURN, credentials can be static or time-limited
    // In production, generate time-limited credentials using HMAC-SHA1
    return [
      {
        urls: [this.turnServerUrl],
        username: this.turnUsername,
        credential: this.turnCredential,
        credentialType: 'password'
      }
    ];
  }

  /**
   * Update aggregated session metrics
   */
  private async updateAggregatedMetrics(sessionId: string): Promise<void> {
    // Scan for all participant metrics
    const pattern = `comm:media-metrics:${sessionId}:*`;
    const metricsKeys: string[] = [];
    
    for await (const key of this.redis.scanIterator({ MATCH: pattern, COUNT: 100 })) {
      // Exclude the aggregated metrics key itself
      if (!key.endsWith(`:${sessionId}`)) {
        metricsKeys.push(key);
      }
    }

    if (metricsKeys.length === 0) {
      return;
    }

    // Fetch all participant metrics
    const metricsData = await this.redis.mGet(metricsKeys);
    const validMetrics = metricsData
      .filter((data): data is string => data !== null)
      .map(data => {
        try {
          return JSON.parse(data);
        } catch {
          return null;
        }
      })
      .filter((metrics): metrics is QualityMetrics => metrics !== null);

    if (validMetrics.length === 0) {
      return;
    }

    // Calculate averages
    const avgRtt = validMetrics.reduce((sum, m) => sum + m.rttMs, 0) / validMetrics.length;
    const avgJitter = validMetrics.reduce((sum, m) => sum + m.jitterMs, 0) / validMetrics.length;
    const avgPacketLoss = validMetrics.reduce((sum, m) => sum + m.packetLossPercent, 0) / validMetrics.length;

    // Store aggregated metrics
    const metricsKey = `comm:media-metrics:${sessionId}`;
    await this.redis.setEx(
      metricsKey,
      300, // 5 minutes
      JSON.stringify({
        participantCount: validMetrics.length,
        avgRtt: Math.round(avgRtt),
        avgJitter: Math.round(avgJitter),
        avgPacketLoss: Math.round(avgPacketLoss * 100) / 100,
        timestamp: new Date().toISOString()
      })
    );
  }
}

// ============================================================================
// PROVIDER FACTORY
// ============================================================================

export interface VoiceMediaProviderConfig {
  provider: 'self-hosted' | 'mediasoup' | 'janus';
  turnServerUrl: string;
  turnUsername: string;
  turnCredential: string;
  turnCredentialTtlSeconds?: number;
  redis: RedisClientType;
  logger: Logger;
}

/**
 * Create voice media provider based on configuration
 * 
 * Currently supports:
 * - self-hosted: Simple P2P with TURN fallback
 * 
 * Future implementations:
 * - mediasoup: SFU for multi-party calls
 * - janus: Alternative SFU
 */
export function createVoiceMediaProvider(config: VoiceMediaProviderConfig): VoiceMediaProvider {
  switch (config.provider) {
    case 'self-hosted':
      return new SelfHostedVoiceMediaProvider({
        turnServerUrl: config.turnServerUrl,
        turnUsername: config.turnUsername,
        turnCredential: config.turnCredential,
        turnCredentialTtlSeconds: config.turnCredentialTtlSeconds,
        redis: config.redis,
        logger: config.logger
      });

    case 'mediasoup':
      // TODO: Implement MediasoupVoiceMediaProvider
      throw new Error('Mediasoup provider not yet implemented');

    case 'janus':
      // TODO: Implement JanusVoiceMediaProvider
      throw new Error('Janus provider not yet implemented');

    default:
      throw new Error(`Unsupported voice media provider: ${config.provider}`);
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Parse participant token (for self-hosted provider)
 * 
 * In production, replace with proper JWT verification
 */
export function parseParticipantToken(token: string): {
  sessionId: string;
  participantId: string;
  participantType: 'device' | 'operator';
  canPublish: boolean;
  canSubscribe: boolean;
  exp: number;
} | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf-8');
    const payload = JSON.parse(decoded);
    
    // Validate token structure
    if (
      !payload.sessionId ||
      !payload.participantId ||
      !payload.participantType ||
      typeof payload.canPublish !== 'boolean' ||
      typeof payload.canSubscribe !== 'boolean' ||
      !payload.exp
    ) {
      return null;
    }

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Determine call quality status based on metrics
 */
export function determineCallQuality(metrics: SessionMetrics): 'GOOD' | 'DEGRADED' | 'POOR' {
  // Quality thresholds based on ITU-T G.114 recommendations
  const highRttThreshold = 300; // ms
  const highJitterThreshold = 50; // ms
  const highPacketLossThreshold = 3; // percent

  let issueCount = 0;

  if (metrics.avgRtt > highRttThreshold) {
    issueCount++;
  }

  if (metrics.avgJitter > highJitterThreshold) {
    issueCount++;
  }

  if (metrics.avgPacketLoss > highPacketLossThreshold) {
    issueCount++;
  }

  if (issueCount === 0) {
    return 'GOOD';
  } else if (issueCount === 1) {
    return 'DEGRADED';
  } else {
    return 'POOR';
  }
}

/**
 * Validate TURN server configuration
 */
export function validateTurnConfig(turnServers: TurnServer[]): boolean {
  if (!turnServers || turnServers.length === 0) {
    return false;
  }

  for (const server of turnServers) {
    if (!server.urls || server.urls.length === 0) {
      return false;
    }

    for (const url of server.urls) {
      if (!url.startsWith('turn:') && !url.startsWith('turns:')) {
        return false;
      }
    }

    if (!server.username || !server.credential) {
      return false;
    }

    if (server.credentialType !== 'password') {
      return false;
    }
  }

  return true;
}
