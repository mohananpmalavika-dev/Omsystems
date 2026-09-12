/**
 * Talkback Repository
 *
 * PostgreSQL data access with high-speed deterministic in-memory fallback
 * for active talk sessions, single-talker camera mutex leases,
 * hardware capability discovery, and forensic completion audits.
 */

import crypto from 'node:crypto';
import type { Pool } from 'pg';
import type {
  TalkbackSessionRecord,
  TalkbackActiveLeaseRecord,
  TalkbackDeviceCapabilityRecord,
  CreateTalkSessionInput,
  CompleteTalkSessionInput,
  TerminateTalkSessionInput,
  ListTalkbackHistoryFilter,
  TalkbackHistoryResult,
  TalkbackTelemetryStats,
} from '../domain/talkback.types.js';

export class TalkbackRepository {
  private readonly memorySessions = new Map<string, TalkbackSessionRecord>();
  private readonly memoryLeases = new Map<string, TalkbackActiveLeaseRecord>();
  private readonly memoryCapabilities = new Map<string, TalkbackDeviceCapabilityRecord>();

  constructor(private readonly pool?: Pool) {}

  /**
   * Create a new talkback session record
   */
  async createSession(data: CreateTalkSessionInput): Promise<TalkbackSessionRecord> {
    const id = crypto.randomUUID();
    const now = new Date();
    const ttlMs = data.ttlMs ?? 60_000;
    const expiresAt = new Date(now.getTime() + ttlMs);
    const tokenHash = crypto.createHash('sha256').update(data.token).digest();

    const record: TalkbackSessionRecord = {
      id,
      tenant_id: data.tenantId,
      camera_id: data.cameraId,
      user_id: data.userId,
      session_token_hash: tokenHash,
      status: 'initiating',
      purpose: 'talk',
      adapter: data.adapter ?? 'onvif-rtsp-backchannel',
      audio_codec: data.codec ?? 'PCMA',
      sample_rate: data.sampleRate ?? 8000,
      channel_count: 1,
      started_at: now,
      ended_at: null,
      duration_ms: 0,
      bytes_sent: 0,
      packets_sent: 0,
      client_ip: data.clientIp ?? null,
      user_agent: data.userAgent ?? null,
      expires_at: expiresAt,
      created_at: now,
      updated_at: now,
    };

    if (this.pool) {
      try {
        const query = `
          INSERT INTO talkback_sessions (
            id, tenant_id, camera_id, user_id, session_token_hash,
            status, purpose, adapter, audio_codec, sample_rate,
            channel_count, started_at, duration_ms, bytes_sent,
            packets_sent, client_ip, user_agent, expires_at,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
          RETURNING *;
        `;
        const values = [
          record.id,
          record.tenant_id,
          record.camera_id,
          record.user_id,
          record.session_token_hash,
          record.status,
          record.purpose,
          record.adapter,
          record.audio_codec,
          record.sample_rate,
          record.channel_count,
          record.started_at,
          record.duration_ms,
          record.bytes_sent,
          record.packets_sent,
          record.client_ip,
          record.user_agent,
          record.expires_at,
          record.created_at,
          record.updated_at,
        ];
        const res = await this.pool.query(query, values);
        if (res.rows[0]) {
          this.memorySessions.set(record.id, record);
          return res.rows[0];
        }
      } catch {
        // Fallback to memory
      }
    }

    this.memorySessions.set(record.id, record);
    return record;
  }

