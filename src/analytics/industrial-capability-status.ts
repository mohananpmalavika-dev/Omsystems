/**
 * Industrial Capability Status Integration
 * 
 * Bridges the capability catalog with runtime health checking.
 * Maps catalog capability IDs to actual inference/tracker/rule availability.
 */

import { AI_CAPABILITIES, type AiCapability } from './capability-catalog.js';
import type { IndustrialHealthSummary } from '../../analytics-engine/src/industrial/capability-health.js';

// ============================================================================
// Types
// ============================================================================

export interface CapabilityRuntimeStatus extends AiCapability {
  available: boolean;
  reason?: string;
  dependencies?: string[];
  modelDeployed?: boolean;
  lastCheckedAt?: Date;
}

// ============================================================================
// Capability Mapping
// ============================================================================

/**
 * Map catalog capabilities to runtime health status
 */
export function mapIndustrialCapabilityStatus(
  health: IndustrialHealthSummary
): Map<string, CapabilityRuntimeStatus> {
  const statusMap = new Map<string, CapabilityRuntimeStatus>();

  // Get all industrial capabilities from catalog
  const industrialCaps = AI_CAPABILITIES.filter(
    (cap) => cap.domainId === 'industrial'
  );

  // Equipment detection capabilities (require model)
  const equipmentTypes = [
    'forklift',
    'pallet-jack',
    'reach-truck',
    'crane',
    'overhead-crane',
    'excavator',
    'bulldozer',
    'loader',
    'conveyor-belt',
    'cnc-machine',
    'agv',
    'robot-arm',
  ];

  for (const type of equipmentTypes) {
    const cap = industrialCaps.find((c) => c.id === type);
    if (cap) {
      statusMap.set(type, {
        ...cap,
        available: health.capabilities.equipment_detection.available,
        reason: health.capabilities.equipment_detection.reason,
        modelDeployed: health.capabilities.equipment_detection.available,
        dependencies: ['industrial_equipment_detection'],
        lastCheckedAt: health.lastCheckedAt,
      });
    }
  }

  // Tracking capabilities (depend on detection)
  const trackingCaps = [
    'equipment-tracking',
    'equipment-velocity',
    'equipment-trajectory',
    'machine-running',
    'machine-idle',
    'machine-stationary',
  ];

  for (const id of trackingCaps) {
    const cap = industrialCaps.find((c) => c.id === id);
    if (cap) {
      statusMap.set(id, {
        ...cap,
        available: health.capabilities.equipment_tracking.available,
        reason: health.capabilities.equipment_tracking.reason,
        dependencies: ['equipment_detection', 'tracker'],
        lastCheckedAt: health.lastCheckedAt,
      });
    }
  }

  // Safety analytics capabilities
  const safetyCaps = [
    {
      id: 'unsafe-proximity',
      healthKey: 'proximity_detection' as const,
      deps: ['equipment_tracking', 'person_detection', 'proximity_rule'],
    },
    {
      id: 'equipment-restricted-zone',
      healthKey: 'zone_violation_detection' as const,
      deps: ['equipment_tracking', 'zone_violation_rule'],
    },
    {
      id: 'person-equipment-zone',
      healthKey: 'zone_violation_detection' as const,
      deps: ['equipment_tracking', 'person_detection', 'zone_violation_rule'],
    },
    {
      id: 'equipment-idle-too-long',
      healthKey: 'idle_detection' as const,
      deps: ['equipment_tracking', 'idle_detection_rule'],
    },
    {
      id: 'restricted-machinery-zone',
      healthKey: 'zone_violation_detection' as const,
      deps: ['equipment_tracking', 'zone_violation_rule'],
    },
    {
      id: 'worker-near-hazard',
      healthKey: 'proximity_detection' as const,
      deps: ['equipment_tracking', 'person_detection', 'proximity_rule'],
    },
    {
      id: 'equipment-pedestrian-zone',
      healthKey: 'zone_violation_detection' as const,
      deps: ['equipment_tracking', 'zone_violation_rule'],
    },
  ];

  for (const { id, healthKey, deps } of safetyCaps) {
    const cap = industrialCaps.find((c) => c.id === id);
    if (cap) {
      const capHealth = health.capabilities[healthKey];
      statusMap.set(id, {
        ...cap,
        available: capHealth.available,
        reason: capHealth.reason,
        dependencies: deps,
        lastCheckedAt: health.lastCheckedAt,
      });
    }
  }

  // Other capabilities (require additional models/config)
  const otherCaps = ['conveyor-blockage', 'fall-from-height', 'smoke-near-machine'];

  for (const id of otherCaps) {
    const cap = industrialCaps.find((c) => c.id === id);
    if (cap) {
      statusMap.set(id, {
        ...cap,
        available: false, // Not yet implemented in v2.0
        reason: 'Feature not yet implemented in current architecture',
        lastCheckedAt: health.lastCheckedAt,
      });
    }
  }

  return statusMap;
}

