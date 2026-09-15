/**
 * Industrial Analytics API Routes
 * 
 * REST endpoints for industrial equipment monitoring and safety analytics.
 * 
 * Endpoints:
 * - GET  /api/industrial/health - Overall health and capability status
 * - GET  /api/industrial/capabilities - Detailed capability matrix
 * - POST /api/industrial/initialize - Initialize industrial analytics
 * 
 * - GET  /api/industrial/equipment/:cameraId - Get tracked equipment
 * - GET  /api/industrial/equipment/:cameraId/type/:type - Get equipment by type
 * - GET  /api/industrial/equipment/:cameraId/zone/:zoneId - Get equipment in zone
 * 
 * - GET  /api/industrial/violations/:cameraId - Get recent violations
 * - GET  /api/industrial/violations/:cameraId/type/:type - Get violations by type
 * 
 * - GET  /api/industrial/zones/:cameraId - Get configured zones
 * - POST /api/industrial/zones/:cameraId - Add safety zone
 * - PUT  /api/industrial/zones/:cameraId/:zoneId - Update zone
 * - DELETE /api/industrial/zones/:cameraId/:zoneId - Remove zone
 * 
 * - GET  /api/industrial/config/:cameraId - Get configuration
 * - PUT  /api/industrial/config/:cameraId - Update configuration
 * 
 * - GET  /api/industrial/metrics - Get analytics metrics
 * - GET  /api/industrial/tracker/stats/:cameraId - Get tracker statistics
 */

import { Router, type Request, type Response } from 'express';
import type { Pool } from 'pg';
import { getIndustrialCapabilityHealth } from '../industrial/capability-health.js';
import { getIndustrialInitializer } from '../industrial/industrial-init.js';
import { getSceneStateRegistry } from '../tracking/scene-state.js';
import { createIndustrialAnalytics } from '../detectors/industrial-analytics.js';
import { IndustrialPersistenceService } from '../industrial/industrial-persistence.service.js';
import type { Zone } from '../tracking/scene-state.js';
import type { IndustrialConfig } from '../industrial/rules/types.js';

// Singleton persistence service (initialized when database is available)
let persistenceService: IndustrialPersistenceService | null = null;

export function initializeIndustrialPersistence(db: Pool): void {
  persistenceService = new IndustrialPersistenceService(db);
  persistenceService.initializeTables().catch((error) => {
    console.error("Failed to initialize industrial persistence tables:", error);
  });
}

export function getPersistenceService(): IndustrialPersistenceService | null {
  return persistenceService;
}

const router = Router();

// ============================================================================
// Health & Capabilities
// ============================================================================

/**
 * GET /api/industrial/health
 * Get overall health and capability status
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const healthService = getIndustrialCapabilityHealth();
    const health = await healthService.checkHealth();

    res.json({
      status: health.overall,
      overall: health.overall,
      capabilities: health.capabilities,
      degradationReasons: health.degradationReasons,
      lastCheckedAt: health.lastCheckedAt,
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({
      error: 'Health check failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/industrial/capabilities
 * Get detailed capability availability matrix
 */
