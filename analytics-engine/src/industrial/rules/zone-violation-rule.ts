/**
 * Zone Violation Rules
 * 
 * Detects when equipment or persons enter restricted/unauthorized zones.
 * Supports:
 * - Equipment in pedestrian-only zones
 * - Persons in equipment-only zones
 * - Unauthorized equipment in restricted zones
 */

import type {
  IndustrialRule,
  IndustrialRuleContext,
  IndustrialViolation,
  IndustrialConfig,
} from './types.js';
import type { Zone } from '../../tracking/scene-state.js';
import type { TrackedEquipment } from '../../tracking/equipment-tracker.js';
import type { TrackedPerson } from '../../tracking/scene-state.js';
import { RuleStateManager } from './types.js';

// ============================================================================
// Equipment in Restricted Zone Rule
// ============================================================================

export class EquipmentRestrictedZoneRule implements IndustrialRule {
  id = 'equipment_restricted_zone';
  name = 'Equipment in Restricted Zone';
  description = 'Detects equipment entering restricted or unauthorized zones';
  severity: 'high' = 'high';
  
  private stateManager = new RuleStateManager();
  private readonly CONFIRMATION_FRAMES = 5;
  private readonly CONFIRMATION_DURATION_MS = 1500;
  
  isApplicable(config: IndustrialConfig): boolean {
    return config.enforceZoneRestrictions;
  }
  
  async evaluate(context: IndustrialRuleContext): Promise<IndustrialViolation[]> {
    const violations: IndustrialViolation[] = [];
    const { scene, zones, timestamp } = context;
    
    // Find restricted zones
    const restrictedZones = zones.filter(
      (z) => z.type === 'restricted_zone' || z.type === 'pedestrian_only'
    );
    
    for (const equipment of scene.equipment) {
      // Get equipment position (bottom-center)
      const position = {
        x: equipment.bbox.x + equipment.bbox.width / 2,
        y: equipment.bbox.y + equipment.bbox.height,
      };
      
      for (const zone of restrictedZones) {
        if (this.isPointInZone(position, zone)) {
          // Check if equipment is permitted in this zone
          if (
            zone.type === 'restricted_zone' &&
            zone.permittedEquipment?.includes(equipment.equipmentType)
          ) {
            continue; // Allowed
          }
          
          // Track state
          const stateKey = `${equipment.trackId}_${zone.id}`;
          const state = this.stateManager.updateState(
            this.id,
            stateKey,
            timestamp
          );
          
          const duration = timestamp.getTime() - state.firstObservedAt.getTime();
          
          if (
            state.consecutiveFrames >= this.CONFIRMATION_FRAMES &&
            duration >= this.CONFIRMATION_DURATION_MS &&
            !state.confirmed
          ) {
            state.confirmed = true;
            
            const violationType =
              zone.type === 'pedestrian_only'
                ? 'equipment_pedestrian_zone'
                : 'equipment_restricted_zone';
            
            violations.push({
              type: violationType,
              severity: this.severity,
              confidence: Math.min(equipment.confidence + 0.1, 1.0),
              timestamp,
              
              cameraId: context.cameraId,
              tenantId: context.tenantId,
              branchId: context.branchId,
              
              equipmentTrackIds: [equipment.trackId],
              zoneIds: [zone.id],
              
              description: `${equipment.equipmentType} entered ${zone.type.replace('_', ' ')} "${zone.name}"`,
              
              evidence: {
                equipmentType: equipment.equipmentType,
                zoneName: zone.name,
                zoneType: zone.type,
                equipmentBbox: equipment.bbox,
              },
              
              firstObservedAt: state.firstObservedAt,
              consecutiveFrames: state.consecutiveFrames,
            });
          }
        }
      }
    }
    
    // Clean up old states
    const fiveSecondsAgo = new Date(timestamp.getTime() - 5000);
    this.stateManager.clearOldStates(fiveSecondsAgo);
    
    return violations;
  }
  
  private isPointInZone(
    point: { x: number; y: number },
    zone: Zone
  ): boolean {
    let inside = false;
    const polygon = zone.polygon;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i]!.x;
      const yi = polygon[i]!.y;
      const xj = polygon[j]!.x;
      const yj = polygon[j]!.y;
      
      const intersect =
        yi > point.y !== yj > point.y &&
        point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
      
      if (intersect) inside = !inside;
    }
    
    return inside;
  }
}

// ============================================================================
// Person in Equipment-Only Zone Rule
// ============================================================================

export class PersonEquipmentZoneRule implements IndustrialRule {
  id = 'person_restricted_zone';
  name = 'Person in Equipment-Only Zone';
  description = 'Detects persons entering equipment-only zones';
  severity: 'high' = 'high';
  
  private stateManager = new RuleStateManager();
  private readonly CONFIRMATION_FRAMES = 5;
  private readonly CONFIRMATION_DURATION_MS = 1500;
  
  isApplicable(config: IndustrialConfig): boolean {
    return config.enforceZoneRestrictions;
  }
  
  async evaluate(context: IndustrialRuleContext): Promise<IndustrialViolation[]> {
    const violations: IndustrialViolation[] = [];
    const { scene, zones, timestamp } = context;
    
    // Find equipment-only zones
    const equipmentZones = zones.filter(
      (z) => z.type === 'equipment_only' || z.type === 'hazard_zone'
    );
    
    for (const person of scene.persons) {
      const position = {
        x: person.bbox.x + person.bbox.width / 2,
        y: person.bbox.y + person.bbox.height,
      };
      
      for (const zone of equipmentZones) {
        if (this.isPointInZone(position, zone)) {
          const stateKey = `${person.trackId}_${zone.id}`;
          const state = this.stateManager.updateState(
            this.id,
            stateKey,
            timestamp
          );
          
          const duration = timestamp.getTime() - state.firstObservedAt.getTime();
          
          if (
            state.consecutiveFrames >= this.CONFIRMATION_FRAMES &&
            duration >= this.CONFIRMATION_DURATION_MS &&
            !state.confirmed
          ) {
            state.confirmed = true;
            
            violations.push({
              type: 'person_restricted_zone',
              severity: zone.type === 'hazard_zone' ? 'critical' : 'high',
              confidence: Math.min(person.confidence + 0.1, 1.0),
              timestamp,
              
              cameraId: context.cameraId,
              tenantId: context.tenantId,
              branchId: context.branchId,
              
              personTrackIds: [person.trackId],
              zoneIds: [zone.id],
              
              description: `Worker entered ${zone.type.replace('_', ' ')} "${zone.name}"`,
              
              evidence: {
                zoneName: zone.name,
                zoneType: zone.type,
                personBbox: person.bbox,
              },
              
              firstObservedAt: state.firstObservedAt,
              consecutiveFrames: state.consecutiveFrames,
            });
          }
        }
      }
    }
    
    const fiveSecondsAgo = new Date(timestamp.getTime() - 5000);
    this.stateManager.clearOldStates(fiveSecondsAgo);
    
    return violations;
  }
  
  private isPointInZone(
    point: { x: number; y: number },
    zone: Zone
  ): boolean {
    let inside = false;
    const polygon = zone.polygon;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i]!.x;
      const yi = polygon[i]!.y;
      const xj = polygon[j]!.x;
      const yj = polygon[j]!.y;
      
      const intersect =
        yi > point.y !== yj > point.y &&
        point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
      
      if (intersect) inside = !inside;
    }
    
    return inside;
  }
}
