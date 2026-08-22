/**
 * Occupancy Ledger
 * Maintains accurate occupancy counts with corrections and audit trail
 */

import { randomUUID } from "node:crypto";
import type { OccupancyLedgerEntry, CrossingEvent } from "../types.js";

export interface OccupancyState {
  zoneId: string;
  occupancy: number;
  confidence: number;
  lastReconciledAt?: Date;
  lastUpdatedAt: Date;
  coverage: {
    monitoredEntrances: number;
    totalEntrances: number;
  };
}

export class OccupancyLedger {
  private ledger: OccupancyLedgerEntry[] = [];
  private currentOccupancy = new Map<string, number>();
  private baselineOccupancy = new Map<string, number>();

  constructor(
    private readonly siteId: string,
  ) {}

  /**
   * Process crossing event and update occupancy
   */
  processCrossingEvent(
    event: CrossingEvent,
    zoneId: string,
  ): OccupancyLedgerEntry {
    const delta = event.direction === "entry" ? 1 : -1;

    const entry: OccupancyLedgerEntry = {
      id: `ledger_${randomUUID()}`,
      siteId: this.siteId,
      zoneId,
      timestamp: event.crossedAt,
      delta,
      reason: event.direction === "entry" ? "camera_entry" : "camera_exit",
      sourceEventId: event.id,
      confidence: event.confidence,
    };

    this.addEntry(entry);
    return entry;
  }

  /**
   * Add manual correction
   */
  addManualCorrection(
    zoneId: string,
    delta: number,
    timestamp: Date,
    reason: string,
  ): OccupancyLedgerEntry {
    const entry: OccupancyLedgerEntry = {
      id: `ledger_${randomUUID()}`,
      siteId: this.siteId,
      zoneId,
      timestamp,
      delta,
      reason: "manual_correction",
      sourceEventId: `manual_${Date.now()}`,
      confidence: 1.0,
    };

    this.addEntry(entry);
    return entry;
  }

  /**
   * Add access control correlation
   */
  addAccessControlEvent(
    zoneId: string,
    delta: number,
    timestamp: Date,
    accessEventId: string,
  ): OccupancyLedgerEntry {
    const entry: OccupancyLedgerEntry = {
      id: `ledger_${randomUUID()}`,
      siteId: this.siteId,
      zoneId,
      timestamp,
      delta,
      reason: "access_control",
      sourceEventId: accessEventId,
      confidence: 0.95,
    };

    this.addEntry(entry);
    return entry;
  }

  /**
   * Add reconciliation entry
   */
  addReconciliation(
    zoneId: string,
    actualCount: number,
    timestamp: Date,
  ): OccupancyLedgerEntry {
    const currentCount = this.getOccupancy(zoneId);
    const delta = actualCount - currentCount;

    const entry: OccupancyLedgerEntry = {
      id: `ledger_${randomUUID()}`,
      siteId: this.siteId,
      zoneId,
      timestamp,
      delta,
      reason: "reconciliation",
      sourceEventId: `reconciliation_${Date.now()}`,
      confidence: 1.0,
    };

    this.addEntry(entry);

    // Update baseline
    this.baselineOccupancy.set(zoneId, actualCount);

    return entry;
  }

  /**
   * Add entry to ledger
   */
  private addEntry(entry: OccupancyLedgerEntry): void {
    this.ledger.push(entry);

    // Update current occupancy
    const current = this.currentOccupancy.get(entry.zoneId) || 0;
    this.currentOccupancy.set(entry.zoneId, Math.max(0, current + entry.delta));
  }

  /**
   * Get current occupancy for a zone
   */
  getOccupancy(zoneId: string): number {
    return this.currentOccupancy.get(zoneId) || 0;
  }

  /**
   * Get occupancy state with confidence
   */
  getOccupancyState(
    zoneId: string,
    monitoredEntrances: number,
    totalEntrances: number,
  ): OccupancyState {
    const occupancy = this.getOccupancy(zoneId);
    const confidence = this.calculateConfidence(zoneId, monitoredEntrances, totalEntrances);
    const lastReconciliation = this.getLastReconciliation(zoneId);

    return {
      zoneId,
      occupancy,
      confidence,
      lastReconciledAt: lastReconciliation?.timestamp,
      lastUpdatedAt: new Date(),
      coverage: {
        monitoredEntrances,
        totalEntrances,
      },
    };
  }

