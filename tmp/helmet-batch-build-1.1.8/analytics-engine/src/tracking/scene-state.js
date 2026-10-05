/**
 * Scene State Manager
 *
 * Maintains unified view of all objects in a camera's field of view:
 * - Persons
 * - Vehicles
 * - Equipment
 * - Detected events (fire, smoke, etc.)
 *
 * This enables cross-domain analytics like:
 * - Person + equipment proximity
 * - Worker + PPE correlation
 * - Vehicle + equipment interaction
 * - Multi-object incident reconstruction
 */
// ============================================================================
// Scene State Manager
// ============================================================================
export class SceneStateManager {
    cameraId;
    persons = new Map();
    equipment = new Map();
    vehicles = new Map();
    zones = new Map();
    constructor(cameraId) {
        this.cameraId = cameraId;
    }
    /**
     * Update persons in scene
     */
    updatePersons(persons) {
        this.persons.clear();
        for (const person of persons) {
            this.persons.set(person.trackId, person);
        }
    }
    /**
     * Update equipment in scene
     */
    updateEquipment(equipment) {
        this.equipment.clear();
        for (const eq of equipment) {
            this.equipment.set(eq.trackId, eq);
        }
    }
    /**
     * Update vehicles in scene
     */
    updateVehicles(vehicles) {
        this.vehicles.clear();
        for (const vehicle of vehicles) {
            this.vehicles.set(vehicle.trackId, vehicle);
        }
    }
    /**
     * Update zones
     */
    updateZones(zones) {
        this.zones.clear();
        for (const zone of zones) {
            this.zones.set(zone.id, zone);
        }
    }
    /**
     * Get current scene snapshot
     */
    getSnapshot(tenantId, branchId) {
        const persons = Array.from(this.persons.values());
        const equipment = Array.from(this.equipment.values());
        const vehicles = Array.from(this.vehicles.values());
        return {
            cameraId: this.cameraId,
            tenantId,
            branchId,
            timestamp: new Date(),
            persons,
            equipment,
            vehicles,
            stats: {
                totalObjects: persons.length + equipment.length + vehicles.length,
                personCount: persons.length,
                equipmentCount: equipment.length,
                vehicleCount: vehicles.length,
            },
        };
    }
    /**
     * Find zones containing a point
     */
    findZones(point) {
        return Array.from(this.zones.values()).filter((zone) => this.isPointInPolygon(point, zone.polygon));
    }
    /**
     * Check if point is inside polygon (ray casting algorithm)
     */
    isPointInPolygon(point, polygon) {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x;
            const yi = polygon[i].y;
            const xj = polygon[j].x;
            const yj = polygon[j].y;
            const intersect = yi > point.y !== yj > point.y &&
                point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
            if (intersect)
                inside = !inside;
        }
        return inside;
    }
    /**
     * Calculate distance between two objects
     */
    calculateDistance(obj1, obj2) {
        // Use bottom-center point for ground-plane distance
        const obj1Point = {
            x: obj1.bbox.x + obj1.bbox.width / 2,
            y: obj1.bbox.y + obj1.bbox.height,
        };
        const obj2Point = {
            x: obj2.bbox.x + obj2.bbox.width / 2,
            y: obj2.bbox.y + obj2.bbox.height,
        };
        const dx = obj2Point.x - obj1Point.x;
        const dy = obj2Point.y - obj1Point.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    /**
     * Calculate IoU between two objects
     */
    calculateIoU(obj1, obj2) {
        const x1 = Math.max(obj1.bbox.x, obj2.bbox.x);
        const y1 = Math.max(obj1.bbox.y, obj2.bbox.y);
        const x2 = Math.min(obj1.bbox.x + obj1.bbox.width, obj2.bbox.x + obj2.bbox.width);
        const y2 = Math.min(obj1.bbox.y + obj1.bbox.height, obj2.bbox.y + obj2.bbox.height);
        const intersectionWidth = Math.max(0, x2 - x1);
        const intersectionHeight = Math.max(0, y2 - y1);
        const intersectionArea = intersectionWidth * intersectionHeight;
        const obj1Area = obj1.bbox.width * obj1.bbox.height;
        const obj2Area = obj2.bbox.width * obj2.bbox.height;
        const unionArea = obj1Area + obj2Area - intersectionArea;
        return unionArea > 0 ? intersectionArea / unionArea : 0;
    }
    /**
     * Find all person-equipment pairs within distance threshold
     */
    findProximityPairs(maxDistance) {
        const relationships = [];
        for (const person of this.persons.values()) {
            for (const eq of this.equipment.values()) {
                const distance = this.calculateDistance(person, eq);
                if (distance <= maxDistance) {
                    const iou = this.calculateIoU(person, eq);
                    relationships.push({
                        object1Id: person.trackId,
                        object1Type: 'person',
                        object2Id: eq.trackId,
                        object2Type: 'equipment',
                        distance,
                        overlapping: iou > 0,
                        iou,
                    });
                }
            }
        }
        return relationships;
    }
    /**
     * Find equipment in zones
     */
    findEquipmentInZones() {
        const result = new Map();
        for (const eq of this.equipment.values()) {
            const center = {
                x: eq.bbox.x + eq.bbox.width / 2,
                y: eq.bbox.y + eq.bbox.height,
            };
            const zones = this.findZones(center);
            for (const zone of zones) {
                if (!result.has(zone.id)) {
                    result.set(zone.id, []);
                }
                result.get(zone.id).push(eq);
            }
        }
        return result;
    }
    /**
     * Find persons in zones
     */
    findPersonsInZones() {
        const result = new Map();
        for (const person of this.persons.values()) {
            const center = {
                x: person.bbox.x + person.bbox.width / 2,
                y: person.bbox.y + person.bbox.height,
            };
            const zones = this.findZones(center);
            for (const zone of zones) {
                if (!result.has(zone.id)) {
                    result.set(zone.id, []);
                }
                result.get(zone.id).push(person);
            }
        }
        return result;
    }
    /**
     * Get equipment by type
     */
    getEquipmentByType(type) {
        return Array.from(this.equipment.values()).filter((eq) => eq.equipmentType === type);
    }
    /**
     * Get moving equipment
     */
    getMovingEquipment() {
        return Array.from(this.equipment.values()).filter((eq) => eq.movementState === 'moving');
    }
    /**
     * Get stationary equipment
     */
    getStationaryEquipment() {
        return Array.from(this.equipment.values()).filter((eq) => eq.movementState === 'stationary');
    }
    /**
     * Clear all state
     */
    clear() {
        this.persons.clear();
        this.equipment.clear();
        this.vehicles.clear();
    }
    /**
     * Get statistics
     */
    getStatistics() {
        return {
            persons: this.persons.size,
            equipment: this.equipment.size,
            vehicles: this.vehicles.size,
            zones: this.zones.size,
            totalObjects: this.persons.size + this.equipment.size + this.vehicles.size,
        };
    }
}
// ============================================================================
// Scene State Registry (per camera)
// ============================================================================
export class SceneStateRegistry {
    scenes = new Map();
    /**
     * Get or create scene state for a camera
     */
    getSceneState(cameraId) {
        if (!this.scenes.has(cameraId)) {
            this.scenes.set(cameraId, new SceneStateManager(cameraId));
        }
        return this.scenes.get(cameraId);
    }
    /**
     * Remove scene state
     */
    removeSceneState(cameraId) {
        return this.scenes.delete(cameraId);
    }
    /**
     * Get all camera IDs
     */
    getCameraIds() {
        return Array.from(this.scenes.keys());
    }
    /**
     * Clear all scenes
     */
    clearAll() {
        this.scenes.clear();
    }
    /**
     * Get statistics
     */
    getStatistics() {
        const stats = {
            totalCameras: this.scenes.size,
            totalObjects: 0,
            totalPersons: 0,
            totalEquipment: 0,
            totalVehicles: 0,
        };
        for (const scene of this.scenes.values()) {
            const sceneStats = scene.getStatistics();
            stats.totalObjects += sceneStats.totalObjects;
            stats.totalPersons += sceneStats.persons;
            stats.totalEquipment += sceneStats.equipment;
            stats.totalVehicles += sceneStats.vehicles;
        }
        return stats;
    }
}
// ============================================================================
// Singleton
// ============================================================================
let registryInstance = null;
export function getSceneStateRegistry() {
    if (!registryInstance) {
        registryInstance = new SceneStateRegistry();
    }
    return registryInstance;
}
export function resetSceneStateRegistry() {
    registryInstance = null;
}
