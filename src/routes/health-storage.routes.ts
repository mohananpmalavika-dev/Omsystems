/**
 * Storage Telemetry Health Check Routes
 * 
 * Provides health check endpoints to monitor storage visibility
 * in the Predictive Operations dashboard.
 */

import type { FastifyInstance } from 'fastify';
import type { ControlPlaneStore } from '../control-plane-store.js';

interface StorageHealthStatus {
  healthy: boolean;
  totalRecords: number;
  lastTelemetryAt: string | null;
  hoursOld: number | null;
  branchesWithData: number;
  uniqueDevices: number;
  issues: string[];
  timestamp: string;
}

const MAX_AGE_HOURS = 24;
const MIN_RECORDS_REQUIRED = 1;

export async function registerStorageTelemetryHealthRoutes(app: FastifyInstance, store: ControlPlaneStore) {
  /**
   * GET /v1/health/storage-telemetry
   * 
   * Returns the health status of storage telemetry collection.
   * Used for monitoring and alerting.
   */
  app.get('/v1/health/storage-telemetry', async (request, reply) => {
    const db = (store as any).db || store;
    
    if (!db.query) {
      return reply.code(503).send({
        error: 'database_unavailable',
        message: 'Cannot check storage health without database access',
      });
    }
    
    try {
      const result = await db.query(
        `SELECT 
          COUNT(*)::int as total_records,
          MAX(created_at) as last_telemetry_at,
          COUNT(DISTINCT branch_id)::int as branches_with_data,
          COUNT(DISTINCT device_id)::int as unique_devices
        FROM operational_telemetry
        WHERE device_type = 'disk'
          AND created_at > NOW() - INTERVAL '7 days'`,
        []
      );
      
      const row = result.rows[0];
      const totalRecords: number = row?.total_records || 0;
      const lastTelemetryAt: Date | null = row?.last_telemetry_at ? new Date(row.last_telemetry_at) : null;
      const hoursOld: number | null = lastTelemetryAt 
        ? (Date.now() - lastTelemetryAt.getTime()) / (1000 * 60 * 60) 
        : null;
      const branchesWithData: number = row?.branches_with_data || 0;
      const uniqueDevices: number = row?.unique_devices || 0;
      
      const issues: string[] = [];
      
      if (totalRecords === 0) {
        issues.push('No storage telemetry data found in database');
      } else if (hoursOld !== null && hoursOld > MAX_AGE_HOURS) {
        issues.push(`Storage data is stale (${hoursOld.toFixed(1)} hours old, threshold: ${MAX_AGE_HOURS}h)`);
      }
      
      if (branchesWithData === 0 && totalRecords > 0) {
        issues.push('Storage data exists but no branches have valid records');
      }
      
      const healthy = totalRecords >= MIN_RECORDS_REQUIRED && (hoursOld === null || hoursOld <= MAX_AGE_HOURS);
      
      const status: StorageHealthStatus = {
        healthy,
        totalRecords,
        lastTelemetryAt: lastTelemetryAt?.toISOString() || null,
        hoursOld: hoursOld !== null ? Math.round(hoursOld * 10) / 10 : null,
        branchesWithData,
        uniqueDevices,
        issues,
        timestamp: new Date().toISOString(),
      };
      
      // Return 200 if healthy, 503 if unhealthy
      return reply.code(healthy ? 200 : 503).send(status);
      
    } catch (error) {
      return reply.code(500).send({
        error: 'health_check_failed',
        message: error instanceof Error ? error.message : 'Unknown error checking storage health',
      });
    }
  });

  /**
   * GET /v1/health/storage-telemetry/summary
   * 
   * Returns a summary of storage telemetry by branch.
   * Useful for debugging which branches have missing data.
   */
  app.get('/v1/health/storage-telemetry/summary', async (request, reply) => {
    const db = (store as any).db || store;
    
    if (!db.query) {
      return reply.code(503).send({
        error: 'database_unavailable',
        message: 'Cannot retrieve storage summary without database access',
      });
    }
    
    try {
      const branchSummary = await db.query(
        `SELECT 
          rn.id as branch_id,
          rn.name as branch_name,
          COUNT(DISTINCT ot.device_id)::int as device_count,
          MAX(ot.created_at) as last_telemetry_at,
          COUNT(ot.id)::int as total_records
        FROM resource_nodes rn
        LEFT JOIN operational_telemetry ot 
          ON ot.branch_id = rn.id 
          AND ot.device_type = 'disk'
          AND ot.created_at > NOW() - INTERVAL '7 days'
        WHERE rn.node_type = 'branch'
          AND rn.is_active = true
        GROUP BY rn.id, rn.name
        ORDER BY device_count DESC, last_telemetry_at DESC NULLS LAST`,
        []
      );
      
      const branches = branchSummary.rows.map(row => ({
        branchId: row.branch_id,
        branchName: row.branch_name,
        deviceCount: row.device_count || 0,
        lastTelemetryAt: row.last_telemetry_at || null,
        totalRecords: row.total_records || 0,
        hasData: (row.device_count || 0) > 0,
      }));
      
      const branchesWithData = branches.filter(b => b.hasData).length;
      const branchesWithoutData = branches.filter(b => !b.hasData).length;
      
      return {
        summary: {
          totalBranches: branches.length,
          branchesWithData,
          branchesWithoutData,
          healthPercentage: branches.length > 0 
            ? Math.round((branchesWithData / branches.length) * 100)
            : 0,
        },
        branches,
        timestamp: new Date().toISOString(),
      };
      
    } catch (error) {
      return reply.code(500).send({
        error: 'summary_failed',
        message: error instanceof Error ? error.message : 'Unknown error retrieving storage summary',
      });
    }
  });

  /**
   * POST /v1/health/storage-telemetry/refresh
   * 
   * Triggers a refresh of storage telemetry collection.
   * This can be called manually or by monitoring systems.
   * 
   * NOTE: This is a placeholder endpoint. In production, this would
   * trigger actual storage collection from NVRs/edge agents.
   */
  app.post('/v1/health/storage-telemetry/refresh', async (request, reply) => {
    // This is a stub - in production, this would trigger:
    // 1. Edge agent storage collection
    // 2. NVR storage polling
    // 3. Cache refresh
    
    return {
      message: 'Storage telemetry refresh triggered',
      note: 'In production, this would trigger edge agents to re-collect storage data',
      nextSteps: [
        'Wait 1-2 minutes for collection to complete',
        'Check /v1/health/storage-telemetry for updated status',
        'Refresh the Predictive Operations dashboard',
      ],
      timestamp: new Date().toISOString(),
    };
  });
}
