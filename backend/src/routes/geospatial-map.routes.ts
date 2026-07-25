/**
 * Geospatial Map API Routes
 * Map visualization and location-based analytics endpoints
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { GeospatialMapService, MapBounds } from '../services/geospatial-map.service';

interface AuthRequest extends Request {
  context?: {
    tenantId: string;
    userId?: string;
    userScope?: {
      branchIds?: string[];
      regionIds?: string[];
    };
  };
}

export function createGeospatialMapRoutes(pool: Pool): Router {
  const router = Router();
  const mapService = new GeospatialMapService(pool);

  /**
   * GET /v1/map/branches
   * Get branch markers for map display
   */
  router.get('/branches', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId } = req.context || {};
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      const { north, south, east, west, healthStatus, region, minHealthScore, hasAlerts } = req.query;

      const bounds: MapBounds | undefined = 
        north && south && east && west
          ? {
              north: parseFloat(north as string),
              south: parseFloat(south as string),
              east: parseFloat(east as string),
              west: parseFloat(west as string)
            }
          : undefined;

      const filters: any = {
        bounds,
        healthStatus: healthStatus ? (healthStatus as string).split(',') : undefined,
        region: region as string,
        minHealthScore: minHealthScore ? parseFloat(minHealthScore as string) : undefined,
        hasAlerts: hasAlerts === 'true'
      };

      const markers = await mapService.getBranchMarkers(tenantId, filters);
      
      res.json({
        success: true,
        data: markers
      });
    } catch (error) {
      console.error('Error fetching branch markers:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch branch markers'
      });
    }
  });

  /**
   * GET /v1/map/clusters
   * Get clustered branch locations
   */
  router.get('/clusters', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId } = req.context || {};
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      const { north, south, east, west, radius } = req.query;

      if (!north || !south || !east || !west) {
        return res.status(400).json({
          success: false,
          error: 'Bounds (north, south, east, west) are required'
        });
      }

      const bounds: MapBounds = {
        north: parseFloat(north as string),
        south: parseFloat(south as string),
        east: parseFloat(east as string),
        west: parseFloat(west as string)
      };

      const clusterRadius = radius ? parseFloat(radius as string) : 0.5;

      const clusters = await mapService.getClusteredBranches(tenantId, bounds, clusterRadius);
      
      res.json({
        success: true,
        data: clusters
      });
    } catch (error) {
      console.error('Error fetching clusters:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch clusters'
      });
    }
  });

  /**
   * GET /v1/map/heatmap
   * Get heatmap data for specified metric
   */
  router.get('/heatmap', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId } = req.context || {};
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      const { metric, north, south, east, west, days } = req.query;

      if (!metric) {
        return res.status(400).json({
          success: false,
          error: 'Metric is required (incidents, alerts, cameras_offline, health_score)'
        });
      }

      const bounds: MapBounds | undefined = 
        north && south && east && west
          ? {
              north: parseFloat(north as string),
              south: parseFloat(south as string),
              east: parseFloat(east as string),
              west: parseFloat(west as string)
            }
          : undefined;

      const daysValue = days ? parseInt(days as string) : 30;

      const heatmapData = await mapService.getHeatmapData(
        tenantId,
        metric as any,
        bounds,
        daysValue
      );
      
      res.json({
        success: true,
        data: heatmapData
      });
    } catch (error) {
      console.error('Error fetching heatmap data:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch heatmap data'
      });
    }
  });

  /**
   * GET /v1/map/regional-stats
   * Get statistics by region
   */
  router.get('/regional-stats', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId } = req.context || {};
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      const stats = await mapService.getRegionalStatistics(tenantId);
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error fetching regional stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch regional statistics'
      });
    }
  });

  /**
   * GET /v1/map/nearby
   * Get nearby branches for a location
   */
  router.get('/nearby', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId } = req.context || {};
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      const { latitude, longitude, radius, limit } = req.query;

      if (!latitude || !longitude) {
        return res.status(400).json({
          success: false,
          error: 'Latitude and longitude are required'
        });
      }

      const radiusKm = radius ? parseFloat(radius as string) : 50;
      const limitValue = limit ? parseInt(limit as string) : 10;

      const nearby = await mapService.getNearbyBranches(
        tenantId,
        parseFloat(latitude as string),
        parseFloat(longitude as string),
        radiusKm,
        limitValue
      );
      
      res.json({
        success: true,
        data: nearby
      });
    } catch (error) {
      console.error('Error fetching nearby branches:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch nearby branches'
      });
    }
  });

  /**
   * GET /v1/map/summary
   * Get map summary statistics
   */
  router.get('/summary', async (req: AuthRequest, res: Response) => {
    try {
      const { tenantId } = req.context || {};
      
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      const { north, south, east, west } = req.query;

      const bounds: MapBounds | undefined = 
        north && south && east && west
          ? {
              north: parseFloat(north as string),
              south: parseFloat(south as string),
              east: parseFloat(east as string),
              west: parseFloat(west as string)
            }
          : undefined;

      const summary = await mapService.getMapSummary(tenantId, bounds);
      
      res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      console.error('Error fetching map summary:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch map summary'
      });
    }
  });

  return router;
}

export default createGeospatialMapRoutes;
