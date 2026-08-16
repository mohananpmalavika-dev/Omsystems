/**
 * Evidence-Driven & Path-Aware Branch Internet Connectivity Verification Test Runner
 */

import { ConnectivityMonitor } from "../../edge-agent/src/monitoring/connectivity/connectivity-monitor.js";
import { DefaultRouteParser, WireGuardStatusParser } from "../../edge-agent/src/monitoring/connectivity/probes.js";
import { BranchConnectivityService } from "../../backend/src/connectivity/services/branch-connectivity.service.js";
import { registerConnectivityHealthRoutes } from "../../src/routes/connectivity-health.routes.js";
import Fastify from "fastify";
import type { BranchNetworkConfig } from "../../backend/src/connectivity/domain/connectivity.types.js";

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

async function runBranchConnectivityTests() {
  console.log("================================================================================");
  console.log("  BRANCH INTERNET & WAN CONNECTIVITY - VERIFICATION TEST RUNNER");
  console.log("================================================================================\n");

  const config: BranchNetworkConfig & { branchId: string } = {
    branchId: "branch-178",
    primary: {
      interfaceName: "eth0",
      providerName: "Jio Fiber",
      gatewayIp: "192.168.1.1",
    },
    backup: {
      interfaceName: "wwan0",
      providerName: "Airtel LTE",
      gatewayIp: "192.168.8.1",
    },
    probeTargets: {
      ipTargets: ["1.1.1.1", "8.8.8.8"],
      dnsHostname: "health.company.internal",
      centralEndpoint: "https://surveillance.bank.internal/health",
    },
    thresholds: {
      degradedLatencyMs: 150,
      criticalLatencyMs: 500,
      degradedPacketLossPct: 5,
      criticalPacketLossPct: 20,
      consecutiveFailuresForOffline: 3,
      consecutiveSuccessesForRecovery: 3,
    },
  };

  const monitor = new ConnectivityMonitor(config);
  const service = new BranchConnectivityService();

  // --------------------------------------------------------------------------
  // Suite 1: Multi-Layer Link Probing (Interface -> Gateway -> Internet -> Loss)
  // --------------------------------------------------------------------------
  console.log("Suite 1: Multi-Layer Link Probing");

  // 1. Healthy Link
  const healthyLink = await monitor.probeLink("eth0", "PRIMARY", "Jio Fiber", [
    { timestamp: new Date(), success: true, latencyMs: 28 },
    { timestamp: new Date(), success: true, latencyMs: 32 },
  ], true, true);
  assert(healthyLink.state === "ONLINE", "Healthy link evaluates to ONLINE");
  assert(healthyLink.gatewayReachable === true, "Gateway is marked reachable");
  assert(healthyLink.packetLossPct === 0, "Packet loss is 0%");

  // 2. Degraded Link (High Latency: 340ms)
  const highLatencyLink = await monitor.probeLink("eth0", "PRIMARY", "Jio Fiber", [
    { timestamp: new Date(), success: true, latencyMs: 340 },
  ], true, true);
  assert(highLatencyLink.state === "DEGRADED", "Latency 340ms evaluates to DEGRADED (threshold: 150ms)");

  // 3. Degraded Link (Packet Loss: 15%)
  const lossLink = await monitor.probeLink("eth0", "PRIMARY", "Jio Fiber", [
    { timestamp: new Date(), success: true, latencyMs: 40 },
    { timestamp: new Date(), success: false },
  ], true, true);
  assert(lossLink.state === "DEGRADED", "Packet loss > 5% evaluates to DEGRADED");

  // 4. Gateway Unreachable
  const gatewayDownLink = await monitor.probeLink("eth0", "PRIMARY", "Jio Fiber", [], false, false);
  assert(gatewayDownLink.state === "OFFLINE", "Unreachable gateway evaluates to OFFLINE");

  // --------------------------------------------------------------------------
  // Suite 2: Routing Table & Active WAN Path Detection
  // --------------------------------------------------------------------------
  console.log("\nSuite 2: Routing Table & Active WAN Path Detection");

  const sampleRoutesPrimary = `
default via 192.168.1.1 dev eth0 metric 10
default via 192.168.8.1 dev wwan0 metric 100
  `;
  const routes1 = DefaultRouteParser.parse(sampleRoutesPrimary);
  const path1 = DefaultRouteParser.identifyCurrentPath(routes1, "eth0", "wwan0");
  assert(path1 === "PRIMARY", "Lowest metric route on eth0 resolves WAN Path to PRIMARY");

  const sampleRoutesFailover = `
default via 192.168.8.1 dev wwan0 metric 20
default via 192.168.1.1 dev eth0 metric 500
  `;
  const routes2 = DefaultRouteParser.parse(sampleRoutesFailover);
  const path2 = DefaultRouteParser.identifyCurrentPath(routes2, "eth0", "wwan0");
  assert(path2 === "BACKUP", "Failover metric on wwan0 resolves WAN Path to BACKUP");

  // --------------------------------------------------------------------------
  // Suite 3: WireGuard VPN Independence
  // --------------------------------------------------------------------------
  console.log("\nSuite 3: WireGuard VPN Independence");

  const nowSec = Math.floor(Date.now() / 1000);
  const wgRecentOutput = `
interface: wg0
peer-public-key	(none)	192.168.100.1:51820	10.0.0.1/32	${nowSec - 6}	1048576	2097152	persistent-keepalive
  `;
  const vpnHealthy = WireGuardStatusParser.parse(wgRecentOutput, "wg0");
  assert(vpnHealthy.state === "CONNECTED", "Recent handshake (6s ago) evaluates VPN to CONNECTED");

  const wgStaleOutput = `
interface: wg0
peer-public-key	(none)	192.168.100.1:51820	10.0.0.1/32	${nowSec - 300}	1048576	2097152	persistent-keepalive
  `;
  const vpnStale = WireGuardStatusParser.parse(wgStaleOutput, "wg0");
  assert(vpnStale.state === "DISCONNECTED", "Stale handshake (300s ago) evaluates VPN to DISCONNECTED");

  // --------------------------------------------------------------------------
  // Suite 4: Failover State Machine & Hysteresis
  // --------------------------------------------------------------------------
  console.log("\nSuite 4: Failover State Machine & Hysteresis");

  // Primary offline + Backup online + Current path BACKUP -> FAILOVER
  const failoverHealth = await monitor.buildConnectivityHealth({
    primaryInternetReachable: false,
    primaryGatewayReachable: false,
    backupInternetReachable: true,
    backupGatewayReachable: true,
    injectedPath: "BACKUP",
  });
  assert(failoverHealth.state === "FAILOVER", "Primary offline + Backup online evaluates to FAILOVER");
  assert(failoverHealth.failoverActive === true, "Flags failoverActive as true");

  // Both offline -> OFFLINE
  const bothOfflineHealth = await monitor.buildConnectivityHealth({
    primaryInternetReachable: false,
    primaryGatewayReachable: false,
    backupInternetReachable: false,
    backupGatewayReachable: false,
    injectedPath: "NONE",
  });
  assert(bothOfflineHealth.state === "OFFLINE", "Both WAN links offline evaluates to OFFLINE");

  // Ingest with Hysteresis (1st failure -> DEGRADED, 3rd failure -> OFFLINE)
  const r1 = await service.ingestTelemetry({ ...bothOfflineHealth, branchId: "branch-hysteresis-test" });
  assert(r1.state === "DEGRADED", "1st offline report is absorbed by hysteresis as DEGRADED (prevents flapping)");

  await service.ingestTelemetry({ ...bothOfflineHealth, branchId: "branch-hysteresis-test" });
  const r3 = await service.ingestTelemetry({ ...bothOfflineHealth, branchId: "branch-hysteresis-test" });
  assert(r3.state === "OFFLINE", "3rd consecutive failure confirms OFFLINE state transition");

  // --------------------------------------------------------------------------
  // Suite 5: Root-Cause Correlation & Blast Radius
  // --------------------------------------------------------------------------
  console.log("\nSuite 5: Root-Cause Correlation & Blast Radius");

  const correlation = service.correlateCctvDownstreamImpact("branch-099"); // branch-099 is seeded OFFLINE
  assert(correlation.wanOffline === true, "Detects branch-099 WAN is offline");
  assert(correlation.suppressDownstreamAlerts === true, "Suppresses downstream individual camera connectivity alarms");
  assert(correlation.rootCauseAlert !== null, "Generates single WAN outage root-cause alert");

  // --------------------------------------------------------------------------
  // Suite 6: Branch Network SLA Calculations
  // --------------------------------------------------------------------------
  console.log("\nSuite 6: Branch Network SLA Calculations");

  const sla = await service.calculateBranchSla("branch-178");
  assert(sla.effectiveBranchUptimePct >= 98.0, `Calculates high effective uptime (got ${sla.effectiveBranchUptimePct}%)`);
  assert(sla.failoverCount >= 1, "Tracks failover count");
  assert(sla.vpnUptimePct >= 99.0, "Reports VPN tunnel availability SLA");

  // --------------------------------------------------------------------------
  // Suite 7: Backend REST Control-Plane Routes
  // --------------------------------------------------------------------------
  console.log("\nSuite 7: Backend REST Control-Plane Routes");

  const app = Fastify();
  await registerConnectivityHealthRoutes(app, undefined, service);

  // 1. Fleet network summary
  const summaryRes = await app.inject({ method: "GET", url: "/v1/operational-health/network" });
  assert(summaryRes.statusCode === 200, "GET /v1/operational-health/network returns 200 OK");
  const summary = JSON.parse(summaryRes.body);
  assert(summary.totalBranches >= 3, "Summary contains total branches count");
  assert(summary.failover >= 1, "Summary distinguishes branches in FAILOVER");

  // 2. Branch connectivity detail
  const branchRes = await app.inject({ method: "GET", url: "/v1/branches/branch-178/connectivity" });
  assert(branchRes.statusCode === 200, "GET /v1/branches/:id/connectivity returns 200 OK");
  const branchData = JSON.parse(branchRes.body);
  assert(branchData.state === "FAILOVER", "Branch 178 state is FAILOVER");
  assert(branchData.primary.providerName === "Jio Fiber 300M", "Captures primary ISP provider");
  assert(branchData.backup.providerName === "Airtel LTE 4G", "Captures backup LTE provider");

  // 3. Branch Outages
  const outagesRes = await app.inject({ method: "GET", url: "/v1/branches/branch-178/connectivity/outages" });
  assert(outagesRes.statusCode === 200, "GET /v1/branches/:id/connectivity/outages returns 200 OK");

  // 4. Branch SLA
  const slaRes = await app.inject({ method: "GET", url: "/v1/branches/branch-178/connectivity/sla" });
  assert(slaRes.statusCode === 200, "GET /v1/branches/:id/connectivity/sla returns 200 OK");

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

runBranchConnectivityTests().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
