/**
 * Unsafe Proximity Rule
 *
 * Detects when workers are dangerously close to operating equipment.
 * Critical for preventing workplace accidents involving forklifts, cranes, etc.
 */
import { RuleStateManager } from './types.js';
export class UnsafeProximityRule {
    id = 'unsafe_proximity';
    name = 'Unsafe Worker-Equipment Proximity';
    description = 'Detects when workers are too close to operating equipment';
    severity = 'critical';
    stateManager = new RuleStateManager();
    // Require 3 consecutive frames and 1 second duration before alerting
    CONFIRMATION_FRAMES = 3;
    CONFIRMATION_DURATION_MS = 1000;
    isApplicable(config) {
        return config.minPersonEquipmentDistance > 0;
    }
    async evaluate(context) {
        const violations = [];
        const { scene, config, timestamp } = context;
        // Only check proximity with moving equipment (higher risk)
        const movingEquipment = scene.equipment.filter((eq) => eq.movementState === 'moving');
        for (const person of scene.persons) {
            for (const equipment of movingEquipment) {
                // Calculate distance (bottom-center points)
                const distance = this.calculateDistance(person.bbox, equipment.bbox);
                const threshold = config.minPersonEquipmentDistanceMeters
                    ? config.minPersonEquipmentDistanceMeters
                    : config.minPersonEquipmentDistance;
                if (distance < threshold) {
                    // Create unique key for this person-equipment pair
                    const stateKey = `${person.trackId}_${equipment.trackId}`;
                    // Update temporal state
                    const state = this.stateManager.updateState(this.id, stateKey, timestamp);
                    // Check if violation is confirmed
                    const duration = timestamp.getTime() - state.firstObservedAt.getTime();
                    if (state.consecutiveFrames >= this.CONFIRMATION_FRAMES &&
                        duration >= this.CONFIRMATION_DURATION_MS &&
                        !state.confirmed) {
                        state.confirmed = true;
                        const violation = {
                            type: 'unsafe_proximity',
                            severity: this.severity,
                            confidence: this.calculateConfidence(person.confidence, equipment.confidence, state.consecutiveFrames),
                            timestamp,
                            cameraId: context.cameraId,
                            tenantId: context.tenantId,
                            branchId: context.branchId,
                            personTrackIds: [person.trackId],
                            equipmentTrackIds: [equipment.trackId],
                            description: `Worker dangerously close to moving ${equipment.equipmentType} (${distance.toFixed(1)}${config.minPersonEquipmentDistanceMeters ? 'm' : 'px'})`,
                            evidence: {
                                distance,
                                distanceMeters: config.minPersonEquipmentDistanceMeters
                                    ? distance
                                    : undefined,
                                equipmentType: equipment.equipmentType,
                                speed: equipment.velocity?.speed,
                                equipmentBbox: equipment.bbox,
                                personBbox: person.bbox,
                            },
                            firstObservedAt: state.firstObservedAt,
                            consecutiveFrames: state.consecutiveFrames,
                        };
                        violations.push(violation);
                    }
                }
            }
        }
        // Clean up old states (not seen in last 5 seconds)
        const fiveSecondsAgo = new Date(timestamp.getTime() - 5000);
        this.stateManager.clearOldStates(fiveSecondsAgo);
        return violations;
    }
    calculateDistance(bbox1, bbox2) {
        // Use bottom-center for ground-plane distance
        const p1 = {
            x: bbox1.x + bbox1.width / 2,
            y: bbox1.y + bbox1.height,
        };
        const p2 = {
            x: bbox2.x + bbox2.width / 2,
            y: bbox2.y + bbox2.height,
        };
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    calculateConfidence(personConf, equipmentConf, consecutiveFrames) {
        // Combine detection confidences and temporal stability
        const detectionConf = (personConf + equipmentConf) / 2;
        const temporalBoost = Math.min(consecutiveFrames / 10, 0.1);
        return Math.min(detectionConf + temporalBoost, 1.0);
    }
}
