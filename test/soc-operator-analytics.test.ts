import { describe, it, expect } from 'vitest';
import { SocOperatorAnalyticsService } from '../src/analytics/services/soc-operator-analytics.service.js';
import type {
  AlertCategoryType,
  IncidentLifecycleRecord,
  ShiftType,
} from '../src/analytics/domain/soc-analytics.types.js';

describe('SOC Operator Performance Analytics & SLA Learning Subsystem (Genetec Mission Control Parity)', () => {
  it('computes fleetwide executive summary with MTTA, MTTI, MTTR, escalation, and false positive rates', async () => {
    const service = new SocOperatorAnalyticsService();
    await seedFleet(service);
    const summary = await service.getDashboardSummary('LAST_30_DAYS');

    expect(summary.period).toBe('LAST_30_DAYS');
    expect(summary.fleetSummary.totalIncidents).toBe(250);
    expect(summary.fleetSummary.p1Count).toBeGreaterThan(0);
    expect(summary.fleetSummary.p2Count).toBeGreaterThan(0);

    // MTTA < 30s bank SLA target
    expect(summary.fleetSummary.mttaSeconds).toBeGreaterThan(0);
    expect(summary.fleetSummary.mttaSeconds).toBeLessThan(30);

    // MTTI & MTTR
    expect(summary.fleetSummary.mttiSeconds).toBeGreaterThan(0);
    expect(summary.fleetSummary.mttrSeconds).toBeGreaterThan(summary.fleetSummary.mttiSeconds);

    // Escalation, False Positive, and Repeat Incident Rates
    expect(summary.fleetSummary.escalationRatePercent).toBeGreaterThanOrEqual(0);
    expect(summary.fleetSummary.falsePositiveRatePercent).toBeGreaterThanOrEqual(0);
    expect(summary.fleetSummary.repeatIncidentRatePercent).toBeGreaterThanOrEqual(0);
    expect(summary.fleetSummary.slaCompliancePercent).toBeGreaterThan(80);
  });

  it('calculates performance breakdown across all 5 dimensions (Branch, Region, Operator, Shift, Alert Type)', async () => {
    const service = new SocOperatorAnalyticsService();
    await seedFleet(service);

    // 1. By Branch
    const branches = await service.getMetricsByBranch();
    expect(branches.length).toBe(5);
    const br118 = branches.find((b) => b.branchId === 'BR-118')!;
    expect(br118).toBeDefined();
    expect(br118.branchName).toBe('Kollam Main Branch');
    expect(br118.p1Count).toBeGreaterThanOrEqual(1);
    expect(br118.mttaSeconds).toBeGreaterThan(0);
    expect(br118.mttiSeconds).toBeGreaterThan(0);
    expect(br118.mttrSeconds).toBeGreaterThan(0);

    // 2. By Region
    const regions = await service.getMetricsByRegion();
    expect(regions.length).toBe(3);
    const southKerala = regions.find((r) => r.regionId === 'REG-S-KL')!;
    expect(southKerala).toBeDefined();
    expect(southKerala.regionName).toContain('South Kerala');
    expect(southKerala.totalBranches).toBe(2);

    // 3. By Operator
    const operators = await service.getMetricsByOperator();
    expect(operators.length).toBe(4);
    const topOp = operators[0]!;
    expect(topOp).toBeDefined();
    expect(topOp.operatorName).toBe('Arun Kumar'); // Fastest MTTA operator
    expect(topOp.totalIncidentsHandled).toBeGreaterThan(30);
    expect(topOp.mttaSeconds).toBeLessThan(20);
    expect(topOp.sopComplianceRatePercent).toBeGreaterThan(90);

    // 4. By Shift
    const shifts = await service.getMetricsByShift();
    expect(shifts.length).toBe(3);
    const morning = shifts.find((s) => s.shift === 'MORNING')!;
    const evening = shifts.find((s) => s.shift === 'EVENING')!;
    const night = shifts.find((s) => s.shift === 'NIGHT')!;
    expect(morning.activeOperatorsCount).toBe(4);
    expect(evening.activeOperatorsCount).toBe(4);
    expect(night.activeOperatorsCount).toBe(4);

    // 5. By Alert Type / Detector
    const alertTypes = await service.getMetricsByAlertType();
    expect(alertTypes.length).toBe(9);
    const vaultIntrusion = alertTypes.find((a) => a.alertType === 'VAULT_INTRUSION')!;
    expect(vaultIntrusion).toBeDefined();
    expect(vaultIntrusion.requiresQrtDispatch).toBe(true);
    expect(vaultIntrusion.p1Count).toBeGreaterThan(0);
  });

  it('supports filtered analytics queries (e.g. shift = NIGHT, priority = P1)', async () => {
    const service = new SocOperatorAnalyticsService();
    await seedFleet(service);
    const summary = await service.getDashboardSummary('LAST_30_DAYS', {
      shift: 'NIGHT',
      priority: 'P1',
    });

    expect(summary.fleetSummary.p1Count).toBe(summary.fleetSummary.totalIncidents);
    expect(summary.fleetSummary.p2Count).toBe(0);
    expect(summary.fleetSummary.p3Count).toBe(0);
  });

  it('ingests live incident lifecycle events and updates operator SLA metrics', async () => {
    const service = new SocOperatorAnalyticsService();
    await seedFleet(service);
    const now = new Date();

    await service.recordIncidentLifecycle({
      tenantId: 'omsystems',
      incidentId: 'INC-2026-LIVE-999',
      priority: 'P1',
      alertType: 'VAULT_INTRUSION',
      branchId: 'BR-118',
      regionId: 'REG-S-KL',
      stateId: 'KL',
      operatorId: 'usr-op-01',
      shift: 'NIGHT',
      triggeredAt: now,
      acknowledgedAt: new Date(now.getTime() + 8000), // 8 sec MTTA
      investigationStartedAt: new Date(now.getTime() + 25000), // 17 sec MTTI
      resolvedAt: new Date(now.getTime() + 110000), // 110 sec MTTR
      isEscalated: true,
      isFalsePositive: false,
      isRepeatIncident: false,
      isSlaBreached: false,
      isSopCompliant: true,
    });

    const summary = await service.getDashboardSummary('LAST_30_DAYS');
    expect(summary.fleetSummary.totalIncidents).toBe(251);
  });

  it('updates repeated lifecycle records idempotently and applies inclusive date filters', async () => {
    const service = new SocOperatorAnalyticsService();
    const initial = fleetRecord(0, new Date('2026-08-30T10:00:00.000Z'));
    await service.recordIncidentLifecycle(initial);
    await service.recordIncidentLifecycle({
      ...initial,
      resolvedAt: new Date('2026-08-30T10:03:00.000Z'),
    });

    const included = await service.getDashboardSummary('CUSTOM', {
      tenantId: 'omsystems',
      startDate: '2026-08-30T10:00:00.000Z',
      endDate: '2026-08-30T10:00:00.000Z',
    });
    expect(included.fleetSummary).toMatchObject({ totalIncidents: 1, mttrSeconds: 180 });

    const excluded = await service.getDashboardSummary('CUSTOM', {
      tenantId: 'omsystems',
      startDate: '2026-08-30T10:00:00.001Z',
    });
    expect(excluded.fleetSummary.totalIncidents).toBe(0);
  });
});

