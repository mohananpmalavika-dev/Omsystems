import type { Pool } from "pg";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import type {
  PortableCameraEnrollment,
  PortableDevice,
  PortableCameraSession,
  PortableCameraPolicy,
  VideoSourceType,
  VideoSourceHealth,
} from "../domain/models.js";

export interface CreateEnrollmentInput {
  tenantId: string;
  branchId?: string;
  createdBy: string;
  allowedSourceTypes?: VideoSourceType[];
  requestedPermissions?: string[];
  expiresInSeconds?: number;
}

export interface RegisterDeviceInput {
  tenantId: string;
  deviceType: "ANDROID" | "IOS" | "WINDOWS" | "BROWSER";
  deviceName: string;
  enrolledBy?: string;
  credentialId?: string;
  credentialSecret?: string;
  appVersion?: string;
  osVersion?: string;
  lastKnownIp?: string;
  cameraId?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateSessionInput {
  tenantId: string;
  branchId?: string;
  sourceId: string;
  deviceId: string;
  userId: string;
  mediaNodeId: string;
  fencingToken?: number;
  recordingPolicy?: "NO_RECORDING" | "RECORD_WHILE_LIVE" | "CONTINUOUS_WHILE_SESSION_ACTIVE" | "MANUAL_RECORDING" | "INCIDENT_ONLY";
  videoCodec?: string;
  audioCodec?: string;
  resolution?: { width: number; height: number };
  fps?: number;
  bitrateKbps?: number;
}

export class PortableCameraRepository {
  private inMemoryEnrollments = new Map<string, PortableCameraEnrollment>();
  private inMemoryDevices = new Map<string, PortableDevice>();
  private inMemorySessions = new Map<string, PortableCameraSession>();
  private inMemoryEvents: Array<{ id: string; sessionId: string; eventType: string; payload: any; timestamp: string }> = [];
  private inMemoryPolicies = new Map<string, PortableCameraPolicy>();

  constructor(private readonly pool?: Pool | undefined) {}

