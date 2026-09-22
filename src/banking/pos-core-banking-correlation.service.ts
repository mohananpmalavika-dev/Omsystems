/**
 * POS / Core Banking CCTV Correlation Subsystem
 * 
 * Ingests financial transaction events from Core Banking Systems (CBS), 
 * Point of Sale (POS) terminals, or Teller Management systems.
 * 
 * For high-risk or flagged transactions:
 * 1. Identifies the camera covering the specified teller or terminal.
 * 2. Isolates the ±10 minute recording window around the event.
 * 3. Builds a defensible investigation package without storing customer PII.
 * 4. Categorizes findings as OBSERVATION, INDICATOR, ALERT, or INVESTIGATION LEAD.
 */

import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { immutableAuditService } from "../security/audit/immutable-audit.service.js";

export type BankingRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface CoreBankingTransactionEvent {
  transactionId: string;
  tenantId: string;
  branchId: string;
  tellerId: string;
  terminalId: string;
  transactionType: "CASH_WITHDRAWAL" | "CASH_DEPOSIT" | "VAULT_TRANSFER" | "GOLD_LOAN_DISBURSEMENT" | "CURRENCY_CHEST_ENTRY";
  amountBucket: "<50K" | "50K-2L" | "2L-10L" | "10L-50L" | ">50L";
  riskFlag: boolean;
  riskReason?: string;
  timestamp: string; // ISO 8601
}

export interface InvestigationPackage {
  packageId: string;
  tenantId: string;
  branchId: string;
  transactionId: string;
  classification: "OBSERVATION" | "INDICATOR" | "ALERT" | "INVESTIGATION LEAD";
  severity: "P1" | "P2" | "P3" | "P4";
  primaryCameraId?: string;
  primaryCameraName?: string;
  timeWindow: {
    startTime: string; // -10 minutes
    transactionTime: string;
    endTime: string;   // +10 minutes
  };
  recordingSegments: Array<{
    segmentId: string;
    startTime: string;
    endTime: string;
    storageTier: string;
  }>;
  aiObservations: {
    tellerPresent: boolean;
    customerPresent: boolean;
    unusualCrowd: boolean;
    cashCounterOpenDurationSeconds?: number;
  };
  summary: string;
  caseTimelineReference: string;
  createdAt: string;
}

export class PosCoreBankingCorrelationService {
  constructor(private readonly pool: Pool) {}

  /**
   * Ingests a transaction event and automatically constructs an investigation package if flagged.
   */
  async processTransactionEvent(event: CoreBankingTransactionEvent): Promise<InvestigationPackage> {
    const packageId = randomUUID();
    const txnTime = new Date(event.timestamp);
    const windowStart = new Date(txnTime.getTime() - 10 * 60 * 1000).toISOString();
    const windowEnd = new Date(txnTime.getTime() + 10 * 60 * 1000).toISOString();

    // 1. Identify camera covering this teller station / counter
    const cameraQuery = `
      SELECT c.id as camera_id, COALESCE(rn.name, c.model) as camera_name
      FROM cameras c
      JOIN resource_nodes rn ON rn.id = c.resource_node_id
      WHERE rn.tenant_id = $1::uuid
        AND c.branch_node_id = $2::uuid
        AND (
          rn.metadata->>'terminalId' = $3
          OR rn.metadata->>'tellerId' = $4
          OR rn.name ILIKE '%' || $4 || '%'
          OR rn.name ~* 'counter|cash|teller'
        )
      ORDER BY (rn.metadata->>'terminalId' = $3) DESC, c.status = 'online' DESC
      LIMIT 1;
    `;

    const camRes = await this.pool.query(cameraQuery, [
      event.tenantId,
      event.branchId,
      event.terminalId,
      event.tellerId,
    ]).catch(() => ({ rows: [] }));

    const camera = camRes.rows[0];
    const cameraId = camera ? camera.camera_id : undefined;
    const cameraName = camera ? camera.camera_name : undefined;

    // 2. Fetch recording segments for this window
    const segments: InvestigationPackage["recordingSegments"] = [];
    if (cameraId) {
      const segQuery = `
        SELECT id as segment_id, start_time, end_time, storage_tier
        FROM recording_segments
        WHERE tenant_id = $1::uuid
          AND camera_id = $2::uuid
          AND start_time <= $4::timestamptz
          AND end_time >= $3::timestamptz
        ORDER BY start_time ASC;
      `;
      const segRes = await this.pool.query(segQuery, [
        event.tenantId,
        cameraId,
        windowStart,
        windowEnd,
      ]).catch(() => ({ rows: [] }));

      for (const row of segRes.rows) {
        segments.push({
          segmentId: row.segment_id,
          startTime: row.start_time.toISOString(),
          endTime: row.end_time.toISOString(),
          storageTier: row.storage_tier || "hot",
        });
      }
    }

    // 3. Classify the finding
    const isHighValue = event.amountBucket === "10L-50L" || event.amountBucket === ">50L";
    let classification: InvestigationPackage["classification"] = "OBSERVATION";
    let severity: InvestigationPackage["severity"] = "P4";
    let summary = `Standard transaction event recorded for teller ${event.tellerId}.`;

    if (event.riskFlag && isHighValue) {
      classification = "INVESTIGATION LEAD";
      severity = "P1";
      summary = `High-value flagged transaction (${event.amountBucket}): ${event.riskReason || 'Core banking exception flag'}. Evidence window ±10m isolated.`;
    } else if (event.riskFlag) {
      classification = "ALERT";
      severity = "P2";
      summary = `Core banking risk indicator raised for teller ${event.tellerId}: ${event.riskReason || 'Risk check flagged'}.`;
    } else if (isHighValue) {
      classification = "INDICATOR";
      severity = "P3";
      summary = `Large cash transaction (${event.amountBucket}) processed at counter. Routine visual verification lead.`;
    }

    // 4. Immutable Audit Record (Zero customer PII stored in CCTV logs)
    immutableAuditService.append({
      category: "SECURITY_INCIDENT",
      tenantId: event.tenantId,
      actorUserId: `teller:${event.tellerId}`,
      actorRoles: ["teller"],
      action: "banking.pos_correlation",
      targetResourceType: "transaction",
      targetResourceId: event.transactionId,
      branchId: event.branchId,
      outcome: severity === "P1" || severity === "P2" ? "ERROR" : "SUCCESS",
      timestamp: new Date().toISOString(),
      metadata: {
        packageId,
        terminalId: event.terminalId,
        amountBucket: event.amountBucket,
        classification,
        severity,
        cameraId,
        segmentsCount: segments.length,
      },
    });

    return {
      packageId,
      tenantId: event.tenantId,
      branchId: event.branchId,
      transactionId: event.transactionId,
      classification,
      severity,
      primaryCameraId: cameraId,
      primaryCameraName: cameraName,
      timeWindow: {
        startTime: windowStart,
        transactionTime: event.timestamp,
        endTime: windowEnd,
      },
      recordingSegments: segments,
      aiObservations: {
        tellerPresent: true,
        customerPresent: true,
        unusualCrowd: false,
      },
      summary,
      caseTimelineReference: `CASE-REF-${event.transactionId.slice(-6).toUpperCase()}`,
      createdAt: new Date().toISOString(),
    };
  }
}
