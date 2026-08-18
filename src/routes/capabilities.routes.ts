/**
 * Capabilities API Routes
 * 
 * Provides UI components with real-time capability availability information.
 * This prevents showing features that are not yet implemented or currently unavailable.
 * 
 * Core Principle:
 * - UI should query capabilities before showing features
 * - Features that return UNAVAILABLE should be hidden, not shown with "coming soon" alerts
 * - Capabilities can change at runtime (service restarts, feature flags, etc.)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger.js';

/**
 * Capability states
 */
type CapabilityState = 
  | 'AVAILABLE'       // Feature is fully implemented and working
  | 'PARTIAL'         // Feature is partially working (some sub-features unavailable)
  | 'UNAVAILABLE'     // Feature not implemented or service unavailable
  | 'DISABLED';       // Feature disabled by configuration

/**
 * Capability information
 */
interface CapabilityInfo {
  id: string;
  name: string;
  state: CapabilityState;
  reason?: string;
  since?: string;
  dependencies?: string[];
}

/**
 * Capability registry
 * 
 * This should be populated from actual service checks, not hardcoded.
 * In production, capabilities should be discovered dynamically.
 */
class CapabilityRegistry {
  private capabilities: Map<string, CapabilityInfo> = new Map();
  
  constructor() {
    this.initializeCapabilities();
  }
  
