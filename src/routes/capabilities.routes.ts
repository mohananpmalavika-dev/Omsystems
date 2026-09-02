/**
 * Authoritative Platform Capabilities API Routes
 * 
 * Exposes truthful capability status, maturity levels, and runtime diagnostics to dashboard and API consumers.
 * Prevents UI deception and guarantees that NOT_IMPLEMENTED features are never misrepresented.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { RouteGenericInterface } from 'fastify/types/route.js';
import { getCapabilityRegistry } from '../capabilities/capability-registry.js';
import {
  CapabilityMaturity,
  type CapabilityCategory,
} from '../../packages/contracts/src/capabilities/capability-types.js';

export async function registerCapabilitiesRoutes(app: FastifyInstance): Promise<void> {
  const registry = getCapabilityRegistry();

  /**
   * Helper to register endpoints with dual prefix support (/v1/capabilities and /api/v1/capabilities)
   */
  function registerRoute<T extends RouteGenericInterface = RouteGenericInterface>(
    pathSuffix: string,
    handler: (req: FastifyRequest<T>, reply: FastifyReply) => Promise<unknown> | unknown
  ) {
    const prefixes = ['/v1/capabilities', '/api/v1/capabilities'];
    for (const prefix of prefixes) {
      const fullPath = pathSuffix ? `${prefix}/${pathSuffix}` : prefix;
      app.get(fullPath, handler as any);
    }
  }

  // ============================================================================
  // 1. GET ALL CAPABILITIES
  // ============================================================================
  registerRoute('', async (_req, reply) => {
    const capabilities = registry.getAll();
    const summary = registry.getSummary();
    return reply.send({
      success: true,
      capabilities,
      summary,
      timestamp: new Date().toISOString(),
    });
  });

  // ============================================================================
  // 2. GET CAPABILITY SUMMARY
  // ============================================================================
  registerRoute('summary', async (_req, reply) => {
    const summary = registry.getSummary();
    return reply.send({
      success: true,
      data: summary,
      summary,
      timestamp: summary.generatedAt,
    });
  });

  // ============================================================================
  // 3. GET CAPABILITY BY CATEGORY
  // ============================================================================
  registerRoute('category/:category', async (req: FastifyRequest<{ Params: { category: string } }>, reply) => {
    const category = req.params.category as CapabilityCategory;
    const capabilities = registry.getByCategory(category);
    return reply.send({
      success: true,
      category,
      count: capabilities.length,
      capabilities,
      timestamp: new Date().toISOString(),
    });
  });

  // ============================================================================
  // 4. GET CAPABILITY BY MATURITY
  // ============================================================================
  registerRoute('maturity/:maturity', async (req: FastifyRequest<{ Params: { maturity: string } }>, reply) => {
    const maturityParam = req.params.maturity.toUpperCase();
    if (!Object.values(CapabilityMaturity).includes(maturityParam as CapabilityMaturity)) {
      return reply.status(400).send({
        success: false,
        error: `Invalid maturity level '${req.params.maturity}'. Valid values: ${Object.values(CapabilityMaturity).join(', ')}`,
      });
    }

    const capabilities = registry.getByMaturity(maturityParam as CapabilityMaturity);
    return reply.send({
      success: true,
      maturity: maturityParam,
      count: capabilities.length,
      capabilities,
      timestamp: new Date().toISOString(),
    });
  });

  // ============================================================================
  // 5. GET SINGLE CAPABILITY BY ID
  // ============================================================================
  registerRoute(':id', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const capability = registry.get(req.params.id);
    if (!capability) {
      return reply.status(404).send({
        success: false,
        error: `Capability '${req.params.id}' not found`,
      });
    }

    return reply.send({
      success: true,
      capability,
      canUse: registry.canUse(req.params.id),
      timestamp: new Date().toISOString(),
    });
  });

  // ============================================================================
  // 6. ADMIN AUDIT & BLOCKERS ENDPOINTS
  // ============================================================================
  const adminPrefixes = ['/v1/admin/capabilities', '/api/v1/admin/capabilities'];
  for (const prefix of adminPrefixes) {
    app.get(`${prefix}/audit`, async (_req, reply) => {
      const audit = registry.getAuditReport();
      return reply.send({
        success: true,
        data: audit,
        timestamp: audit.generatedAt,
      });
    });

    app.get(`${prefix}/blockers`, async (_req, reply) => {
      const blockers = registry.getBlockers();
      return reply.send({
        success: true,
        count: blockers.length,
        blockers,
        timestamp: new Date().toISOString(),
      });
    });
  }
}

export default registerCapabilitiesRoutes;
