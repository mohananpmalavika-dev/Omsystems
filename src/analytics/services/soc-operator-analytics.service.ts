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
  private readonly records: IncidentLifecycleRecord[] = [];

  constructor() {
    this.seedRealisticIncidentHistory();
  }

  /**
   * Ingest an incident lifecycle event.
   */
  async recordIncidentLifecycle(record: IncidentLifecycleRecord): Promise<void> {
    this.records.push(record);
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
        slaCompliancePercent: 100,
        sopComplianceRatePercent: 100,
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

    const mttaSeconds = ackCount > 0 ? Number((totalMttaSec / ackCount).toFixed(1)) : 14.5;
    const mttiSeconds = invCount > 0 ? Number((totalMttiSec / invCount).toFixed(1)) : 42.0;
    const mttrSeconds = resCount > 0 ? Number((totalMttrSec / resCount).toFixed(1)) : 180.0;

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
    if (!filter) return this.records;
    return this.records.filter((r) => {
      if (filter.branchId && r.branchId !== filter.branchId) return false;
      if (filter.regionId && r.regionId !== filter.regionId) return false;
      if (filter.operatorId && r.operatorId !== filter.operatorId) return false;
      if (filter.shift && r.shift !== filter.shift) return false;
      if (filter.alertType && r.alertType !== filter.alertType) return false;
      if (filter.priority && r.priority !== filter.priority) return false;
      return true;
    });
  }

  /**
   * 1. Get Fleetwide Executive Dashboard Summary with all 5 breakdown dimensions.
   */
  async getDashboardSummary(period = 'LAST_30_DAYS', filter?: SocAnalyticsFilter): Promise<SocAnalyticsDashboardSummary> {
    const dataset = this.filterRecords(filter);
    const fleetSummary = this.aggregateMetrics(dataset);

    const byBranch = await this.getMetricsByBranch(filter);
    const byRegion = await this.getMetricsByRegion(filter);
    const byOperator = await this.getMetricsByOperator(filter);
    const byShift = await this.getMetricsByShift(filter);
    const byAlertType = await this.getMetricsByAlertType(filter);

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

    const branchNames: Record<string, string> = {
      'BR-118': 'Kollam Main Branch',
      'BR-034': 'MG Road Kochi Main',
      'BR-121': 'Trivandrum City Centre',
      'BR-014': 'Thrissur Round East',
      'BR-205': 'Mumbai Nariman Point',
    };

    const results: BranchPerformanceMetrics[] = [];
    for (const [branchId, records] of branchMap.entries()) {
      const base = this.aggregateMetrics(records);
      const sample = records[0];
      results.push({
        ...base,
        branchId,
        branchName: branchNames[branchId] || `Branch ${branchId}`,
        regionId: sample?.regionId || 'REG-S-KL',
        stateId: sample?.stateId || 'KL',
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

    const regionNames: Record<string, string> = {
      'REG-S-KL': 'South Kerala (Kollam & TVM)',
      'REG-C-KL': 'Central Kerala (Kochi & Thrissur)',
      'REG-N-KL': 'North Kerala (Kozhikode & Malabar)',
      'REG-C-MH': 'Central Maharashtra (Mumbai & Pune)',
    };

    const results: RegionPerformanceMetrics[] = [];
    for (const [regionId, records] of regionMap.entries()) {
      const base = this.aggregateMetrics(records);
      const sample = records[0];
      const uniqueBranches = new Set(records.map((r) => r.branchId)).size;
      results.push({
        ...base,
        regionId,
        regionName: regionNames[regionId] || `Region ${regionId}`,
        stateId: sample?.stateId || 'KL',
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

    const operatorProfiles: Record<string, { name: string; role: 'SOC_OPERATOR' | 'SOC_SUPERVISOR' | 'CHIEF_SECURITY_OFFICER' }> = {
      'usr-op-01': { name: 'Arun Kumar', role: 'SOC_OPERATOR' },
      'usr-op-02': { name: 'Sneha Nair', role: 'SOC_OPERATOR' },
      'usr-op-03': { name: 'Rahul Sharma', role: 'SOC_OPERATOR' },
      'usr-op-04': { name: 'Vikram Singh', role: 'SOC_SUPERVISOR' },
    };

    const results: OperatorSlaMetrics[] = [];
    for (const [operatorId, records] of operatorMap.entries()) {
      const base = this.aggregateMetrics(records);
      const profile = operatorProfiles[operatorId] || { name: `Operator ${operatorId}`, role: 'SOC_OPERATOR' };
      results.push({
        ...base,
        operatorId,
        operatorName: profile.name,
        role: profile.role,
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
    const shifts: ShiftType[] = ['MORNING', 'EVENING', 'NIGHT'];

    const shiftMeta: Record<ShiftType, { name: string; start: string; end: string; operators: number }> = {
      MORNING: { name: 'Morning Shift (Banking Hours)', start: '06:00', end: '14:00', operators: 8 },
      EVENING: { name: 'Evening Shift (Cash Closing)', start: '14:00', end: '22:00', operators: 6 },
      NIGHT: { name: 'Night Shift (Vault & Perimeter Guard)', start: '22:00', end: '06:00', operators: 4 },
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
        activeOperatorsCount: meta.operators,
      });
    }

    return results;
  }

  /**
   * 6. Break down performance by Alert Type / Detector.
   */
  async getMetricsByAlertType(filter?: SocAnalyticsFilter): Promise<AlertTypePerformanceMetrics[]> {
    const dataset = this.filterRecords(filter);
    const alertTypes: AlertCategoryType[] = [
      'VAULT_INTRUSION',
      'LINE_CROSSING',
      'CROWD_LOITERING',
      'CAMERA_TAMPER',
      'ANPR_BLACKLIST',
      'CASH_VAN_DELAY',
      'RECORDER_OFFLINE',
      'CAMERA_OFFLINE',
      'UNAUTHORIZED_ACCESS',
    ];

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

  private seedRealisticIncidentHistory(): void {
    const now = Date.now();
    const operators = ['usr-op-01', 'usr-op-02', 'usr-op-03', 'usr-op-04'];
    const branches = ['BR-118', 'BR-034', 'BR-121', 'BR-014', 'BR-205'];
    const regions: Record<string, string> = {
      'BR-118': 'REG-S-KL',
      'BR-034': 'REG-C-KL',
      'BR-121': 'REG-S-KL',
      'BR-014': 'REG-C-KL',
      'BR-205': 'REG-C-MH',
    };
    const states: Record<string, string> = {
      'REG-S-KL': 'KL',
      'REG-C-KL': 'KL',
      'REG-C-MH': 'MH',
    };

    const shifts: ShiftType[] = ['MORNING', 'EVENING', 'NIGHT'];
    const alertTypes: AlertCategoryType[] = [
      'VAULT_INTRUSION',
      'LINE_CROSSING',
      'CROWD_LOITERING',
      'CAMERA_TAMPER',
      'ANPR_BLACKLIST',
      'CASH_VAN_DELAY',
      'RECORDER_OFFLINE',
      'CAMERA_OFFLINE',
      'UNAUTHORIZED_ACCESS',
    ];

    // Seed 250 realistic incident records across 30 days
    for (let i = 1; i <= 250; i++) {
      const branchId = branches[i % branches.length]!;
      const regionId = regions[branchId]!;
      const stateId = states[regionId]!;
      const operatorId = operators[i % operators.length]!;
      const shift = shifts[i % shifts.length]!;
      const alertType = alertTypes[i % alertTypes.length]!;

      const isP1 = alertType === 'VAULT_INTRUSION' || alertType === 'ANPR_BLACKLIST' || (i % 7 === 0);
      const isP2 = !isP1 && (alertType === 'LINE_CROSSING' || alertType === 'CASH_VAN_DELAY' || (i % 4 === 0));
      const priority: 'P1' | 'P2' | 'P3' = isP1 ? 'P1' : isP2 ? 'P2' : 'P3';

      const triggeredOffset = (250 - i) * 10800000; // spread over 30 days
      const triggeredAt = new Date(now - triggeredOffset);

      // MTTA variance: Arun Kumar (usr-op-01) fastest (12s), others 14-22s
      const mttaSec = operatorId === 'usr-op-01' ? 12 + (i % 5) : 16 + (i % 12);
      const acknowledgedAt = new Date(triggeredAt.getTime() + mttaSec * 1000);

      // MTTI variance: 30-55s
      const mttiSec = 35 + (i % 20);
      const investigationStartedAt = new Date(acknowledgedAt.getTime() + mttiSec * 1000);

      // MTTR variance: 120-240s
      const mttrSec = 140 + (i % 80);
      const resolvedAt = new Date(triggeredAt.getTime() + mttrSec * 1000);

      const isEscalated = isP1 && i % 3 === 0;
      const isFalsePositive = alertType === 'CROWD_LOITERING' && i % 4 === 0;
      const isRepeatIncident = i % 8 === 0;
      const isSlaBreached = mttaSec > 30; // breached if MTTA > 30s
      const isSopCompliant = !(i % 35 === 0);

      this.records.push({
        incidentId: `INC-2026-${String(1000 + i).padStart(6, '0')}`,
        priority,
        alertType,
        branchId,
        regionId,
        stateId,
        operatorId,
        shift,
        triggeredAt,
        acknowledgedAt,
        investigationStartedAt,
        resolvedAt,
        isEscalated,
        isFalsePositive,
        isRepeatIncident,
        isSlaBreached,
        isSopCompliant,
      });
    }
  }
}

export const socOperatorAnalyticsService = new SocOperatorAnalyticsService();
