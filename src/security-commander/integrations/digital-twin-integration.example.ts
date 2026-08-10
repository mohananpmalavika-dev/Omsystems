/**
 * Digital Twin Integration Examples
 * Demonstrates how to use Digital Twin bridge with Security Commander
 */

import { Pool } from 'pg';
import { DigitalTwinBridge } from './digital-twin-bridge';
import { EnhancedRootCauseService } from './enhanced-root-cause.service';
import type { SecurityIncident, SecurityEvent } from '../types';

/**
 * Example 1: Initialize Digital Twin bridge
 */
async function initializeDigitalTwin() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'security_commander',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
  });

  const digitalTwinBridge = new DigitalTwinBridge(pool);
  const rootCauseService = new EnhancedRootCauseService(digitalTwinBridge);

  console.log('Digital Twin bridge initialized');

  return { digitalTwinBridge, rootCauseService, pool };
}

/**
 * Example 2: Analyze incident with Digital Twin context
 */
async function analyzeIncidentWithDigitalTwin(
  incident: SecurityIncident,
  events: SecurityEvent[]
) {
  const { digitalTwinBridge, rootCauseService } = await initializeDigitalTwin();

  // Perform enhanced root cause analysis
  const rootCause = await rootCauseService.analyzeRootCause(incident, events);

  console.log('Root Cause Analysis:');
  console.log('------------------');
  console.log(`Primary Event Type: ${rootCause.primaryEventType}`);
  console.log(`Confidence: ${rootCause.confidence}%`);
  console.log(`Explanation: ${rootCause.explanation}`);
  
  if (rootCause.dependencyAnalysis) {
    console.log('\nDependency Analysis:');
    console.log(`Common Dependencies: ${rootCause.dependencyAnalysis.commonDependencies.length}`);
    rootCause.dependencyAnalysis.commonDependencies.forEach((dep) => {
      console.log(`  - ${dep.asset_type}: ${dep.name} (health: ${dep.health_score})`);
    });

    if (rootCause.dependencyAnalysis.singlePointsOfFailure.length > 0) {
      console.log('\nSingle Points of Failure:');
      rootCause.dependencyAnalysis.singlePointsOfFailure.forEach((spof) => {
        console.log(`  - ${spof}`);
      });
    }

    if (rootCause.dependencyAnalysis.blastRadius) {
      const br = rootCause.dependencyAnalysis.blastRadius;
      console.log('\nBlast Radius:');
      console.log(`  Total Affected: ${br.total_affected}`);
      console.log(`  By Type:`, br.by_type);
      console.log(`  Operational Impact: ${br.business_impact.operational_impact}`);
      console.log(`  Coverage Loss: ${br.business_impact.coverage_loss}`);
    }

    console.log('\nDependency Chain:');
    rootCause.dependencyAnalysis.topologyContext.dependencyChain.forEach((link, idx) => {
      console.log(`  ${idx + 1}. ${link}`);
    });
  }

  console.log('\nContributing Factors:');
  rootCause.contributingFactors.forEach((factor) => {
    console.log(`  - ${factor}`);
  });

  return rootCause;
}

/**
 * Example 3: Calculate blast radius for a network switch failure
 */
async function calculateSwitchBlastRadius(switchId: string) {
  const { digitalTwinBridge } = await initializeDigitalTwin();

  const blastRadius = await digitalTwinBridge.calculateBlastRadius(switchId);

  if (!blastRadius) {
    console.log(`Asset ${switchId} not found in Digital Twin`);
    return;
  }

  console.log(`Blast Radius Analysis for ${blastRadius.source_asset.name}`);
  console.log('='.repeat(60));
  console.log(`Asset Type: ${blastRadius.source_asset.asset_type}`);
  console.log(`Current Status: ${blastRadius.source_asset.status}`);
  console.log(`Health Score: ${blastRadius.source_asset.health_score}/100`);
  console.log();
  console.log(`Total Affected Assets: ${blastRadius.total_affected}`);
  console.log();
  console.log('Breakdown by Type:');
  Object.entries(blastRadius.by_type).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });
  console.log();
  console.log('Business Impact:');
  console.log(`  Coverage Loss: ${blastRadius.business_impact.coverage_loss}`);
  console.log(`  Operational Impact: ${blastRadius.business_impact.operational_impact}`);
  console.log(`  Estimated Downtime: ${blastRadius.business_impact.estimated_downtime}`);
  
  if (blastRadius.business_impact.affected_zones?.length) {
    console.log(`  Affected Zones: ${blastRadius.business_impact.affected_zones.join(', ')}`);
  }

  if (blastRadius.critical_services.length > 0) {
    console.log();
    console.log('Critical Services Affected:');
    blastRadius.critical_services.forEach((service) => {
      console.log(`  - ${service}`);
    });
  }

  return blastRadius;
}

