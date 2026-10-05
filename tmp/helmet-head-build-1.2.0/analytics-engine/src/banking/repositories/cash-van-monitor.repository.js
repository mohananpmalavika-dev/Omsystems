/**
 * Cash Van Monitor Configuration Repository
 *
 * Manages cash van monitor configurations (policies and rules)
 */
import { v4 as uuidv4 } from 'uuid';
/**
 * Cash Van Monitor Repository
 */
export class CashVanMonitorRepository {
    monitors = new Map();
    zoneIndex = new Map(); // zoneId -> Set<monitorId>
    branchIndex = new Map(); // branchId -> Set<monitorId>
    /**
     * Create a new monitor with default rules
     */
    async create(input) {
        const now = new Date();
        const monitor = {
            id: `mon_${uuidv4().replace(/-/g, '')}`,
            tenantId: input.tenantId,
            branchId: input.branchId,
            name: input.name,
            description: input.description,
            enabled: true,
            arrivalZoneId: input.arrivalZoneId,
            unloadingZoneId: input.unloadingZoneId,
            secureEntryZoneId: input.secureEntryZoneId,
            approvedRouteZones: input.approvedRouteZones || [],
            allowedVehicles: [],
            scheduleRules: [],
            // Default personnel rules
            personnelRules: {
                minimumPersonnel: 2,
                minimumGuards: 1,
                requireIdentityVerification: false,
                minimumIdentityConfidence: 0.75,
                minimumTrackAgeMs: 1500,
                allowedRoles: ['cash_guard', 'cash_handler', 'cash_van_driver'],
            },
            // Default unloading rules
            unloadingRules: {
                maxDurationSeconds: 720, // 12 minutes
                minimumPersonnelNearby: 2,
                maxEscortDistanceMeters: 4,
                requireGuardEscort: true,
                requireSecureZoneCompletion: true,
                transferObjectClasses: ['cash_case', 'cash_bag', 'security_container', 'bag', 'briefcase'],
            },
            // Default access rules
            accessRules: {
                requireAccessCorrelation: true,
                accessCorrelationWindowMs: 10_000,
                allowedDoorIds: [],
                requireAuthorizedIdentity: true,
            },
            sessionTimeoutMinutes: 60,
            createdAt: now,
            updatedAt: now,
        };
        this.monitors.set(monitor.id, monitor);
        this.indexMonitor(monitor);
        return monitor;
    }
    /**
     * Find monitor by ID
     */
    async findById(monitorId) {
        return this.monitors.get(monitorId) || null;
    }
    /**
     * Find enabled monitors by branch
     */
    async findByBranch(tenantId, branchId) {
        const monitorIds = this.branchIndex.get(branchId) || new Set();
        const monitors = [];
        for (const monitorId of monitorIds) {
            const monitor = this.monitors.get(monitorId);
            if (monitor && monitor.tenantId === tenantId && monitor.enabled) {
                monitors.push(monitor);
            }
        }
        return monitors;
    }
    /**
     * Find monitor by arrival zone
     */
    async findByArrivalZone(tenantId, branchId, zoneId) {
        const monitorIds = this.zoneIndex.get(zoneId);
        if (!monitorIds) {
            return null;
        }
        for (const monitorId of monitorIds) {
            const monitor = this.monitors.get(monitorId);
            if (monitor &&
                monitor.tenantId === tenantId &&
                monitor.branchId === branchId &&
                monitor.arrivalZoneId === zoneId &&
                monitor.enabled) {
                return monitor;
            }
        }
        return null;
    }
    /**
     * Find monitor by any associated zone (arrival, unloading, secure entry, route)
     */
    async findByZone(tenantId, branchId, zoneId) {
        const monitorIds = this.zoneIndex.get(zoneId);
        if (!monitorIds) {
            return null;
        }
        for (const monitorId of monitorIds) {
            const monitor = this.monitors.get(monitorId);
            if (monitor &&
                monitor.tenantId === tenantId &&
                monitor.branchId === branchId &&
                monitor.enabled) {
                return monitor;
            }
        }
        return null;
    }
    /**
     * Update monitor configuration
     */
    async update(monitorId, updates) {
        const monitor = this.monitors.get(monitorId);
        if (!monitor) {
            return null;
        }
        // Remove from old zone indexes
        this.removeFromZoneIndex(monitor);
        // Apply updates
        Object.assign(monitor, updates, {
            updatedAt: new Date(),
        });
        // Re-index with new zones
        this.indexMonitor(monitor);
        return monitor;
    }
    /**
     * Delete monitor
     */
    async delete(monitorId) {
        const monitor = this.monitors.get(monitorId);
        if (!monitor) {
            return false;
        }
        this.removeFromZoneIndex(monitor);
        this.removeFromBranchIndex(monitor);
        this.monitors.delete(monitorId);
        return true;
    }
    /**
     * Add vehicle rule to monitor
     */
    async addVehicleRule(monitorId, rule) {
        const monitor = this.monitors.get(monitorId);
        if (!monitor) {
            return null;
        }
        const vehicleRule = {
            ...rule,
            id: `vr_${uuidv4().replace(/-/g, '')}`,
        };
        monitor.allowedVehicles.push(vehicleRule);
        monitor.updatedAt = new Date();
        return monitor;
    }
    /**
     * Add schedule rule to monitor
     */
    async addScheduleRule(monitorId, rule) {
        const monitor = this.monitors.get(monitorId);
        if (!monitor) {
            return null;
        }
        const scheduleRule = {
            ...rule,
            id: `sr_${uuidv4().replace(/-/g, '')}`,
        };
        monitor.scheduleRules.push(scheduleRule);
        monitor.updatedAt = new Date();
        return monitor;
    }
    /**
     * Update personnel rules
     */
    async updatePersonnelRules(monitorId, rules) {
        const monitor = this.monitors.get(monitorId);
        if (!monitor) {
            return null;
        }
        monitor.personnelRules = { ...monitor.personnelRules, ...rules };
        monitor.updatedAt = new Date();
        return monitor;
    }
    /**
     * Update unloading rules
     */
    async updateUnloadingRules(monitorId, rules) {
        const monitor = this.monitors.get(monitorId);
        if (!monitor) {
            return null;
        }
        monitor.unloadingRules = { ...monitor.unloadingRules, ...rules };
        monitor.updatedAt = new Date();
        return monitor;
    }
    /**
     * Update access rules
     */
    async updateAccessRules(monitorId, rules) {
        const monitor = this.monitors.get(monitorId);
        if (!monitor) {
            return null;
        }
        monitor.accessRules = { ...monitor.accessRules, ...rules };
        monitor.updatedAt = new Date();
        return monitor;
    }
    /**
     * Index monitor by zones
     */
    indexMonitor(monitor) {
        const zones = [
            monitor.arrivalZoneId,
            monitor.unloadingZoneId,
            monitor.secureEntryZoneId,
            ...(monitor.approvedRouteZones || []),
        ].filter(Boolean);
        for (const zoneId of zones) {
            if (!this.zoneIndex.has(zoneId)) {
                this.zoneIndex.set(zoneId, new Set());
            }
            this.zoneIndex.get(zoneId).add(monitor.id);
        }
        if (!this.branchIndex.has(monitor.branchId)) {
            this.branchIndex.set(monitor.branchId, new Set());
        }
        this.branchIndex.get(monitor.branchId).add(monitor.id);
    }
    /**
     * Remove monitor from zone indexes
     */
    removeFromZoneIndex(monitor) {
        const zones = [
            monitor.arrivalZoneId,
            monitor.unloadingZoneId,
            monitor.secureEntryZoneId,
            ...(monitor.approvedRouteZones || []),
        ].filter(Boolean);
        for (const zoneId of zones) {
            const monitorIds = this.zoneIndex.get(zoneId);
            if (monitorIds) {
                monitorIds.delete(monitor.id);
                if (monitorIds.size === 0) {
                    this.zoneIndex.delete(zoneId);
                }
            }
        }
    }
    /**
     * Remove monitor from branch index
     */
    removeFromBranchIndex(monitor) {
        const monitorIds = this.branchIndex.get(monitor.branchId);
        if (monitorIds) {
            monitorIds.delete(monitor.id);
            if (monitorIds.size === 0) {
                this.branchIndex.delete(monitor.branchId);
            }
        }
    }
    /**
     * Find all active monitors
     */
    async findActiveMonitors() {
        const monitors = [];
        for (const monitor of this.monitors.values()) {
            if (monitor.enabled) {
                monitors.push(monitor);
            }
        }
        return monitors;
    }
    /**
     * Clear all monitors (for testing)
     */
    async clear() {
        this.monitors.clear();
        this.zoneIndex.clear();
        this.branchIndex.clear();
    }
}
/**
 * Singleton instance
 */
let repository = null;
export function getCashVanMonitorRepository() {
    if (!repository) {
        repository = new CashVanMonitorRepository();
    }
    return repository;
}
export function setCashVanMonitorRepository(repo) {
    repository = repo;
}
