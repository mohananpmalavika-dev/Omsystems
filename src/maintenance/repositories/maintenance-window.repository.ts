/**
 * Maintenance Window Repository
 */

import type { MaintenanceWindow, MaintenanceWindowStatus } from "../domain/maintenance-window.types.js";

export class MaintenanceWindowRepository {
  private windows: Map<string, MaintenanceWindow> = new Map();

  async create(window: MaintenanceWindow): Promise<MaintenanceWindow> {
    this.windows.set(window.id, window);
    return window;
  }

  async update(window: MaintenanceWindow): Promise<MaintenanceWindow> {
    this.windows.set(window.id, window);
    return window;
  }

  async findById(id: string): Promise<MaintenanceWindow | undefined> {
    return this.windows.get(id);
  }

  async list(filter?: {
    tenantId?: string;
    branchId?: string;
    status?: MaintenanceWindowStatus;
  }): Promise<MaintenanceWindow[]> {
    return Array.from(this.windows.values()).filter((w) => {
      if (filter?.tenantId && w.tenantId !== filter.tenantId) return false;
      if (filter?.branchId && w.branchId !== filter.branchId) return false;
      if (filter?.status && w.status !== filter.status) return false;
      return true;
    });
  }

  async findActiveByBranch(branchId: string, timestamp: Date = new Date()): Promise<MaintenanceWindow[]> {
    return Array.from(this.windows.values()).filter((w) => {
      if (w.branchId !== branchId) return false;
      if (w.status === "CANCELLED") return false;
      if (!w.approvedAt) return false; // Must be approved

      const recoveryDeadline = new Date(w.endsAt.getTime() + w.recoveryGraceSeconds * 1000);
      return w.startsAt <= timestamp && timestamp < recoveryDeadline;
    });
  }

  clear() {
    this.windows.clear();
  }
}

export const maintenanceWindowRepository = new MaintenanceWindowRepository();
