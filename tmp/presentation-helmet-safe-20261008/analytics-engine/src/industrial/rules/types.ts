/**
 * Industrial Rule Types
 * 
 * Type definitions for industrial safety and compliance rules
 */

import type { TrackedEquipment } from '../../tracking/equipment-tracker.js';
import type { TrackedPerson, SceneSnapshot, Zone } from '../../tracking/scene-state.js';
import type { IndustrialEquipmentType } from '../../inference/model-manifest.js';

// ============================================================================
// Rule Context
// ============================================================================

/**
 * Context passed to rule evaluators
 */
export interface IndustrialRuleContext {
  scene: SceneSnapshot;
  zones: Zone[];
  cameraId: string;
  tenantId: string;
  branchId?: string;
  timestamp: Date;
  config: IndustrialConfig;
}

/**
 * Industrial analytics configuration
 */
export interface IndustrialConfig {
  // Proximity settings
  minPersonEquipmentDistance: number; // pixels
  minPersonEquipmentDistanceMeters?: number; // if camera calibrated
  
  // Zone settings
  enforceZoneRestrictions: boolean;
  
  // Idle detection
  idleTimeThreshold: number; // seconds
  stationaryTimeThreshold: number; // seconds
  
  // Speed limits
  maxEquipmentSpeed?: number; // pixels/second
  maxEquipmentSpeedMeters?: number; // meters/second if calibrated
  
  // Missing equipment detection
  expectedEquipment?: Array<{
    type: IndustrialEquipmentType;
    minCount: number;
    maxCount?: number;
    zones?: string[];
  }>;
  
  // Operating hours
  operatingHours?: {
    start: string; // HH:MM
    end: string; // HH:MM
  };
}

// ============================================================================
// Violation Types
// ============================================================================

/**
 * Base violation interface
 */
export interface IndustrialViolation {
  id?: string;
  type: IndustrialViolationType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  timestamp: Date;
  
  cameraId: string;
  tenantId: string;
  branchId?: string;
  
  // Involved objects
  equipmentTrackIds?: string[];
  personTrackIds?: string[];
  zoneIds?: string[];
  
  // Details
  description: string;
  evidence?: ViolationEvidence;
  
  // Temporal state (for state tracking)
  firstObservedAt?: Date;
  consecutiveFrames?: number;
}

/**
 * Violation types
 */
export type IndustrialViolationType =
  | 'unsafe_proximity'
  | 'equipment_restricted_zone'
  | 'person_restricted_zone'
  | 'equipment_idle_too_long'
  | 'equipment_missing'
  | 'equipment_unauthorized'
  | 'equipment_speed_violation'
  | 'equipment_wrong_direction'
  | 'unattended_running_equipment'
  | 'person_without_ppe_near_equipment'
  | 'equipment_pedestrian_zone';

/**
 * Evidence for violation
 */
export interface ViolationEvidence {
  distance?: number;
  distanceMeters?: number;
  speed?: number;
  speedMeters?: number;
  idleTime?: number;
  equipmentType?: IndustrialEquipmentType;
  zoneName?: string;
  zoneType?: string;
  
  // Spatial details
  equipmentBbox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  
  personBbox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

// ============================================================================
// Rule Interface
// ============================================================================

/**
 * Base rule interface
 */
export interface IndustrialRule {
  id: string;
  name: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  
  /**
   * Evaluate rule against current scene
   */
  evaluate(context: IndustrialRuleContext): Promise<IndustrialViolation[]>;
  
  /**
   * Check if rule is applicable given current config
   */
  isApplicable(config: IndustrialConfig): boolean;
}

// ============================================================================
// Rule State (for temporal rules)
// ============================================================================

/**
 * State for tracking violations over time
 */
export interface RuleState {
  ruleId: string;
  key: string; // Unique key for the violation instance
  firstObservedAt: Date;
  lastObservedAt: Date;
  consecutiveFrames: number;
  confirmed: boolean;
}

/**
 * Rule state manager for temporal confirmation
 */
export class RuleStateManager {
  private states = new Map<string, RuleState>();
  
  /**
   * Update or create state
   */
  updateState(
    ruleId: string,
    key: string,
    timestamp: Date
  ): RuleState {
    const stateKey = `${ruleId}:${key}`;
    
    const existing = this.states.get(stateKey);
    if (existing) {
      existing.lastObservedAt = timestamp;
      existing.consecutiveFrames++;
      return existing;
    }
    
    const newState: RuleState = {
      ruleId,
      key,
      firstObservedAt: timestamp,
      lastObservedAt: timestamp,
      consecutiveFrames: 1,
      confirmed: false,
    };
    
    this.states.set(stateKey, newState);
    return newState;
  }
  
  /**
   * Get state
   */
  getState(ruleId: string, key: string): RuleState | undefined {
    return this.states.get(`${ruleId}:${key}`);
  }
  
  /**
   * Remove state
   */
  removeState(ruleId: string, key: string): boolean {
    return this.states.delete(`${ruleId}:${key}`);
  }
  
  /**
   * Clear old states (not seen recently)
   */
  clearOldStates(olderThan: Date): number {
    let removed = 0;
    
    for (const [key, state] of this.states.entries()) {
      if (state.lastObservedAt < olderThan) {
        this.states.delete(key);
        removed++;
      }
    }
    
    return removed;
  }
  
  /**
   * Clear all states
   */
  clearAll(): void {
    this.states.clear();
  }
  
  /**
   * Get statistics
   */
  getStatistics() {
    return {
      totalStates: this.states.size,
      confirmedStates: Array.from(this.states.values()).filter(
        (s) => s.confirmed
      ).length,
    };
  }
}
