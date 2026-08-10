/**
 * Security Commander API Controller
 * 
 * REST API endpoints for the Security Commander.
 */

import type { Request, Response, NextFunction } from 'express';
import { SecurityCommanderService } from '../services/commander.service.js';
import type { CommanderContext } from '../types/index.js';

export class SecurityCommanderController {
  constructor(
    private readonly commanderService: SecurityCommanderService
  ) {}

  /**
   * POST /api/security-commander/query
   * Execute a natural language security query
   */
  query = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { query, sessionId } = req.body;

      if (!query || typeof query !== 'string') {
        res.status(400).json({
          error: 'Invalid request',
          message: 'Query is required and must be a string',
        });
        return;
      }

      // Build context from authenticated user
      const context: CommanderContext = {
        userId: (req as any).user?.id || 'anonymous',
        tenantId: (req as any).user?.tenantId || (req as any).tenantId,
        permissions: (req as any).user?.permissions || [],
        sessionId,
      };

      // Execute query
      const response = await this.commanderService.execute(query, context);

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/security-commander/investigations
   * Get recent investigations
   */
  getInvestigations = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const tenantId = (req as any).user?.tenantId || (req as any).tenantId;
      const limit = parseInt(req.query.limit as string) || 10;

      const investigations = await this.commanderService.getRecentInvestigations(
        tenantId,
        limit
      );

      res.json({
        investigations,
        total: investigations.length,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/security-commander/investigations/:id
   * Get investigation by ID
   */
  getInvestigation = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;

      const investigation = await this.commanderService.getInvestigation(id);

      if (!investigation) {
        res.status(404).json({
          error: 'Not found',
          message: 'Investigation not found',
        });
        return;
      }

      res.json(investigation);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/security-commander/health
   * Check commander health
   */
  health = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const status = await this.commanderService.isReady();

      res.json({
        status: status.ready ? 'healthy' : 'degraded',
        ...status,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };
}
