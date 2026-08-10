/**
 * AI Assistant V2 API Routes
 * 
 * Exposes the new truthful AI Assistant architecture.
 * Deploy behind feature flag for gradual rollout.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Pool } from 'pg';
import { AIAssistantV2, createAIAssistantV2 } from '../../analytics-engine/src/assistant/index.js';
import { CameraServiceProvider } from '../../analytics-engine/src/assistant/providers/camera-service.provider.js';
import {
  CameraControlServiceProvider,
  type CameraApiClient
} from '../../analytics-engine/src/assistant/providers/camera-control-service.provider.js';
import { commandRegistry } from '../../analytics-engine/src/assistant/registry/command-registry.js';
import { capabilityRegistry } from '../../analytics-engine/src/assistant/registry/capability-registry.js';
import { 
  StartCameraCommand,
  StopCameraCommand,
  SystemStatusCommand,
  SearchDetectionsCommand
} from '../../analytics-engine/src/assistant/commands/index.js';
import { CommandRisk, CapabilityHealth } from '../../analytics-engine/src/assistant/types/index.js';

// Feature flag
const ENABLE_ASSISTANT_V2 = process.env.USE_ASSISTANT_V2 === 'true' || false;

if (!ENABLE_ASSISTANT_V2) {
  console.warn('[AI Assistant V2] Feature flag disabled. Set USE_ASSISTANT_V2=true to enable.');
}

/**
 * Initialize assistant with dependencies
 */
function createAssistantInstance(app: FastifyInstance): AIAssistantV2 | null {
  if (!ENABLE_ASSISTANT_V2) {
    return null;
  }
  
  try {
    const pool: Pool = (app as any).pool;
    
    if (!pool) {
      console.error('[AI Assistant V2] Database pool not available');
      return null;
    }
    
    // Create service providers
    const cameraService = new CameraServiceProvider(pool);
    
    // Create a simple camera API client
    // TODO: Replace with your actual camera control API
    const cameraApiClient: CameraApiClient = {
      async startCamera(cameraId: string, options?: { idempotencyKey?: string }) {
        // Implement actual camera start logic here
        // For now, placeholder that updates database
        try {
          await pool.query(
            'UPDATE cameras SET status = $1 WHERE id = $2',
            ['starting', cameraId]
          );
          
          return {
            success: true,
            id: `op_${Date.now()}`
          };
        } catch (error) {
          return {
            success: false,
            error: error.message
          };
        }
      },
      
      async stopCamera(cameraId: string, options?: { idempotencyKey?: string }) {
        // Implement actual camera stop logic here
        try {
          await pool.query(
            'UPDATE cameras SET status = $1 WHERE id = $2',
            ['stopping', cameraId]
          );
          
          return {
            success: true,
            id: `op_${Date.now()}`
          };
        } catch (error) {
          return {
            success: false,
            error: error.message
          };
        }
      }
    };
    
    const cameraControl = new CameraControlServiceProvider(
      cameraService,
      cameraApiClient,
      1000, // poll interval
      10000 // default timeout
    );
    
    // Create placeholder services
    // TODO: Implement real service providers
    const systemHealth: any = {
      async getSnapshot() {
        // Aggregate from actual sources
        const cameras = await pool.query('SELECT status, COUNT(*) as count FROM cameras GROUP BY status');
        
        const cameraHealth = {
          total: 0,
          online: 0,
          offline: 0,
          degraded: 0,
          starting: 0,
          error: 0
        };
        
        for (const row of cameras.rows) {
          const status = row.status?.toLowerCase();
          const count = parseInt(row.count);
          cameraHealth.total += count;
          
          if (status === 'online') cameraHealth.online += count;
          else if (status === 'offline') cameraHealth.offline += count;
          else if (status === 'starting') cameraHealth.starting += count;
          else if (status === 'error') cameraHealth.error += count;
        }
        
        return {
          timestamp: new Date(),
          overall: cameraHealth.online > cameraHealth.offline ? 'HEALTHY' : 'DEGRADED',
          cameras: cameraHealth,
          detection: {
            healthy: true,
            processingLagMs: 0
          },
          incidents: {
            open: 0,
            critical: 0,
            high: 0,
            medium: 0,
            low: 0
          },
          storage: {
            healthy: true,
            usedBytes: 0,
            totalBytes: 1000000000000,
            usedPercentage: 0
          }
        };
      }
    };
    
    const authorization: any = {
      async can() {
        // Implement actual authorization logic
        return { allowed: true };
      }
    };
    
    const audit: any = {
      async record(event: any) {
        // Implement actual audit logging
        console.log('[Audit]', event.command, event.resultStatus);
      }
    };
    
    // Register commands
    commandRegistry.register(
      {
        id: 'camera-start',
        name: 'Start Camera',
        risk: CommandRisk.SIDE_EFFECT,
        requires: ['camera-service', 'camera-control'],
        enabled: true
      },
      new StartCameraCommand(cameraService, cameraControl, authorization, audit),
      ['CAMERA_START']
    );
    
    commandRegistry.register(
      {
        id: 'camera-stop',
        name: 'Stop Camera',
        risk: CommandRisk.SIDE_EFFECT,
        requires: ['camera-service', 'camera-control'],
        enabled: true
      },
      new StopCameraCommand(cameraService, cameraControl, authorization, audit),
      ['CAMERA_STOP']
    );
    
    commandRegistry.register(
      {
        id: 'system-status',
        name: 'System Status',
        risk: CommandRisk.READ_ONLY,
        requires: ['system-health'],
        enabled: true
      },
      new SystemStatusCommand(systemHealth, authorization, audit),
      ['SYSTEM_STATUS']
    );
    
    // Register capabilities
    capabilityRegistry.register({
      id: 'camera-service',
      name: 'Camera Service',
      available: true,
      health: CapabilityHealth.HEALTHY
    });
    
    capabilityRegistry.register({
      id: 'camera-control',
      name: 'Camera Control',
      available: true,
      health: CapabilityHealth.HEALTHY
    });
    
    capabilityRegistry.register({
      id: 'system-health',
      name: 'System Health',
      available: true,
      health: CapabilityHealth.HEALTHY
    });
    
    // Create assistant
    return createAIAssistantV2({
      debug: process.env.NODE_ENV !== 'production'
    });
    
  } catch (error) {
    console.error('[AI Assistant V2] Failed to initialize:', error);
    return null;
  }
}

