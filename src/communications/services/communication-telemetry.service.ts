/**
 * KryptoVision Connect - Communication Telemetry Service
 * 
 * Integrates communication subsystem with existing VMS Prometheus metrics registry.
 * Tracks device presence, call sessions, messaging throughput, and call quality.
 * 
 * Architecture:
 * - Uses existing VmsMetricsRegistry for Prometheus exposition
 * - Provides domain-specific metric recording methods
 * - Supports Grafana dashboards and alerting
 * - Aligned with VMS observability standards
 */

import type { Logger } from 'pino';
import { VmsCounter, VmsGauge, VmsHistogram } from '../../observability/vms-metrics-registry.js';
import type {
  CommunicationCallStatus,
  CommunicationCallEndReason,
  CallQualityStatus,
} from '../domain/types.js';

// ============================================================================
// COMMUNICATION METRICS REGISTRY
// ============================================================================

/**
 * Communication-specific Prometheus metrics registry
 * Extends existing VMS metrics with communication subsystem telemetry
 */
export class CommunicationMetricsRegistry {
  // 1. Device & Presence Metrics
  public readonly devicesOnline = new VmsGauge(
    'comm_devices_online',
    'Number of communication devices currently online by tenant and branch'
  );
  
  public readonly devicesTotal = new VmsGauge(
    'comm_devices_total',
    'Total registered communication devices by tenant and status'
  );
  
  public readonly branchesOnline = new VmsGauge(
    'comm_branches_online',
    'Number of branches with at least one online communication device'
  );
  
  public readonly employeesOnline = new VmsGauge(
    'comm_employees_online',
    'Number of employees with at least one online communication device'
  );
  
  // 2. Call Session Metrics
  public readonly callsStarted = new VmsCounter(
    'comm_calls_started_total',
    'Total number of call sessions initiated by direction and target type'
  );
  
  public readonly callsConnected = new VmsCounter(
    'comm_calls_connected_total',
    'Total number of call sessions successfully connected'
  );
  
  public readonly callsFailed = new VmsCounter(
    'comm_calls_failed_total',
    'Total number of call sessions that failed by failure reason'
  );
  
  public readonly callsMissed = new VmsCounter(
    'comm_calls_missed_total',
    'Total number of call sessions missed (not answered)'
  );
  
  public readonly callsRejected = new VmsCounter(
    'comm_calls_rejected_total',
    'Total number of call sessions explicitly rejected'
  );
  
  public readonly callsCancelled = new VmsCounter(
    'comm_calls_cancelled_total',
    'Total number of call sessions cancelled before answer'
  );
  
  public readonly callsActive = new VmsGauge(
    'comm_calls_active',
    'Number of currently active call sessions by tenant'
  );
  
  public readonly callDuration = new VmsHistogram(
    'comm_call_duration_seconds',
    'Distribution of call session duration in seconds',
    [5, 10, 30, 60, 120, 300, 600, 1800, 3600] // 5s to 1h
  );
  
  public readonly callSetupTime = new VmsHistogram(
    'comm_call_setup_time_ms',
    'Time from call initiation to connection in milliseconds',
    [100, 250, 500, 1000, 2000, 3000, 5000, 10000] // 100ms to 10s
  );
  
  // 3. Messaging Metrics
  public readonly messagesSent = new VmsCounter(
    'comm_messages_sent_total',
    'Total number of messages sent by tenant and message type'
  );
  
  public readonly messagesDelivered = new VmsCounter(
    'comm_messages_delivered_total',
    'Total number of messages successfully delivered'
  );
  
  public readonly messagesRead = new VmsCounter(
    'comm_messages_read_total',
    'Total number of messages read by recipients'
  );
  
  public readonly messageDeliveryLatency = new VmsHistogram(
    'comm_message_delivery_latency_ms',
    'Time from message send to delivery in milliseconds',
    [10, 50, 100, 250, 500, 1000, 2000, 5000, 10000] // 10ms to 10s
  );
  
  public readonly conversationsActive = new VmsGauge(
    'comm_conversations_active',
    'Number of conversations with recent activity by tenant and type'
  );
  
  // 4. Call Quality Metrics
  public readonly callQuality = new VmsGauge(
    'comm_call_quality_status',
    'Current call quality status (1=GOOD, 2=DEGRADED, 3=POOR) by call ID'
  );
  
