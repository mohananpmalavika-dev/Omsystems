import type {
  SocAnalyticsDashboardSummary,
  OperatorSlaMetrics,
  BranchPerformanceMetrics,
  RegionPerformanceMetrics,
  ShiftPerformanceMetrics,
  AlertTypePerformanceMetrics,
  BaseSlaMetrics,
  IncidentLifecycleRecord,
  SocAnalyticsFilter,
  ShiftType,
  AlertCategoryType,
} from '../domain/soc-analytics.types.js';

export class SocOperatorAnalyticsService {
  private readonly records = new Map<string, IncidentLifecycleRecord>();

  /**
   * Ingest an incident lifecycle event.
   */
  async recordIncidentLifecycle(record: IncidentLifecycleRecord): Promise<void> {
    validateLifecycle(record);
    const key = `${record.tenantId}:${record.incidentId}`;
    const existing = this.records.get(key);
    this.records.set(key, cloneLifecycle(existing ? { ...existing, ...record } : record));
  }

  /**
   * Compute aggregated metrics for an array of lifecycle records.
   */
  private aggregateMetrics(subset: IncidentLifecycleRecord[]): BaseSlaMetrics {
    if (subset.length === 0) {
      return {
        totalIncidents: 0,
        p1Count: 0,
        p2Count: 0,
        p3Count: 0,
        mttaSeconds: 0,
        mttiSeconds: 0,
        mttrSeconds: 0,
        escalationRatePercent: 0,
        falsePositiveRatePercent: 0,
        repeatIncidentRatePercent: 0,
        unacknowledgedSlaBreaches: 0,
        slaCompliancePercent: 0,
        sopComplianceRatePercent: 0,
      };
    }

    const total = subset.length;
    let p1 = 0;
    let p2 = 0;
    let p3 = 0;
    let totalMttaSec = 0;
    let totalMttiSec = 0;
    let totalMttrSec = 0;
    let ackCount = 0;
    let invCount = 0;
    let resCount = 0;
    let escalatedCount = 0;
    let fpCount = 0;
    let repeatCount = 0;
    let breachCount = 0;
    let sopCompliantCount = 0;

    for (const r of subset) {
      if (r.priority === 'P1') p1++;
      else if (r.priority === 'P2') p2++;
      else p3++;

      if (r.acknowledgedAt) {
        const mtta = (r.acknowledgedAt.getTime() - r.triggeredAt.getTime()) / 1000;
        totalMttaSec += Math.max(mtta, 0);
        ackCount++;
      }

      if (r.investigationStartedAt && r.acknowledgedAt) {
        const mtti = (r.investigationStartedAt.getTime() - r.acknowledgedAt.getTime()) / 1000;
        totalMttiSec += Math.max(mtti, 0);
        invCount++;
      }

      if (r.resolvedAt) {
        const mttr = (r.resolvedAt.getTime() - r.triggeredAt.getTime()) / 1000;
        totalMttrSec += Math.max(mttr, 0);
        resCount++;
      }

      if (r.isEscalated) escalatedCount++;
      if (r.isFalsePositive) fpCount++;
      if (r.isRepeatIncident) repeatCount++;
      if (r.isSlaBreached) breachCount++;
      if (r.isSopCompliant) sopCompliantCount++;
    }

    const mttaSeconds = ackCount > 0 ? Number((totalMttaSec / ackCount).toFixed(1)) : 0;
    const mttiSeconds = invCount > 0 ? Number((totalMttiSec / invCount).toFixed(1)) : 0;
    const mttrSeconds = resCount > 0 ? Number((totalMttrSec / resCount).toFixed(1)) : 0;

    const escalationRatePercent = Number(((escalatedCount / total) * 100).toFixed(1));
    const falsePositiveRatePercent = Number(((fpCount / total) * 100).toFixed(1));
    const repeatIncidentRatePercent = Number(((repeatCount / total) * 100).toFixed(1));
    const sopComplianceRatePercent = Number(((sopCompliantCount / total) * 100).toFixed(1));
    const slaCompliancePercent = Number((((total - breachCount) / total) * 100).toFixed(1));

    return {
      totalIncidents: total,
      p1Count: p1,
      p2Count: p2,
      p3Count: p3,
      mttaSeconds,
      mttiSeconds,
      mttrSeconds,
      escalationRatePercent,
      falsePositiveRatePercent,
      repeatIncidentRatePercent,
      unacknowledgedSlaBreaches: breachCount,
      slaCompliancePercent,
      sopComplianceRatePercent,
    };
  }

