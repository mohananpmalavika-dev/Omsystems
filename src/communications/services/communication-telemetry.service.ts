/**
 * Communication Telemetry Service
 *
 * Provides Prometheus metrics for KryptoVision Connect subsystem.
 *
 * Metrics categories:
 * - Device metrics: online count, enrollment rate, revocation rate
 * - Presence metrics: branch/employee online status
 * - Call metrics: started, connected, failed, missed, duration
 * - Call quality metrics: RTT, jitter, packet loss distribution
 * - Messaging metrics: sent, delivered, read counts
 * - WebSocket metrics: connection count, signaling events
 * - WebRTC metrics: session count, participant count
 *
 * Integration:
 * - Uses Prometheus client library
 * - Metrics exposed via /metrics endpoint
 * - Tenant-labeled for multi-tenancy observability
 *
 * Privacy:
 * - No PII in metric labels
 * - No message content
 * - Device/call/conversation IDs are UUIDs (safe for cardinality)
 */

import type { Registry, Counter, Gauge, Histogram } from 'prom-client';
import type {
  CommunicationCallStatus,
  CommunicationPresence,
  CommunicationDeviceType,
} from '../domain/types.js';

export interface CommunicationTelemetryService {
  // Device metrics
  recordDeviceEnrollment(tenantId: string, deviceType: CommunicationDeviceType): void;
  recordDeviceRevocation(tenantId: string, deviceType: CommunicationDeviceType): void;
  recordDeviceHeartbeat(tenantId: string, deviceType: CommunicationDeviceType): void;
  setDevicesOnline(tenantId: string, count: number): void;

  // Presence metrics
  setBranchPresence(tenantId: string, branchId: string, presence: CommunicationPresence): void;
  setEmployeePresence(tenantId: string, employeeId: string, presence: CommunicationPresence): void;

  // Call metrics
  recordCallStarted(tenantId: string, direction: 'INBOUND' | 'OUTBOUND'): void;
  recordCallConnected(tenantId: string, setupDuration: number): void;
  recordCallEnded(tenantId: string, duration: number, quality?: 'GOOD' | 'DEGRADED' | 'POOR'): void;
  recordCallFailed(tenantId: string, status: CommunicationCallStatus, reason: string): void;
  recordCallMissed(tenantId: string): void;

  // Call quality metrics
  recordCallQuality(params: {
    tenantId: string;
    callId: string;
    rtt?: number;
    jitter?: number;
    packetLoss?: number;
  }): void;

  // Messaging metrics
  recordMessageSent(tenantId: string, conversationType: string): void;
  recordMessageDelivered(tenantId: string, deliveryLatency: number): void;
  recordMessageRead(tenantId: string, readLatency: number): void;

  // WebSocket metrics
  recordWebSocketConnection(tenantId: string, connected: boolean): void;
  recordSignalingEvent(tenantId: string, event: string): void;

  // WebRTC metrics
  recordMediaSessionCreated(tenantId: string): void;
  recordMediaSessionClosed(tenantId: string): void;
  recordParticipantJoined(tenantId: string): void;
  recordParticipantLeft(tenantId: string): void;

  // Get current registry for /metrics endpoint
  getRegistry(): Registry;
}

