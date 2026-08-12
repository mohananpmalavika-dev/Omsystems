/**
 * Capabilities API Routes
 * Expose capability tier status (REAL vs READY vs PLANNED) to frontend
 */

import { FastifyInstance } from 'fastify';
import {
  getCapabilityRegistry,
  CapabilityTier,
} from '../capabilities/capability-registry.js';
import {
  initializeCapabilities,
  getCapabilityStats,
  getCapabilitiesByTier,
  getCapabilitiesByCategory,
} from '../capabilities/capability-definitions.js';

export default async function capabilitiesRoutes(fastify: FastifyInstance) {
  const registry = getCapabilityRegistry();

  // Initialize capabilities on first request
  let initialized = false;
  const ensureInitialized = () => {
    if (!initialized) {
      initializeCapabilities(registry);
      initialized = true;
    }
  };

  /**
   * GET /v1/capabilities
   * Get all capabilities with their current status
   */
  fastify.get('/v1/capabilities', async (request, reply) => {
    ensureInitialized();

    try {
      const result = await registry.exportForAPI();
      
      reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      fastify.log.error(error, 'Failed to get capabilities');
      reply.status(500).send({
        success: false,
        error: 'Failed to retrieve capabilities',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /v1/capabilities/summary
   * Get summary statistics
   */
  fastify.get('/v1/capabilities/summary', async (request, reply) => {
    ensureInitialized();

    try {
      const summary = registry.getSummary();
      const stats = getCapabilityStats();

      reply.send({
        success: true,
        data: {
          ...summary,
          stats,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      fastify.log.error(error, 'Failed to get capability summary');
      reply.status(500).send({
        success: false,
        error: 'Failed to retrieve capability summary',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /v1/capabilities/tier/:tier
   * Get capabilities by tier (REAL, READY, PLANNED)
   */
  fastify.get<{
    Params: { tier: string };
  }>('/v1/capabilities/tier/:tier', async (request, reply) => {
    ensureInitialized();

    const { tier } = request.params;

    // Validate tier
    if (!['REAL', 'READY', 'PLANNED'].includes(tier.toUpperCase())) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid tier',
        message: 'Tier must be one of: REAL, READY, PLANNED',
      });
    }

    try {
      const capabilities = getCapabilitiesByTier(tier.toUpperCase() as CapabilityTier);

      // Check each capability
      const results = await Promise.all(
        capabilities.map(async (cap) => {
          const check = await registry.checkCapability(cap.id);
          return {
            ...cap,
            check,
          };
        })
      );

      reply.send({
        success: true,
        data: {
          tier: tier.toUpperCase(),
          count: results.length,
          capabilities: results,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      fastify.log.error(error, `Failed to get capabilities for tier ${tier}`);
      reply.status(500).send({
        success: false,
        error: 'Failed to retrieve capabilities',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /v1/capabilities/category/:category
   * Get capabilities by category
   */
  fastify.get<{
    Params: { category: string };
  }>('/v1/capabilities/category/:category', async (request, reply) => {
    ensureInitialized();

    const { category } = request.params;

    // Validate category
    const validCategories = ['security', 'analytics', 'infrastructure', 'operations', 'integration'];
    if (!validCategories.includes(category.toLowerCase())) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid category',
        message: `Category must be one of: ${validCategories.join(', ')}`,
      });
    }

    try {
      const capabilities = getCapabilitiesByCategory(category.toLowerCase() as any);

      // Check each capability
      const results = await Promise.all(
        capabilities.map(async (cap) => {
          const check = await registry.checkCapability(cap.id);
          return {
            ...cap,
            check,
          };
        })
      );

      reply.send({
        success: true,
        data: {
          category: category.toLowerCase(),
          count: results.length,
          capabilities: results,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      fastify.log.error(error, `Failed to get capabilities for category ${category}`);
      reply.status(500).send({
        success: false,
        error: 'Failed to retrieve capabilities',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /v1/capabilities/:id
   * Get specific capability details with health check
   */
  fastify.get<{
    Params: { id: string };
  }>('/v1/capabilities/:id', async (request, reply) => {
    ensureInitialized();

    const { id } = request.params;

    try {
      const capability = registry.get(id);

      if (!capability) {
        return reply.status(404).send({
          success: false,
          error: 'Capability not found',
          message: `No capability found with ID: ${id}`,
        });
      }

      const check = await registry.checkCapability(id);

      reply.send({
        success: true,
        data: {
          ...capability,
          check,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      fastify.log.error(error, `Failed to get capability ${id}`);
      reply.status(500).send({
        success: false,
        error: 'Failed to retrieve capability',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /v1/capabilities/check
   * Force health check on all capabilities
   */
  fastify.post('/v1/capabilities/check', async (request, reply) => {
    ensureInitialized();

    try {
      const results = await registry.checkAll();
      const summary = registry.getSummary();

      reply.send({
        success: true,
        data: {
          summary,
          checksPerformed: results.size,
          results: Array.from(results.entries()).map(([id, check]) => ({
            id,
            ...check,
          })),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      fastify.log.error(error, 'Failed to check capabilities');
      reply.status(500).send({
        success: false,
        error: 'Failed to check capabilities',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /v1/capabilities/stats
   * Get implementation statistics
   */
  fastify.get('/v1/capabilities/stats', async (request, reply) => {
    ensureInitialized();

    try {
      const stats = getCapabilityStats();

      reply.send({
        success: true,
        data: stats,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      fastify.log.error(error, 'Failed to get capability stats');
      reply.status(500).send({
        success: false,
        error: 'Failed to retrieve capability statistics',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}
