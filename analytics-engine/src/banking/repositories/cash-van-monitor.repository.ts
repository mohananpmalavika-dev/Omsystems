/**
 * Cash Van Monitor Configuration Repository
 * 
 * Manages cash van monitor configurations (policies and rules)
 */

import {
  CashVanMonitorConfig,
  CashVanVehicleRule,
  ScheduleRule,
  PersonnelRules,
  UnloadingRules,
  AccessRules,
} from '../models/cash-van-session';
import { v4 as uuidv4 } from 'uuid';

export interface CreateMonitorInput {
  tenantId: string;
  branchId: string;
  name: string;
  description?: string;
  arrivalZoneId: string;
  unloadingZoneId: string;
  secureEntryZoneId?: string;
  approvedRouteZones?: string[];
}

/**
 * Cash Van Monitor Repository
 */
export class CashVanMonitorRepository {
  private monitors = new Map<string, CashVanMonitorConfig>();
  private zoneIndex = new Map<string, Set<string>>(); // zoneId -> Set<monitorId>
  private branchIndex = new Map<string, Set<string>>(); // branchId -> Set<monitorId>

  /**
   * Create a new monitor with default rules
   */
  async create(input: CreateMonitorInput): Promise<CashVanMonitorConfig> {
    const now = new Date();
    const monitor: CashVanMonitorConfig = {
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
  async findById(monitorId: string): Promise<CashVanMonitorConfig | null> {
    return this.monitors.get(monitorId) || null;
  }

  /**
   * Find enabled monitors by branch
   */
  async findByBranch(tenantId: string, branchId: string): Promise<CashVanMonitorConfig[]> {
    const monitorIds = this.branchIndex.get(branchId) || new Set();
    const monitors: CashVanMonitorConfig[] = [];

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
  async findByArrivalZone(tenantId: string, branchId: string, zoneId: string): Promise<CashVanMonitorConfig | null> {
    const monitorIds = this.zoneIndex.get(zoneId);
    if (!monitorIds) {
      return null;
    }

    for (const monitorId of monitorIds) {
      const monitor = this.monitors.get(monitorId);
      if (
        monitor &&
        monitor.tenantId === tenantId &&
        monitor.branchId === branchId &&
        monitor.arrivalZoneId === zoneId &&
        monitor.enabled
      ) {
        return monitor;
      }
    }

    return null;
  }

  /**
   * Update monitor configuration
   */
  async update(monitorId: string, updates: Partial<CashVanMonitorConfig>): Promise<CashVanMonitorConfig | null> {
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
  async delete(monitorId: string): Promise<boolean> {
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
  async addVehicleRule(monitorId: string, rule: Omit<CashVanVehicleRule, 'id'>): Promise<CashVanMonitorConfig | null> {
    const monitor = this.monitors.get(monitorId);
    if (!monitor) {
      return null;
    }

    const vehicleRule: CashVanVehicleRule = {
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
  async addScheduleRule(monitorId: string, rule: Omit<ScheduleRule, 'id'>): Promise<CashVanMonitorConfig | null> {
    const monitor = this.monitors.get(monitorId);
    if (!monitor) {
      return null;
    }

    const scheduleRule: ScheduleRule = {
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
  async updatePersonnelRules(monitorId: string, rules: Partial<PersonnelRules>): Promise<CashVanMonitorConfig | null> {
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
  async updateUnloadingRules(monitorId: string, rules: Partial<UnloadingRules>): Promise<CashVanMonitorConfig | null> {
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
  async updateAccessRules(monitorId: string, rules: Partial<AccessRules>): Promise<CashVanMonitorConfig | null> {
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
  private indexMonitor(monitor: CashVanMonitorConfig): void {
    const zones = [
      monitor.arrivalZoneId,
      monitor.unloadingZoneId,
      monitor.secureEntryZoneId,
      ...(monitor.approvedRouteZones || []),
    ].filter(Boolean) as string[];

    for (const zoneId of zones) {
      if (!this.zoneIndex.has(zoneId)) {
        this.zoneIndex.set(zoneId, new Set());
      }
      this.zoneIndex.get(zoneId)!.add(monitor.id);
    }

    if (!this.branchIndex.has(monitor.branchId)) {
      this.branchIndex.set(monitor.branchId, new Set());
    }
    this.branchIndex.get(monitor.branchId)!.add(monitor.id);
  }

  /**
   * Remove monitor from zone indexes
   */
  private removeFromZoneIndex(monitor: CashVanMonitorConfig): void {
    const zones = [
      monitor.arrivalZoneId,
      monitor.unloadingZoneId,
      monitor.secureEntryZoneId,
      ...(monitor.approvedRouteZones || []),
    ].filter(Boolean) as string[];

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
  private removeFromBranchIndex(monitor: CashVanMonitorConfig): void {
    const monitorIds = this.branchIndex.get(monitor.branchId);
    if (monitorIds) {
      monitorIds.delete(monitor.id);
      if (monitorIds.size === 0) {
        this.branchIndex.delete(monitor.branchId);
      }
    }
  }

  /**
   * Clear all monitors (for testing)
   */
  async clear(): Promise<void> {
    this.monitors.clear();
    this.zoneIndex.clear();
    this.branchIndex.clear();
  }
}

/**
 * Singleton instance
 */
let repository: CashVanMonitorRepository | null = null;

export function getCashVanMonitorRepository(): CashVanMonitorRepository {
  if (!repository) {
    repository = new CashVanMonitorRepository();
  }
  return repository;
}

export function setCashVanMonitorRepository(repo: CashVanMonitorRepository): void {
  repository = repo;
}