/**
 * Register AI Assistant V2 routes
 */
export default async function aiAssistantV2Routes(app: FastifyInstance) {
  
/**
 * POST /query
 * Process a natural language query
 */
app.post('/query', async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    if (!ENABLE_ASSISTANT_V2) {
      return reply.code(503).send({
        success: false,
        error: 'AI Assistant V2 is not enabled',
        message: 'Feature is currently disabled'
      });
    }
    
    const body = request.body as { query?: unknown; sessionId?: unknown };
    const { query, sessionId } = body;
    
    if (!query || typeof query !== 'string') {
      return reply.code(400).send({
        success: false,
        error: 'INVALID_REQUEST',
        message: 'Query is required and must be a string'
      });
    }
    
    // Get or create assistant instance
    const assistant = createAssistantInstance(app);
    
    if (!assistant) {
      return reply.code(500).send({
        success: false,
        error: 'SERVICE_UNAVAILABLE',
        message: 'AI Assistant service is unavailable'
      });
    }
    
    // Extract user info from authentication
    const currentUser = (request as any).currentUser;
    const user = {
      id: currentUser?.id || 'anonymous',
      roles: currentUser?.roles || [],
      siteIds: currentUser?.siteIds || []
    };
    
    // Process query
    const response = await assistant.processQuery(
      query,
      user,
      (typeof sessionId === 'string' ? sessionId : undefined) || 'default'
    );
    
    // Return response
    reply.send(response);
    
  } catch (error) {
    app.log.error({ error }, '[AI Assistant V2 API] Error');
    
    reply.code(500).send({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'An error occurred processing your request'
    });
  }
});

/**
 * GET /history/:sessionId
 * Get conversation history for a session
 */
app.get('/history/:sessionId', async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    if (!ENABLE_ASSISTANT_V2) {
      return reply.code(503).send({
        success: false,
        error: 'Feature disabled'
      });
    }
    
    const params = request.params as { sessionId: string };
    const assistant = createAssistantInstance(app);
    
    if (!assistant) {
      return reply.code(500).send({
        success: false,
        error: 'Service unavailable'
      });
    }
    
    const history = assistant.getHistory(params.sessionId);
    
    reply.send({
      success: true,
      sessionId: params.sessionId,
      history
    });
    
  } catch (error) {
    reply.code(500).send({
      success: false,
      error: 'Failed to retrieve history'
    });
  }
});

/**
 * DELETE /history/:sessionId
 * Clear conversation history for a session
 */
app.delete('/history/:sessionId', async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    if (!ENABLE_ASSISTANT_V2) {
      return reply.code(503).send({
        success: false,
        error: 'Feature disabled'
      });
    }
    
    const params = request.params as { sessionId: string };
    const assistant = createAssistantInstance(app);
    
    if (!assistant) {
      return reply.code(500).send({
        success: false,
        error: 'Service unavailable'
      });
    }
    
    assistant.clearHistory(params.sessionId);
    
    reply.send({
      success: true,
      message: 'History cleared'
    });
    
  } catch (error) {
    reply.code(500).send({
      success: false,
      error: 'Failed to clear history'
    });
  }
});

/**
 * GET /statistics
 * Get assistant usage statistics
 */
app.get('/statistics', async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    if (!ENABLE_ASSISTANT_V2) {
      return reply.code(503).send({
        success: false,
        error: 'Feature disabled'
      });
    }
    
    const assistant = createAssistantInstance(app);
    
    if (!assistant) {
      return reply.code(500).send({
        success: false,
        error: 'Service unavailable'
      });
    }
    
    const stats = assistant.getStatistics();
    
    reply.send({
      success: true,
      statistics: stats
    });
    
  } catch (error) {
    reply.code(500).send({
      success: false,
      error: 'Failed to retrieve statistics'
    });
  }
});

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
  reply.send({
    success: true,
    enabled: ENABLE_ASSISTANT_V2,
    version: '2.0.0',
    timestamp: new Date().toISOString()
  });
});

}

export default aiAssistantV2Routes;