  public readonly callRttMs = new VmsHistogram(
    'comm_call_rtt_ms',
    'WebRTC round-trip time in milliseconds',
    [10, 25, 50, 100, 150, 200, 300, 500, 1000] // ITU-T G.114 thresholds
  );
  
  public readonly callJitterMs = new VmsHistogram(
    'comm_call_jitter_ms',
    'WebRTC jitter in milliseconds',
    [5, 10, 20, 30, 50, 75, 100, 150, 200]
  );
  
  public readonly callPacketLoss = new VmsHistogram(
    'comm_call_packet_loss_pct',
    'WebRTC packet loss percentage',
    [0.1, 0.5, 1, 2, 3, 5, 10, 15, 20]
  );
  
  // 5. Device Enrollment Metrics
  public readonly enrollmentCodesGenerated = new VmsCounter(
    'comm_enrollment_codes_generated_total',
    'Total number of device enrollment codes generated'
  );
  
  public readonly enrollmentCodesUsed = new VmsCounter(
    'comm_enrollment_codes_used_total',
    'Total number of enrollment codes successfully used'
  );
  
  public readonly enrollmentCodesExpired = new VmsCounter(
    'comm_enrollment_codes_expired_total',
    'Total number of enrollment codes that expired unused'
  );
  
  public readonly devicesEnrolled = new VmsCounter(
    'comm_devices_enrolled_total',
    'Total number of devices enrolled by platform and type'
  );
  
  public readonly devicesRevoked = new VmsCounter(
    'comm_devices_revoked_total',
    'Total number of devices revoked by reason'
  );
  
  /**
   * Format all communication metrics as Prometheus text
   */
  public formatPrometheusText(): string {
    const lines: string[] = [];
    
    // Device & Presence
    lines.push(...this.devicesOnline.format());
    lines.push('');
    lines.push(...this.devicesTotal.format());
    lines.push('');
    lines.push(...this.branchesOnline.format());
    lines.push('');
    lines.push(...this.employeesOnline.format());
    lines.push('');
    
    // Call Sessions
    lines.push(...this.callsStarted.format());
    lines.push('');
    lines.push(...this.callsConnected.format());
    lines.push('');
    lines.push(...this.callsFailed.format());
    lines.push('');
    lines.push(...this.callsMissed.format());
    lines.push('');
    lines.push(...this.callsRejected.format());
    lines.push('');
    lines.push(...this.callsCancelled.format());
    lines.push('');
    lines.push(...this.callsActive.format());
    lines.push('');
    lines.push(...this.callDuration.format());
    lines.push('');
    lines.push(...this.callSetupTime.format());
    lines.push('');
    
    // Messaging
    lines.push(...this.messagesSent.format());
    lines.push('');
    lines.push(...this.messagesDelivered.format());
    lines.push('');
    lines.push(...this.messagesRead.format());
    lines.push('');
    lines.push(...this.messageDeliveryLatency.format());
    lines.push('');
    lines.push(...this.conversationsActive.format());
    lines.push('');
    
    // Call Quality
    lines.push(...this.callQuality.format());
    lines.push('');
    lines.push(...this.callRttMs.format());
    lines.push('');
    lines.push(...this.callJitterMs.format());
    lines.push('');
    lines.push(...this.callPacketLoss.format());
    lines.push('');
    
    // Enrollment
    lines.push(...this.enrollmentCodesGenerated.format());
    lines.push('');
    lines.push(...this.enrollmentCodesUsed.format());
    lines.push('');
    lines.push(...this.enrollmentCodesExpired.format());
    lines.push('');
    lines.push(...this.devicesEnrolled.format());
    lines.push('');
    lines.push(...this.devicesRevoked.format());
    lines.push('');
    
    return lines.join('\n');
  }
}

// Singleton instance
export const communicationMetrics = new CommunicationMetricsRegistry();

// ============================================================================
// TELEMETRY SERVICE
// ============================================================================

export interface RecordCallStartedInput {
  tenantId: string;
  callId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  sourceType: string;
  targetType: string;
  branchId?: string;
}

export interface RecordCallConnectedInput {
  tenantId: string;
  callId: string;
  setupTimeMs: number;
  branchId?: string;
}

export interface RecordCallEndedInput {
  tenantId: string;
  callId: string;
  status: CommunicationCallStatus;
  durationSeconds?: number;
  endReason?: CommunicationCallEndReason;
  branchId?: string;
}

