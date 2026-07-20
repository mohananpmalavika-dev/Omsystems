import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type {
  LiveBookmark,
  LiveIncident,
  LiveIncidentStatus,
} from "../domain/models.js";
import type { ControlPlaneStore } from "../control-plane-store.js";

type BookmarkInput = Parameters<ControlPlaneStore["createLiveBookmark"]>[0];
type IncidentInput = Parameters<ControlPlaneStore["createLiveIncident"]>[0];

export class LiveOperationsRepository {
  constructor(private readonly pool: Pool) {}

  async listBookmarks(cameraId: string, limit: number): Promise<LiveBookmark[]> {
    const result = await this.pool.query(
      `SELECT * FROM live_bookmarks
       WHERE camera_id=$1 ORDER BY bookmarked_at DESC LIMIT $2`,
      [cameraId, limit],
    );
    return result.rows.map(mapBookmark);
  }

  async createBookmark(input: BookmarkInput): Promise<LiveBookmark> {
    const result = await this.pool.query(
      `INSERT INTO live_bookmarks (
         id, tenant_id, camera_id, operator_id, bookmarked_at, reason, notes,
         priority, recording_segment_id, snapshot_reference
       )
       SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
       FROM cameras camera
       JOIN resource_nodes node ON node.id=camera.resource_node_id
       WHERE camera.id=$3 AND node.tenant_id=$2
         AND ($9::uuid IS NULL OR EXISTS (
           SELECT 1 FROM recording_segments segment
           WHERE segment.id=$9 AND segment.camera_id=$3
         ))
       RETURNING *`,
      [
        randomUUID(), input.tenantId, input.cameraId, input.operatorId,
        input.bookmarkedAt, input.reason, input.notes ?? null, input.priority,
        input.recordingSegmentId ?? null, input.snapshotReference ?? null,
      ],
    );
    if (!result.rows[0]) throw new Error("camera_not_found");
    return mapBookmark(result.rows[0]);
  }

  async listIncidents(cameraId: string, limit: number): Promise<LiveIncident[]> {
    const result = await this.pool.query(
      `SELECT * FROM live_incidents
       WHERE camera_id=$1 ORDER BY occurred_at DESC LIMIT $2`,
      [cameraId, limit],
    );
    return result.rows.map(mapIncident);
  }

  async createIncident(input: IncidentInput): Promise<LiveIncident> {
    const client = await this.pool.connect();
    const incidentId = randomUUID();
    const bookmarkId = randomUUID();
    const legalHoldId = randomUUID();
    const occurredAt = new Date(input.occurredAt);
    const recordingFrom = new Date(
      occurredAt.getTime() - input.preRollSeconds * 1000,
    );
    const recordingTo = new Date(
      occurredAt.getTime() + input.postRollSeconds * 1000,
    );
    try {
      await client.query("BEGIN");
      const incident = await client.query(
        `INSERT INTO live_incidents (
           id, tenant_id, camera_id, created_by, title, notes, priority,
           occurred_at, recording_from, recording_to, pre_roll_seconds,
           post_roll_seconds
         )
         SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
         FROM cameras camera
         JOIN resource_nodes node ON node.id=camera.resource_node_id
         WHERE camera.id=$3 AND node.tenant_id=$2
         RETURNING *`,
        [
          incidentId, input.tenantId, input.cameraId, input.createdBy,
          input.title, input.notes ?? null, input.priority,
          occurredAt.toISOString(), recordingFrom.toISOString(),
          recordingTo.toISOString(), input.preRollSeconds,
          input.postRollSeconds,
        ],
      );
      if (!incident.rows[0]) throw new Error("camera_not_found");

      await client.query(
        `INSERT INTO recording_legal_holds (
           id, tenant_id, camera_id, from_at, to_at, reason, created_by,
           incident_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          legalHoldId, input.tenantId, input.cameraId,
          recordingFrom.toISOString(), recordingTo.toISOString(),
          `Live incident ${input.priority}: ${input.title}`, input.createdBy,
          incidentId,
        ],
      );

      await client.query(
        `INSERT INTO live_bookmarks (
           id, tenant_id, camera_id, operator_id, bookmarked_at, reason,
           notes, priority, incident_id
         ) VALUES ($1,$2,$3,$4,$5,'suspicious-activity',$6,$7,$8)`,
        [
          bookmarkId, input.tenantId, input.cameraId, input.createdBy,
          occurredAt.toISOString(), input.notes ?? null,
          bookmarkPriority(input.priority), incidentId,
        ],
      );

      const completed = await client.query(
        `UPDATE live_incidents
         SET primary_bookmark_id=$2, legal_hold_id=$3, updated_at=now()
         WHERE id=$1 RETURNING *`,
        [incidentId, bookmarkId, legalHoldId],
      );
      await client.query("COMMIT");
      return mapIncident(completed.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateIncidentStatus(
    id: string,
    tenantId: string,
    cameraId: string,
    status: LiveIncidentStatus,
  ): Promise<LiveIncident | undefined> {
    const result = await this.pool.query(
      `UPDATE live_incidents SET status=$4, updated_at=now()
       WHERE id=$1 AND tenant_id=$2 AND camera_id=$3 RETURNING *`,
      [id, tenantId, cameraId, status],
    );
    return result.rows[0] ? mapIncident(result.rows[0]) : undefined;
  }
}

function bookmarkPriority(priority: IncidentInput["priority"]) {
  if (priority === "P1") return "critical";
  if (priority === "P2") return "high";
  if (priority === "P3") return "medium";
  return "low";
}

function mapBookmark(row: any): LiveBookmark {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    cameraId: row.camera_id,
    operatorId: row.operator_id,
    bookmarkedAt: new Date(row.bookmarked_at).toISOString(),
    reason: row.reason,
    notes: row.notes ?? undefined,
    priority: row.priority,
    incidentId: row.incident_id ?? undefined,
    recordingSegmentId: row.recording_segment_id ?? undefined,
    snapshotReference: row.snapshot_reference ?? undefined,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function mapIncident(row: any): LiveIncident {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    cameraId: row.camera_id,
    createdBy: row.created_by,
    title: row.title,
    notes: row.notes ?? undefined,
    priority: row.priority,
    status: row.status,
    occurredAt: new Date(row.occurred_at).toISOString(),
    recordingFrom: new Date(row.recording_from).toISOString(),
    recordingTo: new Date(row.recording_to).toISOString(),
    preRollSeconds: row.pre_roll_seconds,
    postRollSeconds: row.post_roll_seconds,
    bookmarkId: row.primary_bookmark_id,
    legalHoldId: row.legal_hold_id,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
