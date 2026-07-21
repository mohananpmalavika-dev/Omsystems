import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type {
  AnalyticsAlert,
  AnalyticsEvent,
  AnalyticsIngestResult,
  AnalyticsRule,
} from "../domain/models.js";
import type {
  AnalyticsAlertFilters,
  AnalyticsAlertTransitionInput,
  AnalyticsEventInput,
  AnalyticsRuleInput,
} from "../control-plane-store.js";
import {
  analyticsAlertTitle,
  isTerminalAlertStatus,
  sortedMatchingRules,
} from "../analytics/rule-engine.js";

const ruleSelection = `
  SELECT rule.*,
         zone.id::text AS zone_join_id, zone.name AS zone_name,
         zone.shape AS zone_shape, zone.points AS zone_points
  FROM analytics_rules rule
  LEFT JOIN analytics_zones zone ON zone.id=rule.zone_id`;

export class AnalyticsRepository {
  constructor(private readonly pool: Pool) {}

  async listRules(cameraId: string): Promise<AnalyticsRule[]> {
    const result = await this.pool.query(
      `${ruleSelection} WHERE rule.camera_id=$1 ORDER BY rule.name`,
      [cameraId],
    );
    return result.rows.map(mapRule);
  }

  async createRule(
    tenantId: string,
    cameraId: string,
    createdBy: string,
    input: AnalyticsRuleInput,
  ): Promise<AnalyticsRule> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const zoneId = await replaceZone(client, tenantId, cameraId, input.zone);
      const result = await client.query(
        `INSERT INTO analytics_rules (
           id, tenant_id, camera_id, zone_id, model_id, name, detection_type,
           enabled, schedule, object_classes, min_confidence,
           min_duration_seconds, direction, severity, cooldown_seconds,
           recipients, escalate_after_seconds, recording_policy,
           pre_roll_seconds, post_roll_seconds, created_by
         )
         SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
                $16,$17,$18,$19,$20,$21
         FROM cameras camera
         JOIN resource_nodes node ON node.id=camera.resource_node_id
         JOIN users actor ON actor.id=$21 AND actor.tenant_id=$2
         WHERE camera.id=$3 AND node.tenant_id=$2
         RETURNING id`,
        [
          randomUUID(), tenantId, cameraId, zoneId, input.modelId ?? null,
          input.name, input.detectionType, input.enabled,
          input.schedule ? JSON.stringify(input.schedule) : null,
          JSON.stringify(input.objectClasses), input.minConfidence,
          input.minDurationSeconds, input.direction, input.severity,
          input.cooldownSeconds, JSON.stringify(input.recipients),
          input.escalateAfterSeconds ?? null, input.recordingPolicy,
          input.preRollSeconds, input.postRollSeconds, createdBy,
        ],
      );
      if (!result.rows[0]) throw new Error("camera_not_found");
      const created = await selectRule(client, result.rows[0].id);
      await client.query("COMMIT");
      return created!;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateRule(
    id: string,
    tenantId: string,
    cameraId: string,
    input: Partial<AnalyticsRuleInput>,
  ): Promise<AnalyticsRule | undefined> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await selectRule(client, id, tenantId, cameraId, true);
      if (!current) {
        await client.query("ROLLBACK");
        return undefined;
      }
      const next = { ...current, ...input };
      let zoneId = current.zone?.id ?? null;
      if (input.zone) {
        if (current.zone) {
          await client.query(
            `UPDATE analytics_zones SET name=$2, shape=$3, points=$4, updated_at=now()
             WHERE id=$1 AND tenant_id=$5 AND camera_id=$6`,
            [current.zone.id, input.zone.name, input.zone.shape,
              JSON.stringify(input.zone.points), tenantId, cameraId],
          );
        } else {
          zoneId = await replaceZone(client, tenantId, cameraId, input.zone);
        }
      }
      await client.query(
        `UPDATE analytics_rules SET
           zone_id=$4, model_id=$5, name=$6, detection_type=$7, enabled=$8,
           schedule=$9, object_classes=$10, min_confidence=$11,
           min_duration_seconds=$12, direction=$13, severity=$14,
           cooldown_seconds=$15, recipients=$16, escalate_after_seconds=$17,
           recording_policy=$18, pre_roll_seconds=$19, post_roll_seconds=$20,
           updated_at=now()
         WHERE id=$1 AND tenant_id=$2 AND camera_id=$3`,
        [
          id, tenantId, cameraId, zoneId, next.modelId ?? null, next.name,
          next.detectionType, next.enabled,
          next.schedule ? JSON.stringify(next.schedule) : null,
          JSON.stringify(next.objectClasses), next.minConfidence,
          next.minDurationSeconds, next.direction, next.severity,
          next.cooldownSeconds, JSON.stringify(next.recipients),
          next.escalateAfterSeconds ?? null, next.recordingPolicy,
          next.preRollSeconds, next.postRollSeconds,
        ],
      );
      const updated = await selectRule(client, id);
      await client.query("COMMIT");
      return updated;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteRule(id: string, tenantId: string, cameraId: string) {
    const result = await this.pool.query(
      `DELETE FROM analytics_rules
       WHERE id=$1 AND tenant_id=$2 AND camera_id=$3 RETURNING zone_id`,
      [id, tenantId, cameraId],
    );
    if (!result.rows[0]) return false;
    if (result.rows[0].zone_id) {
      await this.pool.query("DELETE FROM analytics_zones WHERE id=$1", [result.rows[0].zone_id]);
    }
    return true;
  }