/**
 * Example 4: Find common root cause for multiple camera failures
 */
async function findCommonRootCause(cameraIds: string[]) {
  const { digitalTwinBridge } = await initializeDigitalTwin();

  const commonDeps = await digitalTwinBridge.findCommonDependency(cameraIds);

  console.log(`Analyzing ${cameraIds.length} cameras for common dependencies...`);
  console.log();

  if (commonDeps.length === 0) {
    console.log('No common dependencies found. Cameras may be on different network segments.');
    return;
  }

  console.log(`Found ${commonDeps.length} common dependencies:`);
  commonDeps.forEach((dep) => {
    console.log(`  - ${dep.asset_type}: ${dep.name}`);
    console.log(`    Status: ${dep.status}`);
    console.log(`    Health: ${dep.health_score}/100`);
    console.log(`    Security: ${dep.security_score}/100`);
    console.log();
  });

  // Check if any are single points of failure
  for (const dep of commonDeps) {
    const isSPOF = await digitalTwinBridge.isSinglePointOfFailure(dep.id);
    if (isSPOF) {
      console.log(`⚠️  WARNING: ${dep.name} is a Single Point of Failure!`);
      console.log('   Consider adding redundancy to this asset.');
      console.log();
    }
  }

  return commonDeps;
}

/**
 * Example 5: Get local topology around an asset
 */
async function getAssetTopology(assetId: string, depth: number = 2) {
  const { digitalTwinBridge } = await initializeDigitalTwin();

  const topology = await digitalTwinBridge.getLocalTopology(assetId, depth);

  console.log(`Topology around ${assetId} (depth: ${depth})`);
  console.log('='.repeat(60));
  console.log(`Nodes: ${topology.nodes.length}`);
  console.log(`Edges: ${topology.edges.length}`);
  console.log();

  // Group nodes by type
  const nodesByType = new Map<string, typeof topology.nodes>();
  topology.nodes.forEach((node) => {
    if (!nodesByType.has(node.asset_type)) {
      nodesByType.set(node.asset_type, []);
    }
    nodesByType.get(node.asset_type)!.push(node);
  });

  console.log('Assets:');
  nodesByType.forEach((nodes, type) => {
    console.log(`  ${type} (${nodes.length}):`);
    nodes.slice(0, 5).forEach((node) => {
      console.log(`    - ${node.name} [${node.status}]`);
    });
    if (nodes.length > 5) {
      console.log(`    ... and ${nodes.length - 5} more`);
    }
  });

  console.log();
  console.log('Relationships:');
  const relsByType = new Map<string, number>();
  topology.edges.forEach((edge) => {
    relsByType.set(edge.relationship_type, (relsByType.get(edge.relationship_type) || 0) + 1);
  });
  relsByType.forEach((count, type) => {
    console.log(`  ${type}: ${count}`);
  });

  return topology;
}

/**
 * Example 6: Real-world scenario - Network switch failure investigation
 */
