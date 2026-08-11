/**
 * Vehicle Analytics API Routes
 * REST endpoints for vehicle search, journey, watchlist, and ANPR queries
 */

import { Router, type Request, type Response } from 'express';
import type { VehicleEventRepository } from '../../analytics-engine/src/vehicle/persistence/vehicle-event.repository.js';
import type { VehicleJourneyService } from '../../analytics-engine/src/vehicle/journey/vehicle-journey.service.js';
import type { VehicleWatchlistService } from '../../analytics-engine/src/vehicle/watchlist/vehicle-watchlist.service.js';

export function createVehicleAnalyticsRoutes(
  eventRepository: VehicleEventRepository,
  journeyService: VehicleJourneyService,
  watchlistService: VehicleWatchlistService
): Router {
  const router = Router();
  
  /**
   * Search vehicle events
   * GET /api/vehicle-analytics/events
   */
  router.get('/events', async (req: Request, res: Response) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      const query = {
        tenantId,
        cameraIds: req.query.cameraIds ? String(req.query.cameraIds).split(',') : undefined,
        vehicleTypes: req.query.vehicleTypes ? String(req.query.vehicleTypes).split(',') : undefined,
        colors: req.query.colors ? String(req.query.colors).split(',') : undefined,
        normalizedPlate: req.query.plate ? String(req.query.plate) : undefined,
        from: req.query.from ? new Date(String(req.query.from)) : undefined,
        to: req.query.to ? new Date(String(req.query.to)) : undefined,
        direction: req.query.direction as any,
        limit: req.query.limit ? parseInt(String(req.query.limit)) : 50,
        offset: req.query.offset ? parseInt(String(req.query.offset)) : 0,
        orderBy: (req.query.orderBy as any) || 'occurredAt',
        orderDirection: (req.query.orderDirection as any) || 'desc',
      };
      
      const events = await eventRepository.search(query);
      const total = await eventRepository.count(query);
      
      res.json({
        events,
        pagination: {
          total,
          limit: query.limit,
          offset: query.offset,
          hasMore: (query.offset || 0) + events.length < total,
        },
      });
    } catch (error) {
      console.error('Vehicle events search failed:', error);
      res.status(500).json({ error: 'Failed to search vehicle events' });
    }
  });
  
  /**
   * Get vehicle event by ID
   * GET /api/vehicle-analytics/events/:eventId
   */
  router.get('/events/:eventId', async (req: Request, res: Response) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      const event = await eventRepository.findById(tenantId, req.params.eventId);
      
      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }
      
      res.json({ event });
    } catch (error) {
      console.error('Get vehicle event failed:', error);
      res.status(500).json({ error: 'Failed to get vehicle event' });
    }
  });
  
  /**
   * Search by plate number
   * GET /api/vehicle-analytics/plates/:plate
   */
  router.get('/plates/:plate', async (req: Request, res: Response) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      const plate = req.params.plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const minConfidence = req.query.minConfidence 
        ? parseFloat(String(req.query.minConfidence))
        : 0.7;
      
      const events = await eventRepository.findByPlate(tenantId, plate, {
        minConfidence,
        maxResults: 100,
      });
      
      res.json({
        plate,
        events,
        count: events.length,
      });
    } catch (error) {
      console.error('Plate search failed:', error);
      res.status(500).json({ error: 'Failed to search plate' });
    }
  });
  
  /**
   * Get vehicle journey
   * GET /api/vehicle-analytics/journey/:plate
   */
  router.get('/journey/:plate', async (req: Request, res: Response) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      const plate = req.params.plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
      
      const from = req.query.from 
        ? new Date(String(req.query.from))
        : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
      
      const to = req.query.to
        ? new Date(String(req.query.to))
        : new Date();
      
      const journey = await journeyService.buildJourney(tenantId, plate, { from, to });
      
      if (!journey) {
        return res.status(404).json({ error: 'No journey found for this plate' });
      }
      
      // Validate route if topology available
      const validation = journeyService.validateRoute(journey);
      
      res.json({
        journey,
        validation,
      });
    } catch (error) {
      console.error('Journey reconstruction failed:', error);
      res.status(500).json({ error: 'Failed to reconstruct journey' });
    }
  });
  
  /**
   * Get last seen location
   * GET /api/vehicle-analytics/last-seen/:plate
   */
  router.get('/last-seen/:plate', async (req: Request, res: Response) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      const plate = req.params.plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const lastSeen = await journeyService.getLastSeen(tenantId, plate);
      
      if (!lastSeen) {
        return res.status(404).json({ error: 'Vehicle not found' });
      }
      
      res.json({ lastSeen });
    } catch (error) {
      console.error('Last seen query failed:', error);
      res.status(500).json({ error: 'Failed to get last seen location' });
    }
  });
  
  /**
   * Get statistics
   * GET /api/vehicle-analytics/stats
   */
  router.get('/stats', async (req: Request, res: Response) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      const from = req.query.from
        ? new Date(String(req.query.from))
        : new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours
      
      const to = req.query.to
        ? new Date(String(req.query.to))
        : new Date();
      
      const cameraIds = req.query.cameraIds
        ? String(req.query.cameraIds).split(',')
        : undefined;
      
      const stats = await eventRepository.getStats(tenantId, { from, to }, cameraIds);
      
      res.json({ stats });
    } catch (error) {
      console.error('Stats query failed:', error);
      res.status(500).json({ error: 'Failed to get statistics' });
    }
  });
  
  /**
   * Get watchlist
   * GET /api/vehicle-analytics/watchlist
   */
  router.get('/watchlist', async (req: Request, res: Response) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      const entries = watchlistService.getWatchlist(tenantId);
      
      res.json({
        entries,
        count: entries.length,
      });
    } catch (error) {
      console.error('Watchlist query failed:', error);
      res.status(500).json({ error: 'Failed to get watchlist' });
    }
  });
  
  /**
   * Add to watchlist
   * POST /api/vehicle-analytics/watchlist
   */
  router.post('/watchlist', async (req: Request, res: Response) => {
    try {
      const tenantId = req.user?.tenantId;
      const userId = req.user?.id;
      
      if (!tenantId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      const { plate, reason, severity, category, label } = req.body;
      
      if (!plate) {
        return res.status(400).json({ error: 'Plate number is required' });
      }
      
      const normalized = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
      
      const entry = {
        id: `watchlist_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        tenantId,
        normalizedPlate: normalized,
        reason: reason || 'No reason provided',
        severity: severity || 'medium',
        category: category || 'other',
        label,
        enabled: true,
        createdAt: new Date(),
        createdBy: userId,
      };
      
      await watchlistService.addEntry(entry);
      
      res.status(201).json({ entry });
    } catch (error) {
      console.error('Add to watchlist failed:', error);
      res.status(500).json({ error: 'Failed to add to watchlist' });
    }
  });
  
  /**
   * Remove from watchlist
   * DELETE /api/vehicle-analytics/watchlist/:entryId
   */
  router.delete('/watchlist/:entryId', async (req: Request, res: Response) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      const removed = await watchlistService.removeEntry(tenantId, req.params.entryId);
      
      if (!removed) {
        return res.status(404).json({ error: 'Watchlist entry not found' });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('Remove from watchlist failed:', error);
      res.status(500).json({ error: 'Failed to remove from watchlist' });
    }
  });
  
  /**
   * Get watchlist matches
   * GET /api/vehicle-analytics/watchlist/matches
   */
  router.get('/watchlist/matches', async (req: Request, res: Response) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      const status = req.query.status as string;
      
      let matches = status === 'pending'
        ? watchlistService.getPendingMatches(tenantId)
        : []; // Would need to add getMatches method
      
      res.json({
        matches,
        count: matches.length,
      });
    } catch (error) {
      console.error('Get watchlist matches failed:', error);
      res.status(500).json({ error: 'Failed to get watchlist matches' });
    }
  });
  
  /**
   * Acknowledge watchlist match
   * POST /api/vehicle-analytics/watchlist/matches/:matchId/acknowledge
   */
  router.post('/watchlist/matches/:matchId/acknowledge', async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      await watchlistService.acknowledgeMatch(req.params.matchId, userId);
      
      res.json({ success: true });
    } catch (error) {
      console.error('Acknowledge match failed:', error);
      res.status(500).json({ error: 'Failed to acknowledge match' });
    }
  });
  
  return router;
}