  async processEvent(input: AnalyticsEventInput): Promise<AnalyticsIngestResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const camera = await client.query(
        `SELECT camera.id FROM cameras camera
         JOIN resource_nodes node ON node.id=camera.resource_node_id
         WHERE camera.id=$1 AND node.tenant_id=$2`,
        [input.cameraId, input.tenantId],
      );
      if (!camera.rows[0]) throw new Error("camera_not_found");
      const duplicate = await client.query(
        "SELECT * FROM analytics_events WHERE tenant_id=$1 AND source_event_id=$2",
        [input.tenantId, input.sourceEventId],
      );
      if (duplicate.rows[0]) {
        const alerts = await client.query(
          "SELECT * FROM analytics_alerts WHERE event_id=$1 ORDER BY created_at",
          [duplicate.rows[0].id],
        );
        const rules = await rulesByIds(client, alerts.rows.map((row) => row.rule_id));
        await client.query("COMMIT");
        return {
          event: { ...mapEvent(duplicate.rows[0], []), status: "duplicate" },
          alerts: alerts.rows.map(mapAlert), rules,
        };
      }
      const candidates = await client.query(
        `${ruleSelection}
         WHERE rule.camera_id=$1 AND rule.tenant_id=$2
           AND rule.enabled AND rule.detection_type=$3`,
        [input.cameraId, input.tenantId, input.detectionType],
      );
      const rules = sortedMatchingRules(candidates.rows.map(mapRule), input);
      const eventId = randomUUID();
      await client.query(
        `INSERT INTO analytics_events (
           id, tenant_id, camera_id, source_event_id, primary_rule_id,
           detection_type, occurred_at, ended_at, confidence, duration_seconds,
           model_version, snapshot_reference, clip_reference, metadata, status,
           rejection_reason
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          eventId, input.tenantId, input.cameraId, input.sourceEventId,
          rules[0]?.id ?? null, input.detectionType, input.occurredAt,
          input.endedAt ?? null, input.confidence, input.durationSeconds,
          input.modelVersion, input.snapshotReference ?? null,
          input.clipReference ?? null, JSON.stringify(input.metadata ?? {}),
          rules.length ? "accepted" : "unmatched",
          rules.length ? null : "no_matching_rule",
        ],
      );
      for (const object of input.objects) {
        await client.query(
          `INSERT INTO detected_objects (
             id, event_id, label, confidence, track_id, bounding_box
           ) VALUES ($1,$2,$3,$4,$5,$6)`,
          [randomUUID(), eventId, object.label, object.confidence,
            object.trackId ?? null,
            object.boundingBox ? JSON.stringify(object.boundingBox) : null],
        );
      }

      const alerts: AnalyticsAlert[] = [];
      let created = 0;
      for (const rule of rules) {
        const recent = await client.query(
          `SELECT * FROM analytics_alerts
           WHERE rule_id=$1 AND camera_id=$2
             AND status NOT IN ('resolved', 'false_alarm', 'suppressed')
             AND last_detected_at <= $3::timestamptz
             AND last_detected_at >= $3::timestamptz - ($4::double precision * interval '1 second')
           ORDER BY last_detected_at DESC LIMIT 1 FOR UPDATE`,
          [rule.id, input.cameraId, input.occurredAt, rule.cooldownSeconds],
        );
        if (recent.rows[0]) {
          const updated = await client.query(
            `UPDATE analytics_alerts SET last_detected_at=$2,
               occurrence_count=occurrence_count+1,
               confidence=GREATEST(confidence,$3), updated_at=now()
             WHERE id=$1 RETURNING *`,
            [recent.rows[0].id, input.occurredAt, input.confidence],
          );
          alerts.push(mapAlert(updated.rows[0]));
          continue;
        }
        const alertId = randomUUID();
        const inserted = await client.query(
          `INSERT INTO analytics_alerts (
             id, tenant_id, camera_id, rule_id, event_id, title, description,
             severity, confidence, object_classes, model_version,
             snapshot_reference, clip_reference, first_detected_at,
             last_detected_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)
           RETURNING *`,
          [
            alertId, input.tenantId, input.cameraId, rule.id, eventId,
            analyticsAlertTitle(rule), `Rule \"${rule.name}\" matched.`,
            rule.severity, input.confidence,
            JSON.stringify([...new Set(input.objects.map((object) => object.label))]),
            input.modelVersion, input.snapshotReference ?? null,
            input.clipReference ?? null, input.occurredAt,
          ],
        );
        alerts.push(mapAlert(inserted.rows[0]));
        created += 1;
        for (const recipient of rule.recipients) {
          await client.query(
            `INSERT INTO analytics_notifications (
               id, tenant_id, alert_id, recipient
             ) VALUES ($1,$2,$3,$4)`,
            [randomUUID(), input.tenantId, alertId, recipient],
          );
        }
      }
      if (rules.length > 0 && created === 0) {
        await client.query(
          "UPDATE analytics_events SET status='suppressed' WHERE id=$1",
          [eventId],
        );
      }
      const event = await client.query("SELECT * FROM analytics_events WHERE id=$1", [eventId]);
      await client.query("COMMIT");
      return { event: mapEvent(event.rows[0], input.objects), alerts, rules };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listAlerts(tenantId: string, filters: AnalyticsAlertFilters): Promise<AnalyticsAlert[]> {
    const result = await this.pool.query(
      `SELECT alert.* FROM analytics_alerts alert
       JOIN cameras camera ON camera.id=alert.camera_id
       WHERE alert.tenant_id=$1
         AND ($2::uuid IS NULL OR alert.camera_id=$2)
         AND ($3::uuid IS NULL OR camera.branch_node_id=$3)
         AND ($4::text IS NULL OR alert.status=$4)
         AND ($5::text IS NULL OR alert.severity=$5)
         AND ($6::timestamptz IS NULL OR alert.last_detected_at >= $6)
         AND ($7::timestamptz IS NULL OR alert.first_detected_at <= $7)
       ORDER BY alert.last_detected_at DESC LIMIT $8`,
      [tenantId, filters.cameraId ?? null, filters.branchId ?? null,
        filters.status ?? null, filters.severity ?? null, filters.from ?? null,
        filters.to ?? null, filters.limit],
    );
    return result.rows.map(mapAlert);
  }

  async getAlert(id: string, tenantId: string): Promise<AnalyticsAlert | undefined> {
    const result = await this.pool.query(
      "SELECT * FROM analytics_alerts WHERE id=$1 AND tenant_id=$2",
      [id, tenantId],
    );
    return result.rows[0] ? mapAlert(result.rows[0]) : undefined;
  }

  async transitionAlert(
    id: string,
    tenantId: string,
    input: AnalyticsAlertTransitionInput,
  ): Promise<AnalyticsAlert | undefined> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        "SELECT * FROM analytics_alerts WHERE id=$1 AND tenant_id=$2 FOR UPDATE",
        [id, tenantId],
      );
      if (!current.rows[0]) {
        await client.query("ROLLBACK");
        return undefined;
      }
      if (isTerminalAlertStatus(current.rows[0].status) &&
          current.rows[0].status !== input.status) {
        throw new Error("invalid_alert_transition");
      }
      const updated = await client.query(
        `UPDATE analytics_alerts SET status=$3,
           acknowledged_by=CASE WHEN $3='acknowledged' THEN $4 ELSE acknowledged_by END,
           acknowledged_at=CASE WHEN $3='acknowledged' THEN now() ELSE acknowledged_at END,
           false_alarm_reason=CASE WHEN $3='false_alarm' THEN $5 ELSE false_alarm_reason END,
           resolved_at=CASE WHEN $3='resolved' THEN now() ELSE resolved_at END,
           updated_at=now()
         WHERE id=$1 AND tenant_id=$2 RETURNING *`,
        [id, tenantId, input.status, input.actorUserId,
          input.falseAlarmReason ?? null],
      );
      if (input.status === "acknowledged") {
        await client.query(
          `INSERT INTO analytics_acknowledgements
             (id, tenant_id, alert_id, user_id, notes)
           VALUES ($1,$2,$3,$4,$5)`,
          [randomUUID(), tenantId, id, input.actorUserId, input.notes ?? null],
        );
      }
      if (input.status === "escalated") {
        await client.query(
          `INSERT INTO analytics_escalations
             (id, tenant_id, alert_id, escalated_by, recipients, notes)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [randomUUID(), tenantId, id, input.actorUserId,
            JSON.stringify(input.recipients ?? []), input.notes ?? null],
        );
      }
      await client.query("COMMIT");
      return mapAlert(updated.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async linkIncident(id: string, tenantId: string, incidentId: string) {
    const result = await this.pool.query(
      `UPDATE analytics_alerts SET incident_id=$3, updated_at=now()
       WHERE id=$1 AND tenant_id=$2 RETURNING *`,
      [id, tenantId, incidentId],
    );
    return result.rows[0] ? mapAlert(result.rows[0]) : undefined;
  }
}

async function replaceZone(
  client: PoolClient,
  tenantId: string,
  cameraId: string,
  zone: AnalyticsRuleInput["zone"],
) {
  if (!zone) return null;
  const id = zone.id || randomUUID();
  await client.query(
    `INSERT INTO analytics_zones (id, tenant_id, camera_id, name, shape, points)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, tenantId, cameraId, zone.name, zone.shape, JSON.stringify(zone.points)],
  );
  return id;
}

