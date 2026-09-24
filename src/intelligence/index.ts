/**
 * Guardian Network Module
 * 
 * Production initialization and export
 */

import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import type { FastifyInstance } from 'fastify';
import { GuardianNetworkProductionService } from './services/guardian-network-production.service';
import { registerGuardianNetworkProductionRoutes } from './routes/guardian-network-production.routes';
import { getGuardianNetworkConfig, validateGuardianNetworkConfig } from './config/guardian-network.config.example';
import type { GuardianNetworkConfig } from './guardian-network.types';

export * from './guardian-network.types';
export { PatternAnonymizerService } from './services/pattern-anonymizer.service';
export { GuardianNetworkProductionService } from './services/guardian-network-production.service';
export { GuardianNetworkRepository } from './database/guardian-network.repository';

let guardianNetworkService: GuardianNetworkProductionService | null = null;

/**
 * Initialize Guardian Network with production dependencies
 */
export async function initializeGuardianNetwork(
  pool: Pool,
  redis?: Redis,
  config?: GuardianNetworkConfig
): Promise<GuardianNetworkProductionService> {
  
  // Get or validate config
  const finalConfig = config || getGuardianNetworkConfig();
  
  const validation = validateGuardianNetworkConfig(finalConfig);
  if (!validation.valid) {
    throw new Error(`Invalid Guardian Network configuration: ${validation.errors.join(', ')}`);
  }

  console.log('[GuardianNetwork] Initializing production service...');
  console.log(`[GuardianNetwork] Deployment ID: ${finalConfig.deploymentId}`);
  console.log(`[GuardianNetwork] Industries: ${finalConfig.consumptionSettings.relevantIndustries.join(', ')}`);
  console.log(`[GuardianNetwork] Pattern sharing: ${finalConfig.privacySettings.shareIncidentPatterns ? 'enabled' : 'disabled'}`);

  // Create service instance
  guardianNetworkService = new GuardianNetworkProductionService(
    finalConfig,
    pool,
    redis
  );

  // Setup event handlers
  guardianNetworkService.on('threat-alert', (alert) => {
    console.log(`[GuardianNetwork] 🚨 Threat Alert: ${alert.title}`);
    // Application can listen to this event and take action
  });

  guardianNetworkService.on('pattern-matched', (match) => {
    console.log(`[GuardianNetwork] ✅ Pattern matched for incident ${match.localIncidentId}`);
    // Application can use the intelligence to enhance incident response
  });

  guardianNetworkService.on('intelligence-update', (update) => {
    console.log(`[GuardianNetwork] 📊 Intelligence Update: ${update.title}`);
    // Application can process new intelligence
  });

  guardianNetworkService.on('sync-complete', (stats) => {
    console.log(`[GuardianNetwork] Sync complete. Patterns received: ${stats.benefit.patternsReceived}`);
  });

  console.log('[GuardianNetwork] Initialization complete');

  return guardianNetworkService;
}

/**
 * Register Guardian Network routes with Fastify
 */
export async function registerGuardianNetworkRoutes(
  fastify: FastifyInstance,
  service?: GuardianNetworkProductionService
): Promise<void> {
  
  const serviceToUse = service || guardianNetworkService;
  
  if (!serviceToUse) {
    throw new Error('Guardian Network service not initialized. Call initializeGuardianNetwork() first.');
  }

  await registerGuardianNetworkProductionRoutes(fastify, serviceToUse);
}

/**
 * Get the initialized Guardian Network service
 */
export function getGuardianNetworkService(): GuardianNetworkProductionService {
  if (!guardianNetworkService) {
    throw new Error('Guardian Network service not initialized');
  }
  return guardianNetworkService;
}

/**
 * Graceful shutdown
 */
export async function shutdownGuardianNetwork(): Promise<void> {
  if (guardianNetworkService) {
    await guardianNetworkService.shutdown();
    guardianNetworkService = null;
  }
}

/**
 * Auto-integrate with alert resolution workflow
 * Call this function when an incident is verified and resolved
 */
export async function autoShareVerifiedIncident(incidentId: string): Promise<void> {
  if (!guardianNetworkService) {
    console.warn('[GuardianNetwork] Service not initialized, skipping auto-share');
    return;
  }

  try {
    // This would fetch incident details from your database
    // Placeholder implementation
    console.log(`[GuardianNetwork] Auto-sharing verified incident: ${incidentId}`);
    
    // const incident = await getIncidentDetails(incidentId);
    // await guardianNetworkService.shareIncident(incident);
  } catch (error) {
    console.error('[GuardianNetwork] Auto-share failed:', error);
  }
}

/**
 * Auto-match new incidents against global patterns
 * Call this function when a new alert is created
 */
export async function autoMatchNewIncident(incidentId: string): Promise<void> {
  if (!guardianNetworkService) {
    return;
  }

  try {
    console.log(`[GuardianNetwork] Auto-matching incident: ${incidentId}`);
    
    // This would fetch incident details from your database
    // const incident = await getIncidentDetails(incidentId);
    // const match = await guardianNetworkService.matchIncidentToPatterns(incident);
    
    // if (match) {
    //   // Attach intelligence to the incident
    //   await attachIntelligenceToIncident(incidentId, match);
    //   
    //   // Execute immediate recommended actions
    //   for (const action of match.recommendedActions.filter(a => a.priority === 'immediate')) {
    //     await executeRecommendedAction(incidentId, action);
    //   }
    // }
  } catch (error) {
    console.error('[GuardianNetwork] Auto-match failed:', error);
  }
}
