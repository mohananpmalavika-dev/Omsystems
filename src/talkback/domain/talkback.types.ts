/**
 * Canonical Domain Types for Two-Way Audio Talkback
 *
 * Defines contracts for real-time bidirectional push-to-talk, single-talker
 * camera mutex leases, audio codec negotiation, backchannel protocols,
 * and operational telemetry.
 */

export type TalkbackStatus =
  | 'initiating'
  | 'active'
  | 'completed'
  | 'terminated'
  | 'failed';

export type TalkbackAdapter =
  | 'onvif-rtsp-backchannel'
  | 'dahua-private3-talkback'
  | 'hikvision-isapi-talkback'
  | 'webrtc-backchannel'
  | 'generic-backchannel';

export type TalkbackCodec =
  | 'PCMA'
  | 'PCMU'
  | 'AAC'
  | 'OPUS'
  | 'G726'
  | 'L16';

export interface TalkbackSessionRecord {
  id: string;
  tenant_id: string;
  camera_id: string;
  user_id: string;
  session_token_hash?: Buffer | string;
  status: TalkbackStatus;
  purpose: 'talk';
  adapter: TalkbackAdapter;
  audio_codec: TalkbackCodec;
  sample_rate: number;
  channel_count: number;
  started_at: Date;
  ended_at?: Date | null;
  duration_ms: number;
  bytes_sent: number;
  packets_sent: number;
  error_code?: string | null;
  error_message?: string | null;
  client_ip?: string | null;
  user_agent?: string | null;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface TalkbackActiveLeaseRecord {
  camera_id: string;
  session_id: string;
  user_id: string;
  tenant_id: string;
  acquired_at: Date;
  heartbeat_at: Date;
  lease_expires_at: Date;
}

export interface TalkbackDeviceCapabilityRecord {
  camera_id: string;
  supported: boolean;
  transport: string;
  codecs: TalkbackCodec[];
  sample_rates: number[];
  verified_at: Date;
  reason?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTalkSessionInput {
  tenantId: string;
  cameraId: string;
  userId: string;
  token: string;
  ttlMs?: number;
  adapter?: TalkbackAdapter;
  codec?: TalkbackCodec;
  sampleRate?: number;
  clientIp?: string;
  userAgent?: string;
}

export interface CompleteTalkSessionInput {
  sessionId: string;
  outcome: 'success' | 'failure';
  durationMs: number;
  bytesSent?: number;
  packetsSent?: number;
  adapter?: string;
  codec?: string;
  error?: string;
}

export interface TerminateTalkSessionInput {
  sessionId: string;
  terminatedByUserId: string;
  reason?: string;
}

export interface ListTalkbackHistoryFilter {
  tenantId: string;
  cameraId?: string;
  userId?: string;
  status?: TalkbackStatus;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

export interface TalkbackHistoryResult {
  sessions: TalkbackSessionRecord[];
  total: number;
}

export interface TalkbackTelemetryStats {
  totalSessions: number;
  activeSessions: number;
  completedSessions: number;
  failedSessions: number;
  totalDurationMs: number;
  totalBytesSent: number;
  averageDurationMs: number;
  codecDistribution: Record<string, number>;
  adapterDistribution: Record<string, number>;
}
