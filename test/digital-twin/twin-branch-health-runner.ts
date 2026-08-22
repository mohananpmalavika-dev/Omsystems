/**
 * Digital Twin-Powered Branch Health & Root-Cause Reasoning - Verification Test Runner
 */

import { DigitalTwinTopologyService } from "../../src/digital-twin/services/digital-twin-topology.service.js";
import { TwinObservationConsumerService } from "../../src/digital-twin/services/twin-observation-consumer.service.js";
import { TwinRootCauseAnalyzerService } from "../../src/digital-twin/services/twin-root-cause-analyzer.service.js";
import { BranchHealthProjectionService } from "../../src/digital-twin/services/branch-health-projection.service.js";
import { registerDigitalTwinHealthRoutes } from "../../src/routes/digital-twin-health.routes.js";
import Fastify from "fastify";

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) {
    console.log(`  [PASS] ${name}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${name}`);
    failed++;
  }
}

async function runTwinBranchHealthTests() {
  console.log("================================================================================");
  console.log("  DIGITAL TWIN-POWERED BRANCH HEALTH - VERIFICATION TEST RUNNER");
  console.log("================================================================================\n");

  const topology = new DigitalTwinTopologyService();
  const consumer = new TwinObservationConsumerService(topology);
  const analyzer = new TwinRootCauseAnalyzerService(topology);
  const projection = new BranchHealthProjectionService(topology, analyzer);

  const baseTime = new Date("2026-08-16T14:23:17.000Z");

  // --------------------------------------------------------------------------
  // Suite 1: Initial Baseline Topology
  // --------------------------------------------------------------------------
  console.log("Suite 1: Initial Baseline Topology");

  const initialNodes = topology.listNodes("branch-118");
  assert(initialNodes.length >= 13, "Topology includes Branch, Router, Switch, DVR, HDD, 8 Cameras, and Services");

  const initialProj = projection.getBranchProjection("branch-118", baseTime);
  assert(initialProj.status === "HEALTHY", "Initial branch health status is HEALTHY");
  assert(initialProj.impacts.cameras === 0, "Zero cameras impacted initially");
  assert(initialProj.suppressedAlertsCount === 0, "Zero alerts suppressed initially");

  // --------------------------------------------------------------------------
  // Suite 2: Switch-02 Outage Ingestion & Propagation
  // --------------------------------------------------------------------------
  console.log("\nSuite 2: Switch-02 Outage Ingestion & Propagation");

  // Ingest Switch-02 failure
  const obsRes = consumer.consumeObservation({
    id: "obs-sw-fail",
    tenantId: "tenant-bank-01",
    branchId: "branch-118",
    nodeId: "switch-118-02",
    metric: "NETWORK_REACHABLE",
    value: false,
    observedAt: baseTime,
    source: "collector-network",
  });

  assert(obsRes.stateChanged === true, "Consumer registers state change for Switch-02");
  assert(obsRes.node?.health === "OFFLINE", "Switch-02 marked as OFFLINE");
  assert(obsRes.node?.healthOrigin === "OBSERVED", "Switch-02 failure origin is OBSERVED");

  // Run Root Cause Analyzer
  const incident = analyzer.analyzeBranch("branch-118", baseTime);
  assert(incident !== null, "RootCauseAnalyzer creates an active InfrastructureIncident");
  assert(incident?.rootCauseNodeId === "switch-118-02", "Identifies Switch-02 as primary root cause");
  assert(incident?.rootCauseNodeType === "SWITCH", "Root cause type is SWITCH");
  assert(incident?.severity === "P1", "Assigns P1 severity due to critical service disruption");

  // Verify Downstream Dependency States
  const dvr = topology.getNode("dvr-118-01");
  assert(dvr?.health === "OFFLINE", "Downstream DVR-01 evaluated as OFFLINE");
  assert(dvr?.healthOrigin === "DEPENDENCY", "DVR-01 failure origin is DEPENDENCY");
  assert(dvr?.rootCauseNodeId === "switch-118-02", "DVR-01 points to root cause switch-118-02");

  const cam4 = topology.getNode("cam-118-04");
  assert(cam4?.health === "OFFLINE", "Vault Camera 04 evaluated as OFFLINE");
  assert(cam4?.healthOrigin === "DEPENDENCY", "Camera failure origin is DEPENDENCY");

  // --------------------------------------------------------------------------
  // Suite 3: Impact Analysis & Child Alert Suppression
  // --------------------------------------------------------------------------
  console.log("\nSuite 3: Impact Analysis & Child Alert Suppression");

  assert(incident?.impactedRecordersCount === 1, "Direct impact includes 1 DVR recorder");
  assert(incident?.impactedCamerasCount === 8, "Dependent impact includes 8 IP cameras");
  assert(incident?.impactedServices.includes("Vault Recording") === true, "Impacts critical business service: Vault Recording");
  assert(incident?.impactedServices.includes("ATM Camera Recording") === true, "Impacts critical business service: ATM Camera Recording");
  assert(incident?.suppressedAlertsCount >= 24, "Suppresses 24 child alarms (stream, recording, ping per camera)");

  // --------------------------------------------------------------------------
  // Suite 4: Control Room Branch Health Projection
  // --------------------------------------------------------------------------
  console.log("\nSuite 4: Control Room Branch Health Projection");

  const laterTime = new Date("2026-08-16T14:31:58.000Z"); // 8m 41s later
  const branchProj = projection.getBranchProjection("branch-118", laterTime);

  assert(branchProj.status === "CRITICAL", "Branch status is CRITICAL");
  assert(branchProj.primaryRootCause?.nodeName === "Switch-02", "Root cause explicitly surfaces Switch-02");
  assert(branchProj.primaryRootCause?.durationSeconds === 521, "Tracks exact outage duration: 521s (8m 41s)");
  assert(branchProj.impacts.cameras === 8, "Projection reports 8 impacted cameras");
  assert(branchProj.impacts.services.length === 2, "Projection reports 2 impacted compliance services");

  const controlRoomList = projection.listControlRoomBranches(laterTime);
  const br118 = controlRoomList.find((b) => b.branchId === "branch-118");
  assert(br118 !== undefined && br118.status === "CRITICAL", "Control room list contains Branch 118 in CRITICAL state");
  assert(br118?.suppressedAlerts >= 24, "Control room list shows 24 suppressed child alerts");

  // --------------------------------------------------------------------------
  // Suite 5: Recovery & Incident Resolution
  // --------------------------------------------------------------------------
  console.log("\nSuite 5: Recovery & Incident Resolution");

  // Switch recovers
  const recovTime = new Date("2026-08-16T14:37:00.000Z");
  consumer.consumeObservation({
    id: "obs-sw-recov",
    tenantId: "tenant-bank-01",
    branchId: "branch-118",
    nodeId: "switch-118-02",
    metric: "NETWORK_REACHABLE",
    value: true,
    observedAt: recovTime,
    source: "collector-network",
  });

  // Restore all child nodes
  for (const node of topology.listNodes("branch-118")) {
    node.health = "HEALTHY";
    node.healthOrigin = "OBSERVED";
    node.rootCauseNodeId = undefined;
  }

  const postRecovIncident = analyzer.analyzeBranch("branch-118", recovTime);
  assert(postRecovIncident === null, "RootCauseAnalyzer resolves active incident upon full recovery");

  const postRecovProj = projection.getBranchProjection("branch-118", recovTime);
  assert(postRecovProj.status === "HEALTHY", "Branch health returns to HEALTHY");

  // --------------------------------------------------------------------------
  // Suite 6: Backend REST Control-Plane Endpoints
  // --------------------------------------------------------------------------
  console.log("\nSuite 6: Backend REST Control-Plane Endpoints");

  const app = Fastify();
  await registerDigitalTwinHealthRoutes(app, undefined, topology, consumer, analyzer, projection);

  // 1. GET /v1/control-room/branches
  const crRes = await app.inject({ method: "GET", url: "/v1/control-room/branches" });
  assert(crRes.statusCode === 200, "GET /v1/control-room/branches returns 200 OK");
  const crData = JSON.parse(crRes.body);
  assert(crData.count >= 1, "Returns branches in control room list");

  // 2. GET /v1/branches/:id/twin/health
  const healthRes = await app.inject({ method: "GET", url: "/v1/branches/branch-118/twin/health" });
  assert(healthRes.statusCode === 200, "GET /v1/branches/:id/twin/health returns 200 OK");

  // 3. GET /v1/branches/:id/twin/topology
  const topRes = await app.inject({ method: "GET", url: "/v1/branches/branch-118/twin/topology" });
  assert(topRes.statusCode === 200, "GET /v1/branches/:id/twin/topology returns 200 OK");
  const topData = JSON.parse(topRes.body);
  assert(topData.data.nodeCount >= 13, "Topology returns all nodes");
  assert(topData.data.relationshipCount >= 12, "Topology returns all relationships");

  // 4. POST /v1/twin/observations
  const postObsRes = await app.inject({
    method: "POST",
    url: "/v1/twin/observations",
    payload: {
      nodeId: "switch-118-02",
      metric: "NETWORK_REACHABLE",
      value: false,
    },
  });
  assert(postObsRes.statusCode === 200, "POST /v1/twin/observations returns 200 OK");

  // --------------------------------------------------------------------------
  // Final Results
  // --------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTwinBranchHealthTests().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
