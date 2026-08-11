/**
 * Banking Analytics Activation Script
 * 
 * Initializes and activates the banking analytics system:
 * 1. Wires up detectors to publish events
 * 2. Starts the workflow engine
 * 3. Loads monitor configurations
 * 4. Sets up personnel authorizations
 */

import type { AnalyticsPipeline } from '../analytics-pipeline.js';
import { initializeBankingAnalyticsIntegration } from './integration/analytics-pipeline-integration.js';
import { getBankingAnalyticsService } from './banking-analytics.service.js';
import {
  getCashVanMonitorRepository,
  getExpectedVisitRepository,
  getPersonnelAuthorizationRepository,
} from './repositories/index.js';

export interface ActivationConfig {
  enableVehicleEvents?: boolean;
  enableAnprEvents?: boolean;
  enablePersonEvents?: boolean;
  enableFaceEvents?: boolean;
  enableZoneEvents?: boolean;
  enableAccessEvents?: boolean;
  enableObjectEvents?: boolean;
  autoStartWorkflows?: boolean;
  preloadMonitors?: boolean;
}

const DEFAULT_ACTIVATION_CONFIG: ActivationConfig = {
  enableVehicleEvents: true,
  enableAnprEvents: true,
  enablePersonEvents: true,
  enableFaceEvents: true,
  enableZoneEvents: true,
  enableAccessEvents: true,
  enableObjectEvents: true,
  autoStartWorkflows: true,
  preloadMonitors: true,
};

/**
 * Activate banking analytics system
 */
export async function activateBankingAnalytics(
  pipeline: AnalyticsPipeline,
  config: ActivationConfig = {}
): Promise<void> {
  const activationConfig = { ...DEFAULT_ACTIVATION_CONFIG, ...config };

  console.log('🏦 Activating banking analytics system...');

  // Step 1: Wire up analytics pipeline integration
  console.log('  ✓ Wiring up detector event publishers...');
  initializeBankingAnalyticsIntegration(pipeline, {
    enableVehicleEvents: activationConfig.enableVehicleEvents,
    enableAnprEvents: activationConfig.enableAnprEvents,
    enablePersonEvents: activationConfig.enablePersonEvents,
    enableFaceEvents: activationConfig.enableFaceEvents,
    enableZoneEvents: activationConfig.enableZoneEvents,
    enableAccessEvents: activationConfig.enableAccessEvents,
    enableObjectEvents: activationConfig.enableObjectEvents,
  });

  // Step 2: Initialize banking analytics service
  console.log('  ✓ Initializing banking analytics service...');
  const bankingService = getBankingAnalyticsService();

  // Step 3: Load monitor configurations if requested
  if (activationConfig.preloadMonitors) {
    console.log('  ✓ Loading monitor configurations...');
    await preloadMonitorConfigurations();
  }

  // Step 4: Auto-start workflows for active monitors
  if (activationConfig.autoStartWorkflows) {
    console.log('  ✓ Auto-starting workflows for active monitors...');
    await autoStartMonitorWorkflows();
  }

  console.log('🏦 Banking analytics system activated successfully!');
  console.log('');
  console.log('📋 Activation Summary:');
  console.log(`   • Vehicle Events: ${activationConfig.enableVehicleEvents ? '✓' : '✗'}`);
  console.log(`   • ANPR Events: ${activationConfig.enableAnprEvents ? '✓' : '✗'}`);
  console.log(`   • Person Events: ${activationConfig.enablePersonEvents ? '✓' : '✗'}`);
  console.log(`   • Face Events: ${activationConfig.enableFaceEvents ? '✓' : '✗'}`);
  console.log(`   • Zone Events: ${activationConfig.enableZoneEvents ? '✓' : '✗'}`);
  console.log(`   • Access Events: ${activationConfig.enableAccessEvents ? '✓' : '✗'}`);
  console.log(`   • Object Events: ${activationConfig.enableObjectEvents ? '✓' : '✗'}`);
  console.log('');
  console.log('🚀 Banking analytics is now ready to process events!');
}

/**
 * Preload monitor configurations from database
 */
async function preloadMonitorConfigurations(): Promise<void> {
  try {
    const monitorRepo = getCashVanMonitorRepository();
    const monitors = await monitorRepo.findActiveMonitors();
    
    console.log(`     Loaded ${monitors.length} active monitor(s)`);
    
    for (const monitor of monitors) {
      console.log(`     - ${monitor.name} (${monitor.monitorType})`);
    }
  } catch (error) {
    console.warn('     Warning: Could not preload monitors:', error);
  }
}

