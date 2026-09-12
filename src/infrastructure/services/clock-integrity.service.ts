/**
 * Clock Integrity & NTP Drift Engine
 * 
 * Tracks time synchronization across:
 * - HO server time
 * - Edge gateway time
 * - NVR time
 * - Camera time
 * 
 * Policy:
 * - <5s     : HEALTHY
 * - 5–30s   : WARNING
 * - >30s    : CRITICAL
 */

import type { Pool } from "pg";

export type ClockDriftStatus = "HEALTHY" | "WARNING" | "CRITICAL";

export interface ClockMeasurement {
  nodeId: string;
  nodeType: "HO_SERVER" | "EDGE_GATEWAY" | "NVR" | "CAMERA";
  referenceSource: string;
  offsetMs: number;
  jitterMs: number;
  status: ClockDriftStatus;
  measuredAt: Date;
}

export class ClockIntegrityService {
  private readonly cachedOffsets = new Map<string, ClockMeasurement>();

  constructor(private readonly pool?: Pool) {}

  evaluateDrift(offsetMs: number): ClockDriftStatus {
    const abs = Math.abs(offsetMs);
    if (abs < 5000) return "HEALTHY";
    if (abs <= 30000) return "WARNING";
    return "CRITICAL";
  }

  async recordMeasurement(params: {
    nodeId: string;
    nodeType: "HO_SERVER" | "EDGE_GATEWAY" | "NVR" | "CAMERA";
    referenceSource?: string;
    offsetMs: number;
    jitterMs?: number;
    measuredAt?: Date;
  }): Promise<ClockMeasurement> {
    const offsetMs = Math.round(params.offsetMs);
    const status = this.evaluateDrift(offsetMs);
    const measuredAt = params.measuredAt || new Date();

    const measurement: ClockMeasurement = {
      nodeId: params.nodeId,
      nodeType: params.nodeType,
      referenceSource: params.referenceSource || "NTP",
      offsetMs,
      jitterMs: params.jitterMs || 0,
      status,
      measuredAt,
    };

    this.cachedOffsets.set(params.nodeId, measurement);

    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO clock_drift_telemetry (
            node_id, node_type, reference_source, offset_ms, jitter_ms, status, measured_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            measurement.nodeId,
            measurement.nodeType,
            measurement.referenceSource,
            measurement.offsetMs,
            measurement.jitterMs,
            measurement.status,
            measurement.measuredAt,
          ]
        );
      } catch {
        // Suppress or log
      }
    }

    return measurement;
  }

  async getObservedOffset(nodeId: string): Promise<number> {
    const cached = this.cachedOffsets.get(nodeId);
    if (cached) return cached.offsetMs;

    if (this.pool) {
      try {
        const res = await this.pool.query(
          `SELECT offset_ms FROM clock_drift_telemetry 
           WHERE node_id = $1 
           ORDER BY measured_at DESC LIMIT 1`,
          [nodeId]
        );
        if (res.rows.length > 0) {
          return Number(res.rows[0].offset_ms);
        }
      } catch {
        // Fall through
      }
    }

    return 0;
  }
}

export const clockIntegrityService = new ClockIntegrityService();
