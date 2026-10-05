/**
 * Zone Engine
 * Core spatial operations for safety zone management and person-zone mapping
 */
import { randomUUID } from 'node:crypto';
// ============================================================================
// Zone Engine
// ============================================================================
export class ZoneEngine {
    zones = new Map();
    trackedPersons = new Map();
    zoneOccupancy = new Map();
    transitionHistory = [];
    maxTransitionHistory = 1000;
    constructor() {
        this.startOccupancyMonitoring();
    }
    // ============================================================================
    // Zone Management
    // ============================================================================
    /**
     * Register a safety zone
     */
    registerZone(zone) {
        const id = `zone_${randomUUID().substring(0, 8)}`;
        const safetyZone = { id, ...zone };
        // Validate polygon
        if (!this.isValidPolygon(safetyZone.polygon)) {
            throw new Error(`Invalid polygon for zone ${zone.name}: must have at least 3 points`);
        }
        this.zones.set(id, safetyZone);
        // Initialize occupancy tracking
        this.zoneOccupancy.set(id, {
            zoneId: id,
            zoneName: zone.name,
            current: 0,
            maximum: zone.maxOccupancy,
            occupants: [],
            isOverCapacity: false,
            utilizationRate: 0,
            lastUpdated: new Date(),
        });
        console.log(`✓ Registered safety zone: ${zone.name} (${id}) - Type: ${zone.type}`);
        return safetyZone;
    }
    /**
     * Update zone configuration
     */
    updateZone(zoneId, updates) {
        const zone = this.zones.get(zoneId);
        if (!zone) {
            throw new Error(`Zone not found: ${zoneId}`);
        }
        Object.assign(zone, updates);
        console.log(`✓ Updated zone: ${zone.name} (${zoneId})`);
    }
    /**
     * Remove a zone
     */
    removeZone(zoneId) {
        this.zones.delete(zoneId);
        this.zoneOccupancy.delete(zoneId);
        console.log(`✓ Removed zone: ${zoneId}`);
    }
    /**
     * Get zone by ID
     */
    getZone(zoneId) {
        return this.zones.get(zoneId);
    }
    /**
     * Get all zones
     */
    getAllZones() {
        return Array.from(this.zones.values());
    }
    /**
     * Get zones by type
     */
    getZonesByType(type) {
        return Array.from(this.zones.values()).filter(z => z.type === type);
    }
    // ============================================================================
    // Spatial Operations
    // ============================================================================
    /**
     * Check if a point is inside a polygon using ray casting algorithm
     */
    isPointInPolygon(point, polygon) {
        if (polygon.length < 3)
            return false;
        let inside = false;
        const { x, y } = point;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x;
            const yi = polygon[i].y;
            const xj = polygon[j].x;
            const yj = polygon[j].y;
            const intersect = ((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect)
                inside = !inside;
        }
        return inside;
    }
    /**
     * Find which zone a point belongs to (handles overlapping zones by priority)
     */
    findZoneForPoint(point) {
        const matchingZones = [];
        for (const zone of this.zones.values()) {
            if (this.isPointInPolygon(point, zone.polygon)) {
                matchingZones.push(zone);
            }
        }
        if (matchingZones.length === 0)
            return undefined;
        if (matchingZones.length === 1)
            return matchingZones[0];
        // Multiple zones overlap - return highest priority
        return matchingZones.reduce((highest, current) => current.priority > highest.priority ? current : highest);
    }
    /**
     * Calculate polygon overlap percentage
     */
    calculatePolygonOverlap(polygon1, polygon2) {
        // Simplified overlap calculation using bounding box intersection
        const bbox1 = this.getBoundingBox(polygon1);
        const bbox2 = this.getBoundingBox(polygon2);
        const xOverlap = Math.max(0, Math.min(bbox1.maxX, bbox2.maxX) - Math.max(bbox1.minX, bbox2.minX));
        const yOverlap = Math.max(0, Math.min(bbox1.maxY, bbox2.maxY) - Math.max(bbox1.minY, bbox2.minY));
        const intersectionArea = xOverlap * yOverlap;
        const bbox1Area = (bbox1.maxX - bbox1.minX) * (bbox1.maxY - bbox1.minY);
        return bbox1Area > 0 ? (intersectionArea / bbox1Area) * 100 : 0;
    }
    /**
     * Get bounding box for a polygon
     */
    getBoundingBox(polygon) {
        if (polygon.length === 0)
            return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
        let minX = polygon[0].x;
        let maxX = polygon[0].x;
        let minY = polygon[0].y;
        let maxY = polygon[0].y;
        for (const point of polygon) {
            minX = Math.min(minX, point.x);
            maxX = Math.max(maxX, point.x);
            minY = Math.min(minY, point.y);
            maxY = Math.max(maxY, point.y);
        }
        return { minX, maxX, minY, maxY };
    }
    /**
     * Calculate distance between two points
     */
    calculateDistance(point1, point2) {
        return Math.sqrt(Math.pow(point2.x - point1.x, 2) + Math.pow(point2.y - point1.y, 2));
    }
    /**
     * Validate polygon has at least 3 points
     */
    isValidPolygon(polygon) {
        return polygon.length >= 3;
    }
    // ============================================================================
    // Person-Zone Mapping
    // ============================================================================
    /**
     * Update person position and zone assignment
     */
    updatePersonPosition(personId, position, boundingBox) {
        const footPosition = {
            x: position.x,
            y: position.y + (boundingBox.height / 2), // Bottom center of bounding box
        };
        const zone = this.findZoneForPoint(footPosition);
        const existingPerson = this.trackedPersons.get(personId);
        const now = new Date();
        let person;
        if (existingPerson) {
            // Check for zone transition
            if (existingPerson.zoneId !== zone?.id) {
                this.recordTransition(personId, existingPerson.zone, zone, now);
                person = {
                    ...existingPerson,
                    zone,
                    zoneId: zone?.id,
                    position,
                    footPosition,
                    enteredZoneAt: now,
                    duration: 0,
                };
            }
            else {
                // Same zone - update duration
                const duration = existingPerson.enteredZoneAt
                    ? (now.getTime() - existingPerson.enteredZoneAt.getTime()) / 1000
                    : 0;
                // Calculate speed if we have previous position
                const speed = this.calculateSpeed(existingPerson.position, position, 1 // Assume 1 second between frames
                );
                // Calculate direction
                const direction = this.calculateDirection(existingPerson.position, position);
                person = {
                    ...existingPerson,
                    position,
                    footPosition,
                    duration,
                    speed,
                    direction,
                    boundingBox,
                };
            }
        }
        else {
            // New person
            person = {
                id: personId,
                zone,
                zoneId: zone?.id,
                position,
                footPosition,
                boundingBox,
                enteredZoneAt: zone ? now : undefined,
                duration: 0,
            };
            if (zone) {
                this.recordTransition(personId, undefined, zone, now);
            }
        }
        this.trackedPersons.set(personId, person);
        this.updateOccupancy();
        return person;
    }
    /**
     * Get person by ID
     */
    getTrackedPerson(personId) {
        return this.trackedPersons.get(personId);
    }
    /**
     * Get all tracked persons
     */
    getAllTrackedPersons() {
        return Array.from(this.trackedPersons.values());
    }
    /**
     * Get persons in a specific zone
     */
    getPersonsInZone(zoneId) {
        return Array.from(this.trackedPersons.values())
            .filter(p => p.zoneId === zoneId);
    }
    /**
     * Remove tracked person
     */
    removeTrackedPerson(personId) {
        const person = this.trackedPersons.get(personId);
        if (person?.zone) {
            this.recordTransition(personId, person.zone, undefined, new Date());
        }
        this.trackedPersons.delete(personId);
        this.updateOccupancy();
    }
    /**
     * Calculate person speed (units per second)
     */
    calculateSpeed(from, to, deltaTime) {
        if (deltaTime === 0)
            return 0;
        const distance = this.calculateDistance(from, to);
        return distance / deltaTime;
    }
    /**
     * Calculate direction in degrees (0 = right, 90 = down, 180 = left, 270 = up)
     */
    calculateDirection(from, to) {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        return (angle + 360) % 360;
    }
    // ============================================================================
    // Occupancy Management
    // ============================================================================
    /**
     * Update occupancy for all zones
     */
    updateOccupancy() {
        const now = new Date();
        for (const [zoneId, occupancy] of this.zoneOccupancy.entries()) {
            const occupants = this.getPersonsInZone(zoneId);
            const current = occupants.length;
            occupancy.current = current;
            occupancy.occupants = occupants.map(p => p.id);
            occupancy.isOverCapacity = occupancy.maximum ? current > occupancy.maximum : false;
            occupancy.utilizationRate = occupancy.maximum ? (current / occupancy.maximum) * 100 : 0;
            occupancy.lastUpdated = now;
        }
    }
    /**
     * Get occupancy for a specific zone
     */
    getZoneOccupancy(zoneId) {
        return this.zoneOccupancy.get(zoneId);
    }
    /**
     * Get all zone occupancies
     */
    getAllOccupancies() {
        return Array.from(this.zoneOccupancy.values());
    }
    /**
     * Get over-capacity zones
     */
    getOverCapacityZones() {
        return Array.from(this.zoneOccupancy.values())
            .filter(o => o.isOverCapacity);
    }
    // ============================================================================
    // Transition Tracking
    // ============================================================================
    /**
     * Record a zone transition
     */
    recordTransition(personId, fromZone, toZone, timestamp) {
        const transition = {
            personId,
            fromZone,
            toZone,
            timestamp,
        };
        this.transitionHistory.push(transition);
        // Limit history size
        if (this.transitionHistory.length > this.maxTransitionHistory) {
            this.transitionHistory.shift();
        }
    }
    /**
     * Get transition history for a person
     */
    getPersonTransitions(personId, limit = 100) {
        return this.transitionHistory
            .filter(t => t.personId === personId)
            .slice(-limit);
    }
    /**
     * Get recent transitions
     */
    getRecentTransitions(limit = 100) {
        return this.transitionHistory.slice(-limit);
    }
    // ============================================================================
    // Analytics
    // ============================================================================
    /**
     * Get zone statistics
     */
    getZoneStatistics() {
        const zones = this.getAllZones();
        const byType = {};
        const byHazardLevel = {
            low: 0,
            medium: 0,
            high: 0,
            critical: 0,
        };
        for (const zone of zones) {
            byType[zone.type] = (byType[zone.type] || 0) + 1;
            byHazardLevel[zone.hazardLevel]++;
        }
        const occupancies = this.getAllOccupancies();
        const totalOccupants = occupancies.reduce((sum, o) => sum + o.current, 0);
        const overCapacity = occupancies.filter(o => o.isOverCapacity).length;
        return {
            totalZones: zones.length,
            byType,
            byHazardLevel,
            totalOccupants,
            overCapacity,
        };
    }
    /**
     * Get zone utilization report
     */
    getZoneUtilizationReport() {
        const occupancies = this.getAllOccupancies();
        return occupancies.map(occ => {
            const zone = this.zones.get(occ.zoneId);
            let status = 'normal';
            if (occ.isOverCapacity) {
                status = 'over_capacity';
            }
            else if (occ.utilizationRate > 80) {
                status = 'high';
            }
            return {
                zoneId: occ.zoneId,
                zoneName: occ.zoneName,
                type: zone?.type || 'safe',
                current: occ.current,
                maximum: occ.maximum,
                utilizationRate: Math.round(occ.utilizationRate * 10) / 10,
                status,
            };
        });
    }
    // ============================================================================
    // Monitoring
    // ============================================================================
    /**
     * Start periodic occupancy monitoring
     */
    startOccupancyMonitoring() {
        setInterval(() => {
            this.updateOccupancy();
            // Clean up stale tracked persons (not updated in 30 seconds)
            const now = Date.now();
            const staleThreshold = 30000;
            const toRemove = [];
            for (const [personId, person] of this.trackedPersons.entries()) {
                if (person.enteredZoneAt) {
                    const age = now - person.enteredZoneAt.getTime();
                    if (age > staleThreshold) {
                        toRemove.push(personId);
                    }
                }
            }
            for (const personId of toRemove) {
                this.removeTrackedPerson(personId);
            }
        }, 5000); // Every 5 seconds
    }
    /**
     * Get engine health
     */
    getHealth() {
        const zones = this.zones.size;
        const trackedPersons = this.trackedPersons.size;
        const transitions = this.transitionHistory.length;
        let status = 'healthy';
        if (zones === 0)
            status = 'degraded';
        if (trackedPersons > 1000)
            status = 'degraded';
        return {
            status,
            zones,
            trackedPersons,
            transitions,
        };
    }
    /**
     * Clear all tracking data
     */
    clearAll() {
        this.trackedPersons.clear();
        this.transitionHistory = [];
        this.updateOccupancy();
    }
    /**
     * Export configuration
     */
    exportConfiguration() {
        return {
            zones: this.getAllZones(),
            version: '1.0.0',
        };
    }
    /**
     * Import configuration
     */
    importConfiguration(config) {
        for (const zone of config.zones) {
            this.zones.set(zone.id, zone);
            this.zoneOccupancy.set(zone.id, {
                zoneId: zone.id,
                zoneName: zone.name,
                current: 0,
                maximum: zone.maxOccupancy,
                occupants: [],
                isOverCapacity: false,
                utilizationRate: 0,
                lastUpdated: new Date(),
            });
        }
        console.log(`✓ Imported ${config.zones.length} zones`);
    }
}