router.get('/capabilities', async (req: Request, res: Response) => {
  try {
    const healthService = getIndustrialCapabilityHealth();
    const matrix = await healthService.getCapabilityMatrix();

    res.json({
      capabilities: matrix,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Capability check failed:', error);
    res.status(500).json({
      error: 'Capability check failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/industrial/initialize
 * Initialize industrial analytics
 */
router.post('/initialize', async (req: Request, res: Response) => {
  try {
    const { enableHealthMonitoring = true, healthCheckIntervalMs = 60000 } =
      req.body;

    const initializer = getIndustrialInitializer();
    const result = await initializer.initialize({
      enableHealthMonitoring,
      healthCheckIntervalMs,
    });

    if (result.success) {
      res.json({
        success: true,
        message: 'Industrial analytics initialized',
        result,
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Industrial analytics initialization failed',
        result,
      });
    }
  } catch (error) {
    console.error('Initialization failed:', error);
    res.status(500).json({
      error: 'Initialization failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/industrial/status
 * Get initialization and health status
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const initializer = getIndustrialInitializer();
    const status = await initializer.getStatus();

    res.json(status);
  } catch (error) {
    console.error('Status check failed:', error);
    res.status(500).json({
      error: 'Status check failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================================
// Equipment Tracking
// ============================================================================

/**
 * GET /api/industrial/equipment/:cameraId
 * Get all tracked equipment for a camera
 */
router.get('/equipment/:cameraId', (req: Request, res: Response) => {
  try {
    const { cameraId } = req.params;
    const sceneRegistry = getSceneStateRegistry();
    const scene = sceneRegistry.getSceneState(cameraId);
    
    // Check if scene exists and has the getAllTracks method
    if (!scene || typeof (scene as any).getAllTracks !== 'function') {
      res.json({
        cameraId,
        equipment: [],
        count: 0,
        timestamp: new Date(),
      });
      return;
    }
    
    const equipment = (scene as any).getAllTracks();

    res.json({
      cameraId,
      equipment,
      count: equipment.length,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Equipment query failed:', error);
    res.status(500).json({
      error: 'Equipment query failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/industrial/equipment/:cameraId/type/:type
 * Get equipment by type
 */
router.get(
  '/equipment/:cameraId/type/:type',
  (req: Request, res: Response) => {
    try {
      const { cameraId, type } = req.params;
      const sceneRegistry = getSceneStateRegistry();
      const scene = sceneRegistry.getSceneState(cameraId);
      const equipment = scene.getEquipmentByType(type as any);

      res.json({
        cameraId,
        type,
        equipment,
        count: equipment.length,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error('Equipment type query failed:', error);
      res.status(500).json({
        error: 'Equipment type query failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * GET /api/industrial/equipment/:cameraId/zone/:zoneId
 * Get equipment in specific zone
 */
router.get(
  '/equipment/:cameraId/zone/:zoneId',
  (req: Request, res: Response) => {
    try {
      const { cameraId, zoneId } = req.params;
      const sceneRegistry = getSceneStateRegistry();
      const scene = sceneRegistry.getSceneState(cameraId);
      const equipmentByZone = scene.findEquipmentInZones();
      const equipment = equipmentByZone.get(zoneId) || [];

      res.json({
        cameraId,
        zoneId,
        equipment,
        count: equipment.length,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error('Equipment zone query failed:', error);
      res.status(500).json({
        error: 'Equipment zone query failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * GET /api/industrial/equipment/:cameraId/moving
 * Get moving equipment
 */
router.get('/equipment/:cameraId/moving', (req: Request, res: Response) => {
  try {
    const { cameraId } = req.params;
    const sceneRegistry = getSceneStateRegistry();
    const scene = sceneRegistry.getSceneState(cameraId);
    const equipment = scene.getMovingEquipment();

    res.json({
      cameraId,
      equipment,
      count: equipment.length,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Moving equipment query failed:', error);
    res.status(500).json({
      error: 'Moving equipment query failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/industrial/equipment/:cameraId/stationary
 * Get stationary equipment
 */
router.get('/equipment/:cameraId/stationary', (req: Request, res: Response) => {
  try {
    const { cameraId } = req.params;
    const sceneRegistry = getSceneStateRegistry();
    const scene = sceneRegistry.getSceneState(cameraId);
    const equipment = scene.getStationaryEquipment();

    res.json({
      cameraId,
      equipment,
      count: equipment.length,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Stationary equipment query failed:', error);
    res.status(500).json({
      error: 'Stationary equipment query failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================================
// Violations (placeholder - would integrate with event storage)
// ============================================================================

/**
 * GET /api/industrial/violations/:cameraId
 * Get recent violations for a camera
 */
router.get('/violations/:cameraId', async (req: Request, res: Response) => {
  try {
    const { cameraId } = req.params;
    const { limit, severity, type, reviewStatus, fromDate, toDate } = req.query;
    const tenantId = (req.headers['x-tenant-id'] as string) || 'default';

    // Use persistence service if available
    if (persistenceService) {
      const result = await persistenceService.getViolations(tenantId, {
        cameraId,
        severity: severity as string,
        violationType: type as string,
        reviewStatus: reviewStatus as string,
        fromDate: fromDate ? new Date(fromDate as string) : undefined,
        toDate: toDate ? new Date(toDate as string) : undefined,
        limit: limit ? parseInt(limit as string, 10) : 100,
      });

      res.json({
        cameraId,
        violations: result.violations,
        count: result.violations.length,
        total: result.total,
        filters: { limit, severity, type, reviewStatus },
        timestamp: new Date(),
      });
    } else {
      // Fallback when persistence not available
      res.json({
        cameraId,
        violations: [],
        count: 0,
        total: 0,
        filters: { limit, severity, type },
        timestamp: new Date(),
        warning: 'Persistence service not initialized',
      });
    }
  } catch (error) {
    console.error('Violations query failed:', error);
    res.status(500).json({
      error: 'Violations query failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================================
// Zones Configuration
// ============================================================================

/**
 * GET /api/industrial/zones/:cameraId
 * Get configured zones for a camera
 */
router.get('/zones/:cameraId', async (req: Request, res: Response) => {
  try {
    const { cameraId } = req.params;
    const tenantId = (req.headers['x-tenant-id'] as string) || 'default';

    // Get zones from persistent storage
    if (persistenceService) {
      const zones = await persistenceService.getZonesByCamera(tenantId, cameraId);
      
      // Also sync to scene state for runtime use
      const sceneRegistry = getSceneStateRegistry();
      const scene = sceneRegistry.getSceneState(cameraId);
      scene.updateZones(zones);

      res.json({
        cameraId,
        zones,
        count: zones.length,
        timestamp: new Date(),
      });
    } else {
      // Fallback to scene state only
      const sceneRegistry = getSceneStateRegistry();
      const scene = sceneRegistry.getSceneState(cameraId);

      res.json({
        cameraId,
        zones: [],
        count: 0,
        timestamp: new Date(),
        warning: 'Persistence service not initialized - zones are memory-only',
      });
    }
  } catch (error) {
    console.error('Zones query failed:', error);
    res.status(500).json({
      error: 'Zones query failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/industrial/zones/:cameraId
 * Add a safety zone
 */
router.post('/zones/:cameraId', async (req: Request, res: Response) => {
  try {
    const { cameraId } = req.params;
    const zone: any = req.body;
    const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
    const userId = (req.headers['x-user-id'] as string) || 'system';

    // Validate zone
    if (!zone.id || !zone.name || !zone.polygon || zone.polygon.length < 3) {
      return res.status(400).json({
        error: 'Invalid zone configuration',
        message:
          'Zone must have id, name, and polygon with at least 3 points',
      });
    }

    // Ensure zone type is set
    zone.zoneType = zone.zoneType || 'monitoring';
    zone.enabled = zone.enabled !== false;
    zone.tenantId = tenantId;
    zone.cameraId = cameraId;
    zone.createdBy = userId;

    // Persist zone configuration
    if (persistenceService) {
      const savedZone = await persistenceService.saveZone(zone);
      
      // Also add to scene state for runtime use
      const sceneRegistry = getSceneStateRegistry();
      const scene = sceneRegistry.getSceneState(cameraId);
      scene.updateZones([savedZone]);

      res.status(201).json({
        success: true,
        message: 'Zone added and persisted',
        zone: savedZone,
      });
    } else {
      // Fallback to memory-only
      const sceneRegistry = getSceneStateRegistry();
      const scene = sceneRegistry.getSceneState(cameraId);
      scene.updateZones([zone]);

      res.status(201).json({
        success: true,
        message: 'Zone added (memory only - persistence not available)',
        zone,
        warning: 'Zone will be lost on restart',
      });
    }
  } catch (error) {
    console.error('Zone creation failed:', error);
    res.status(500).json({
      error: 'Zone creation failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /api/industrial/zones/:cameraId/:zoneId
 * Remove a zone
 */
router.delete(
  '/zones/:cameraId/:zoneId',
  async (req: Request, res: Response) => {
    try {
      const { cameraId, zoneId } = req.params;
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';

      // Remove from persistent storage
      if (persistenceService) {
        const deleted = await persistenceService.deleteZone(tenantId, zoneId);
        
        if (deleted) {
          res.json({
            success: true,
            message: 'Zone removed from database',
            cameraId,
            zoneId,
          });
        } else {
          res.status(404).json({
            error: 'Zone not found',
            cameraId,
            zoneId,
          });
        }
      } else {
        res.json({
          success: true,
          message: 'Zone removed from memory (persistence not available)',
          cameraId,
          zoneId,
          warning: 'Zone was not persisted',
        });
      }
    } catch (error) {
      console.error('Zone deletion failed:', error);
      res.status(500).json({
        error: 'Zone deletion failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

// ============================================================================
// Configuration
// ============================================================================

/**
 * GET /api/industrial/config/:cameraId
 * Get industrial analytics configuration for a camera
 */
router.get('/config/:cameraId', async (req: Request, res: Response) => {
  try {
    const { cameraId } = req.params;
    const tenantId = (req.headers['x-tenant-id'] as string) || 'default';

    // Get from persistent configuration
    if (persistenceService) {
      let config = await persistenceService.getConfig(tenantId, cameraId);
      
      if (!config) {
        // Return default config
        config = await persistenceService.getDefaultConfig();
        config.cameraId = cameraId;
        config.tenantId = tenantId;
      }

      res.json({
        cameraId,
        config,
        timestamp: new Date(),
      });
    } else {
      // Return default config
      const defaultConfig: IndustrialConfig = {
        minPersonEquipmentDistance: 150,
        enforceZoneRestrictions: true,
        idleTimeThreshold: 300,
        stationaryTimeThreshold: 60,
      };

      res.json({
        cameraId,
        config: defaultConfig,
        timestamp: new Date(),
        warning: 'Using default config - persistence not available',
      });
    }
  } catch (error) {
    console.error('Config query failed:', error);
    res.status(500).json({
      error: 'Config query failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * PUT /api/industrial/config/:cameraId
 * Update configuration
 */
router.put('/config/:cameraId', async (req: Request, res: Response) => {
  try {
    const { cameraId } = req.params;
    const config: Partial<IndustrialConfig> = req.body;
    const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
    const userId = (req.headers['x-user-id'] as string) || 'system';

    // Validate configuration
    if (
      config.minPersonEquipmentDistance !== undefined &&
      config.minPersonEquipmentDistance < 0
    ) {
      return res.status(400).json({
        error: 'Invalid configuration',
        message: 'minPersonEquipmentDistance must be >= 0',
      });
    }

    // Persist configuration
    if (persistenceService) {
      // Get existing config or create new one
      let existingConfig = await persistenceService.getConfig(tenantId, cameraId);
      
      if (!existingConfig) {
        existingConfig = await persistenceService.getDefaultConfig();
        existingConfig.cameraId = cameraId;
        existingConfig.tenantId = tenantId;
      }

      // Merge with updates
      const updatedConfig = {
        ...existingConfig,
        ...config,
        cameraId,
        tenantId,
        updatedBy: userId,
      };

      const savedConfig = await persistenceService.saveConfig(updatedConfig);

      res.json({
        success: true,
        message: 'Configuration updated and persisted',
        cameraId,
        config: savedConfig,
      });
    } else {
      res.json({
        success: true,
        message: 'Configuration accepted (memory only - persistence not available)',
        cameraId,
        config,
        warning: 'Configuration will be lost on restart',
      });
    }
  } catch (error) {
    console.error('Config update failed:', error);
    res.status(500).json({
      error: 'Config update failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================================
// Metrics & Statistics
// ============================================================================

/**
 * GET /api/industrial/metrics
 * Get overall industrial analytics metrics
 */
router.get('/metrics', (req: Request, res: Response) => {
  try {
    const sceneRegistry = getSceneStateRegistry();
    const stats = sceneRegistry.getStatistics();

    res.json({
      sceneState: stats,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Metrics query failed:', error);
    res.status(500).json({
      error: 'Metrics query failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/industrial/tracker/stats/:cameraId
 * Get tracker statistics for a camera
 */
router.get('/tracker/stats/:cameraId', (req: Request, res: Response) => {
  try {
    const { cameraId } = req.params;

    // TODO: Get tracker instance and return stats
    // For now, return basic scene state stats
    const sceneRegistry = getSceneStateRegistry();
    const scene = sceneRegistry.getSceneState(cameraId);
    const stats = scene.getStatistics();

    res.json({
      cameraId,
      stats,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Tracker stats query failed:', error);
    res.status(500).json({
      error: 'Tracker stats query failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/industrial/scene/:cameraId
 * Get complete scene snapshot
 */
router.get('/scene/:cameraId', (req: Request, res: Response) => {
  try {
    const { cameraId } = req.params;
    const { tenantId = 'default', branchId } = req.query;

    const sceneRegistry = getSceneStateRegistry();
    const scene = sceneRegistry.getSceneState(cameraId);
    const snapshot = scene.getSnapshot(tenantId as string, branchId as string);

    res.json({
      scene: snapshot,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Scene query failed:', error);
    res.status(500).json({
      error: 'Scene query failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================================
// Export
// ============================================================================

export default router;
