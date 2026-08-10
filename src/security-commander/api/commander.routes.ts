/**
 * Security Commander Routes
 */

import { Router } from 'express';
import type { Pool } from 'pg';
import { SecurityCommanderService } from '../services/commander.service.js';
import { SecurityCommanderController } from './commander.controller.js';

export function createCommanderRoutes(pool: Pool): Router {
  const router = Router();

  // Initialize service and controller
  const commanderService = new SecurityCommanderService(pool, {
    useLLM: process.env.COMMANDER_USE_LLM !== 'false',
    ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
    ollamaModel: process.env.OLLAMA_MODEL || 'llama3.2',
    evidenceStoragePath: process.env.EVIDENCE_STORAGE_PATH || './evidence',
  });

  const controller = new SecurityCommanderController(commanderService);

  // Routes
  router.post('/query', controller.query);
  router.get('/investigations', controller.getInvestigations);
  router.get('/investigations/:id', controller.getInvestigation);
  router.get('/health', controller.health);

  return router;
}

/**
 * Mount commander routes on Express app
 */
export function mountCommanderRoutes(app: any, pool: Pool): void {
  const commanderRoutes = createCommanderRoutes(pool);
  app.use('/api/security-commander', commanderRoutes);
}
