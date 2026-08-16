/**
 * Canonical Recorder SDK & Driver Architecture - Verification Test Runner
 */

import fs from "node:fs";
import path from "node:path";
import {
  recorderManager,
  RecorderManager,
  CircuitBreaker,
  parseDahuaSystemInfo,
  parseDahuaStorage,
  parseDahuaChannels,
  parseHikvisionDeviceInfo,
  parseHikvisionStorage,
  parseHikvisionChannels,
  type RecorderContext,
} from "../../packages/recorder-sdk/src/index.js";
import { RecorderHealthCollector } from "../../edge-agent/src/monitoring/recorder-health-collector.js";

async function runCanonicalDriverTests() {
  console.log("================================================================================");
  console.log("  CANONICAL RECORDER SDK & DRIVER ARCHITECTURE - VERIFICATION RUNNER");
  console.log("================================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, description: string, extra?: unknown) {
    if (condition) {
      console.log(`  [PASS] ${description}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${description}`);
      if (extra !== undefined) console.error(`         Details:`, extra);
      failed++;
    }
  }

  // 1. Separation of Vendor Identity and Protocol
  console.log("Suite 1: Vendor Identity vs Protocol Family Decoupling");
  const cpPlusResolved = await recorderManager.resolveDriver("cp-plus");
  assert(cpPlusResolved.protocol === "dahua-cgi", "CP PLUS maps to dahua-cgi protocol driver");
  assert(cpPlusResolved.confidence >= 0.9, "CP PLUS driver confidence is >= 0.90");

  const hikResolved = await recorderManager.resolveDriver("hikvision");
  assert(hikResolved.protocol === "hikvision-isapi", "Hikvision maps to hikvision-isapi protocol driver");

  const unvResolved = await recorderManager.resolveDriver("uniview");
  assert(unvResolved.protocol === "uniview-api", "Uniview maps to uniview-api protocol driver");

  const onvifResolved = await recorderManager.resolveDriver("onvif");
  assert(onvifResolved.protocol === "onvif", "ONVIF maps to onvif protocol driver");

  const genericResolved = await recorderManager.resolveDriver("generic");
  assert(genericResolved.protocol === "generic-rtsp", "Generic vendor maps to generic-rtsp fallback driver");

  // 2. Pure Dahua / CP PLUS Parser Fixtures
  console.log("\nSuite 2: CP PLUS (Dahua CGI) Pure Parser Fixtures");
  const cpSysInfoText = fs.readFileSync(
    path.resolve("test/fixtures/recorders/cp-plus/cp-unr-4k4322/system-info.txt"),
    "utf-8"
  );
  const cpStorageText = fs.readFileSync(
    path.resolve("test/fixtures/recorders/cp-plus/cp-unr-4k4322/storage.txt"),
    "utf-8"
  );
  const cpChannelsText = fs.readFileSync(
    path.resolve("test/fixtures/recorders/cp-plus/cp-unr-4k4322/channels.txt"),
    "utf-8"
  );

  const cpInfo = parseDahuaSystemInfo(cpSysInfoText);
  assert(cpInfo.manufacturer === "CP PLUS", "Preserves CP PLUS as manufacturer identity");
  assert(cpInfo.model === "CP PLUS" || cpInfo.model?.includes("CP-UNR"), "Extracts CP PLUS model profile");
  assert(cpInfo.serialNumber === "9L02A8BPAP00178", "Extracts CP PLUS serial number");
  assert(cpInfo.channelCapacity === 16, "Extracts 16 channel capacity");

  const cpStorage = parseDahuaStorage(cpStorageText);
  assert(cpStorage.disks.total === 2, "Parses 2 physical storage disks");
  assert(cpStorage.disks.healthy === 1 && cpStorage.disks.warning === 1, "Correctly identifies 1 healthy and 1 warning disk");
  assert(cpStorage.volumes[1]?.smartHealth === "WARNING", "Flags SMART warning on Disk 2");
  assert(cpStorage.state === "DEGRADED", "Overall storage health evaluates to DEGRADED");

  const cpChannels = parseDahuaChannels(cpChannelsText, "", 16);
  assert(cpChannels.length === 16, "Parses 16 channels");
  assert(cpChannels[0]?.name === "CAM01-Entrance", "Channel 1 title is CAM01-Entrance");
  assert(cpChannels[6]?.name === "CAM07-CashVault", "Channel 7 title is CAM07-CashVault");

  // 3. Pure Hikvision ISAPI XML Parser Fixtures
  console.log("\nSuite 3: Hikvision ISAPI Pure XML Parser Fixtures");
  const hikDevXml = fs.readFileSync(
    path.resolve("test/fixtures/recorders/hikvision/device-info.xml"),
    "utf-8"
  );
  const hikStorageXml = fs.readFileSync(
    path.resolve("test/fixtures/recorders/hikvision/storage.xml"),
    "utf-8"
  );
  const hikChannelsXml = fs.readFileSync(
    path.resolve("test/fixtures/recorders/hikvision/channels.xml"),
    "utf-8"
  );

  const hikInfo = parseHikvisionDeviceInfo(hikDevXml);
  assert(hikInfo.manufacturer === "Hikvision", "Extracts Hikvision manufacturer");
  assert(hikInfo.model === "DS-7616NI-I2/16P", "Extracts Hikvision model");
  assert(hikInfo.firmwareVersion?.includes("V4.61"), "Extracts firmware version");

  const hikStorage = parseHikvisionStorage(hikStorageXml);
  assert(hikStorage.disks.total === 2, "Parses 2 physical SATA disks");
  assert(hikStorage.volumes[1]?.smartHealth === "WARNING", "Identifies SMART warning on HDD-2");

  const hikChannels = parseHikvisionChannels(hikChannelsXml);
  assert(hikChannels.length === 8, "Parses 8 video input channels");
  assert(hikChannels[0]?.name === "CAM01-Entrance", "Hikvision CAM01 title is CAM01-Entrance");

  // 4. Circuit Breaker Fault Isolation & Recovery
  console.log("\nSuite 4: Circuit Breaker Fault Protection & Device Lockout Prevention");
  const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 50 });
  assert(cb.getState() === "CLOSED", "Initial circuit breaker state is CLOSED");

  // Record 1 failure -> still closed
  cb.recordFailure(false);
  assert(cb.getState() === "CLOSED", "Single failure keeps circuit CLOSED");

  // Record 2nd failure -> trips to OPEN
  cb.recordFailure(false);
  assert(cb.getState() === "OPEN", "Circuit trips to OPEN after threshold");
  assert(cb.canExecute() === false, "Execution blocked while circuit is OPEN");

  // Wait for reset timeout
  await new Promise((r) => setTimeout(r, 60));
  assert(cb.getState() === "HALF_OPEN", "Transitions to HALF_OPEN after reset timeout");

  // Successful execution resets circuit
  cb.recordSuccess();
  cb.recordSuccess();
  assert(cb.getState() === "CLOSED", "Resets to CLOSED after successful recovery");

  // 5. Recorder Session & Subdivided Operations Model
  console.log("\nSuite 5: Recorder Session & Subdivided Operations Model");
  const ctx: RecorderContext = {
    tenantId: "omsystems",
    branchId: "branch-178",
    recorderId: "rec-aluva-01",
    endpoint: { host: "192.168.1.100", port: 80, scheme: "http", baseUrl: "http://192.168.1.100" },
    credentialRef: { ref: "vault://rec-aluva-01", type: "digest" },
    protocol: "dahua-cgi",
  };

  const session = await recorderManager.openSession(ctx);
  assert(session.id === "rec-aluva-01", "Opened session for recorder rec-aluva-01");
  assert(session.protocol === "dahua-cgi", "Session bound to dahua-cgi driver");

  const devInfo = await session.device.getInfo();
  assert(Boolean(devInfo.model), "session.device.getInfo() returns device model");

  const storage = await session.storage.list();
  assert(storage.volumes.length >= 1, "session.storage.list() returns storage volumes");

  const channels = await session.channels.list();
  assert(channels.length === 16, "session.channels.list() returns 16 channels");

  const streamDescriptor = await session.streams.resolve({
    channelNumber: 1,
    streamType: "SUB",
  });
  assert(streamDescriptor.protocol === "RTSP", "session.streams.resolve() returns RTSP descriptor");
  assert(streamDescriptor.width === 640 && streamDescriptor.height === 360, "Substream resolution is 640x360");

  const searchResult = await session.recordings.search({
    channelNumber: 1,
    from: new Date(Date.now() - 90 * 86400000),
    to: new Date(),
  });
  assert(searchResult.segments.length > 0, "session.recordings.search() returns recording archive segments");

  // 6. Universal Retention Verification via Driver Search
  console.log("\nSuite 6: Universal Retention Calculation via Universal Archive Search");
  const oldestSegment = searchResult.segments[searchResult.segments.length - 1];
  const observedRetentionDays = Math.round((Date.now() - oldestSegment.startTime.getTime()) / 86400000);
  assert(observedRetentionDays >= 60, `Calculated retention of ${observedRetentionDays} days from archive segments`);

  // 7. Edge Agent Health Collector Integration
  console.log("\nSuite 7: Edge Agent Health Collector Integration");
  const collector = new RecorderHealthCollector();
  const probeResult = await collector.collect({
    id: "rec-aluva-01",
    name: "Aluva DVR",
    deviceType: "dvr",
    vendor: "cp-plus",
    host: "192.168.1.100",
    port: 80,
    username: "admin",
    password: "password",
    archiveRetention: {
      lookbackDays: 90,
      maxResults: 50,
      continuityGapSeconds: 300,
      channels: [{ cameraId: "cam-178-01", channel: 1 }],
    },
  });

  assert(probeResult.metrics.reachable === true, "Probe metrics indicate reachable");
  assert(probeResult.metrics.channelsTotal === 16, "Probe metrics track 16 total channels");
  assert(probeResult.hddStatus.length >= 1, "Probe returns HDD status breakdown");
  assert(probeResult.archiveEvidence.length === 1, "Probe returns archive retention evidence");

  console.log("\n================================================================================");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runCanonicalDriverTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