  /**
   * Filter records based on criteria.
   */
  private filterRecords(filter?: SocAnalyticsFilter): IncidentLifecycleRecord[] {
    const records = [...this.records.values()];
    if (!filter) return records;
    const start = filter.startDate ? Date.parse(filter.startDate) : Number.NEGATIVE_INFINITY;
    const end = filter.endDate ? Date.parse(filter.endDate) : Number.POSITIVE_INFINITY;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end) {
      throw new Error("invalid_soc_analytics_date_range");
    }
    return records.filter((r) => {
      if (filter.tenantId && r.tenantId !== filter.tenantId) return false;
      if (filter.branchId && r.branchId !== filter.branchId) return false;
      if (filter.regionId && r.regionId !== filter.regionId) return false;
      if (filter.operatorId && r.operatorId !== filter.operatorId) return false;
      if (filter.shift && r.shift !== filter.shift) return false;
      if (filter.alertType && r.alertType !== filter.alertType) return false;
      if (filter.priority && r.priority !== filter.priority) return false;
      const triggeredAt = r.triggeredAt.getTime();
      if (triggeredAt < start || triggeredAt > end) return false;
      return true;
    });
  }

  /**
   * 1. Get Fleetwide Executive Dashboard Summary with all 5 breakdown dimensions.
   */
  async getDashboardSummary(period = 'LAST_30_DAYS', filter?: SocAnalyticsFilter): Promise<SocAnalyticsDashboardSummary> {
    const effectiveFilter = filterForPeriod(period, filter);
    const dataset = this.filterRecords(effectiveFilter);
    const fleetSummary = this.aggregateMetrics(dataset);

    const byBranch = await this.getMetricsByBranch(effectiveFilter);
    const byRegion = await this.getMetricsByRegion(effectiveFilter);
    const byOperator = await this.getMetricsByOperator(effectiveFilter);
    const byShift = await this.getMetricsByShift(effectiveFilter);
    const byAlertType = await this.getMetricsByAlertType(effectiveFilter);

    return {
      period,
      generatedAt: new Date(),
      fleetSummary,
      byBranch,
      byRegion,
      byOperator,
      byShift,
      byAlertType,
    };
  }

  /**
   * 2. Break down performance by Branch.
   */
  async getMetricsByBranch(filter?: SocAnalyticsFilter): Promise<BranchPerformanceMetrics[]> {
    const dataset = this.filterRecords(filter);
    const branchMap = new Map<string, IncidentLifecycleRecord[]>();

    for (const r of dataset) {
      const list = branchMap.get(r.branchId) || [];
      list.push(r);
      branchMap.set(r.branchId, list);
    }

    const results: BranchPerformanceMetrics[] = [];
    for (const [branchId, records] of branchMap.entries()) {
      const base = this.aggregateMetrics(records);
      const sample = records[0];
      results.push({
        ...base,
        branchId,
        branchName: sample?.branchName ?? branchId,
        regionId: sample!.regionId,
        stateId: sample!.stateId,
      });
    }

    // Sort by total incidents descending
    return results.sort((a, b) => b.totalIncidents - a.totalIncidents);
  }

  /**
   * 3. Break down performance by Region.
   */
  async getMetricsByRegion(filter?: SocAnalyticsFilter): Promise<RegionPerformanceMetrics[]> {
    const dataset = this.filterRecords(filter);
    const regionMap = new Map<string, IncidentLifecycleRecord[]>();

    for (const r of dataset) {
      const list = regionMap.get(r.regionId) || [];
      list.push(r);
      regionMap.set(r.regionId, list);
    }

    const results: RegionPerformanceMetrics[] = [];
    for (const [regionId, records] of regionMap.entries()) {
      const base = this.aggregateMetrics(records);
      const sample = records[0];
      const uniqueBranches = new Set(records.map((r) => r.branchId)).size;
      results.push({
        ...base,
        regionId,
        regionName: sample?.regionName ?? regionId,
        stateId: sample!.stateId,
        totalBranches: uniqueBranches,
      });
    }

    return results.sort((a, b) => b.totalIncidents - a.totalIncidents);
  }

  /**
   * 4. Break down performance by Operator.
   */
  async getMetricsByOperator(filter?: SocAnalyticsFilter): Promise<OperatorSlaMetrics[]> {
    const dataset = this.filterRecords(filter);
    const operatorMap = new Map<string, IncidentLifecycleRecord[]>();

    for (const r of dataset) {
      const list = operatorMap.get(r.operatorId) || [];
      list.push(r);
      operatorMap.set(r.operatorId, list);
    }

    const results: OperatorSlaMetrics[] = [];
    for (const [operatorId, records] of operatorMap.entries()) {
      const base = this.aggregateMetrics(records);
      results.push({
        ...base,
        operatorId,
        operatorName: records[0]?.operatorName ?? operatorId,
        role: records[0]?.operatorRole ?? 'SOC_OPERATOR',
        totalIncidentsHandled: records.length,
        averageHandlingTimeSeconds: base.mttrSeconds,
      });
    }

    return results.sort((a, b) => a.mttaSeconds - b.mttaSeconds); // Sort by fastest acknowledgment
  }

  /**
   * 5. Break down performance by Shift.
   */
  async getMetricsByShift(filter?: SocAnalyticsFilter): Promise<ShiftPerformanceMetrics[]> {
    const dataset = this.filterRecords(filter);
    const shifts = Array.from(new Set(dataset.map((record) => record.shift))) as ShiftType[];

    const shiftMeta: Record<ShiftType, { name: string; start: string; end: string; operators: number }> = {
      MORNING: { name: 'Morning', start: '06:00', end: '14:00', operators: 0 },
      EVENING: { name: 'Evening', start: '14:00', end: '22:00', operators: 0 },
      NIGHT: { name: 'Night', start: '22:00', end: '06:00', operators: 0 },
    };

    const results: ShiftPerformanceMetrics[] = [];
    for (const s of shifts) {
      const records = dataset.filter((r) => r.shift === s);
      const base = this.aggregateMetrics(records);
      const meta = shiftMeta[s];
      results.push({
        ...base,
        shift: s,
        shiftName: meta.name,
        startTime: meta.start,
        endTime: meta.end,
        activeOperatorsCount: new Set(records.map((record) => record.operatorId)).size,
      });
    }

    return results;
  }

  /**
   * 6. Break down performance by Alert Type / Detector.
   */
  async getMetricsByAlertType(filter?: SocAnalyticsFilter): Promise<AlertTypePerformanceMetrics[]> {
    const dataset = this.filterRecords(filter);
    const alertTypes = Array.from(new Set(dataset.map((record) => record.alertType))) as AlertCategoryType[];

    const alertNames: Record<AlertCategoryType, { name: string; qrt: boolean }> = {
      VAULT_INTRUSION: { name: 'Vault & Strongroom Intrusion', qrt: true },
      LINE_CROSSING: { name: 'Perimeter Tripwire Line Crossing', qrt: true },
      CROWD_LOITERING: { name: 'ATM Lobby Loitering & Congestion', qrt: false },
      CAMERA_TAMPER: { name: 'Camera Tamper / Spray / Defocus', qrt: false },
      ANPR_BLACKLIST: { name: 'Blacklisted Vehicle License Plate', qrt: true },
      CASH_VAN_DELAY: { name: 'Armored Cash-Van Bay Bay Occupancy Exceeded', qrt: true },
      RECORDER_OFFLINE: { name: 'NVR / DVR Hardware Communication Lost', qrt: false },
      CAMERA_OFFLINE: { name: 'Camera Signal Video Loss', qrt: false },
      UNAUTHORIZED_ACCESS: { name: 'Server Room Unauthorized Badge Access', qrt: true },
    };

    const results: AlertTypePerformanceMetrics[] = [];
    for (const type of alertTypes) {
      const records = dataset.filter((r) => r.alertType === type);
      const base = this.aggregateMetrics(records);
      const meta = alertNames[type];
      results.push({
        ...base,
        alertType: type,
        alertTypeName: meta.name,
        requiresQrtDispatch: meta.qrt,
      });
    }

    return results.sort((a, b) => b.totalIncidents - a.totalIncidents);
  }

}