export interface RecordMessageSentInput {
  tenantId: string;
  messageType: string;
  conversationType: string;
  branchId?: string;
}

export interface RecordMessageDeliveredInput {
  tenantId: string;
  messageType: string;
  deliveryLatencyMs: number;
}

export interface RecordCallQualityInput {
  tenantId: string;
  callId: string;
  quality: CallQualityStatus;
  rttMs?: number;
  jitterMs?: number;
  packetLossPct?: number;
}

export interface RecordDevicePresenceInput {
  tenantId: string;
  branchId: string;
  onlineDevices: number;
  totalDevices: number;
}

/**
 * Communication telemetry service
 * Provides high-level methods for recording communication metrics
 */
export class CommunicationTelemetryService {
  private readonly metrics: CommunicationMetricsRegistry;
  private readonly logger: Logger;
  
  constructor(logger: Logger, metrics?: CommunicationMetricsRegistry) {
    this.logger = logger.child({ component: 'CommunicationTelemetry' });
    this.metrics = metrics || communicationMetrics;
  }
  
  // ============================================================================
  // CALL TELEMETRY
  // ============================================================================
  
  /**
   * Record call session initiated
   */
  recordCallStarted(input: RecordCallStartedInput): void {
    try {
      this.metrics.callsStarted.inc(1, {
        tenant_id: input.tenantId,
        direction: input.direction,
        source_type: input.sourceType,
        target_type: input.targetType,
        branch_id: input.branchId,
      });
      
      // Increment active calls
      this.metrics.callsActive.inc(1, { tenant_id: input.tenantId });
      
      this.logger.debug({
        event: 'call_started',
        callId: input.callId,
        tenantId: input.tenantId,
        direction: input.direction,
      }, 'Recorded call started metric');
    } catch (error) {
      this.logger.warn({ error }, 'Failed to record call started metric');
    }
  }
  
  /**
   * Record call successfully connected
   */
  recordCallConnected(input: RecordCallConnectedInput): void {
    try {
      this.metrics.callsConnected.inc(1, {
        tenant_id: input.tenantId,
        branch_id: input.branchId,
      });
      
      // Record setup time
      if (input.setupTimeMs > 0) {
        this.metrics.callSetupTime.observe(input.setupTimeMs, {
          tenant_id: input.tenantId,
        });
      }
      
      this.logger.debug({
        event: 'call_connected',
        callId: input.callId,
        setupTimeMs: input.setupTimeMs,
      }, 'Recorded call connected metric');
    } catch (error) {
      this.logger.warn({ error }, 'Failed to record call connected metric');
    }
  }
  
  /**
   * Record call ended
   */
  recordCallEnded(input: RecordCallEndedInput): void {
    try {
      // Decrement active calls
      this.metrics.callsActive.dec(1, { tenant_id: input.tenantId });
      
      // Increment status-specific counter
      const labels = {
        tenant_id: input.tenantId,
        branch_id: input.branchId,
        end_reason: input.endReason,
      };
      
      switch (input.status) {
        case 'FAILED':
          this.metrics.callsFailed.inc(1, labels);
          break;
        case 'MISSED':
          this.metrics.callsMissed.inc(1, labels);
          break;
        case 'REJECTED':
          this.metrics.callsRejected.inc(1, labels);
          break;
        case 'CANCELLED':
          this.metrics.callsCancelled.inc(1, labels);
          break;
        case 'ENDED':
          // Successfully completed call
          if (input.durationSeconds && input.durationSeconds > 0) {
            this.metrics.callDuration.observe(input.durationSeconds, {
              tenant_id: input.tenantId,
            });
          }
          break;
      }
      
      this.logger.debug({
        event: 'call_ended',
        callId: input.callId,
        status: input.status,
        durationSeconds: input.durationSeconds,
      }, 'Recorded call ended metric');
    } catch (error) {
      this.logger.warn({ error }, 'Failed to record call ended metric');
    }
  }
  