async function selectRule(
  client: PoolClient,
  id: string,
  tenantId?: string,
  cameraId?: string,
  lock = false,
) {
  const result = await client.query(
    `${ruleSelection} WHERE rule.id=$1
       AND ($2::uuid IS NULL OR rule.tenant_id=$2)
       AND ($3::uuid IS NULL OR rule.camera_id=$3)${lock ? " FOR UPDATE OF rule" : ""}`,
    [id, tenantId ?? null, cameraId ?? null],
  );
  return result.rows[0] ? mapRule(result.rows[0]) : undefined;
}

async function rulesByIds(client: PoolClient, ids: string[]) {
  if (ids.length === 0) return [];
  const result = await client.query(
    `${ruleSelection} WHERE rule.id=ANY($1::uuid[])`,
    [ids],
  );
  return result.rows.map(mapRule);
}

function mapRule(row: any): AnalyticsRule {
  return {
    id: row.id, tenantId: row.tenant_id, cameraId: row.camera_id,
    name: row.name, detectionType: row.detection_type, enabled: row.enabled,
    ...(row.zone_join_id ? { zone: {
      id: row.zone_join_id, name: row.zone_name, shape: row.zone_shape,
      points: json(row.zone_points, []),
    } } : {}),
    ...(row.schedule ? { schedule: json(row.schedule, undefined) } : {}),
    objectClasses: json(row.object_classes, []),
    minConfidence: Number(row.min_confidence),
    minDurationSeconds: Number(row.min_duration_seconds),
    direction: row.direction, severity: row.severity,
    cooldownSeconds: row.cooldown_seconds,
    recipients: json(row.recipients, []),
    ...(row.escalate_after_seconds != null
      ? { escalateAfterSeconds: row.escalate_after_seconds } : {}),
    recordingPolicy: row.recording_policy,
    preRollSeconds: row.pre_roll_seconds, postRollSeconds: row.post_roll_seconds,
    ...(row.model_id ? { modelId: row.model_id } : {}),
    createdBy: row.created_by,
    createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
  };
}