  /**
   * Initialize capability states
   * 
   * TODO: Replace with dynamic service discovery
   */
  private initializeCapabilities(): void {
    // Analytics & Reporting
    this.register({
      id: 'analytics.export.csv',
      name: 'CSV Export',
      state: 'AVAILABLE',
      reason: 'Analog camera CSV export fully implemented'
    });
    
    this.register({
      id: 'analytics.export.pdf',
      name: 'PDF Export',
      state: 'PARTIAL',
      reason: 'PDF generation implemented but some report types incomplete'
    });
    
    this.register({
      id: 'analytics.export.excel',
      name: 'Excel Export',
      state: 'AVAILABLE',
      reason: 'Excel export via exceljs library'
    });
    
    // Video Search & Timeline
    this.register({
      id: 'video.search',
      name: 'Video Search',
      state: 'AVAILABLE',
      reason: 'AI-powered video search operational'
    });
    
    this.register({
      id: 'video.timeline',
      name: 'Timeline Visualization',
      state: 'UNAVAILABLE',
      reason: 'Timeline component not yet implemented',
      dependencies: ['video.search']
    });
    
    // Health & Monitoring
    this.register({
      id: 'health.charts',
      name: 'Health Charts',
      state: 'PARTIAL',
      reason: 'Basic charts implemented, advanced visualizations incomplete'
    });
    
    this.register({
      id: 'health.predictions',
      name: 'Predictive Health',
      state: 'PARTIAL',
      reason: 'Framework exists but telemetry collectors incomplete'
    });
    
    // Maps & Digital Twin
    this.register({
      id: 'maps.live',
      name: 'Live Map View',
      state: 'AVAILABLE',
      reason: 'Leaflet-based mapping operational'
    });
    
    this.register({
      id: 'maps.heatmap',
      name: 'Heat Map Overlay',
      state: 'AVAILABLE',
      reason: 'Heat map generation and rendering complete'
    });
    
    this.register({
      id: 'digital-twin.status',
      name: 'Digital Twin Status Overlay',
      state: 'AVAILABLE',
      reason: 'Real-time device status overlay operational'
    });
    
    this.register({
      id: 'digital-twin.video',
      name: 'Digital Twin Live Video',
      state: 'AVAILABLE',
      reason: 'Live video streaming via media gateway'
    });
    
    // Incidents & Investigations
    this.register({
      id: 'incidents.create',
      name: 'Create Incident',
      state: 'AVAILABLE'
    });
    
    this.register({
      id: 'incidents.workflow',
      name: 'Incident Workflow',
      state: 'AVAILABLE',
      reason: 'SOP workflow engine operational'
    });
    
    this.register({
      id: 'incidents.map',
      name: 'Incident Map View',
      state: 'AVAILABLE',
      reason: 'Incident location mapping functional'
    });
    
    this.register({
      id: 'investigation.reid',
      name: 'Person Re-Identification',
      state: 'PARTIAL',
      reason: 'ReID framework exists, embedding extraction incomplete'
    });
    
    this.register({
      id: 'investigation.journey',
      name: 'Cross-Camera Journey',
      state: 'PARTIAL',
      reason: 'Journey tracking partially implemented'
    });
    
    // AI Assistant
    this.register({
      id: 'assistant.nlp',
      name: 'Natural Language Processing',
      state: process.env.OPENAI_API_KEY ? 'AVAILABLE' : 'PARTIAL',
      reason: process.env.OPENAI_API_KEY 
        ? 'ChatGPT Plus integration active'
        : 'Rule-based parser only (no GPT-4)'
    });
    
    this.register({
      id: 'assistant.commands',
      name: 'AI Assistant Commands',
      state: 'AVAILABLE',
      reason: 'Command registry operational'
    });
    
    // Recording & Storage
    this.register({
      id: 'recording.verification',
      name: 'Recording Verification',
      state: 'AVAILABLE',
      reason: 'ffprobe-based verification operational'
    });
    
    this.register({
      id: 'recording.cloud',
      name: 'Cloud Archive',
      state: 'UNAVAILABLE',
      reason: 'Cloud archive adapter not yet implemented'
    });
    
    this.register({
      id: 'recording.san',
      name: 'SAN Storage',
      state: 'UNAVAILABLE',
      reason: 'SAN storage adapter not yet implemented'
    });
    
    // Device Management
    this.register({
      id: 'devices.onvif',
      name: 'ONVIF Integration',
      state: 'AVAILABLE',
      reason: 'Full ONVIF recorder adapter implemented'
    });
    
    this.register({
      id: 'devices.hikvision',
      name: 'Hikvision Integration',
      state: 'PARTIAL',
      reason: 'ISAPI transport ready, XML parsing incomplete'
    });
    
    this.register({
      id: 'devices.dahua',
      name: 'Dahua Integration',
      state: 'PARTIAL',
      reason: 'Basic adapter exists, many methods unfinished'
    });
    
    // Security & Compliance
    this.register({
      id: 'security.tpm',
      name: 'TPM Attestation',
      state: 'PARTIAL',
      reason: 'Framework exists, quote verification incomplete'
    });
    
    this.register({
      id: 'security.secure-boot',
      name: 'Secure Boot',
      state: 'PARTIAL',
      reason: 'Detection implemented, verification incomplete'
    });
    
    this.register({
      id: 'compliance.reports',
      name: 'Compliance Reports',
      state: 'AVAILABLE',
      reason: 'Report generation operational'
    });
  }
  
  /**
   * Register a capability
   */
  register(capability: CapabilityInfo): void {
    this.capabilities.set(capability.id, {
      ...capability,
      since: capability.since || new Date().toISOString()
    });
  }
  
  /**
   * Get capability by ID
   */
  get(id: string): CapabilityInfo | undefined {
    return this.capabilities.get(id);
  }
  
  /**
   * Get all capabilities
   */
  getAll(): CapabilityInfo[] {
    return Array.from(this.capabilities.values());
  }
  
  /**
   * Get capabilities by state
   */
  getByState(state: CapabilityState): CapabilityInfo[] {
    return this.getAll().filter(cap => cap.state === state);
  }
  
  /**
   * Get capabilities by category
   */
  getByCategory(category: string): CapabilityInfo[] {
    return this.getAll().filter(cap => cap.id.startsWith(category + '.'));
  }
  
  /**
   * Check if capability is available
   */
  isAvailable(id: string): boolean {
    const capability = this.get(id);
    return capability?.state === 'AVAILABLE';
  }
  