  /**
   * Calculate occupancy confidence
   */
  private calculateConfidence(
    zoneId: string,
    monitoredEntrances: number,
    totalEntrances: number,
  ): number {
    let confidence = 0.5;

    // Coverage factor
    if (totalEntrances > 0) {
      const coverageRatio = monitoredEntrances / totalEntrances;
      confidence = coverageRatio * 0.6;
    }

    // Recent reconciliation factor
    const lastReconciliation = this.getLastReconciliation(zoneId);
    if (lastReconciliation) {
      const timeSinceReconciliation =
        Date.now() - lastReconciliation.timestamp.getTime();
      const hoursSinceReconciliation = timeSinceReconciliation / (1000 * 60 * 60);

      if (hoursSinceReconciliation < 1) {
        confidence += 0.3;
      } else if (hoursSinceReconciliation < 4) {
        confidence += 0.2;
      } else if (hoursSinceReconciliation < 12) {
        confidence += 0.1;
      }
    }

    // Entry/exit balance factor
    const balance = this.getEntryExitBalance(zoneId);
    if (Math.abs(balance) < 5) {
      confidence += 0.1;
    }

    return Math.min(0.95, confidence);
  }

  /**
   * Get entry/exit balance for a zone
   */
  private getEntryExitBalance(zoneId: string): number {
    const entries = this.ledger.filter(
      (e) =>
        e.zoneId === zoneId &&
        (e.reason === "camera_entry" || e.reason === "access_control") &&
        e.delta > 0,
    ).length;

    const exits = this.ledger.filter(
      (e) =>
        e.zoneId === zoneId &&
        (e.reason === "camera_exit" || e.reason === "access_control") &&
        e.delta < 0,
    ).length;

    return entries - exits;
  }

  /**
   * Get last reconciliation entry
   */
  private getLastReconciliation(zoneId: string): OccupancyLedgerEntry | undefined {
    return this.ledger
      .filter((e) => e.zoneId === zoneId && e.reason === "reconciliation")
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];
  }

  /**
   * Get ledger entries for a zone
   */
  getLedgerEntries(
    zoneId: string,
    fromDate?: Date,
    toDate?: Date,
  ): OccupancyLedgerEntry[] {
    return this.ledger.filter((entry) => {
      if (entry.zoneId !== zoneId) return false;
      if (fromDate && entry.timestamp < fromDate) return false;
      if (toDate && entry.timestamp > toDate) return false;
      return true;
    });
  }

  /**
   * Get occupancy history
   */
  getOccupancyHistory(
    zoneId: string,
    fromDate: Date,
    toDate: Date,
    intervalMinutes: number = 5,
  ): Array<{ timestamp: Date; occupancy: number; confidence: number }> {
    const entries = this.getLedgerEntries(zoneId, fromDate, toDate);
    const history: Array<{ timestamp: Date; occupancy: number; confidence: number }> =
      [];

    let currentOccupancy = this.baselineOccupancy.get(zoneId) || 0;
    let currentTime = new Date(fromDate);

    while (currentTime <= toDate) {
      // Apply all entries up to current time
      const applicableEntries = entries.filter(
        (e) => e.timestamp <= currentTime,
      );

      for (const entry of applicableEntries) {
        currentOccupancy = Math.max(0, currentOccupancy + entry.delta);
      }

      // Calculate confidence (simplified)
      const confidence = 0.7;

      history.push({
        timestamp: new Date(currentTime),
        occupancy: currentOccupancy,
        confidence,
      });

      currentTime = new Date(
        currentTime.getTime() + intervalMinutes * 60 * 1000,
      );
    }

    return history;
  }

  /**
   * Get statistics
   */
  getStatistics(zoneId: string): {
    totalEntries: number;
    totalExits: number;
    manualCorrections: number;
    reconciliations: number;
    currentOccupancy: number;
  } {
    const entries = this.getLedgerEntries(zoneId);

    return {
      totalEntries: entries.filter(
        (e) => e.reason === "camera_entry" && e.delta > 0,
      ).length,
      totalExits: entries.filter(
        (e) => e.reason === "camera_exit" && e.delta < 0,
      ).length,
      manualCorrections: entries.filter((e) => e.reason === "manual_correction")
        .length,
      reconciliations: entries.filter((e) => e.reason === "reconciliation")
        .length,
      currentOccupancy: this.getOccupancy(zoneId),
    };
  }

  /**
   * Clear old entries (for memory management)
   */
  clearOldEntries(beforeTimestamp: Date): void {
    this.ledger = this.ledger.filter(
      (entry) => entry.timestamp >= beforeTimestamp,
    );
  }
}
