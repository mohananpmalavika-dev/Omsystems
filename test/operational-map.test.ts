import { describe, it, expect } from 'vitest';
import { operationalMapService, OperationalMapService } from '../src/operations/services/operational-map.service.js';

describe('Multi-Tier Operational Maps & Digital Twin Hierarchy Subsystem', () => {
  it('navigates the full 6-tier operational hierarchy (India -> State -> Region -> Branch -> Floor -> Camera)', async () => {
    const service = new OperationalMapService();

    // 1. Tier 1: Country (India)
    const india = await service.getRootNode();
    expect(india.id).toBe('node-country-india');
    expect(india.level).toBe('COUNTRY');
    expect(india.metrics.totalBranches).toBe(400);

    // 2. Tier 2: States
    const states = await service.getChildrenNodes(india.id);
    expect(states.length).toBeGreaterThanOrEqual(4);
    const kerala = states.find((s) => s.code === 'KL')!;
    expect(kerala).toBeDefined();
    expect(kerala.level).toBe('STATE');

    // 3. Tier 3: Regions in Kerala
    const regions = await service.getChildrenNodes(kerala.id);
    expect(regions.length).toBeGreaterThanOrEqual(2);
    const southKerala = regions.find((r) => r.id === 'node-region-south-kerala')!;
    expect(southKerala).toBeDefined();
    expect(southKerala.level).toBe('REGION');

    // 4. Tier 4: Branches in South Kerala
    const branches = await service.getChildrenNodes(southKerala.id);
    expect(branches.length).toBeGreaterThanOrEqual(2);
    const br118 = branches.find((b) => b.id === 'BR-118')!;
    expect(br118).toBeDefined();
    expect(br118.level).toBe('BRANCH');

    // 5. Tier 5: Floors in BR-118
    const floors = await service.listBranchFloors(br118.id);
    expect(floors.length).toBe(2);
    const vaultFloor = floors.find((f) => f.floorId === 'floor-br-118-vault')!;
    expect(vaultFloor).toBeDefined();
    expect(vaultFloor.name).toContain('Vault');

    // 6. Tier 6: Cameras on Floor Plan
    expect(vaultFloor.cameras.length).toBeGreaterThanOrEqual(2);
    const vaultDoorCam = vaultFloor.cameras.find((c) => c.cameraId === 'CAM-118-14')!;
    expect(vaultDoorCam).toBeDefined();
    expect(vaultDoorCam.fieldOfViewDegrees).toBe(90);
    expect(vaultDoorCam.rotationDegrees).toBe(225);
    expect(vaultDoorCam.status).toBe('ALERTING');
  });

  it('propagates operational severity upwards (P1 incident & NVR failure makes branch, region, state CRITICAL)', async () => {
    const service = new OperationalMapService();

    // Check branch BR-118
    const br118 = await service.getNodeDetails('BR-118');
    expect(br118?.overallStatus).toBe('CRITICAL');
    expect(br118?.incidentStatus).toBe('P1');
    expect(br118?.metrics.activeP1Incidents).toBe(1);

    // Check parent South Kerala region
    const southKerala = await service.getNodeDetails('node-region-south-kerala');
    expect(southKerala?.overallStatus).toBe('CRITICAL');
    expect(southKerala?.incidentStatus).toBe('P1');

    // Check parent Kerala state
    const kerala = await service.getNodeDetails('node-state-kerala');
    expect(kerala?.overallStatus).toBe('CRITICAL');
    expect(kerala?.incidentStatus).toBe('P1');

    // Check nominal state (Tamil Nadu)
    const tamilNadu = await service.getNodeDetails('node-state-tamilnadu');
    expect(tamilNadu?.overallStatus).toBe('HEALTHY');
    expect(tamilNadu?.incidentStatus).toBe('NONE');
  });

  it('provides deterministic "Why Red?" root-cause explanation for failing nodes', async () => {
    const service = new OperationalMapService();

    // 1. Why is State Kerala Critical?
    const stateCauses = await service.getNodeCauses('node-state-kerala');
    expect(stateCauses.length).toBeGreaterThanOrEqual(1);
    expect(stateCauses[0]?.drillDownTarget?.id).toBe('node-region-south-kerala');

    // 2. Why is Region South Kerala Critical?
    const regionCauses = await service.getNodeCauses('node-region-south-kerala');
    expect(regionCauses.length).toBeGreaterThanOrEqual(1);
    expect(regionCauses[0]?.drillDownTarget?.id).toBe('BR-118');

    // 3. Why is Branch BR-118 Critical?
    const branchCauses = await service.getNodeCauses('BR-118');
    expect(branchCauses.length).toBeGreaterThanOrEqual(4);

    const p1Cause = branchCauses.find((c) => c.code === 'P1_VAULT_INTRUSION');
    expect(p1Cause).toBeDefined();
    expect(p1Cause?.severity).toBe('CRITICAL');
    expect(p1Cause?.drillDownTarget?.id).toBe('CAM-118-14');

    const nvrCause = branchCauses.find((c) => c.code === 'RECORDER_NVR_OFFLINE');
    expect(nvrCause).toBeDefined();
    expect(nvrCause?.sourceType).toBe('RECORDER');

    const retCause = branchCauses.find((c) => c.code === 'RETENTION_POLICY_BREACH');
    expect(retCause).toBeDefined();
    expect(retCause?.message).toContain('17 days');
  });

  it('models camera placement with FOV cone properties (rotation, FOV degrees, coverage depth)', async () => {
    const service = new OperationalMapService();

    const groundFloor = await service.getFloorPlan('floor-br-118-ground');
    expect(groundFloor).toBeDefined();
    expect(groundFloor?.widthMeters).toBe(35);
    expect(groundFloor?.heightMeters).toBe(25);

    const tellerCam = groundFloor?.cameras.find((c) => c.cameraId === 'CAM-118-04');
    expect(tellerCam).toBeDefined();
    expect(tellerCam?.xPercent).toBe(55);
    expect(tellerCam?.yPercent).toBe(42);
    expect(tellerCam?.rotationDegrees).toBe(180);
    expect(tellerCam?.fieldOfViewDegrees).toBe(75);
    expect(tellerCam?.coverageDepthMeters).toBe(12);
  });

  it('aggregates live telemetry updates and computes fleetwide operational overlay metrics', async () => {
    const service = new OperationalMapService();

    // 1. Overlay metrics
    const overlay = await service.getOverlaySummary();
    expect(overlay.totalBranches).toBe(400);
    expect(overlay.p1Incidents).toBeGreaterThanOrEqual(1);
    expect(overlay.cameraOutages).toBeGreaterThanOrEqual(6);
    expect(overlay.recorderOutages).toBeGreaterThanOrEqual(1);

    // 2. Ingest live telemetry update
    const updateRes = await service.updateAssetOperationalTelemetry({
      branchId: 'BR-121',
      cameraId: 'CAM-121-01',
      status: 'OFFLINE',
    });

    expect(updateRes.updated).toBe(true);
    expect(updateRes.branchStatus).toBe('CRITICAL');

    const br121Updated = await service.getNodeDetails('BR-121');
    expect(br121Updated?.overallStatus).toBe('CRITICAL');
  });
});
