import { describe, it, expect } from 'vitest';
import {
  DegradationDetectorService,
  AiRootCauseService,
  AutonomousRemediationService,
  SurgicalDispatchService,
  FleetRoiCalculatorService,
} from '../src/remote-ops/index.js';

describe('Remote CCTV Infrastructure Operations Subsystem (Technician Replacement)', () => {
  it('detects early stream and storage degradation before full blackout occurs', () => {
    const detector = new DegradationDetectorService();
    const branchId = 'BR-204';

    // 1. Frozen camera stream (0.2 FPS)
    const streamSignal = detector.evaluateCameraStream(branchId, 'CAM-CASH-02', {
      fps: 0.2,
      packetLossPct: 0.0,
      bitrateKbps: 12,
      stalledSeconds: 15,
    });
    expect(streamSignal).not.toBeNull();
    expect(streamSignal?.signalType).toBe('RTSP_STREAM_FROZEN');
    expect(streamSignal?.severity).toBe('CRITICAL');

    // 2. Storage write latency spike & bad sectors
    const diskSignal = detector.evaluateStorageDisk(branchId, 'DISK-NVME-01', {
      writeLatencyMs: 650,
      readLatencyMs: 12,
      smartPendingSectors: 84,
      isReadOnly: false,
      usedPercent: 78,
    });
    expect(diskSignal).not.toBeNull();
    expect(diskSignal?.signalType).toBe('SMART_BAD_SECTORS');
    expect(diskSignal?.severity).toBe('CRITICAL');
  });

  it('performs deterministic AI root cause analysis distinguishing remote-remediable from physical issues', () => {
    const detector = new DegradationDetectorService();
    const rca = new AiRootCauseService();
    const branchId = 'BR-204';

    // Case A: Camera firmware crash (Ping responds at 12ms, but RTSP locked)
    const frozenSignal = detector.evaluateCameraStream(branchId, 'CAM-CASH-02', {
      fps: 0.0,
      packetLossPct: 0.0,
      bitrateKbps: 0,
      stalledSeconds: 20,
    })!;

    const diagnosisA = rca.diagnoseSignal(frozenSignal, 'Cash Counter #2 Dome', {
      pingResponseMs: 12, // Ping OK
      switchPortPoEVoltage: 48.0,
    });

    expect(diagnosisA.category).toBe('CAMERA_FIRMWARE_LOCKUP');
    expect(diagnosisA.canRemediateRemotely).toBe(true);
    expect(diagnosisA.recommendedAction).toContain('PoE power-cycle');

    // Case B: Physical Cable Cut (0V PoE / Link down)
    const diagnosisB = rca.diagnoseSignal(frozenSignal, 'Vault Perimeter Bullet', {
      switchPortPoEVoltage: 0.0, // 0V -> Cable cut or unplugged
    });

    expect(diagnosisB.category).toBe('PHYSICAL_CABLE_SEVERED');
    expect(diagnosisB.canRemediateRemotely).toBe(false);
    expect(diagnosisB.recommendedAction).toContain('Dispatch technician');

    // Case C: Multi-camera cascade (Switch power loss)
    const diagnosisC = rca.diagnoseSignal(frozenSignal, 'Branch Switch Alpha', {
      otherCamerasOnSameSwitchDown: true,
    });

    expect(diagnosisC.category).toBe('LOCAL_SWITCH_POWER_OR_UPLINK_FAILURE');
    expect(diagnosisC.confidenceScore).toBeGreaterThanOrEqual(0.99);
  });

  it('executes autonomous remote self-healing in under 45 seconds without technician dispatch', async () => {
    const rca = new AiRootCauseService();
    const remediation = new AutonomousRemediationService();
    const branchId = 'BR-204';

    // 1. Diagnose firmware lockup
    const diagnosis = rca.diagnoseSignal(
      {
        signalId: 'sig-01',
        branchId,
        componentId: 'CAM-CASH-02',
        componentType: 'CAMERA',
        signalType: 'RTSP_STREAM_FROZEN',
        severity: 'CRITICAL',
        metrics: { fps: 0 },
        detectedAt: new Date().toISOString(),
      },
      'Cash Counter #2 Dome',
      { pingResponseMs: 15 }
    );

    // 2. Execute remote PoE power-cycle
    const result = await remediation.executeRemediation(diagnosis);

    expect(result.success).toBe(true);
    expect(result.actionType).toBe('REMOTE_POE_POWER_CYCLE');
    expect(result.dispatchedTechnicianNeeded).toBe(false);
    expect(result.verifiedHealthStatus).toBe('HEALTHY');
    expect(result.resolutionSummary).toContain('Successfully power-cycled PoE switch port');
    expect(result.executionDurationMs).toBeLessThanOrEqual(45_000);
  });

  it('generates a precision surgical work order when physical hardware repair is strictly mandatory', () => {
    const rca = new AiRootCauseService();
    const surgical = new SurgicalDispatchService();
    const branchId = 'BR-204';

    // Cable severed diagnosis
    const diagnosis = rca.diagnoseSignal(
      {
        signalId: 'sig-cut',
        branchId,
        componentId: 'CAM-VAULT-01',
        componentType: 'CAMERA',
        signalType: 'PHYSICAL_LINK_DOWN',
        severity: 'CRITICAL',
        metrics: { link: false },
        detectedAt: new Date().toISOString(),
      },
      'Main Vault Entrance Camera',
      { switchPortPoEVoltage: 0 }
    );

    const workOrder = surgical.generateWorkOrder(diagnosis, {
      branchName: 'Bandra West Flagship Branch',
      branchCode: 'BR-MUM-204',
      physicalLocationInBranch: 'Ceiling conduit above Vault Door #1, Basement Level',
      modelNumber: 'Hikvision DS-2CD2143G0-I (4MP Dome)',
      macAddress: '44:19:B6:77:21:04',
      ipAddress: '10.14.2.14',
    });

    expect(workOrder.workOrderId).toBeDefined();
    expect(workOrder.physicalLocationInBranch).toBe('Ceiling conduit above Vault Door #1, Basement Level');
    expect(workOrder.requiredSpareParts).toContain('1x 20m Cat6 UTP Solid Copper Cable');
    expect(workOrder.diagnosticChecklist.length).toBeGreaterThanOrEqual(4);
    expect(workOrder.diagnosticChecklist[0]).toContain('conduit');
    expect(workOrder.priority).toBe('HIGH');
  });

  it('calculates financial ROI and physical truck rolls avoided for a 500-branch enterprise', () => {
    const roiCalculator = new FleetRoiCalculatorService(100.0); // $100 per physical technician truck roll

    // Model 500 branches
    const metrics = roiCalculator.calculateMetrics(500);

    expect(metrics.totalBranchesMonitored).toBe(500);
    expect(metrics.totalIncidentsDetected).toBe(5000);
    expect(metrics.resolvedRemotelyCount).toBe(4120);
    expect(metrics.remoteResolutionRatePct).toBe(82.4);
    expect(metrics.physicalTruckRollsAvoided).toBe(4120);
    expect(metrics.technicianCostPerVisitDollars).toBe(100.0);
    expect(metrics.totalCostSavingsDollars).toBe(412_000.0); // $412k annual savings!
    expect(metrics.averageRemoteMttrSeconds).toBe(42);
    expect(metrics.traditionalMttrHours).toBe(48.0);
    expect(metrics.uptimeSlaPct).toBe(99.96);
  });
});