  /**
   * Retrieve session by ID
   */
  async getSession(id: string): Promise<TalkbackSessionRecord | undefined> {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          'SELECT * FROM talkback_sessions WHERE id = $1',
          [id]
        );
        if (res.rows[0]) return res.rows[0];
      } catch {
        // Fallback to memory
      }
    }
    return this.memorySessions.get(id);
  }

  /**
   * Acquire exclusive talkback lease for a camera (Single-Talker Mutex)
   */
  async acquireLease(
    cameraId: string,
    sessionId: string,
    userId: string,
    tenantId: string,
    ttlMs: number = 30_000
  ): Promise<boolean> {
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + ttlMs);

    if (this.pool) {
      try {
        // Cleanup expired lease first
        await this.pool.query(
          'DELETE FROM talkback_active_leases WHERE camera_id = $1 AND lease_expires_at <= NOW()',
          [cameraId]
        );

        // Attempt to insert active lease
        const res = await this.pool.query(
          `INSERT INTO talkback_active_leases (
            camera_id, session_id, user_id, tenant_id, acquired_at, heartbeat_at, lease_expires_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (camera_id) DO NOTHING
          RETURNING *;`,
          [cameraId, sessionId, userId, tenantId, now, now, leaseExpiresAt]
        );

        if (res.rowCount && res.rowCount > 0) {
          this.memoryLeases.set(cameraId, {
            camera_id: cameraId,
            session_id: sessionId,
            user_id: userId,
            tenant_id: tenantId,
            acquired_at: now,
            heartbeat_at: now,
            lease_expires_at: leaseExpiresAt,
          });
          return true;
        }
        return false;
      } catch {
        // Fallback to memory
      }
    }

    // In-memory mutex enforcement
    const existing = this.memoryLeases.get(cameraId);
    if (existing && existing.lease_expires_at.getTime() > now.getTime()) {
      return false; // Busy
    }

    this.memoryLeases.set(cameraId, {
      camera_id: cameraId,
      session_id: sessionId,
      user_id: userId,
      tenant_id: tenantId,
      acquired_at: now,
      heartbeat_at: now,
      lease_expires_at: leaseExpiresAt,
    });
    return true;
  }

  /**
   * Renew active lease heartbeat
   */
  async renewLease(
    cameraId: string,
    sessionId: string,
    ttlMs: number = 30_000
  ): Promise<boolean> {
    const now = new Date();
    const newExpiresAt = new Date(now.getTime() + ttlMs);

    if (this.pool) {
      try {
        const res = await this.pool.query(
          `UPDATE talkback_active_leases
           SET heartbeat_at = $1, lease_expires_at = $2
           WHERE camera_id = $3 AND session_id = $4`,
          [now, newExpiresAt, cameraId, sessionId]
        );
        if (res.rowCount && res.rowCount > 0) {
          const m = this.memoryLeases.get(cameraId);
          if (m && m.session_id === sessionId) {
            m.heartbeat_at = now;
            m.lease_expires_at = newExpiresAt;
          }
          return true;
        }
        return false;
      } catch {
        // Fallback
      }
    }

    const m = this.memoryLeases.get(cameraId);
    if (m && m.session_id === sessionId && m.lease_expires_at.getTime() > now.getTime()) {
      m.heartbeat_at = now;
      m.lease_expires_at = newExpiresAt;
      return true;
    }
    return false;
  }

  /**
   * Release lease
   */
  async releaseLease(cameraId: string, sessionId?: string): Promise<boolean> {
    if (this.pool) {
      try {
        let query = 'DELETE FROM talkback_active_leases WHERE camera_id = $1';
        const params: any[] = [cameraId];
        if (sessionId) {
          query += ' AND session_id = $2';
          params.push(sessionId);
        }
        await this.pool.query(query, params);
      } catch {
        // Fallback
      }
    }

    const current = this.memoryLeases.get(cameraId);
    if (current && (!sessionId || current.session_id === sessionId)) {
      this.memoryLeases.delete(cameraId);
      return true;
    }
    return false;
  }

  /**
   * Get active lease on camera
   */
  async getActiveLease(cameraId: string): Promise<TalkbackActiveLeaseRecord | undefined> {
    const now = new Date();
    if (this.pool) {
      try {
        const res = await this.pool.query(
          `SELECT * FROM talkback_active_leases
           WHERE camera_id = $1 AND lease_expires_at > NOW()`,
          [cameraId]
        );
        if (res.rows[0]) return res.rows[0];
      } catch {
        // Fallback
      }
    }

    const current = this.memoryLeases.get(cameraId);
    if (current && current.lease_expires_at.getTime() > now.getTime()) {
      return current;
    }
    if (current && current.lease_expires_at.getTime() <= now.getTime()) {
      this.memoryLeases.delete(cameraId);
    }
    return undefined;
  }

  /**
   * Complete talk session record
   */
  async completeSession(input: CompleteTalkSessionInput): Promise<TalkbackSessionRecord | undefined> {
    const now = new Date();
    const session = await this.getSession(input.sessionId);
    if (!session) return undefined;

    session.ended_at = now;
    session.duration_ms = input.durationMs;
    session.status = input.outcome === 'success' ? 'completed' : 'failed';
    if (input.bytesSent !== undefined) session.bytes_sent = input.bytesSent;
    if (input.packetsSent !== undefined) session.packets_sent = input.packetsSent;
    if (input.adapter) session.adapter = input.adapter as any;
    if (input.codec) session.audio_codec = input.codec as any;
    if (input.error) session.error_message = input.error;
    session.updated_at = now;

    if (this.pool) {
      try {
        await this.pool.query(
          `UPDATE talkback_sessions
           SET ended_at = $1, duration_ms = $2, status = $3,
               bytes_sent = $4, packets_sent = $5, adapter = $6,
               audio_codec = $7, error_message = $8, updated_at = $9
           WHERE id = $10`,
          [
            session.ended_at,
            session.duration_ms,
            session.status,
            session.bytes_sent,
            session.packets_sent,
            session.adapter,
            session.audio_codec,
            session.error_message,
            session.updated_at,
            session.id,
          ]
        );
      } catch {
        // Fallback
      }
    }

    // Release any lease on this camera
    await this.releaseLease(session.camera_id, session.id);
    this.memorySessions.set(session.id, session);
    return session;
  }

  /**
   * Terminate talk session prematurely
   */
  async terminateSession(input: TerminateTalkSessionInput): Promise<TalkbackSessionRecord | undefined> {
    const session = await this.getSession(input.sessionId);
    if (!session) return undefined;

    const now = new Date();
    session.status = 'terminated';
    session.ended_at = now;
    session.duration_ms = Math.max(0, now.getTime() - new Date(session.started_at).getTime());
    session.error_message = input.reason ?? `Terminated by user ${input.terminatedByUserId}`;
    session.updated_at = now;

    if (this.pool) {
      try {
        await this.pool.query(
          `UPDATE talkback_sessions
           SET ended_at = $1, duration_ms = $2, status = $3,
               error_message = $4, updated_at = $5
           WHERE id = $6`,
          [
            session.ended_at,
            session.duration_ms,
            session.status,
            session.error_message,
            session.updated_at,
            session.id,
          ]
        );
      } catch {
        // Fallback
      }
    }

    await this.releaseLease(session.camera_id, session.id);
    this.memorySessions.set(session.id, session);
    return session;
  }

  /**
   * List historical talk sessions with pagination & filtering
   */
  async listHistory(filter: ListTalkbackHistoryFilter): Promise<TalkbackHistoryResult> {
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;

    if (this.pool) {
      try {
        const conditions: string[] = ['tenant_id = $1'];
        const values: any[] = [filter.tenantId];
        let idx = 2;

        if (filter.cameraId) {
          conditions.push(`camera_id = $${idx++}`);
          values.push(filter.cameraId);
        }
        if (filter.userId) {
          conditions.push(`user_id = $${idx++}`);
          values.push(filter.userId);
        }
        if (filter.status) {
          conditions.push(`status = $${idx++}`);
          values.push(filter.status);
        }
        if (filter.fromDate) {
          conditions.push(`started_at >= $${idx++}`);
          values.push(filter.fromDate);
        }
        if (filter.toDate) {
          conditions.push(`started_at <= $${idx++}`);
          values.push(filter.toDate);
        }

        const whereClause = conditions.join(' AND ');
        const countRes = await this.pool.query(
          `SELECT COUNT(*)::int as count FROM talkback_sessions WHERE ${whereClause}`,
          values
        );
        const total = countRes.rows[0]?.count ?? 0;

        values.push(limit, offset);
        const dataRes = await this.pool.query(
          `SELECT * FROM talkback_sessions
           WHERE ${whereClause}
           ORDER BY started_at DESC
           LIMIT $${idx++} OFFSET $${idx++}`,
          values
        );

        return { sessions: dataRes.rows, total };
      } catch {
        // Fallback
      }
    }

    let list = [...this.memorySessions.values()].filter((s) => s.tenant_id === filter.tenantId);
    if (filter.cameraId) list = list.filter((s) => s.camera_id === filter.cameraId);
    if (filter.userId) list = list.filter((s) => s.user_id === filter.userId);
    if (filter.status) list = list.filter((s) => s.status === filter.status);
    if (filter.fromDate) list = list.filter((s) => new Date(s.started_at) >= filter.fromDate!);
    if (filter.toDate) list = list.filter((s) => new Date(s.started_at) <= filter.toDate!);

    list.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
    const total = list.length;
    const paginated = list.slice(offset, offset + limit);

    return { sessions: paginated, total };
  }

  /**
   * Get operational telemetry statistics
   */
  async getTelemetryStats(tenantId?: string): Promise<TalkbackTelemetryStats> {
    const sessions = [...this.memorySessions.values()].filter(
      (s) => !tenantId || s.tenant_id === tenantId
    );
    const now = Date.now();
    const activeLeases = [...this.memoryLeases.values()].filter(
      (l) => (!tenantId || l.tenant_id === tenantId) && l.lease_expires_at.getTime() > now
    );

    let totalDurationMs = 0;
    let totalBytesSent = 0;
    let completedCount = 0;
    let failedCount = 0;
    const codecDistribution: Record<string, number> = {};
    const adapterDistribution: Record<string, number> = {};

    for (const s of sessions) {
      totalDurationMs += s.duration_ms || 0;
      totalBytesSent += s.bytes_sent || 0;
      if (s.status === 'completed') completedCount += 1;
      if (s.status === 'failed') failedCount += 1;

      codecDistribution[s.audio_codec] = (codecDistribution[s.audio_codec] || 0) + 1;
      adapterDistribution[s.adapter] = (adapterDistribution[s.adapter] || 0) + 1;
    }

    return {
      totalSessions: sessions.length,
      activeSessions: activeLeases.length,
      completedSessions: completedCount,
      failedSessions: failedCount,
      totalDurationMs,
      totalBytesSent,
      averageDurationMs: sessions.length > 0 ? Math.round(totalDurationMs / sessions.length) : 0,
      codecDistribution,
      adapterDistribution,
    };
  }

  /**
   * Save probed device talkback capability
   */
  async saveDeviceCapability(cap: TalkbackDeviceCapabilityRecord): Promise<void> {
    this.memoryCapabilities.set(cap.camera_id, cap);
    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO talkback_device_capabilities (
             camera_id, supported, transport, codecs, sample_rates, verified_at, reason, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (camera_id) DO UPDATE SET
             supported = EXCLUDED.supported,
             transport = EXCLUDED.transport,
             codecs = EXCLUDED.codecs,
             sample_rates = EXCLUDED.sample_rates,
             verified_at = EXCLUDED.verified_at,
             reason = EXCLUDED.reason,
             updated_at = EXCLUDED.updated_at;`,
          [
            cap.camera_id,
            cap.supported,
            cap.transport,
            cap.codecs,
            cap.sample_rates,
            cap.verified_at,
            cap.reason,
            cap.created_at,
            cap.updated_at,
          ]
        );
      } catch {
        // Fallback
      }
    }
  }

  /**
   * Get device talkback capability
   */
  async getDeviceCapability(cameraId: string): Promise<TalkbackDeviceCapabilityRecord | undefined> {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          'SELECT * FROM talkback_device_capabilities WHERE camera_id = $1',
          [cameraId]
        );
        if (res.rows[0]) return res.rows[0];
      } catch {
        // Fallback
      }
    }
    return this.memoryCapabilities.get(cameraId);
  }
}
