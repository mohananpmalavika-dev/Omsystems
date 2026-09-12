/**
 * Two-Way Audio Talkback Service
 *
 * Production business logic orchestrating push-to-talk bidirectional backchannel,
 * mutual exclusion (single-talker camera lease), hardware capability negotiation,
 * token lifecycle, and audit telemetry.
 */

import type { ControlPlaneStore } from '../../control-plane-store.js';
import type { Camera, User } from '../../domain/models.js';
import type { TalkbackRepository } from '../repositories/talkback.repository.js';
import type {
  TalkbackSessionRecord,
  TalkbackActiveLeaseRecord,
  TalkbackDeviceCapabilityRecord,
  CompleteTalkSessionInput,
  TerminateTalkSessionInput,
  ListTalkbackHistoryFilter,
  TalkbackHistoryResult,
  TalkbackTelemetryStats,
  TalkbackAdapter,
  TalkbackCodec,
} from '../domain/talkback.types.js';

export class TalkbackServiceError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: number = 400,
    message: string = code,
    readonly details?: unknown
  ) {
    super(message);
  }
}

export class TalkbackService {
  constructor(
    private readonly repository: TalkbackRepository,
    private readonly store: ControlPlaneStore
  ) {}

  /**
   * Initiate a push-to-talk session on a target camera
   */
  async initiateTalkSession(input: {
    cameraId: string;
    user: User;
    clientIp?: string;
    userAgent?: string;
    ttlMs?: number;
  }): Promise<{
    session: TalkbackSessionRecord;
    liveSession: {
      id: string;
      token: string;
      expiresAt: string;
      mediaGatewayUrl?: string;
      localMediaGatewayUrl?: string;
    };
  }> {
    const { cameraId, user, clientIp, userAgent, ttlMs = 30_000 } = input;
    const camera = await this.store.getCamera(cameraId);
    if (!camera) {
      throw new TalkbackServiceError('camera_not_found', 404);
    }

    // Verify camera hardware audio/speaker capability
    if (
      camera.capabilities.talkback?.supported === false ||
      (!camera.capabilities.audio && camera.capabilities.talkback?.supported !== true)
    ) {
      throw new TalkbackServiceError(
        'talkback_not_supported',
        409,
        camera.capabilities.talkback?.reason ?? 'device_does_not_advertise_two_way_audio'
      );
    }

    // Determine target backchannel adapter & codec
    const adapter = this.resolveAdapter(camera);
    const codec = this.resolveCodec(camera);

    // Acquire single-talker camera mutex lease
    // Generate a temporary ID for the pre-lease lock
    const preLeaseId = `pending-${Date.now()}`;
    const acquired = await this.repository.acquireLease(
      camera.id,
      preLeaseId,
      user.id,
      user.tenantId,
      ttlMs
    );

    if (!acquired) {
      const activeLease = await this.repository.getActiveLease(camera.id);
      throw new TalkbackServiceError('talkback_busy', 409, 'Another operator is currently broadcasting to this camera speaker', {
        activeUserId: activeLease?.user_id,
        acquiredAt: activeLease?.acquired_at,
        leaseExpiresAt: activeLease?.lease_expires_at,
      });
    }

    try {
      // Issue live session token for media-gateway / edge-agent backchannel
      const liveSession = await this.store.createLiveSession(camera.id, user.id, 'talk');

      // Create durable talkback session record
      const session = await this.repository.createSession({
        tenantId: user.tenantId,
        cameraId: camera.id,
        userId: user.id,
        token: liveSession.token,
        ttlMs,
        adapter,
        codec,
        sampleRate: 8000,
        clientIp,
        userAgent,
      });

      // Update the lease with the real session ID
      await this.repository.releaseLease(camera.id, preLeaseId);
      await this.repository.acquireLease(camera.id, session.id, user.id, user.tenantId, ttlMs);

      // Audit log
      if (this.store.writeAudit) {
        await this.store.writeAudit({
          tenantId: user.tenantId,
          actorUserId: user.id,
          action: 'talk_session.created',
          resourceNodeId: camera.nodeId,
          outcome: 'success',
          details: {
            sessionId: session.id,
            cameraId: camera.id,
            branchId: camera.branchId,
            sourceType: camera.sourceType ?? 'ip-camera',
            recorderChannel: camera.recorderChannel ?? camera.channel,
            adapter,
            codec,
          },
        });
      }

      return { session, liveSession };
    } catch (err) {
      // Release lease if session initialization failed
      await this.repository.releaseLease(camera.id);
      throw err;
    }
  }

  /**
   * Heartbeat to extend active push-to-talk lease
   */
  async heartbeatSession(
    cameraId: string,
    sessionId: string,
    ttlMs: number = 30_000
  ): Promise<boolean> {
    return this.repository.renewLease(cameraId, sessionId, ttlMs);
  }