async function investigateNetworkSwitchFailure() {
  console.log('Scenario: Network switch "SW-Floor3" has gone offline');
  console.log('Investigating impact and root cause...');
  console.log('='.repeat(60));
  console.log();

  const switchId = 'switch_floor3';
  const { digitalTwinBridge } = await initializeDigitalTwin();

  // Step 1: Get the switch asset
  const switchAsset = await digitalTwinBridge.getAsset(switchId);
  if (!switchAsset) {
    console.log('Switch not found in Digital Twin');
    return;
  }

  console.log('Switch Information:');
  console.log(`  Name: ${switchAsset.name}`);
  console.log(`  Status: ${switchAsset.status}`);
  console.log(`  Health: ${switchAsset.health_score}/100`);
  console.log();

  // Step 2: Calculate blast radius
  console.log('Calculating blast radius...');
  const blastRadius = await digitalTwinBridge.calculateBlastRadius(switchId);
  
  if (blastRadius) {
    console.log(`  ${blastRadius.total_affected} assets affected`);
    console.log(`  ${blastRadius.by_type.camera || 0} cameras offline`);
    console.log(`  Impact: ${blastRadius.business_impact.operational_impact}`);
    console.log();
  }

  // Step 3: Check dependencies
  console.log('Checking dependencies...');
  const dependencies = await digitalTwinBridge.getDependencies(switchId);
  console.log(`  Switch depends on ${dependencies.length} upstream assets`);
  dependencies.forEach((dep) => {
    console.log(`    - ${dep.depends_on_id} (path length: ${dep.path_length})`);
  });
  console.log();

  // Step 4: Check if SPOF
  const isSPOF = await digitalTwinBridge.isSinglePointOfFailure(switchId);
  if (isSPOF) {
    console.log('⚠️  This switch is a SINGLE POINT OF FAILURE');
    console.log('  Recommendation: Install redundant switch with failover capability');
  } else {
    console.log('✓ Redundancy available through alternate paths');
  }
  console.log();

  // Step 5: Get local topology
  console.log('Analyzing local topology...');
  const topology = await digitalTwinBridge.getLocalTopology(switchId, 2);
  console.log(`  ${topology.nodes.length} assets in local topology`);
  console.log(`  ${topology.edges.length} relationships mapped`);
  console.log();

  console.log('Investigation Summary:');
  console.log('  Root Cause: Network switch failure (SW-Floor3)');
  console.log(`  Affected Assets: ${blastRadius?.total_affected || 0}`);
  console.log(`  Business Impact: ${blastRadius?.business_impact.operational_impact || 'unknown'}`);
  console.log('  Recommendation: Replace/repair switch immediately');
  if (isSPOF) {
    console.log('  Long-term: Implement redundant network architecture');
  }
}

/**
 * Example 7: Integrate with Investigation Service
 */
async function enhanceInvestigationWithDigitalTwin(investigationId: string) {
  // This would be called from InvestigationService
  const { digitalTwinBridge, rootCauseService } = await initializeDigitalTwin();

  // Simulated incident and events
  const incident: SecurityIncident = {
    id: 'inc_001',
    incidentType: 'network_cascade_failure',
    title: 'Multiple Camera Offline',
    description: 'Multiple cameras went offline simultaneously',
    severity: 85,
    confidence: 80,
    timestamp: new Date(),
    events: ['evt_001', 'evt_002', 'evt_003'],
    affectedAssets: ['camera_301', 'camera_302', 'camera_303'],
    correlationFingerprint: 'network_cascade_floor3',
  };

  const events: SecurityEvent[] = [
    {
      id: 'evt_001',
      eventType: 'camera_offline',
      timestamp: new Date(),
      source: 'camera',
      assetId: 'camera_301',
      severity: 75,
      description: 'Camera went offline',
    },
    {
      id: 'evt_002',
      eventType: 'camera_offline',
      timestamp: new Date(Date.now() + 1000),
      source: 'camera',
      assetId: 'camera_302',
      severity: 75,
      description: 'Camera went offline',
    },
    {
      id: 'evt_003',
      eventType: 'camera_offline',
      timestamp: new Date(Date.now() + 2000),
      source: 'camera',
      assetId: 'camera_303',
      severity: 75,
      description: 'Camera went offline',
    },
  ];

  // Perform enhanced analysis
  const rootCause = await rootCauseService.analyzeRootCause(incident, events);

  console.log('Enhanced Investigation Report');
  console.log('='.repeat(60));
  console.log(`Investigation ID: ${investigationId}`);
  console.log(`Incident: ${incident.title}`);
  console.log();
  console.log('Root Cause Analysis:');
  console.log(`  ${rootCause.explanation}`);
  console.log();
  console.log(`  Confidence: ${rootCause.confidence}%`);
  console.log(`  Primary Event: ${rootCause.primaryEventType}`);
  
  if (rootCause.dependencyAnalysis?.blastRadius) {
    console.log();
    console.log('Impact Assessment:');
    console.log(`  Total Affected: ${rootCause.dependencyAnalysis.blastRadius.total_affected}`);
    console.log(`  Downtime Estimate: ${rootCause.dependencyAnalysis.blastRadius.business_impact.estimated_downtime}`);
  }

  return rootCause;
}

// Export all examples
export {
  initializeDigitalTwin,
  analyzeIncidentWithDigitalTwin,
  calculateSwitchBlastRadius,
  findCommonRootCause,
  getAssetTopology,
  investigateNetworkSwitchFailure,
  enhanceInvestigationWithDigitalTwin,
};

// Run example if executed directly
if (require.main === module) {
  investigateNetworkSwitchFailure()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Error:', error);
      process.exit(1);
    });
}