export function createCommunicationTelemetryService(
  registry: Registry,
  promClient: typeof import('prom-client')
): CommunicationTelemetryService {
  // Device metrics
  const deviceEnrollmentsTotal = new promClient.Counter({
    name: 'kryptovision_comm_device_enrollments_total',
    help: 'Total number of device enrollments',
    labelNames: ['tenant_id', 'device_type'],
    registers: [registry],
  });

  const deviceRevocationsTotal = new promClient.Counter({
    name: 'kryptovision_comm_device_revocations_total',
    help: 'Total number of device revocations',
    labelNames: ['tenant_id', 'device_type'],
    registers: [registry],
  });

  const deviceHeartbeatsTotal = new promClient.Counter({
    name: 'kryptovision_comm_device_heartbeats_total',
    help: 'Total number of device heartbeats received',
    labelNames: ['tenant_id', 'device_type'],
    registers: [registry],
  });

  const devicesOnline = new promClient.Gauge({
    name: 'kryptovision_comm_devices_online',
    help: 'Current number of online communication devices',
    labelNames: ['tenant_id'],
    registers: [registry],
  });

  // Presence metrics
  const branchPresence = new promClient.Gauge({
    name: 'kryptovision_comm_branch_presence',
    help: 'Branch presence status (1=online, 0=offline)',
    labelNames: ['tenant_id', 'branch_id'],
    registers: [registry],
  });

  const employeePresence = new promClient.Gauge({
    name: 'kryptovision_comm_employee_presence',
    help: 'Employee presence status (1=online, 0=offline)',
    labelNames: ['tenant_id', 'employee_id'],
    registers: [registry],
  });

  // Call metrics
  const callsStartedTotal = new promClient.Counter({
    name: 'kryptovision_comm_calls_started_total',
    help: 'Total number of calls started',
    labelNames: ['tenant_id', 'direction'],
    registers: [registry],
  });

  const callsConnectedTotal = new promClient.Counter({
    name: 'kryptovision_comm_calls_connected_total',
    help: 'Total number of calls successfully connected',
    labelNames: ['tenant_id'],
    registers: [registry],
  });

  const callsFailedTotal = new promClient.Counter({
    name: 'kryptovision_comm_calls_failed_total',
    help: 'Total number of failed calls',
    labelNames: ['tenant_id', 'status', 'reason'],
    registers: [registry],
  });

  const callsMissedTotal = new promClient.Counter({
    name: 'kryptovision_comm_calls_missed_total',
    help: 'Total number of missed calls',
    labelNames: ['tenant_id'],
    registers: [registry],
  });

  const callSetupDuration = new promClient.Histogram({
    name: 'kryptovision_comm_call_setup_duration_seconds',
    help: 'Time from call initiation to connection',
    labelNames: ['tenant_id'],
    buckets: [0.5, 1, 2, 3, 5, 10, 15, 30],
    registers: [registry],
  });

  const callDuration = new promClient.Histogram({
    name: 'kryptovision_comm_call_duration_seconds',
    help: 'Duration of connected calls',
    labelNames: ['tenant_id', 'quality'],
    buckets: [10, 30, 60, 120, 300, 600, 1800, 3600],
    registers: [registry],
  });

  // Call quality metrics
  const callRtt = new promClient.Histogram({
    name: 'kryptovision_comm_call_rtt_milliseconds',
    help: 'Call round-trip time',
    labelNames: ['tenant_id'],
    buckets: [10, 25, 50, 100, 150, 200, 300, 500],
    registers: [registry],
  });

  const callJitter = new promClient.Histogram({
    name: 'kryptovision_comm_call_jitter_milliseconds',
    help: 'Call jitter',
    labelNames: ['tenant_id'],
    buckets: [5, 10, 20, 30, 50, 75, 100, 150],
    registers: [registry],
  });

  const callPacketLoss = new promClient.Histogram({
    name: 'kryptovision_comm_call_packet_loss_percent',
    help: 'Call packet loss percentage',
    labelNames: ['tenant_id'],
    buckets: [0.1, 0.5, 1, 2, 3, 5, 10, 15],
    registers: [registry],
  });

  // Messaging metrics
  const messagesSentTotal = new promClient.Counter({
    name: 'kryptovision_comm_messages_sent_total',
    help: 'Total number of messages sent',
    labelNames: ['tenant_id', 'conversation_type'],
    registers: [registry],
  });

  const messagesDeliveredTotal = new promClient.Counter({
    name: 'kryptovision_comm_messages_delivered_total',
    help: 'Total number of messages delivered',
    labelNames: ['tenant_id'],
    registers: [registry],
  });

  const messagesReadTotal = new promClient.Counter({
    name: 'kryptovision_comm_messages_read_total',
    help: 'Total number of messages read',
    labelNames: ['tenant_id'],
    registers: [registry],
  });

  const messageDeliveryLatency = new promClient.Histogram({
    name: 'kryptovision_comm_message_delivery_latency_seconds',
    help: 'Time from message sent to delivered',
    labelNames: ['tenant_id'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
    registers: [registry],
  });

  const messageReadLatency = new promClient.Histogram({
    name: 'kryptovision_comm_message_read_latency_seconds',
    help: 'Time from message sent to read',
    labelNames: ['tenant_id'],
    buckets: [1, 5, 10, 30, 60, 300, 600, 1800],
    registers: [registry],
  });

  // WebSocket metrics
  const websocketConnections = new promClient.Gauge({
    name: 'kryptovision_comm_websocket_connections',
    help: 'Current number of WebSocket connections',
    labelNames: ['tenant_id'],
    registers: [registry],
  });

  const signalingEventsTotal = new promClient.Counter({
    name: 'kryptovision_comm_signaling_events_total',
    help: 'Total number of signaling events',
    labelNames: ['tenant_id', 'event'],
    registers: [registry],
  });

  // WebRTC metrics
  const mediaSessionsActive = new promClient.Gauge({
    name: 'kryptovision_comm_media_sessions_active',
    help: 'Current number of active WebRTC media sessions',
    labelNames: ['tenant_id'],
    registers: [registry],
  });

  const mediaSessionsTotal = new promClient.Counter({
    name: 'kryptovision_comm_media_sessions_total',
    help: 'Total number of media sessions created',
    labelNames: ['tenant_id'],
    registers: [registry],
  });

  const mediaParticipantsActive = new promClient.Gauge({
    name: 'kryptovision_comm_media_participants_active',
    help: 'Current number of active WebRTC participants',
    labelNames: ['tenant_id'],
    registers: [registry],
  });

  return {
    // Device metrics
    recordDeviceEnrollment(tenantId, deviceType) {
      deviceEnrollmentsTotal.inc({ tenant_id: tenantId, device_type: deviceType });
    },

    recordDeviceRevocation(tenantId, deviceType) {
      deviceRevocationsTotal.inc({ tenant_id: tenantId, device_type: deviceType });
    },

    recordDeviceHeartbeat(tenantId, deviceType) {
      deviceHeartbeatsTotal.inc({ tenant_id: tenantId, device_type: deviceType });
    },

    setDevicesOnline(tenantId, count) {
      devicesOnline.set({ tenant_id: tenantId }, count);
    },

    // Presence metrics
    setBranchPresence(tenantId, branchId, presence) {
      const value = presence === 'ONLINE' ? 1 : 0;
      branchPresence.set({ tenant_id: tenantId, branch_id: branchId }, value);
    },

    setEmployeePresence(tenantId, employeeId, presence) {
      const value = presence === 'ONLINE' ? 1 : 0;
      employeePresence.set({ tenant_id: tenantId, employee_id: employeeId }, value);
    },

    // Call metrics
    recordCallStarted(tenantId, direction) {
      callsStartedTotal.inc({ tenant_id: tenantId, direction });
    },

    recordCallConnected(tenantId, setupDuration) {
      callsConnectedTotal.inc({ tenant_id: tenantId });
      callSetupDuration.observe({ tenant_id: tenantId }, setupDuration);
    },

    recordCallEnded(tenantId, duration, quality = 'GOOD') {
      callDuration.observe({ tenant_id: tenantId, quality }, duration);
    },

    recordCallFailed(tenantId, status, reason) {
      callsFailedTotal.inc({ tenant_id: tenantId, status, reason });
    },

    recordCallMissed(tenantId) {
      callsMissedTotal.inc({ tenant_id: tenantId });
    },

    // Call quality metrics
    recordCallQuality(params) {
      if (params.rtt !== undefined) {
        callRtt.observe({ tenant_id: params.tenantId }, params.rtt);
      }
      if (params.jitter !== undefined) {
        callJitter.observe({ tenant_id: params.tenantId }, params.jitter);
      }
      if (params.packetLoss !== undefined) {
        callPacketLoss.observe({ tenant_id: params.tenantId }, params.packetLoss);
      }
    },

    // Messaging metrics
    recordMessageSent(tenantId, conversationType) {
      messagesSentTotal.inc({ tenant_id: tenantId, conversation_type: conversationType });
    },

    recordMessageDelivered(tenantId, deliveryLatency) {
      messagesDeliveredTotal.inc({ tenant_id: tenantId });
      messageDeliveryLatency.observe({ tenant_id: tenantId }, deliveryLatency);
    },

    recordMessageRead(tenantId, readLatency) {
      messagesReadTotal.inc({ tenant_id: tenantId });
      messageReadLatency.observe({ tenant_id: tenantId }, readLatency);
    },

    // WebSocket metrics
    recordWebSocketConnection(tenantId, connected) {
      websocketConnections.inc({ tenant_id: tenantId }, connected ? 1 : -1);
    },

    recordSignalingEvent(tenantId, event) {
      signalingEventsTotal.inc({ tenant_id: tenantId, event });
    },

    // WebRTC metrics
    recordMediaSessionCreated(tenantId) {
      mediaSessionsTotal.inc({ tenant_id: tenantId });
      mediaSessionsActive.inc({ tenant_id: tenantId });
    },

    recordMediaSessionClosed(tenantId) {
      mediaSessionsActive.dec({ tenant_id: tenantId });
    },

    recordParticipantJoined(tenantId) {
      mediaParticipantsActive.inc({ tenant_id: tenantId });
    },

    recordParticipantLeft(tenantId) {
      mediaParticipantsActive.dec({ tenant_id: tenantId });
    },

    getRegistry() {
      return registry;
    },
  };
}

/**
 * Helper to create standardized metric labels
 */
export function createMetricLabels(params: {
  tenantId: string;
  branchId?: string;
  deviceId?: string;
  callId?: string;
}): Record<string, string> {
  const labels: Record<string, string> = {
    tenant_id: params.tenantId,
  };

  if (params.branchId) {
    labels.branch_id = params.branchId;
  }

  // Device/Call IDs are UUIDs - safe for cardinality
  if (params.deviceId) {
    labels.device_id = params.deviceId;
  }

  if (params.callId) {
    labels.call_id = params.callId;
  }

  return labels;
}

/**
 * Metric naming conventions:
 *
 * kryptovision_comm_<domain>_<metric>_<unit>
 *
 * Domains:
 * - device: Device lifecycle
 * - call: Call lifecycle
 * - message: Messaging
 * - websocket: WebSocket signaling
 * - media: WebRTC media sessions
 *
 * Units:
 * - _total: Counter
 * - _seconds: Duration histogram
 * - _milliseconds: Latency histogram
 * - _percent: Percentage histogram
 * - (no suffix): Gauge
 *
 * Labels:
 * - tenant_id: Always present for multi-tenancy
 * - device_type, direction, status: For filtering
 * - quality: For quality-based aggregation
 * - event: For event-type filtering
 */
