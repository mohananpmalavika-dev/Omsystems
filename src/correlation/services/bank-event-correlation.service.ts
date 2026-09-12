import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

export type BankRuleCategory =
  | "ATM_TAMPER"
  | "VAULT_INTRUSION"
  | "CASH_TRANSIT_LOITERING"
  | "CASH_VAN_SOP"
  | "AFTER_HOURS_STRONGROOM";

export type AlertSeverity = "P1" | "P2" | "P3" | "P4";

export interface BankCorrelationInput {
  tenantId: string;
  branchId: string;
  category: BankRuleCategory;
  cameraIds: string[];
  sensorReadings?: Record<string, any>;
  doorStates?: Record<string, string>;
  dwellTimeSeconds?: number;
  motionDetected?: boolean;
  eventTimestamp?: Date;
  isAfterHours?: boolean;
  transitSequence?: string[];
}

export interface BankCorrelationAlert {
  id: string;
  tenantId: string;
  branchId: string;
  ruleCode: string;
  category: BankRuleCategory;
  severity: AlertSeverity;
  title: string;
  description: string;
  correlatedSources: {
    cameraIds: string[];
    sensors: Record<string, any>;
    triggers: string[];
  };
  triggeredAt: Date;
  evidenceCaptureTriggered: boolean;
}

export class BankEventCorrelationService {
  private readonly memoryAlerts = new Map<string, BankCorrelationAlert>();

  constructor(private readonly pool?: Pool) {}

  async evaluateEvent(input: BankCorrelationInput): Promise<BankCorrelationAlert | null> {
    const timestamp = input.eventTimestamp || new Date();
    let triggered = false;
    let ruleCode = "";
    let severity: AlertSeverity = "P2";
    let title = "";
    let description = "";
    const triggers: string[] = [];

    switch (input.category) {
      case "ATM_TAMPER": {
        // Tamper sensor fired + loitering dwell time > 120s
        const tamperFired = Boolean(input.sensorReadings?.tamperFired || input.sensorReadings?.vibrationExceeded);
        const loitering = (input.dwellTimeSeconds ?? 0) >= 120;

        if (tamperFired || (loitering && input.motionDetected)) {
          triggered = true;
          ruleCode = "BANK_CORR_ATM_001";
          severity = "P1";
          title = "ATM Skimming or Hardware Tamper Suspected";
          description = `ATM enclosure tamper alert triggered with dwell time ${input.dwellTimeSeconds ?? 0}s and vibration telemetry breach.`;
          triggers.push(tamperFired ? "VIBRATION_SENSOR_BREACH" : "EXTENDED_LOITERING");
        }
        break;
      }

      case "VAULT_INTRUSION": {
        // Optical motion inside vault while door sensor says CLOSED or outside hours
        const doorClosed = input.doorStates?.vaultDoor === "LOCKED" || input.doorStates?.vaultDoor === "CLOSED";
        const afterHours = input.isAfterHours ?? false;

        if (input.motionDetected && (doorClosed || afterHours)) {
          triggered = true;
          ruleCode = "BANK_CORR_VAULT_002";
          severity = "P1";
          title = "Unscheduled Optical Motion Inside Secured Vault";
          description = `Camera detected optical motion inside vault zone while physical door sensor indicates ${doorClosed ? "CLOSED" : "OPEN"} (After-hours: ${afterHours}).`;
          triggers.push("VAULT_OPTICAL_MOTION");
          if (doorClosed) triggers.push("DOOR_SENSOR_MISMATCH");
          if (afterHours) triggers.push("AFTER_HOURS_WINDOW");
        }
        break;
      }

      case "CASH_VAN_SOP": {
        // Transit sequence check: must be Perimeter -> Entrance -> Bay -> Airlock
        const expected = ["PERIMETER", "ENTRANCE", "CASH_BAY", "STRONGROOM"];
        const actual = input.transitSequence || [];
        const isSequenceBroken = actual.length > 0 && !this.isSubsequence(actual, expected);

        if (isSequenceBroken || (input.dwellTimeSeconds ?? 0) > 600) {
          triggered = true;
          ruleCode = "BANK_CORR_VAN_003";
          severity = "P1";
          title = "Cash Van Ingestion SOP Breach or Timeout";
          description = `Cash transit van corridor procedure anomaly. Observed path: [${actual.join(" -> ")}]. Dwell: ${input.dwellTimeSeconds ?? 0}s.`;
          triggers.push(isSequenceBroken ? "SOP_PATH_VIOLATION" : "SLA_TRANSIT_TIMEOUT");
        }
        break;
      }

      case "AFTER_HOURS_STRONGROOM": {
        if (input.isAfterHours && (input.motionDetected || input.doorStates?.strongroom !== "LOCKED")) {
          triggered = true;
          ruleCode = "BANK_CORR_STRONGROOM_004";
          severity = "P1";
          title = "Critical After-Hours Strongroom Intrusion";
          description = "Authorized strongroom opening window violated outside 09:00-18:00 banking schedule.";
          triggers.push("NON_BUSINESS_HOURS_BREACH");
        }
        break;
      }

      case "CASH_TRANSIT_LOITERING": {
        if ((input.dwellTimeSeconds ?? 0) > 180 && input.motionDetected) {
          triggered = true;
          ruleCode = "BANK_CORR_CASH_005";
          severity = "P2";
          title = "Cash Counter Extended Loitering Without Teller";
          description = `Subject dwelling near cashier counter for ${input.dwellTimeSeconds} seconds during active branch operations.`;
          triggers.push("CASH_COUNTER_PROXIMITY_DWELL");
        }
        break;
      }
    }

    if (!triggered) {
      return null;
    }

    const alertId = randomUUID();
    const alert: BankCorrelationAlert = {
      id: alertId,
      tenantId: input.tenantId,
      branchId: input.branchId,
      ruleCode,
      category: input.category,
      severity,
      title,
      description,
      correlatedSources: {
        cameraIds: input.cameraIds,
        sensors: input.sensorReadings || {},
        triggers,
      },
      triggeredAt: timestamp,
      evidenceCaptureTriggered: severity === "P1",
    };

    this.memoryAlerts.set(alertId, alert);

    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO bank_correlated_events (
            id, tenant_id, branch_id, rule_id, severity, title, description,
            correlated_sources, triggered_at, acknowledged, metadata
          ) VALUES ($1, $2, $3, gen_random_uuid(), $4, $5, $6, $7, $8, false, $9)`,
          [
            alert.id,
            alert.tenantId,
            alert.branchId,
            alert.severity,
            alert.title,
            alert.description,
            JSON.stringify(alert.correlatedSources),
            alert.triggeredAt,
            JSON.stringify({ ruleCode }),
          ]
        );
      } catch {
        // memory fallback
      }
    }

    return alert;
  }

  private isSubsequence(actual: string[], expected: string[]): boolean {
    let expIdx = 0;
    for (const act of actual) {
      const foundIdx = expected.indexOf(act, expIdx);
      if (foundIdx === -1) return false;
      expIdx = foundIdx + 1;
    }
    return true;
  }

  async getRecentAlerts(branchId: string): Promise<BankCorrelationAlert[]> {
    return Array.from(this.memoryAlerts.values()).filter((a) => a.branchId === branchId);
  }
}