export const socOperatorAnalyticsService = new SocOperatorAnalyticsService();

function validateLifecycle(record: IncidentLifecycleRecord) {
  const triggeredAt = record.triggeredAt.getTime();
  if (!record.tenantId.trim() || !record.incidentId.trim() || !Number.isFinite(triggeredAt)) {
    throw new Error("invalid_incident_lifecycle");
  }
  const ordered = [
    record.acknowledgedAt,
    record.investigationStartedAt,
    record.resolvedAt,
  ].filter((value): value is Date => value !== undefined);
  if (ordered.some((value) => !Number.isFinite(value.getTime()) || value.getTime() < triggeredAt)) {
    throw new Error("invalid_incident_lifecycle_order");
  }
  if (record.acknowledgedAt && record.investigationStartedAt &&
      record.investigationStartedAt < record.acknowledgedAt) {
    throw new Error("invalid_incident_lifecycle_order");
  }
}

function cloneLifecycle(record: IncidentLifecycleRecord): IncidentLifecycleRecord {
  return {
    ...record,
    triggeredAt: new Date(record.triggeredAt),
    ...(record.acknowledgedAt ? { acknowledgedAt: new Date(record.acknowledgedAt) } : {}),
    ...(record.investigationStartedAt
      ? { investigationStartedAt: new Date(record.investigationStartedAt) }
      : {}),
    ...(record.resolvedAt ? { resolvedAt: new Date(record.resolvedAt) } : {}),
  };
}

function filterForPeriod(period: string, filter?: SocAnalyticsFilter): SocAnalyticsFilter | undefined {
  if (filter?.startDate || filter?.endDate || period === "ALL_TIME" || period === "CUSTOM") return filter;
  const durations: Record<string, number> = {
    LAST_24_HOURS: 24 * 60 * 60 * 1_000,
    LAST_7_DAYS: 7 * 24 * 60 * 60 * 1_000,
    LAST_30_DAYS: 30 * 24 * 60 * 60 * 1_000,
    LAST_90_DAYS: 90 * 24 * 60 * 60 * 1_000,
  };
  const duration = durations[period];
  if (!duration) return filter;
  const end = new Date();
  return {
    ...filter,
    startDate: new Date(end.getTime() - duration).toISOString(),
    endDate: end.toISOString(),
  };
}
