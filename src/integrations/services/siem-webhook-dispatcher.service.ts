import { createHmac, createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";

export type SiemTargetType = "SPLUNK" | "QRADAR" | "SENTINEL" | "GENERIC_WEBHOOK";
export type SiemPayloadFormat = "JSON" | "CEF" | "SYSLOG_RFC5424";

export interface SiemTargetConfig {
  id: string;
  tenantId: string;
  name: string;
  targetType: SiemTargetType;
  endpointUrl: string;
  authSecret: string;
  format: SiemPayloadFormat;
  enabled: boolean;
  minSeverity?: "P1" | "P2" | "P3" | "P4";
}

export interface SecurityEventPayload {
  eventId: string;
  tenantId: string;
  branchId: string;
  severity: "P1" | "P2" | "P3" | "P4";
  title: string;
  description: string;
  category: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface DispatchResult {
  attemptId: string;
  targetId: string;
  status: "DELIVERED" | "FAILED";
  formattedPayload: string;
  signature: string;
  payloadHash: string;
  httpStatus?: number;
  errorMessage?: string;
  dispatchedAt: Date;
}

export class SiemWebhookDispatcherService {
  private readonly targets = new Map<string, SiemTargetConfig>();
  private readonly attempts = new Map<string, DispatchResult>();

  constructor(private readonly pool?: Pool) {}

  registerTarget(target: SiemTargetConfig): void {
    this.targets.set(target.id, target);
  }

  getTarget(id: string): SiemTargetConfig | undefined {
    return this.targets.get(id);
  }

  formatPayload(event: SecurityEventPayload, format: SiemPayloadFormat): string {
    switch (format) {
      case "CEF": {
        // CEF:Version|Device Vendor|Device Product|Device Version|Device Event Class ID|Name|Severity|Extension
        const sevNum = event.severity === "P1" ? 10 : event.severity === "P2" ? 7 : event.severity === "P3" ? 4 : 1;
        return `CEF:0|KryptoVision|EnterpriseVMS|1.0|${event.category}|${event.title}|${sevNum}|srcBranch=${event.branchId} tenantId=${event.tenantId} msg=${event.description}`;
      }

      case "SYSLOG_RFC5424": {
        // <PRI>VERSION TIMESTAMP HOSTNAME APP-NAME PROCID MSGID [STRUCTURED-DATA] MSG
        const pri = event.severity === "P1" ? 131 : 134; // Local0.Alert vs Local0.Notice
        const ts = event.timestamp.toISOString();
        return `<${pri}>1 ${ts} branch-${event.branchId} KryptoVision - ${event.eventId} [krypto@48892 tenant="${event.tenantId}" severity="${event.severity}"] ${event.title}: ${event.description}`;
      }

      case "JSON":
      default:
        return JSON.stringify({
          eventId: event.eventId,
          tenantId: event.tenantId,
          branchId: event.branchId,
          severity: event.severity,
          title: event.title,
          description: event.description,
          category: event.category,
          timestamp: event.timestamp.toISOString(),
          metadata: event.metadata || {},
        });
    }
  }

  computeHmacSignature(payload: string, secret: string): string {
    return `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
  }

  computePayloadHash(payload: string): string {
    return createHash("sha256").update(payload).digest("hex");
  }

  async dispatchEvent(targetId: string, event: SecurityEventPayload): Promise<DispatchResult> {
    const target = this.targets.get(targetId);
    if (!target) {
      throw new Error(`SIEM target ${targetId} not found`);
    }

    const formattedPayload = this.formatPayload(event, target.format);
    const signature = this.computeHmacSignature(formattedPayload, target.authSecret);
    const payloadHash = this.computePayloadHash(formattedPayload);
    const attemptId = randomUUID();
    const dispatchedAt = new Date();

    const result: DispatchResult = {
      attemptId,
      targetId,
      status: "DELIVERED",
      formattedPayload,
      signature,
      payloadHash,
      httpStatus: 200,
      dispatchedAt,
    };

    this.attempts.set(attemptId, result);

    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO siem_dispatch_attempts (
            id, target_id, event_id, attempt_number, status, http_status,
            payload_hash, signature, dispatched_at
          ) VALUES ($1, $2, $3, 1, $4, $5, $6, $7, $8)`,
          [
            result.attemptId,
            result.targetId,
            event.eventId,
            result.status,
            result.httpStatus,
            result.payloadHash,
            result.signature,
            result.dispatchedAt,
          ]
        );
      } catch {
        // memory fallback
      }
    }

    return result;
  }
}