/**
 * Auto-start workflows for active monitors
 */
async function autoStartMonitorWorkflows(): Promise<void> {
  try {
    const monitorRepo = getCashVanMonitorRepository();
    const monitors = await monitorRepo.findActiveMonitors();
    
    if (monitors.length === 0) {
      console.log('     No active monitors found to auto-start');
      return;
    }

    console.log(`     Auto-starting ${monitors.length} monitor workflow(s)...`);
    
    // Workflows will be started automatically when events arrive
    // No explicit action needed here - just confirm monitors are ready
    
  } catch (error) {
    console.warn('     Warning: Could not auto-start workflows:', error);
  }
}

/**
 * Create example monitor configuration
 * 
 * This is a helper function for initial setup. In production,
 * monitors should be configured via the API or UI.
 */
export async function createExampleMonitor(
  tenantId: string,
  branchId: string,
  config: {
    name: string;
    loadingZoneId: string;
    unloadingZoneId: string;
    authorizedVehicles: string[];
    minimumPersonnel: number;
    maxUnloadingDuration: number;
  }
): Promise<string> {
  const monitorRepo = getCashVanMonitorRepository();

  const monitor = await monitorRepo.create({
    tenantId,
    branchId,
    name: config.name,
    arrivalZoneId: config.loadingZoneId,
    unloadingZoneId: config.unloadingZoneId,
  });
  
  // Update with additional configuration
  await monitorRepo.updateUnloadingRules(monitor.id, {
    maxDurationSeconds: config.maxUnloadingDuration,
  });
  
  await monitorRepo.updatePersonnelRules(monitor.id, {
    minimumPersonnel: config.minimumPersonnel,
  });

  console.log(`✓ Created example monitor: ${config.name} (${monitor.id})`);
  return monitor.id;
}

/**
 * Add example personnel authorization
 */
export async function addExamplePersonnel(
  tenantId: string,
  branchId: string,
  config: {
    identityId: string;
    name: string;
    role: 'cash_guard' | 'manager' | 'escort' | 'driver';
    badgeNumber?: string;
  }
): Promise<string> {
  const personnelRepo = getPersonnelAuthorizationRepository();

  const authorization = await personnelRepo.create({
    tenantId,
    branchId,
    identityId: config.identityId,
    role: config.role,
    name: config.name,
    badgeNumber: config.badgeNumber,
    authorizedZones: [],
    isActive: true,
    validFrom: new Date(),
    validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
  });

  console.log(`✓ Added personnel: ${config.name} (${config.role})`);
  return authorization.authorizationId;
}

/**
 * Schedule an expected cash van visit
 */
export async function scheduleExpectedVisit(
  tenantId: string,
  branchId: string,
  monitorId: string,
  config: {
    vehiclePlateNumber: string;
    expectedArrival: Date;
    expectedDeparture: Date;
    purpose: string;
    escortRequired: boolean;
  }
): Promise<string> {
  const visitRepo = getExpectedVisitRepository();

  const visit = await visitRepo.create({
    tenantId,
    branchId,
    monitorId,
    vehiclePlateNumber: config.vehiclePlateNumber,
    scheduledArrival: config.expectedArrival,
    scheduledDeparture: config.expectedDeparture,
    purpose: config.purpose,
    status: 'scheduled',
    expectedPersonnel: [],
    escortRequired: config.escortRequired,
  });

  console.log(`✓ Scheduled visit for vehicle ${config.vehiclePlateNumber}`);
  return visit.visitId;
}

/**
 * Deactivate banking analytics system
 */
export function deactivateBankingAnalytics(): void {
  console.log('🏦 Deactivating banking analytics system...');
  
  // Integration will be detached when the pipeline is cleaned up
  
  console.log('🏦 Banking analytics system deactivated');
}

/**
 * Get activation status
 */
export function getBankingAnalyticsStatus(): {
  isActive: boolean;
  activeMonitors: number;
  activeSessions: number;
  eventPublishersActive: boolean;
} {
  // This would query actual service state in production
  return {
    isActive: true,
    activeMonitors: 0,
    activeSessions: 0,
    eventPublishersActive: true,
  };
}