  async createEnrollment(input: CreateEnrollmentInput): Promise<PortableCameraEnrollment> {
    const id = randomUUID();
    const token = `pce_${randomBytes(24).toString("base64url")}`;
    const expiresIn = input.expiresInSeconds ?? 900; // 15 minutes default
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    const allowedSourceTypes = input.allowedSourceTypes ?? [
      "BROWSER_CAMERA" as VideoSourceType,
      "ANDROID_CAMERA" as VideoSourceType,
      "IOS_CAMERA" as VideoSourceType,
      "LAPTOP_CAMERA" as VideoSourceType,
      "USB_WEBCAM" as VideoSourceType,
    ];
    const requestedPermissions = input.requestedPermissions ?? ["camera", "audio", "location"];

    const enrollment: PortableCameraEnrollment = {
      id,
      tenantId: input.tenantId,
      branchId: input.branchId,
      createdBy: input.createdBy,
      token,
      expiresAt,
      allowedSourceTypes,
      requestedPermissions,
      status: "PENDING",
    };

    if (this.pool) {
      await this.pool.query(
        `INSERT INTO portable_camera_enrollments (
          id, tenant_id, branch_id, created_by, token, expires_at,
          allowed_source_types, requested_permissions, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          enrollment.id,
          enrollment.tenantId,
          enrollment.branchId ?? null,
          enrollment.createdBy,
          enrollment.token,
          enrollment.expiresAt,
          enrollment.allowedSourceTypes,
          enrollment.requestedPermissions,
          enrollment.status,
        ]
      );
    } else {
      this.inMemoryEnrollments.set(token, enrollment);
    }

    return enrollment;
  }

  async getEnrollment(token: string): Promise<PortableCameraEnrollment | undefined> {
    if (this.pool) {
      const res = await this.pool.query(
        `SELECT * FROM portable_camera_enrollments WHERE token = $1`,
        [token]
      );
      if (res.rows.length === 0) return undefined;
      const row = res.rows[0];
      return {
        id: row.id,
        tenantId: row.tenant_id,
        branchId: row.branch_id ?? undefined,
        createdBy: row.created_by,
        token: row.token,
        expiresAt: new Date(row.expires_at).toISOString(),
        allowedSourceTypes: row.allowed_source_types,
        requestedPermissions: row.requested_permissions,
        status: row.status,
        usedAt: row.used_at ? new Date(row.used_at).toISOString() : undefined,
        usedByDeviceId: row.used_by_device_id ?? undefined,
      };
    }
    const item = this.inMemoryEnrollments.get(token);
    if (!item) return undefined;
    if (item.status === "PENDING" && new Date(item.expiresAt).getTime() < Date.now()) {
      item.status = "EXPIRED";
    }
    return item;
  }

  async consumeEnrollment(token: string, deviceId: string): Promise<boolean> {
    const now = new Date().toISOString();
    if (this.pool) {
      const res = await this.pool.query(
        `UPDATE portable_camera_enrollments
         SET status = 'CONSUMED', used_at = now(), used_by_device_id = $2
         WHERE token = $1 AND status = 'PENDING' AND expires_at > now()`,
        [token, deviceId]
      );
      return (res.rowCount ?? 0) > 0;
    }
    const item = this.inMemoryEnrollments.get(token);
    if (!item || item.status !== "PENDING" || new Date(item.expiresAt).getTime() <= Date.now()) {
      return false;
    }
    item.status = "CONSUMED";
    item.usedAt = now;
    item.usedByDeviceId = deviceId;
    return true;
  }

  async registerDevice(input: RegisterDeviceInput): Promise<PortableDevice> {
    const id = randomUUID();
    const credentialId = input.credentialId || `cred_${randomBytes(16).toString("hex")}`;
    const credentialSecret = input.credentialSecret || randomBytes(32).toString("hex");
    const credentialHash = createHash("sha256").update(credentialSecret).digest("hex");
    const now = new Date().toISOString();

    const device: PortableDevice = {
      id,
      tenantId: input.tenantId,
      type: input.deviceType,
      deviceName: input.deviceName,
      enrolledBy: input.enrolledBy,
      enrolledAt: now,
      credentialId,
      lastSeenAt: now,
      state: "ACTIVE",
      appVersion: input.appVersion,
      osVersion: input.osVersion,
      lastKnownIp: input.lastKnownIp,
      cameraId: input.cameraId,
      metadata: {
        ...input.metadata,
        credentialSecret, // returned on initial creation only
      },
    };

    if (this.pool) {
      await this.pool.query(
        `INSERT INTO portable_devices (
          id, tenant_id, device_type, device_name, enrolled_by, enrolled_at,
          credential_id, credential_hash, last_seen_at, state, app_version,
          os_version, last_known_ip, camera_id, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          device.id,
          device.tenantId,
          device.type,
          device.deviceName,
          device.enrolledBy ?? null,
          device.enrolledAt,
          device.credentialId,
          credentialHash,
          device.lastSeenAt,
          device.state,
          device.appVersion ?? null,
          device.osVersion ?? null,
          device.lastKnownIp ?? null,
          device.cameraId ?? null,
          JSON.stringify(input.metadata || {}),
        ]
      );
    } else {
      this.inMemoryDevices.set(device.id, device);
    }

    return device;
  }

  async getDevice(deviceId: string): Promise<PortableDevice | undefined> {
    if (this.pool) {
      const res = await this.pool.query(`SELECT * FROM portable_devices WHERE id = $1`, [deviceId]);
      if (res.rows.length === 0) return undefined;
      const row = res.rows[0];
      return {
        id: row.id,
        tenantId: row.tenant_id,
        type: row.device_type,
        deviceName: row.device_name,
        enrolledBy: row.enrolled_by ?? undefined,
        enrolledAt: new Date(row.enrolled_at).toISOString(),
        credentialId: row.credential_id,
        lastSeenAt: new Date(row.last_seen_at).toISOString(),
        state: row.state,
        appVersion: row.app_version ?? undefined,
        osVersion: row.os_version ?? undefined,
        lastKnownIp: row.last_known_ip ?? undefined,
        cameraId: row.camera_id ?? undefined,
        metadata: row.metadata ?? {},
      };
    }
    return this.inMemoryDevices.get(deviceId);
  }