/**
 * Get industrial capabilities grouped by availability
 */
export function groupIndustrialCapabilitiesByStatus(
  health: IndustrialHealthSummary
): {
  available: CapabilityRuntimeStatus[];
  unavailable: CapabilityRuntimeStatus[];
  degraded: CapabilityRuntimeStatus[];
} {
  const statusMap = mapIndustrialCapabilityStatus(health);
  const capabilities = Array.from(statusMap.values());

  return {
    available: capabilities.filter((c) => c.available),
    unavailable: capabilities.filter((c) => !c.available),
    degraded: [], // Could add degraded logic based on dependencies
  };
}

/**
 * Get capability availability percentage
 */
export function getIndustrialCapabilityAvailability(
  health: IndustrialHealthSummary
): {
  total: number;
  available: number;
  percentage: number;
} {
  const statusMap = mapIndustrialCapabilityStatus(health);
  const capabilities = Array.from(statusMap.values());
  const available = capabilities.filter((c) => c.available).length;

  return {
    total: capabilities.length,
    available,
    percentage: capabilities.length > 0 ? (available / capabilities.length) * 100 : 0,
  };
}

/**
 * Check if a specific capability is available
 */
export function isIndustrialCapabilityAvailable(
  capabilityId: string,
  health: IndustrialHealthSummary
): boolean {
  const statusMap = mapIndustrialCapabilityStatus(health);
  const status = statusMap.get(capabilityId);
  return status?.available ?? false;
}

/**
 * Get human-readable status summary
 */
export function getIndustrialStatusSummary(
  health: IndustrialHealthSummary
): {
  overallStatus: string;
  message: string;
  details: string[];
  recommendations: string[];
} {
  const { available, total, percentage } = getIndustrialCapabilityAvailability(health);

  let overallStatus = 'Unavailable';
  let message = 'Industrial analytics is unavailable';
  const details: string[] = [];
  const recommendations: string[] = [];

  if (percentage === 100) {
    overallStatus = 'Healthy';
    message = 'All industrial analytics capabilities are available';
  } else if (percentage >= 50) {
    overallStatus = 'Degraded';
    message = `${available} of ${total} industrial capabilities available (${percentage.toFixed(0)}%)`;
  } else if (percentage > 0) {
    overallStatus = 'Limited';
    message = `Only ${available} of ${total} industrial capabilities available (${percentage.toFixed(0)}%)`;
  } else {
    message = 'No industrial analytics capabilities available';
  }

  // Add health details
  if (!health.capabilities.equipment_detection.available) {
    details.push('Equipment detection unavailable - model not deployed');
    recommendations.push(
      'Deploy equipment detection model to INDUSTRIAL_EQUIPMENT_MODEL_PATH'
    );
  }

  if (!health.capabilities.proximity_detection.available) {
    details.push('Proximity detection unavailable');
    if (!health.capabilities.equipment_tracking.available) {
      details.push('  → Equipment tracking unavailable');
    }
    const personDep = health.capabilities.proximity_detection.dependencies?.find(
      (d) => d.name === 'person_detection'
    );
    if (personDep && !personDep.available) {
      details.push('  → Person detection unavailable');
      recommendations.push('Enable person detection for proximity analytics');
    }
  }

  if (health.degradationReasons.length > 0) {
    details.push(...health.degradationReasons);
  }

  return {
    overallStatus,
    message,
    details,
    recommendations,
  };
}
