/**
 * Idle Equipment Rule
 *
 * Detects equipment that has been stationary for too long.
 * Useful for:
 * - Efficiency monitoring
 * - Detecting abandoned equipment
 * - Identifying workflow bottlenecks
 */
export class IdleEquipmentRule {
    id = 'equipment_idle_too_long';
    name = 'Equipment Idle Too Long';
    description = 'Detects equipment that has been stationary beyond threshold';
    severity = 'medium';
    isApplicable(config) {
        return config.idleTimeThreshold > 0;
    }
    async evaluate(context) {
        const violations = [];
        const { scene, config, timestamp } = context;
        for (const equipment of scene.equipment) {
            // Check if equipment is stationary
            if (equipment.movementState !== 'stationary') {
                continue;
            }
            // Calculate how long it's been stationary
            if (!equipment.stationarySince) {
                continue;
            }
            const idleTimeMs = timestamp.getTime() - equipment.stationarySince.getTime();
            const idleTimeSeconds = idleTimeMs / 1000;
            // Check if exceeds threshold
            if (idleTimeSeconds >= config.idleTimeThreshold) {
                // Calculate severity based on idle duration
                let severity = 'medium';
                if (idleTimeSeconds > config.idleTimeThreshold * 3) {
                    severity = 'high';
                }
                else if (idleTimeSeconds > config.idleTimeThreshold * 2) {
                    severity = 'medium';
                }
                else {
                    severity = 'low';
                }
                violations.push({
                    type: 'equipment_idle_too_long',
                    severity,
                    confidence: equipment.confidence,
                    timestamp,
                    cameraId: context.cameraId,
                    tenantId: context.tenantId,
                    branchId: context.branchId,
                    equipmentTrackIds: [equipment.trackId],
                    description: `${equipment.equipmentType} idle for ${Math.floor(idleTimeSeconds)}s (threshold: ${config.idleTimeThreshold}s)`,
                    evidence: {
                        equipmentType: equipment.equipmentType,
                        idleTime: idleTimeSeconds,
                        equipmentBbox: equipment.bbox,
                    },
                    firstObservedAt: equipment.stationarySince,
                });
            }
        }
        return violations;
    }
}