  /**
   * End talkback session cleanly
   */
  async endTalkSession(
    cameraId: string,
    sessionId: string,
    user: User
  ): Promise<TalkbackSessionRecord | undefined> {
    const session = await this.repository.getSession(sessionId);
    if (!session) return undefined;

    const completed = await this.repository.terminateSession({
      sessionId,
      terminatedByUserId: user.id,
      reason: 'Operator released push-to-talk',
    });

    const camera = await this.store.getCamera(cameraId);
    if (camera && this.store.writeAudit) {
      await this.store.writeAudit({
        tenantId: user.tenantId,
        actorUserId: user.id,
        action: 'talk_session.completed',
        resourceNodeId: camera.nodeId,
        outcome: 'success',
        details: {
          sessionId,
          cameraId: camera.id,
          durationMs: completed?.duration_ms ?? 0,
        },
      });
    }

    return completed;
  }

  /**
   * Terminate active talk session (supervisor/emergency kill switch)
   */
  async terminateSession(input: TerminateTalkSessionInput): Promise<TalkbackSessionRecord | undefined> {
    const terminated = await this.repository.terminateSession(input);
    if (terminated) {
      const camera = await this.store.getCamera(terminated.camera_id);
      if (camera && this.store.writeAudit) {
        await this.store.writeAudit({
          tenantId: terminated.tenant_id,
          actorUserId: input.terminatedByUserId,
          action: 'talk_session.terminated',
          resourceNodeId: camera.nodeId,
          outcome: 'success',
          details: {
            sessionId: terminated.id,
            reason: input.reason,
            durationMs: terminated.duration_ms,
          },
        });
      }
    }
    return terminated;
  }

  /**
   * Handle completion report from edge agent or media gateway
   */
  async handleEdgeCompletion(
    sessionId: string,
    input: CompleteTalkSessionInput & { cameraId: string; userId: string; agentId: string }
  ): Promise<TalkbackSessionRecord | undefined> {
    const camera = await this.store.getCamera(input.cameraId);
    const user = await this.store.getUser(input.userId);

    const completed = await this.repository.completeSession(input);

    if (camera && user && this.store.writeAudit) {
      await this.store.writeAudit({
        tenantId: user.tenantId,
        actorUserId: user.id,
        action: 'talk_session.completed',
        resourceNodeId: camera.nodeId,
        outcome: input.outcome,
        details: {
          sessionId,
          cameraId: camera.id,
          branchId: camera.branchId,
          sourceType: camera.sourceType ?? 'ip-camera',
          recorderChannel: camera.recorderChannel ?? camera.channel,
          durationMs: input.durationMs,
          adapter: input.adapter,
          codec: input.codec,
          bytesSent: input.bytesSent,
          error: input.error,
        },
      });
    }

    return completed;
  }

  /**
   * Get active talker state on a camera
   */
  async getActiveSession(cameraId: string): Promise<{
    active: boolean;
    lease?: TalkbackActiveLeaseRecord;
    session?: TalkbackSessionRecord;
  }> {
    const lease = await this.repository.getActiveLease(cameraId);
    if (!lease) {
      return { active: false };
    }
    const session = await this.repository.getSession(lease.session_id);
    return {
      active: true,
      lease,
      session,
    };
  }

  /**
   * Query history with pagination
   */
  async listHistory(filter: ListTalkbackHistoryFilter): Promise<TalkbackHistoryResult> {
    return this.repository.listHistory(filter);
  }

  /**
   * Telemetry stats
   */
  async getTelemetryStats(tenantId?: string): Promise<TalkbackTelemetryStats> {
    return this.repository.getTelemetryStats(tenantId);
  }

  /**
   * Probe or get camera device talkback capability
   */
  async getDeviceCapability(cameraId: string): Promise<TalkbackDeviceCapabilityRecord> {
    const existing = await this.repository.getDeviceCapability(cameraId);
    if (existing) return existing;

    const camera = await this.store.getCamera(cameraId);
    if (!camera) {
      throw new TalkbackServiceError('camera_not_found', 404);
    }

    const isSupported = Boolean(
      camera.capabilities.talkback?.supported ??
      camera.capabilities.audio
    );

    const transport = camera.capabilities.talkback?.transport ?? (
      camera.vendor === 'cp-plus' || camera.vendor === 'dahua'
        ? 'dahua-private3-talkback'
        : camera.vendor === 'hikvision'
        ? 'hikvision-isapi-talkback'
        : 'onvif-rtsp-backchannel'
    );

    const record: TalkbackDeviceCapabilityRecord = {
      camera_id: camera.id,
      supported: isSupported,
      transport,
      codecs: ['PCMA', 'PCMU'],
      sample_rates: [8000],
      verified_at: new Date(),
      reason: isSupported ? 'Hardware backchannel verified' : 'Device has no audio hardware',
      created_at: new Date(),
      updated_at: new Date(),
    };

    await this.repository.saveDeviceCapability(record);
    return record;
  }

  private resolveAdapter(camera: Camera): TalkbackAdapter {
    if (camera.vendor === 'cp-plus' || camera.vendor === 'dahua') {
      return 'dahua-private3-talkback';
    }
    if (camera.vendor === 'hikvision') {
      return 'hikvision-isapi-talkback';
    }
    return 'onvif-rtsp-backchannel';
  }

  private resolveCodec(camera: Camera): TalkbackCodec {
    if (camera.capabilities.talkback?.codecs?.length) {
      const first = camera.capabilities.talkback.codecs[0];
      if (first === 'PCMA' || first === 'PCMU' || first === 'AAC' || first === 'OPUS') {
        return first;
      }
    }
    return 'PCMA';
  }
}