const branches = [
  ['BR-118', 'Kollam Main Branch', 'REG-S-KL', 'South Kerala Region', 'KL'],
  ['BR-119', 'Thiruvananthapuram Central', 'REG-S-KL', 'South Kerala Region', 'KL'],
  ['BR-210', 'Kochi North', 'REG-C-KL', 'Central Kerala Region', 'KL'],
  ['BR-310', 'Kozhikode Main', 'REG-N-KL', 'North Kerala Region', 'KL'],
  ['BR-311', 'Kannur Main', 'REG-N-KL', 'North Kerala Region', 'KL'],
] as const;
const operators = [
  ['usr-op-01', 'Arun Kumar'],
  ['usr-op-02', 'Beena Joseph'],
  ['usr-op-03', 'Cyril Mathew'],
  ['usr-op-04', 'Deepa Nair'],
] as const;
const shifts: ShiftType[] = ['MORNING', 'EVENING', 'NIGHT'];
const alertTypes: AlertCategoryType[] = [
  'VAULT_INTRUSION', 'LINE_CROSSING', 'CROWD_LOITERING',
  'CAMERA_TAMPER', 'ANPR_BLACKLIST', 'CASH_VAN_DELAY',
  'RECORDER_OFFLINE', 'CAMERA_OFFLINE', 'UNAUTHORIZED_ACCESS',
];

async function seedFleet(service: SocOperatorAnalyticsService, count = 250) {
  const now = Date.now();
  for (let index = 0; index < count; index += 1) {
    await service.recordIncidentLifecycle(fleetRecord(
      index,
      new Date(now - index * 60_000),
    ));
  }
}

function fleetRecord(index: number, triggeredAt: Date): IncidentLifecycleRecord {
  const branch = branches[index % branches.length]!;
  const operator = operators[index % operators.length]!;
  const acknowledgeSeconds = 8 + (index % operators.length) * 4;
  return {
    tenantId: 'omsystems',
    incidentId: `INC-TEST-${index.toString().padStart(4, '0')}`,
    priority: index % 5 === 0 ? 'P1' : index % 2 === 0 ? 'P2' : 'P3',
    alertType: alertTypes[index % alertTypes.length]!,
    branchId: branch[0],
    branchName: branch[1],
    regionId: branch[2],
    regionName: branch[3],
    stateId: branch[4],
    operatorId: operator[0],
    operatorName: operator[1],
    operatorRole: 'SOC_OPERATOR',
    shift: shifts[index % shifts.length]!,
    triggeredAt,
    acknowledgedAt: new Date(triggeredAt.getTime() + acknowledgeSeconds * 1_000),
    investigationStartedAt: new Date(triggeredAt.getTime() + (acknowledgeSeconds + 20) * 1_000),
    resolvedAt: new Date(triggeredAt.getTime() + (120 + index % 30) * 1_000),
    isEscalated: index % 10 === 0,
    isFalsePositive: index % 25 === 0,
    isRepeatIncident: index % 20 === 0,
    isSlaBreached: index % 20 === 0,
    isSopCompliant: index % 15 !== 0,
  };
}