  /**
   * Update capability state
   */
  updateState(id: string, state: CapabilityState, reason?: string): void {
    const capability = this.capabilities.get(id);
    if (capability) {
      capability.state = state;
      capability.reason = reason;
      capability.since = new Date().toISOString();
    }
  }
}

// Singleton registry
const capabilityRegistry = new CapabilityRegistry();

export default async function capabilitiesRoutes(app: FastifyInstance) {
  /**
   * GET /api/capabilities
   * Get all capabilities
   */
  app.get('/api/capabilities', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const capabilities = capabilityRegistry.getAll();
      
      return reply.send({
        success: true,
        capabilities,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Failed to get capabilities', { error });
      return reply.code(500).send({
        success: false,
        error: 'Failed to retrieve capabilities'
      });
    }
  });

  /**
   * GET /api/capabilities/:id
   * Get specific capability
   */
  app.get('/api/capabilities/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const id = (req.params as any)?.id;
      if (!id) {
        return reply.code(400).send({
          success: false,
          error: 'Capability ID is required'
        });
      }
      const capability = capabilityRegistry.get(id);
      
      if (!capability) {
        return reply.code(404).send({
          success: false,
          error: `Capability '${id}' not found`
        });
      }
      
      return reply.send({
        success: true,
        capability
      });
      
    } catch (error) {
      logger.error('Failed to get capability', { error, id: (req.params as any)?.id });
      return reply.code(500).send({
        success: false,
        error: 'Failed to retrieve capability'
      });
    }
  });

  /**
   * GET /api/capabilities/state/:state
   * Get capabilities by state
   */
  app.get('/api/capabilities/state/:state', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const state = (req.params as any)?.state;
      
      if (!state || !['AVAILABLE', 'PARTIAL', 'UNAVAILABLE', 'DISABLED'].includes(state)) {
        return reply.code(400).send({
          success: false,
          error: `Invalid state: ${state}`
        });
      }
      
      const capabilities = capabilityRegistry.getByState(state as CapabilityState);
      
      return reply.send({
        success: true,
        capabilities,
        count: capabilities.length
      });
      
    } catch (error) {
      logger.error('Failed to get capabilities by state', { error, state: (req.params as any)?.state });
      return reply.code(500).send({
        success: false,
        error: 'Failed to retrieve capabilities'
      });
    }
  });

  /**
   * GET /api/capabilities/category/:category
   * Get capabilities by category
   */
  app.get('/api/capabilities/category/:category', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const category = (req.params as any)?.category;
      if (!category) {
        return reply.code(400).send({
          success: false,
          error: 'Category is required'
        });
      }
      const capabilities = capabilityRegistry.getByCategory(category);
      
      return reply.send({
        success: true,
        capabilities,
        count: capabilities.length,
        category
      });
      
    } catch (error) {
      logger.error('Failed to get capabilities by category', { error, category: (req.params as any)?.category });
      return reply.code(500).send({
        success: false,
        error: 'Failed to retrieve capabilities'
      });
    }
  });

  /**
   * POST /api/capabilities/check
   * Check multiple capabilities at once
   */
  app.post('/api/capabilities/check', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { capabilities: ids } = (req.body as any) || {};
      
      if (!Array.isArray(ids)) {
        return reply.code(400).send({
          success: false,
          error: 'Expected array of capability IDs'
        });
      }
      
      const results: Record<string, boolean> = {};
      const details: Record<string, CapabilityInfo | null> = {};
      
      for (const id of ids) {
        const capability = capabilityRegistry.get(id);
        results[id] = capability?.state === 'AVAILABLE';
        details[id] = capability || null;
      }
      
      return reply.send({
        success: true,
        results,
        details
      });
      
    } catch (error) {
      logger.error('Failed to check capabilities', { error });
      return reply.code(500).send({
        success: false,
        error: 'Failed to check capabilities'
      });
    }
  });
}

/**
 * Export registry for programmatic access
 */
export { capabilityRegistry, type CapabilityInfo, type CapabilityState };