  async listDevices(tenantId: string): Promise<PortableDevice[]> {
    if (this.pool) {
      const res = await this.pool.query(
        `SELECT * FROM portable_devices WHERE tenant_id = $1 ORDER BY enrolled_at DESC`,
        [tenantId]
      );
      return res.rows.map((row) => ({
        id: row.id,
        tenantId: row.tenant_id,
        type: row.device_type,
        deviceName: row.device_name,
        enrolledBy: row.enrolled_by ?? undefined,
        enrolledAt: new Date(row.enrolled_at).toISOString(),
        credentialId: row.credential_id,
        lastSeenAt: new Date(row.last_seen_at).toISOString(),
        state: row.state,
        appVersion: row.app_version ?? undefined,
        osVersion: row.os_version ?? undefined,
        lastKnownIp: row.last_known_ip ?? undefined,
        cameraId: row.camera_id ?? undefined,
        metadata: row.metadata ?? {},
      }));
    }
    return Array.from(this.inMemoryDevices.values()).filter((d) => d.tenantId === tenantId);
  }

  async revokeDevice(deviceId: string): Promise<boolean> {
    if (this.pool) {
      const res = await this.pool.query(
        `UPDATE portable_devices SET state = 'REVOKED', updated_at = now() WHERE id = $1`,
        [deviceId]
      );
      return (res.rowCount ?? 0) > 0;
    }
    const dev = this.inMemoryDevices.get(deviceId);
    if (!dev) return false;
    dev.state = "REVOKED";
    return true;
  }

  async updateDeviceSeen(deviceId: string, ip?: string, cameraId?: string): Promise<void> {
    const now = new Date().toISOString();
    if (this.pool) {
      await this.pool.query(
        `UPDATE portable_devices SET last_seen_at = now(), last_known_ip = COALESCE($2, last_known_ip), camera_id = COALESCE($3::uuid, camera_id) WHERE id = $1`,
        [deviceId, ip ?? null, cameraId ?? null]
      );
    } else {
      const dev = this.inMemoryDevices.get(deviceId);
      if (dev) {
        dev.lastSeenAt = now;
        if (ip) dev.lastKnownIp = ip;
        if (cameraId) dev.cameraId = cameraId;
      }
    }
  }

  async createSession(input: CreateSessionInput): Promise<PortableCameraSession> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const session: PortableCameraSession = {
      id,
      tenantId: input.tenantId,
      branchId: input.branchId,
      sourceId: input.sourceId,
      deviceId: input.deviceId,
      userId: input.userId,
      mediaNodeId: input.mediaNodeId,
      fencingToken: input.fencingToken ?? 1,
      startedAt: now,
      state: "CREATED",
      videoCodec: input.videoCodec ?? "H264",
      audioCodec: input.audioCodec ?? "OPUS",
      resolution: input.resolution ?? { width: 1920, height: 1080 },
      fps: input.fps ?? 25,
      bitrateKbps: input.bitrateKbps ?? 2000,
      recordingPolicy: input.recordingPolicy ?? "RECORD_WHILE_LIVE",
      incidentIds: [],
    };