  /**
   * Record call quality metrics
   */
  recordCallQuality(input: RecordCallQualityInput): void {
    try {
      // Map quality status to numeric value for gauge
      const qualityValue = {
        GOOD: 1,
        DEGRADED: 2,
        POOR: 3,
      }[input.quality] || 0;
      
      this.metrics.callQuality.set(qualityValue, {
        tenant_id: input.tenantId,
        call_id: input.callId,
      });
      
      // Record quality metrics histograms
      if (input.rttMs !== undefined) {
        this.metrics.callRttMs.observe(input.rttMs, {
          tenant_id: input.tenantId,
        });
      }
      
      if (input.jitterMs !== undefined) {
        this.metrics.callJitterMs.observe(input.jitterMs, {
          tenant_id: input.tenantId,
        });
      }
      
      if (input.packetLossPct !== undefined) {
        this.metrics.callPacketLoss.observe(input.packetLossPct, {
          tenant_id: input.tenantId,
        });
      }
      
      this.logger.debug({
        event: 'call_quality',
        callId: input.callId,
        quality: input.quality,
        rttMs: input.rttMs,
      }, 'Recorded call quality metrics');
    } catch (error) {
      this.logger.warn({ error }, 'Failed to record call quality metrics');
    }
  }
  
  // ============================================================================
  // MESSAGING TELEMETRY
  // ============================================================================
  
  /**
   * Record message sent
   */
  recordMessageSent(input: RecordMessageSentInput): void {
    try {
      this.metrics.messagesSent.inc(1, {
        tenant_id: input.tenantId,
        message_type: input.messageType,
        conversation_type: input.conversationType,
        branch_id: input.branchId,
      });
      
      this.logger.debug({
        event: 'message_sent',
        tenantId: input.tenantId,
        messageType: input.messageType,
      }, 'Recorded message sent metric');
    } catch (error) {
      this.logger.warn({ error }, 'Failed to record message sent metric');
    }
  }
  
  /**
   * Record message delivered
   */
  recordMessageDelivered(input: RecordMessageDeliveredInput): void {
    try {
      this.metrics.messagesDelivered.inc(1, {
        tenant_id: input.tenantId,
        message_type: input.messageType,
      });
      
      // Record delivery latency
      if (input.deliveryLatencyMs > 0) {
        this.metrics.messageDeliveryLatency.observe(input.deliveryLatencyMs, {
          tenant_id: input.tenantId,
        });
      }
      
      this.logger.debug({
        event: 'message_delivered',
        tenantId: input.tenantId,
        latencyMs: input.deliveryLatencyMs,
      }, 'Recorded message delivered metric');
    } catch (error) {
      this.logger.warn({ error }, 'Failed to record message delivered metric');
    }
  }
  
  /**
   * Record message read
   */
  recordMessageRead(tenantId: string, messageType: string): void {
    try {
      this.metrics.messagesRead.inc(1, {
        tenant_id: tenantId,
        message_type: messageType,
      });
      
      this.logger.debug({
        event: 'message_read',
        tenantId,
      }, 'Recorded message read metric');
    } catch (error) {
      this.logger.warn({ error }, 'Failed to record message read metric');
    }
  }
  
  // ============================================================================
  // DEVICE & PRESENCE TELEMETRY
  // ============================================================================
  
  /**
   * Update device presence metrics
   */
  updateDevicePresence(input: RecordDevicePresenceInput): void {
    try {
      this.metrics.devicesOnline.set(input.onlineDevices, {
        tenant_id: input.tenantId,
        branch_id: input.branchId,
      });
      
      this.metrics.devicesTotal.set(input.totalDevices, {
        tenant_id: input.tenantId,
        branch_id: input.branchId,
      });
      
      this.logger.debug({
        event: 'device_presence_updated',
        tenantId: input.tenantId,
        branchId: input.branchId,
        onlineDevices: input.onlineDevices,
      }, 'Updated device presence metrics');
    } catch (error) {
      this.logger.warn({ error }, 'Failed to update device presence metrics');
    }
  }
  
  /**
   * Record branch online status
   */
  setBranchOnline(tenantId: string, branchId: string, online: boolean): void {
    try {
      if (online) {
        this.metrics.branchesOnline.inc(1, {
          tenant_id: tenantId,
          branch_id: branchId,
        });
      } else {
        this.metrics.branchesOnline.dec(1, {
          tenant_id: tenantId,
          branch_id: branchId,
        });
      }
      
      this.logger.debug({
        event: 'branch_presence_changed',
        tenantId,
        branchId,
        online,
      }, 'Updated branch online status');
    } catch (error) {
      this.logger.warn({ error }, 'Failed to update branch online status');
    }
  }
  
