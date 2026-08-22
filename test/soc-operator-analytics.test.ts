import { describe, it, expect } from 'vitest';
import {
  socOperatorAnalyticsService,
  SocOperatorAnalyticsService,
} from '../src/analytics/services/soc-operator-analytics.service.js';

describe('SOC Operator Performance Analytics & SLA Learning Subsystem (Genetec Mission Control Parity)', () => {
  it('computes fleetwide executive summary with MTTA, MTTI, MTTR, escalation, and false positive rates', async () => {
    const service = new SocOperatorAnalyticsService();
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
    expect(morning.activeOperatorsCount).toBe(8);
    expect(evening.activeOperatorsCount).toBe(6);
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
    const now = new Date();

    await service.recordIncidentLifecycle({
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
});
