/**
 * Analytics Metrics API Routes
 * Provides footfall, dwell time, queue metrics, heat maps, and reporting
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";

const cameraParams = z.object({ id: z.string().min(1) });
const branchParams = z.object({ branchId: z.string().min(1) });
const metricsQuery = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  interval: z.enum(["hour", "day", "week", "month"]).default("hour"),
  cameraIds: z.string().optional(), // Comma-separated camera IDs
});
const heatmapQuery = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  gridSize: z.coerce.number().int().min(8).max(64).default(16),
});

export async function registerAnalyticsMetricsRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
) {
  /**
   * Get footfall metrics for a camera
   */
  app.get("/v1/cameras/:id/analytics/footfall", async (request, reply) => {
    const { id } = cameraParams.parse(request.params);
    const query = metricsQuery.parse(request.query);

    // Check camera access
    const camera = await store.getCamera(id);
    if (!camera) {
      return reply.code(404).send({ error: "camera_not_found" });
    }

    const decision = await store.checkCameraAccess(
      request.currentUser.id,
      id,
      "analytics:view",
    );
    if (!decision?.allowed) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const metrics = await store.pool.query(
      `SELECT
         bucket_at,
         entries,
         exits,
         (entries + exits) as total_crossings
       FROM analytics_footfall_metrics
       WHERE camera_id = $1
         AND bucket_at >= $2::timestamptz
         AND bucket_at < $3::timestamptz
       ORDER BY bucket_at ASC`,
      [id, query.from, query.to],
    );

    const summary = {
      totalEntries: metrics.rows.reduce((sum, row) => sum + row.entries, 0),
      totalExits: metrics.rows.reduce((sum, row) => sum + row.exits, 0),
      netOccupancy: 0,
      peakHour: null as any,
    };
    summary.netOccupancy = summary.totalEntries - summary.totalExits;

    if (metrics.rows.length > 0) {
      const peak = metrics.rows.reduce((max, row) =>
        row.total_crossings > max.total_crossings ? row : max,
      );
      summary.peakHour = peak.bucket_at;
    }

    return { data: metrics.rows, summary };
  });

  /**
   * Get dwell time metrics for a camera/zone
   */
  app.get("/v1/cameras/:id/analytics/dwell-time", async (request, reply) => {
    const { id } = cameraParams.parse(request.params);
    const query = metricsQuery.parse(request.query);

    const camera = await store.getCamera(id);
    if (!camera) {
      return reply.code(404).send({ error: "camera_not_found" });
    }

    const decision = await store.checkCameraAccess(
      request.currentUser.id,
      id,
      "analytics:view",
    );
    if (!decision?.allowed) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const metrics = await store.pool.query(
      `SELECT
         m.bucket_at,
         m.average_seconds,
         m.maximum_seconds,
         m.sample_count,
         z.name as zone_name
       FROM analytics_dwell_metrics m
       LEFT JOIN analytics_zones z ON z.id = m.zone_id
       WHERE m.camera_id = $1
         AND m.bucket_at >= $2::timestamptz
         AND m.bucket_at < $3::timestamptz
       ORDER BY m.bucket_at ASC`,
      [id, query.from, query.to],
    );

    const summary = {
      averageDwellTime: 0,
      maximumDwellTime: 0,
      totalSamples: 0,
    };

    if (metrics.rows.length > 0) {
      const totalSeconds = metrics.rows.reduce(
        (sum, row) => sum + Number(row.average_seconds) * row.sample_count,
        0,
      );
      summary.totalSamples = metrics.rows.reduce(
        (sum, row) => sum + row.sample_count,
        0,
      );
      summary.averageDwellTime =
        summary.totalSamples > 0 ? totalSeconds / summary.totalSamples : 0;
      summary.maximumDwellTime = Math.max(
        ...metrics.rows.map((row) => Number(row.maximum_seconds)),
      );
    }

    return { data: metrics.rows, summary };
  });

  /**
   * Get queue metrics for a camera/zone
   */
  app.get("/v1/cameras/:id/analytics/queue", async (request, reply) => {
    const { id } = cameraParams.parse(request.params);
    const query = metricsQuery.parse(request.query);

    const camera = await store.getCamera(id);
    if (!camera) {
      return reply.code(404).send({ error: "camera_not_found" });
    }

    const decision = await store.checkCameraAccess(
      request.currentUser.id,
      id,
      "analytics:view",
    );
    if (!decision?.allowed) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const metrics = await store.pool.query(
      `SELECT
         m.bucket_at,
         m.average_count,
         m.maximum_count,
         z.name as zone_name
       FROM analytics_queue_metrics m
       LEFT JOIN analytics_zones z ON z.id = m.zone_id
       WHERE m.camera_id = $1
         AND m.bucket_at >= $2::timestamptz
         AND m.bucket_at < $3::timestamptz
       ORDER BY m.bucket_at ASC`,
      [id, query.from, query.to],
    );

    const summary = {
      averageQueueLength: 0,
      maximumQueueLength: 0,
      totalMeasurements: metrics.rows.length,
    };

    if (metrics.rows.length > 0) {
      summary.averageQueueLength =
        metrics.rows.reduce(
          (sum, row) => sum + Number(row.average_count),
          0,
        ) / metrics.rows.length;
      summary.maximumQueueLength = Math.max(
        ...metrics.rows.map((row) => row.maximum_count),
      );
    }

    return { data: metrics.rows, summary };
  });

  /**
   * Get heat map data for a camera
   */
  app.get("/v1/cameras/:id/analytics/heatmap", async (request, reply) => {
    const { id } = cameraParams.parse(request.params);
    const query = heatmapQuery.parse(request.query);

    const camera = await store.getCamera(id);
    if (!camera) {
      return reply.code(404).send({ error: "camera_not_found" });
    }

    const decision = await store.checkCameraAccess(
      request.currentUser.id,
      id,
      "analytics:view",
    );
    if (!decision?.allowed) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const metrics = await store.pool.query(
      `SELECT
         bucket_at,
         grid_width,
         grid_height,
         values
       FROM analytics_heatmap_metrics
       WHERE camera_id = $1
         AND bucket_at >= $2::timestamptz
         AND bucket_at < $3::timestamptz
       ORDER BY bucket_at DESC
       LIMIT 1`,
      [id, query.from, query.to],
    );

    if (metrics.rows.length === 0) {
      return {
        data: null,
        message: "No heat map data available for the specified time range",
      };
    }

    return { data: metrics.rows[0] };
  });

  /**
   * Get analytics summary for a branch
   */
  app.get(
    "/v1/branches/:branchId/analytics/summary",
    async (request, reply) => {
      const { branchId } = branchParams.parse(request.params);
      const query = z
        .object({
          from: z.string().datetime(),
          to: z.string().datetime(),
        })
        .parse(request.query);

      const decision = await store.checkAccess(
        request.currentUser,
        "analytics:view",
        branchId,
      );
      if (!decision?.allowed) {
        return reply.code(403).send({ error: "forbidden" });
      }

      // Get all cameras for the branch
      const cameras = await store.pool.query(
        `SELECT id FROM cameras WHERE branch_node_id = $1`,
        [branchId],
      );
      const cameraIds = cameras.rows.map((row) => row.id);

      if (cameraIds.length === 0) {
        return {
          totalAlerts: 0,
          criticalAlerts: 0,
          resolvedAlerts: 0,
          totalFootfall: 0,
          averageDwellTime: 0,
          activeRules: 0,
        };
      }

      // Get alert statistics
      const alerts = await store.pool.query(
        `SELECT
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE severity IN ('P1', 'P2')) as critical,
           COUNT(*) FILTER (WHERE status IN ('resolved', 'false_alarm')) as resolved
         FROM analytics_alerts
         WHERE camera_id = ANY($1::uuid[])
           AND first_detected_at >= $2::timestamptz
           AND first_detected_at < $3::timestamptz`,
        [cameraIds, query.from, query.to],
      );

      // Get footfall statistics
      const footfall = await store.pool.query(
        `SELECT SUM(entries + exits) as total
         FROM analytics_footfall_metrics
         WHERE camera_id = ANY($1::uuid[])
           AND bucket_at >= $2::timestamptz
           AND bucket_at < $3::timestamptz`,
        [cameraIds, query.from, query.to],
      );

      // Get dwell time statistics
      const dwellTime = await store.pool.query(
        `SELECT
           SUM(average_seconds * sample_count) as total_seconds,
           SUM(sample_count) as total_samples
         FROM analytics_dwell_metrics
         WHERE camera_id = ANY($1::uuid[])
           AND bucket_at >= $2::timestamptz
           AND bucket_at < $3::timestamptz`,
        [cameraIds, query.from, query.to],
      );

      // Get active rules
      const rules = await store.pool.query(
        `SELECT COUNT(*) as active
         FROM analytics_rules
         WHERE camera_id = ANY($1::uuid[])
           AND enabled = true
           AND archived_at IS NULL`,
        [cameraIds],
      );

      const alertRow = alerts.rows[0];
      const footfallRow = footfall.rows[0];
      const dwellRow = dwellTime.rows[0];
      const rulesRow = rules.rows[0];

      return {
        totalAlerts: Number(alertRow?.total ?? 0),
        criticalAlerts: Number(alertRow?.critical ?? 0),
        resolvedAlerts: Number(alertRow?.resolved ?? 0),
        totalFootfall: Number(footfallRow?.total ?? 0),
        averageDwellTime:
          Number(dwellRow?.total_samples ?? 0) > 0
            ? Number(dwellRow?.total_seconds ?? 0) /
              Number(dwellRow?.total_samples ?? 0)
            : 0,
        activeRules: Number(rulesRow?.active ?? 0),
      };
    },
  );

  /**
   * Get analytics trends (comparing time periods)
   */
  app.get("/v1/analytics/trends", async (request, reply) => {
    const query = z
      .object({
        branchId: z.string().optional(),
        metric: z.enum(["alerts", "footfall", "dwell-time", "queue"]),
        currentFrom: z.string().datetime(),
        currentTo: z.string().datetime(),
        previousFrom: z.string().datetime(),
        previousTo: z.string().datetime(),
      })
      .parse(request.query);

    if (query.branchId) {
      const decision = await store.checkAccess(
        request.currentUser,
        "analytics:view",
        query.branchId,
      );
      if (!decision?.allowed) {
        return reply.code(403).send({ error: "forbidden" });
      }
    }

    // Implementation would calculate trends by comparing current vs previous periods
    // This is a placeholder structure
    return {
      metric: query.metric,
      current: {
        value: 0,
        from: query.currentFrom,
        to: query.currentTo,
      },
      previous: {
        value: 0,
        from: query.previousFrom,
        to: query.previousTo,
      },
      change: {
        absolute: 0,
        percentage: 0,
        direction: "up" as "up" | "down" | "stable",
      },
    };
  });
}