  /**
   * Record employee online status
   */
  setEmployeeOnline(tenantId: string, employeeId: string, online: boolean): void {
    try {
      if (online) {
        this.metrics.employeesOnline.inc(1, {
          tenant_id: tenantId,
          employee_id: employeeId,
        });
      } else {
        this.metrics.employeesOnline.dec(1, {
          tenant_id: tenantId,
          employee_id: employeeId,
        });
      }
      
      this.logger.debug({
        event: 'employee_presence_changed',
        tenantId,
        employeeId,
        online,
      }, 'Updated employee online status');
    } catch (error) {
      this.logger.warn({ error }, 'Failed to update employee online status');
    }
  }
  
  // ============================================================================
  // ENROLLMENT TELEMETRY
  // ============================================================================
  
  /**
   * Record enrollment code generated
   */
  recordEnrollmentCodeGenerated(tenantId: string, branchId: string): void {
    try {
      this.metrics.enrollmentCodesGenerated.inc(1, {
        tenant_id: tenantId,
        branch_id: branchId,
      });
      
      this.logger.debug({
        event: 'enrollment_code_generated',
        tenantId,
        branchId,
      }, 'Recorded enrollment code generated');
    } catch (error) {
      this.logger.warn({ error }, 'Failed to record enrollment code generated');
    }
  }
  
  /**
   * Record enrollment code used
   */
  recordEnrollmentCodeUsed(tenantId: string, branchId: string): void {
    try {
      this.metrics.enrollmentCodesUsed.inc(1, {
        tenant_id: tenantId,
        branch_id: branchId,
      });
      
      this.logger.debug({
        event: 'enrollment_code_used',
        tenantId,
        branchId,
      }, 'Recorded enrollment code used');
    } catch (error) {
      this.logger.warn({ error }, 'Failed to record enrollment code used');
    }
  }
  
  /**
   * Record device enrolled
   */
  recordDeviceEnrolled(tenantId: string, platform: string, deviceType: string): void {
    try {
      this.metrics.devicesEnrolled.inc(1, {
        tenant_id: tenantId,
        platform,
        device_type: deviceType,
      });
      
      this.logger.debug({
        event: 'device_enrolled',
        tenantId,
        platform,
        deviceType,
      }, 'Recorded device enrolled');
    } catch (error) {
      this.logger.warn({ error }, 'Failed to record device enrolled');
    }
  }
  
  /**
   * Record device revoked
   */
  recordDeviceRevoked(tenantId: string, reason: string): void {
    try {
      this.metrics.devicesRevoked.inc(1, {
        tenant_id: tenantId,
        revocation_reason: reason,
      });
      
      this.logger.debug({
        event: 'device_revoked',
        tenantId,
        reason,
      }, 'Recorded device revoked');
    } catch (error) {
      this.logger.warn({ error }, 'Failed to record device revoked');
    }
  }
  
  /**
   * Get metrics snapshot for debugging/dashboards
   */
  getMetricsSnapshot(): Record<string, unknown> {
    return {
      timestamp: new Date().toISOString(),
      devices: {
        online: this.metrics.devicesOnline.entries().reduce((sum, e) => sum + e.value, 0),
        total: this.metrics.devicesTotal.entries().reduce((sum, e) => sum + e.value, 0),
      },
      branches: {
        online: this.metrics.branchesOnline.entries().reduce((sum, e) => sum + e.value, 0),
      },
      employees: {
        online: this.metrics.employeesOnline.entries().reduce((sum, e) => sum + e.value, 0),
      },
      calls: {
        active: this.metrics.callsActive.entries().reduce((sum, e) => sum + e.value, 0),
        started: this.metrics.callsStarted.entries().reduce((sum, e) => sum + e.value, 0),
        connected: this.metrics.callsConnected.entries().reduce((sum, e) => sum + e.value, 0),
        failed: this.metrics.callsFailed.entries().reduce((sum, e) => sum + e.value, 0),
      },
      messages: {
        sent: this.metrics.messagesSent.entries().reduce((sum, e) => sum + e.value, 0),
        delivered: this.metrics.messagesDelivered.entries().reduce((sum, e) => sum + e.value, 0),
        read: this.metrics.messagesRead.entries().reduce((sum, e) => sum + e.value, 0),
      },
    };
  }
}
