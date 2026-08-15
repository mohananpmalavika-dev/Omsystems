/**
 * Backend Integration Code for Branch Operational Health System
 * 
 * Add this code to your src/app.ts file after the existing operational health routes.
 * Choose either Option A (if your Fastify supports app.register) or Option B (manual route mounting).
 */

// ============================================================================
// OPTION A: Using Fastify Register (Preferred if supported)
// ============================================================================

// 1. Add this import at the top of src/app.ts with other imports:
import { createOperationalHealthRoutes } from "./operational-health/routes/operational-health.routes.js";

// 2. Add this code where other routes are registered (after registerOperationalHealthRoutes):
const pool = (store as any).pool; // Extract database pool from store
if (pool) {
  const branchHealthRoutes = createOperationalHealthRoutes(pool);
  app.register(async (fastify) => {
    fastify.register(branchHealthRoutes, { prefix: '/v1/operational-health' });
  });
  console.log('✅ Branch operational health dashboard routes registered');
} else {
  console.warn('⚠️  Pool not available - branch health dashboard routes not registered');
}

// ============================================================================
// OPTION B: Manual Route Mounting (Guaranteed to work)
// ============================================================================

// 1. Add this import at the top of src/app.ts:
import { IntegratedOperationalHealthService } from "./operational-health/services/integrated-operational-health.service.js";
import type { BranchHealthFilter } from "./operational-health/types/operational-health.types.js";