    if (this.pool) {
      await this.pool.query(
        `INSERT INTO portable_camera_sessions (
          id, tenant_id, branch_id, source_id, device_id, user_id,
          media_node_id, fencing_token, started_at, state, video_codec,
          audio_codec, resolution, fps, bitrate_kbps, recording_policy, incident_ids
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
          session.id,
          session.tenantId,
          session.branchId ?? null,
          session.sourceId,
          session.deviceId,
          session.userId,
          session.mediaNodeId,
          session.fencingToken,
          session.startedAt,
          session.state,
          session.videoCodec,
          session.audioCodec,
          JSON.stringify(session.resolution),
          session.fps,
          session.bitrateKbps,
          session.recordingPolicy,
          session.incidentIds,
        ]
      );
    } else {
      this.inMemorySessions.set(session.id, session);
    }

    return session;
  }

  async getSession(sessionId: string): Promise<PortableCameraSession | undefined> {
    if (this.pool) {
      const res = await this.pool.query(
        `SELECT * FROM portable_camera_sessions WHERE id = $1`,
        [sessionId]
      );
      if (res.rows.length === 0) return undefined;
      const row = res.rows[0];
      return {
        id: row.id,
        tenantId: row.tenant_id,
        branchId: row.branch_id ?? undefined,
        sourceId: row.source_id,
        deviceId: row.device_id,
        userId: row.user_id,
        mediaNodeId: row.media_node_id,
        fencingToken: Number(row.fencing_token),
        startedAt: new Date(row.started_at).toISOString(),
        endedAt: row.ended_at ? new Date(row.ended_at).toISOString() : undefined,
        endedReason: row.ended_reason ?? undefined,
        state: row.state,
        videoCodec: row.video_codec,
        audioCodec: row.audio_codec,
        resolution: row.resolution,
        fps: Number(row.fps),
        bitrateKbps: Number(row.bitrate_kbps),
        recordingPolicy: row.recording_policy,
        health: row.health ?? undefined,
        incidentIds: row.incident_ids ?? [],
      };
    }
    return this.inMemorySessions.get(sessionId);
  }

  async getActiveSessionForSource(sourceId: string): Promise<PortableCameraSession | undefined> {
    if (this.pool) {
      const res = await this.pool.query(
        `SELECT * FROM portable_camera_sessions 
         WHERE source_id = $1 AND state IN ('CREATED', 'CONNECTING', 'LIVE', 'DEGRADED', 'RECONNECTING')
         ORDER BY started_at DESC LIMIT 1`,
        [sourceId]
      );
      if (res.rows.length === 0) return undefined;
      return this.getSession(res.rows[0].id);
    }
    return Array.from(this.inMemorySessions.values()).find(
      (s) => s.sourceId === sourceId && ["CREATED", "CONNECTING", "LIVE", "DEGRADED", "RECONNECTING"].includes(s.state)
    );
  }

  async updateSessionState(
    sessionId: string,
    state: PortableCameraSession["state"],
    health?: VideoSourceHealth,
    endedReason?: string
  ): Promise<void> {
    const endedAt = ["ENDED", "FAILED"].includes(state) ? new Date().toISOString() : null;
    if (this.pool) {
      await this.pool.query(
        `UPDATE portable_camera_sessions
         SET state = $2,
             health = COALESCE($3, health),
             ended_at = CASE WHEN $4::timestamptz IS NOT NULL THEN $4::timestamptz ELSE ended_at END,
             ended_reason = COALESCE($5, ended_reason),
             updated_at = now()
         WHERE id = $1`,
        [
          sessionId,
          state,
          health ? JSON.stringify(health) : null,
          endedAt,
          endedReason ?? null,
        ]
      );
    } else {
      const session = this.inMemorySessions.get(sessionId);
      if (session) {
        session.state = state;
        if (health) session.health = health;
        if (endedAt) session.endedAt = endedAt;
        if (endedReason) session.endedReason = endedReason;
      }
    }
  }

  async recordSessionEvent(sessionId: string, eventType: string, payload: any): Promise<void> {
    const id = randomUUID();
    const timestamp = new Date().toISOString();
    if (this.pool) {
      await this.pool.query(
        `INSERT INTO portable_camera_session_events (id, session_id, event_type, payload, timestamp)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, sessionId, eventType, JSON.stringify(payload), timestamp]
      );
    } else {
      this.inMemoryEvents.push({ id, sessionId, eventType, payload, timestamp });
    }
  }

  async attachIncidentToSession(sessionId: string, incidentId: string): Promise<boolean> {
    if (this.pool) {
      const res = await this.pool.query(
        `UPDATE portable_camera_sessions
         SET incident_ids = array_append(incident_ids, $2::uuid)
         WHERE id = $1 AND NOT ($2::uuid = ANY(incident_ids))`,
        [sessionId, incidentId]
      );
      return (res.rowCount ?? 0) > 0;
    }
    const s = this.inMemorySessions.get(sessionId);
    if (!s) return false;
    s.incidentIds = s.incidentIds || [];
    if (!s.incidentIds.includes(incidentId)) {
      s.incidentIds.push(incidentId);
      return true;
    }
    return false;
  }

  async getPolicy(tenantId: string): Promise<PortableCameraPolicy> {
    if (this.pool) {
      const res = await this.pool.query(`SELECT * FROM portable_camera_policies WHERE tenant_id = $1`, [tenantId]);
      if (res.rows.length > 0) {
        const row = res.rows[0];
        return {
          tenantId: row.tenant_id,
          enabled: row.enabled,
          allowedSourceTypes: row.allowed_source_types,
          maxConcurrentSessions: row.max_concurrent_sessions,
          allowAudio: row.allow_audio,
          allowLocation: row.allow_location,
          allowRecording: row.allow_recording,
          defaultRecordingPolicy: row.default_recording_policy,
          requireUserConsent: true,
          maxSessionDurationMinutes: row.max_session_duration_minutes,
        };
      }
    }
    return (
      this.inMemoryPolicies.get(tenantId) ?? {
        tenantId,
        enabled: true,
        allowedSourceTypes: [
          "ONVIF_CAMERA" as VideoSourceType,
          "RTSP_CAMERA" as VideoSourceType,
          "DVR_CHANNEL" as VideoSourceType,
          "NVR_CHANNEL" as VideoSourceType,
          "LAPTOP_CAMERA" as VideoSourceType,
          "USB_WEBCAM" as VideoSourceType,
          "USB_CAPTURE_CARD" as VideoSourceType,
          "ANDROID_CAMERA" as VideoSourceType,
          "IOS_CAMERA" as VideoSourceType,
          "BROWSER_CAMERA" as VideoSourceType,
        ],
        maxConcurrentSessions: 10,
        allowAudio: true,
        allowLocation: true,
        allowRecording: true,
        defaultRecordingPolicy: "RECORD_WHILE_LIVE",
        requireUserConsent: true,
        maxSessionDurationMinutes: 480,
      }
    );
  }

  async savePolicy(policy: PortableCameraPolicy): Promise<void> {
    if (this.pool) {
      await this.pool.query(
        `INSERT INTO portable_camera_policies (
           tenant_id, enabled, allowed_source_types, max_concurrent_sessions,
           allow_audio, allow_location, allow_recording, default_recording_policy,
           max_session_duration_minutes, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
         ON CONFLICT (tenant_id) DO UPDATE SET
           enabled = EXCLUDED.enabled,
           allowed_source_types = EXCLUDED.allowed_source_types,
           max_concurrent_sessions = EXCLUDED.max_concurrent_sessions,
           allow_audio = EXCLUDED.allow_audio,
           allow_location = EXCLUDED.allow_location,
           allow_recording = EXCLUDED.allow_recording,
           default_recording_policy = EXCLUDED.default_recording_policy,
           max_session_duration_minutes = EXCLUDED.max_session_duration_minutes,
           updated_at = now()`,
        [
          policy.tenantId,
          policy.enabled,
          policy.allowedSourceTypes,
          policy.maxConcurrentSessions,
          policy.allowAudio,
          policy.allowLocation,
          policy.allowRecording,
          policy.defaultRecordingPolicy,
          policy.maxSessionDurationMinutes ?? 480,
        ]
      );
    } else {
      this.inMemoryPolicies.set(policy.tenantId, policy);
    }
  }

  async getEnrollmentByToken(token: string): Promise<PortableCameraEnrollment | undefined> {
    return this.getEnrollment(token);
  }
}