function mapEvent(row: any, objects: AnalyticsEvent["objects"]): AnalyticsEvent {
  return {
    id: row.id, tenantId: row.tenant_id, cameraId: row.camera_id,
    sourceEventId: row.source_event_id,
    ...(row.primary_rule_id ? { ruleId: row.primary_rule_id } : {}),
    detectionType: row.detection_type, occurredAt: iso(row.occurred_at),
    ...(row.ended_at ? { endedAt: iso(row.ended_at) } : {}),
    confidence: Number(row.confidence), durationSeconds: Number(row.duration_seconds),
    modelVersion: row.model_version, objects,
    ...(row.snapshot_reference ? { snapshotReference: row.snapshot_reference } : {}),
    ...(row.clip_reference ? { clipReference: row.clip_reference } : {}),
    metadata: json(row.metadata, {}), status: row.status,
    ...(row.rejection_reason ? { rejectionReason: row.rejection_reason } : {}),
    createdAt: iso(row.created_at),
  };
}

function mapAlert(row: any): AnalyticsAlert {
  return {
    id: row.id, tenantId: row.tenant_id, cameraId: row.camera_id,
    ruleId: row.rule_id, eventId: row.event_id, title: row.title,
    ...(row.description ? { description: row.description } : {}),
    severity: row.severity, status: row.status,
    confidence: Number(row.confidence),
    objectClasses: json(row.object_classes, []), modelVersion: row.model_version,
    ...(row.snapshot_reference ? { snapshotReference: row.snapshot_reference } : {}),
    ...(row.clip_reference ? { clipReference: row.clip_reference } : {}),
    firstDetectedAt: iso(row.first_detected_at),
    lastDetectedAt: iso(row.last_detected_at),
    occurrenceCount: row.occurrence_count,
    ...(row.incident_id ? { incidentId: row.incident_id } : {}),
    ...(row.acknowledged_by ? { acknowledgedBy: row.acknowledged_by } : {}),
    ...(row.acknowledged_at ? { acknowledgedAt: iso(row.acknowledged_at) } : {}),
    ...(row.false_alarm_reason ? { falseAlarmReason: row.false_alarm_reason } : {}),
    ...(row.resolved_at ? { resolvedAt: iso(row.resolved_at) } : {}),
    createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
  };
}

function json<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

function iso(value: string | Date) {
  return new Date(value).toISOString();
}