// 2. Add this code where other routes are registered:
const pool = (store as any).pool;
if (pool) {
  const healthService = new IntegratedOperationalHealthService(pool);
  
  // Dashboard summary endpoint
  app.get('/v1/operational-health/dashboard', async (request, reply) => {
    try {
      const tenantId = request.currentUser?.tenantId;
      if (!tenantId) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      
      const summary = await healthService.getDashboardSummary(tenantId);
      return { success: true, data: summary };
    } catch (error) {
      app.log.error(error);
      return reply.code(500).send({ 
        success: false, 
        error: 'Failed to retrieve dashboard summary' 
      });
    }
  });
  
  // Branch mosaic endpoint
  app.get('/v1/operational-health/branches', async (request, reply) => {
    try {
      const tenantId = request.currentUser?.tenantId;
      if (!tenantId) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      
      const query = request.query as any;
      const filter: BranchHealthFilter = {};
      
      // Parse filter parameters
      if (query.states) {
        filter.states = Array.isArray(query.states) ? query.states : [query.states];
      }
      if (query.internetStates) {
        filter.internetStates = Array.isArray(query.internetStates) 
          ? query.internetStates 
          : [query.internetStates];
      }
      if (query.retentionViolation === 'true') {
        filter.retentionViolation = true;
      }
      if (query.recordingProblem === 'true') {
        filter.recordingProblem = true;
      }
      if (query.cameraOffline === 'true') {
        filter.cameraOffline = true;
      }
      if (query.search) {
        filter.search = query.search;
      }
      
      const branches = await healthService.getBranchMosaicItems(tenantId, filter);
      return { 
        success: true, 
        data: { 
          branches, 
          total: branches.length,
          filters: filter 
        } 
      };
    } catch (error) {
      app.log.error(error);
      return reply.code(500).send({ 
        success: false, 
        error: 'Failed to retrieve branch health' 
      });
    }
  });
  
  // Single branch health endpoint
  app.get('/v1/operational-health/branches/:branchId', async (request, reply) => {
    try {
      const tenantId = request.currentUser?.tenantId;
      const { branchId } = request.params as { branchId: string };
      
      if (!tenantId) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      
      const health = await healthService.getBranchHealth(tenantId, branchId);
      
      if (!health) {
        return reply.code(404).send({ 
          success: false, 
          error: 'Branch not found' 
        });
      }
      
      return { success: true, data: health };
    } catch (error) {
      app.log.error(error);
      return reply.code(500).send({ 
        success: false, 
        error: 'Failed to retrieve branch health' 
      });
    }
  });
  
  // Refresh single branch endpoint
  app.post('/v1/operational-health/branches/:branchId/refresh', async (request, reply) => {
    try {
      const tenantId = request.currentUser?.tenantId;
      const { branchId } = request.params as { branchId: string };
      
      if (!tenantId) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      
      const health = await healthService.refreshBranchHealth(tenantId, branchId);
      return { 
        success: true, 
        data: health,
        message: 'Branch health refreshed successfully' 
      };
    } catch (error) {
      app.log.error(error);
      return reply.code(500).send({ 
        success: false, 
        error: 'Failed to refresh branch health' 
      });
    }
  });
  
  // Refresh all branches endpoint (admin only)
  app.post('/v1/operational-health/refresh-all', async (request, reply) => {
    try {
      const tenantId = request.currentUser?.tenantId;
      const userRole = request.currentUser?.role;
      
      if (!tenantId) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      
      // Check admin permission
      if (userRole !== 'admin' && userRole !== 'super_admin') {
        return reply.code(403).send({
          success: false,
          error: 'Only administrators can refresh all branches',
        });
      }
      
      // Start refresh in background
      const jobId = `refresh-all-${Date.now()}`;
      
      // Don't await - let it run in background
      healthService.refreshAllBranchesHealth(tenantId)
        .then((result) => {
          app.log.info(`Refresh all completed: ${JSON.stringify(result)}`);
        })
        .catch((error) => {
          app.log.error('Refresh all failed:', error);
        });
      
      return { 
        success: true, 
        message: 'Branch health refresh started',
        jobId 
      };
    } catch (error) {
      app.log.error(error);
      return reply.code(500).send({ 
        success: false, 
        error: 'Failed to start health refresh' 
      });
    }
  });
  
  // Branch health history endpoint
  app.get('/v1/operational-health/branches/:branchId/history', async (request, reply) => {
    try {
      const tenantId = request.currentUser?.tenantId;
      const { branchId } = request.params as { branchId: string };
      const query = request.query as any;
      
      if (!tenantId) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      
      let historyQuery = `
        SELECT *
        FROM branch_operational_health_history
        WHERE tenant_id = $1 AND branch_id = $2
      `;
      const params: any[] = [tenantId, branchId];
      let paramIndex = 3;

      if (query.startDate) {
        historyQuery += ` AND transition_at >= $${paramIndex}`;
        params.push(query.startDate);
        paramIndex++;
      }

      if (query.endDate) {
        historyQuery += ` AND transition_at <= $${paramIndex}`;
        params.push(query.endDate);
        paramIndex++;
      }

      historyQuery += ` ORDER BY transition_at DESC LIMIT $${paramIndex}`;
      params.push(parseInt(query.limit || '100'));

      const result = await pool.query(historyQuery, params);
      
      return {
        success: true,
        data: {
          history: result.rows,
          total: result.rows.length,
        },
      };
    } catch (error) {
      app.log.error(error);
      return reply.code(500).send({ 
        success: false, 
        error: 'Failed to retrieve branch history' 
      });
    }
  });
  
  // Health change events endpoint
  app.get('/v1/operational-health/events', async (request, reply) => {
    try {
      const tenantId = request.currentUser?.tenantId;
      const query = request.query as any;
      
      if (!tenantId) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      
      let eventsQuery = `
        SELECT *
        FROM branch_health_change_events
        WHERE tenant_id = $1
      `;
      const params: any[] = [tenantId];
      let paramIndex = 2;

      if (query.since) {
        eventsQuery += ` AND occurred_at > $${paramIndex}`;
        params.push(query.since);
        paramIndex++;
      }

      eventsQuery += ` ORDER BY occurred_at DESC LIMIT $${paramIndex}`;
      params.push(parseInt(query.limit || '50'));

      const result = await pool.query(eventsQuery, params);
      
      return {
        success: true,
        data: {
          events: result.rows,
          total: result.rows.length,
        },
      };
    } catch (error) {
      app.log.error(error);
      return reply.code(500).send({ 
        success: false, 
        error: 'Failed to retrieve events' 
      });
    }
  });
  
  // Health statistics endpoint
  app.get('/v1/operational-health/stats', async (request, reply) => {
    try {
      const tenantId = request.currentUser?.tenantId;
      
      if (!tenantId) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
      
      const statsQuery = `
        SELECT 
          COUNT(*) as total_branches,
          AVG(health_score) as avg_health_score,
          COUNT(*) FILTER (WHERE overall_state = 'CRITICAL') as critical_branches,
          COUNT(*) FILTER (WHERE retention_state = 'BELOW_POLICY') as retention_violations,
          COUNT(*) FILTER (WHERE telemetry_freshness = 'OFFLINE') as offline_branches,
          SUM(cameras_offline) as total_cameras_offline,
          SUM(cameras_not_recording) as total_recording_failures,
          SUM(alerts_p1_count) as total_p1_alerts
        FROM branch_operational_health_current
        WHERE tenant_id = $1
      `;

      const result = await pool.query(statsQuery, [tenantId]);
      const stats = result.rows[0];

      return {
        success: true,
        data: {
          totalBranches: parseInt(stats.total_branches) || 0,
          avgHealthScore: parseFloat(stats.avg_health_score) || 0,
          criticalBranches: parseInt(stats.critical_branches) || 0,
          retentionViolations: parseInt(stats.retention_violations) || 0,
          offlineBranches: parseInt(stats.offline_branches) || 0,
          totalCamerasOffline: parseInt(stats.total_cameras_offline) || 0,
          totalRecordingFailures: parseInt(stats.total_recording_failures) || 0,
          totalP1Alerts: parseInt(stats.total_p1_alerts) || 0,
        },
      };
    } catch (error) {
      app.log.error(error);
      return reply.code(500).send({ 
        success: false, 
        error: 'Failed to retrieve statistics' 
      });
    }
  });
  
  app.log.info('✅ Branch operational health dashboard routes registered (manual)');
} else {
  app.log.warn('⚠️  Database pool not available - branch health dashboard routes not registered');
}

// ============================================================================
// WebSocket Event Publisher (Optional - for real-time updates)
// ============================================================================

// Add this in your src/index.ts after app is built and before app.listen():
import { HealthChangePublisher } from "./operational-health/events/health-change-publisher.js";

// If you have a WebSocket server instance:
if (wsServer && pool) {
  const healthPublisher = new HealthChangePublisher(pool, wsServer);
  healthPublisher.start();
  
  // Cleanup on shutdown
  process.on('SIGTERM', () => {
    healthPublisher.stop();
  });
  
  console.log('✅ Health change publisher started');
}
