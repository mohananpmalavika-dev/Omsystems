import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { AnalyticsRepository } from "../src/database/analytics-repository.js";
import { buildFalseAlarmSignature } from "../src/analytics/false-alarm-feedback.js";

const input = {
  tenantId: "tenant-1", cameraId: "camera-1", sourceEventId: "source-1",
  detectionType: "person" as const, occurredAt: "2026-10-04T10:00:00Z",
  confidence: 0.95, durationSeconds: 2, modelVersion: "v1",
  objects: [{ label: "person", confidence: 0.95, trackId: "chair" }],
};
const rule = {
  id: "rule-1", tenant_id: input.tenantId, camera_id: input.cameraId, name: "Person",
  detection_type: "person", enabled: true, object_classes: [], min_confidence: 0.5,
  min_duration_seconds: 0, direction: "any", severity: "P2", cooldown_seconds: 60,
  recipients: [], recording_policy: "none", pre_roll_seconds: 5, post_roll_seconds: 5,
  created_at: input.occurredAt, updated_at: input.occurredAt,
};

describe("Postgres false alarm feedback transactions", () => {
  it("freezes reviewed evidence, cancels pending delivery and reuses stored feedback after a repository restart", async () => {
    const signature = await buildFalseAlarmSignature(input);
    const row: any = {
      id: "alert-1", tenant_id: input.tenantId, camera_id: input.cameraId, rule_id: rule.id,
      event_id: "event-1", title: "Person", severity: "P2", status: "new", confidence: 0.95,
      model_version: "v1", first_detected_at: input.occurredAt, last_detected_at: input.occurredAt,
      occurrence_count: 1, version: 1, created_at: input.occurredAt, updated_at: input.occurredAt,
      detection_signature: signature, false_alarm_signature: null,
    };
    let storedEvent: any;
    const query = vi.fn(async (sql: string, values: any[] = []) => {
      if (sql.startsWith("SELECT camera_id FROM analytics_alerts")) return { rows: [{ camera_id: row.camera_id }] };
      if (sql.startsWith("SELECT * FROM analytics_alerts WHERE id=")) return { rows: [row] };
      if (sql.includes("UPDATE analytics_alerts SET status=")) {
        Object.assign(row, { status: values[2], false_alarm_signature: row.detection_signature, version: 2 });
        return { rows: [row] };
      }
      if (sql.includes("COALESCE(camera.branch_node_id")) return { rows: [{ id: input.cameraId, branch_id: "branch-1" }] };
      if (sql.includes("FROM analytics_rules rule")) return { rows: [rule] };
      if (sql.includes("INSERT INTO analytics_events")) {
        storedEvent = { id: values[0], tenant_id: values[1], camera_id: values[2], source_event_id: values[3],
          detection_type: values[5], occurred_at: values[6], confidence: values[8], duration_seconds: values[9],
          model_version: values[10], metadata: JSON.parse(values[13]), status: values[14], created_at: input.occurredAt };
      }
      if (sql.includes("SELECT false_alarm_signature")) return { rows: [{ false_alarm_signature: row.false_alarm_signature }] };
      if (sql.includes("UPDATE analytics_events SET status='suppressed'")) storedEvent.status = "suppressed";
      if (sql === "SELECT * FROM analytics_events WHERE id=$1") return { rows: [storedEvent] };
      return { rows: [] };
    });
    const release = vi.fn();
    const pool = { connect: async () => ({ query, release }) } as unknown as Pool;
    const reviewed = await new AnalyticsRepository(pool).transitionAlert(row.id, input.tenantId, {
      status: "false_alarm", actorUserId: "operator", falseAlarmReason: "Chair", expectedVersion: 1,
    });
    expect(reviewed?.repeatSuppressionActive).toBe(true);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("false_alarm_signature=CASE"), expect.any(Array));
    expect(query).toHaveBeenCalledWith(expect.stringContaining("status IN ('queued', 'failed')"), [row.id, input.tenantId]);
    expect(query).toHaveBeenCalledWith("COMMIT");
    query.mockClear();
    const result = await new AnalyticsRepository(pool).processEvent({ ...input, sourceEventId: "repeat-after-restart", occurredAt: "2026-10-04T15:00:00Z" });
    expect(result.alerts).toEqual([]);
    expect(result.event.status).toBe("suppressed");
    expect(query).toHaveBeenCalledWith(expect.stringContaining("tenant_id=$1 AND camera_id=$2 AND rule_id=$3"), [input.tenantId, input.cameraId, rule.id]);
    expect(query.mock.calls.some(([sql]) => sql.includes("INSERT INTO analytics_alerts") || sql.includes("INSERT INTO analytics_notifications"))).toBe(false);
    expect(release).toHaveBeenCalledTimes(2);
  });

  it("rolls back a stale review without saving feedback or cancelling notifications", async () => {
    const query = vi.fn(async (sql: string) => ({ rows: sql.includes("FOR UPDATE")
      ? [{ status: "new", version: 2 }] : sql.startsWith("SELECT camera_id") ? [{ camera_id: input.cameraId }] : [] }));
    const release = vi.fn();
    const pool = { connect: async () => ({ query, release }) } as unknown as Pool;
    await expect(new AnalyticsRepository(pool).transitionAlert("alert-1", input.tenantId, {
      status: "false_alarm", actorUserId: "operator", expectedVersion: 1,
    })).rejects.toThrow("alert_version_conflict");
    expect(query).toHaveBeenCalledWith("ROLLBACK");
    expect(query.mock.calls.some(([sql]) => sql.trim().startsWith("UPDATE"))).toBe(false);
    expect(release).toHaveBeenCalledOnce();
  });
});
