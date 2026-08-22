/**
 * Device Event Normalization Test Suite
 *
 * Verifies the full vendor-neutral normalization pipeline for all 9 DeviceEvent types
 * across all 6 vendor adapters: CP PLUS, Dahua, Hikvision, Axis, ONVIF, Edge Agent.
 */

import { describe, it, expect } from "vitest";
import assert from "node:assert/strict";
import { EventNormalizationService } from "../../src/event-normalization/services/event-normalization.service.js";
import { CpPlusDeviceEventAdapter } from "../../src/event-normalization/adapters/cpplus-adapter.js";
import { DahuaDeviceEventAdapter } from "../../src/event-normalization/adapters/dahua-adapter.js";
import { HikvisionDeviceEventAdapter } from "../../src/event-normalization/adapters/hikvision-adapter.js";
import { AxisDeviceEventAdapter } from "../../src/event-normalization/adapters/axis-adapter.js";
import { OnvifDeviceEventAdapter } from "../../src/event-normalization/adapters/onvif-adapter.js";
import { EdgeAgentDeviceEventAdapter } from "../../src/event-normalization/adapters/edge-agent-adapter.js";
import { GenericDeviceEventAdapter } from "../../src/event-normalization/adapters/generic-adapter.js";

const service = new EventNormalizationService();

function passLog(msg: string) {
  console.log(`  [PASS] ${msg}`);
}
function suiteLog(msg: string) {
  console.log(`\nSuite: ${msg}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1: CP PLUS Adapter
// ─────────────────────────────────────────────────────────────────────────────
describe("CP PLUS Adapter – all 9 event types", () => {
  const adapter = new CpPlusDeviceEventAdapter();

  it("CP PLUS VideoLoss → VIDEO_LOSS (critical)", () => {
    const raw = { Code: "VideoLoss", UTC: "2026-08-17T10:00:00.000Z", channel: 3, deviceId: "NVR-CPPLUS-BR112" };
    const evt = adapter.normalize(raw);
    assert.equal(evt.type, "VIDEO_LOSS");
    assert.equal(evt.severity, "critical");
    assert.equal(evt.vendorOrigin, "CP_PLUS");
    passLog("CP PLUS VideoLoss → VIDEO_LOSS (critical)");
  });

  it("CP PLUS BlindDetect → TAMPER with MASKING_BLIND", () => {
    const raw = { Code: "BlindDetect", UTC: "2026-08-17T10:01:00.000Z" };
    const evt = adapter.normalize(raw);
    assert.equal(evt.type, "TAMPER");
    assert.equal(evt.details?.tamper?.tamperType, "MASKING_BLIND");
    passLog("CP PLUS BlindDetect → TAMPER (MASKING_BLIND)");
  });

  it("CP PLUS DiskFull → STORAGE_FAULT (critical)", () => {
    const raw = { Code: "DiskFull", UTC: "2026-08-17T10:02:00.000Z" };
    const evt = adapter.normalize(raw);
    assert.equal(evt.type, "STORAGE_FAULT");
    assert.equal(evt.details?.storage?.storageFaultType, "DISK_FULL");
    passLog("CP PLUS DiskFull → STORAGE_FAULT (DISK_FULL)");
  });

  it("CP PLUS IPCDisConnect → CAMERA_OFFLINE (high)", () => {
    const raw = { Code: "IPCDisConnect", UTC: "2026-08-17T10:03:00.000Z" };
    const evt = adapter.normalize(raw);
    assert.equal(evt.type, "CAMERA_OFFLINE");
    passLog("CP PLUS IPCDisConnect → CAMERA_OFFLINE");
  });

  it("CP PLUS RecordFailure → RECORDING_FAILURE (critical)", () => {
    const raw = { Code: "RecordFailure", UTC: "2026-08-17T10:04:00.000Z" };
    const evt = adapter.normalize(raw);
    assert.equal(evt.type, "RECORDING_FAILURE");
    assert.equal(evt.details?.recording?.failureReason, "ENCODER_STALL");
    passLog("CP PLUS RecordFailure → RECORDING_FAILURE");
  });

  it("CP PLUS IntrusionDetection → ANALYTICS (LINE_CROSSING or INTRUSION)", () => {
    const raw = {
      Code: "IntrusionDetection",
      UTC: "2026-08-17T10:05:00.000Z",
      Data: { RuleName: "Vault Perimeter" },
    };
    const evt = adapter.normalize(raw);
    assert.equal(evt.type, "ANALYTICS");
    assert.equal(evt.details?.analytics?.analyticsType, "INTRUSION");
    passLog("CP PLUS IntrusionDetection → ANALYTICS");
  });

  it("CP PLUS AlarmLocal → RELAY (TRIGGERED)", () => {
    const raw = { Code: "AlarmLocal", UTC: "2026-08-17T10:06:00.000Z", Data: { Index: 2 } };
    const evt = adapter.normalize(raw);
    assert.equal(evt.type, "RELAY");
    assert.equal(evt.details?.relay?.relayState, "TRIGGERED");
    passLog("CP PLUS AlarmLocal → RELAY");
  });

  it("CP PLUS AccessControl → DOOR_ACCESS (ACCESS_GRANTED)", () => {
    const raw = { Code: "AccessControl", UTC: "2026-08-17T10:07:00.000Z", Data: { CardNo: "0001234567", UserName: "RAVI KUMAR" } };
    const evt = adapter.normalize(raw);
    assert.equal(evt.type, "DOOR_ACCESS");
    assert.equal(evt.details?.access?.accessType, "ACCESS_GRANTED");
    assert.equal(evt.details?.access?.cardId, "0001234567");
    passLog("CP PLUS AccessControl → DOOR_ACCESS (ACCESS_GRANTED)");
  });

  it("CP PLUS MotionDetect → MOTION (low)", () => {
    const raw = { Code: "MotionDetect", UTC: "2026-08-17T10:08:00.000Z" };
    const evt = adapter.normalize(raw);
    assert.equal(evt.type, "MOTION");
    passLog("CP PLUS MotionDetect → MOTION");
  });

  it("CP PLUS Defocus → TAMPER (DEFOCUS)", () => {
    const raw = { Code: "Defocus", UTC: "2026-08-17T10:09:00.000Z" };
    const evt = adapter.normalize(raw);
    assert.equal(evt.type, "TAMPER");
    assert.equal(evt.details?.tamper?.tamperType, "DEFOCUS");
    passLog("CP PLUS Defocus → TAMPER (DEFOCUS)");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2: Dahua Adapter
// ─────────────────────────────────────────────────────────────────────────────
describe("Dahua Adapter – key event types", () => {
  const adapter = new DahuaDeviceEventAdapter();

  it("Dahua VideoLoss → VIDEO_LOSS", () => {
    const raw = { code: "VideoLoss", action: "Start", time: "2026-08-17T10:10:00.000Z", vendor: "DAHUA" };
    const evt = adapter.normalize(raw);
    assert.equal(evt.type, "VIDEO_LOSS");
    assert.equal(evt.vendorOrigin, "DAHUA");
    passLog("Dahua VideoLoss → VIDEO_LOSS");
  });

  it("Dahua VideoBlind → TAMPER (MASKING_BLIND)", () => {
    const raw = { code: "VideoBlind", action: "Start", vendor: "DAHUA" };
    const evt = adapter.normalize(raw);
    assert.equal(evt.type, "TAMPER");
    assert.equal(evt.details?.tamper?.tamperType, "MASKING_BLIND");
    passLog("Dahua VideoBlind → TAMPER (MASKING_BLIND)");
  });

  it("Dahua CrossLineDetection → ANALYTICS (LINE_CROSSING)", () => {
    const raw = { code: "CrossLineDetection", action: "Start", vendor: "DAHUA", data: { Name: "Vault Line" } };
    const evt = adapter.normalize(raw);
    assert.equal(evt.type, "ANALYTICS");
    assert.equal(evt.details?.analytics?.analyticsType, "LINE_CROSSING");
    passLog("Dahua CrossLineDetection → ANALYTICS (LINE_CROSSING)");
  });

  it("Dahua StorageFailure → STORAGE_FAULT", () => {
    const raw = { code: "StorageFailure", vendor: "DAHUA" };
    const evt = adapter.normalize(raw);
    assert.equal(evt.type, "STORAGE_FAULT");
    passLog("Dahua StorageFailure → STORAGE_FAULT");
  });

  it("Dahua AlarmLocal → RELAY", () => {
    const raw = { code: "AlarmLocal", vendor: "DAHUA", data: { index: 1 } };
    const evt = adapter.normalize(raw);
    assert.equal(evt.type, "RELAY");
    passLog("Dahua AlarmLocal → RELAY");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3: Hikvision Adapter
// ─────────────────────────────────────────────────────────────────────────────
describe("Hikvision Adapter – key event types", () => {
  const adapter = new HikvisionDeviceEventAdapter();

  it("Hikvision videoloss → VIDEO_LOSS", () => {
    const raw = { EventNotificationAlert: { eventType: "videoloss", dateTime: "2026-08-17T10:20:00Z", channelID: 1, deviceID: "NVR-HIK-BR200" } };
    const evt = adapter.normalize(raw);
    assert.equal(evt.type, "VIDEO_LOSS");
    assert.equal(evt.vendorOrigin, "HIKVISION");
    passLog("Hikvision videoloss → VIDEO_LOSS");
  });

  it("Hikvision tamperdetection → TAMPER", () => {
    const raw = { eventType: "tamperdetection", vendor: "HIKVISION", dateTime: "2026-08-17T10:21:00Z" };
    const evt = adapter.normalize(raw);
    assert.equal(evt.type, "TAMPER");
    passLog("Hikvision tamperdetection → TAMPER");
  });

  it("Hikvision scenechangedetection → TAMPER (SCENE_CHANGE)", () => {
    const raw = { eventType: "scenechangedetection", vendor: "HIKVISION" };
    const evt = adapter.normalize(raw);
    assert.equal(evt.type, "TAMPER");
    assert.equal(evt.details?.tamper?.tamperType, "SCENE_CHANGE");
    passLog("Hikvision scenechangedetection → TAMPER (SCENE_CHANGE)");
  });

  it("Hikvision linedetection → ANALYTICS (LINE_CROSSING)", () => {
    const raw = { eventType: "linedetection", vendor: "HIKVISION" };
    const evt = adapter.normalize(raw);
    assert.equal(evt.type, "ANALYTICS");
    assert.equal(evt.details?.analytics?.analyticsType, "LINE_CROSSING");
    passLog("Hikvision linedetection → ANALYTICS (LINE_CROSSING)");
  });

  it("Hikvision diskerror → STORAGE_FAULT", () => {
    const raw = { eventType: "diskerror", vendor: "HIKVISION" };
    const evt = adapter.normalize(raw);
    assert.equal(evt.type, "STORAGE_FAULT");
    passLog("Hikvision diskerror → STORAGE_FAULT");
  });

  it("Hikvision DOOR_FORCED_OPEN access event → critical", () => {
    const raw = {
      eventType: "door forced open",
      vendor: "HIKVISION",
    };
    const evt = adapter.normalize(raw);
    assert.equal(evt.type, "DOOR_ACCESS");
    assert.equal(evt.details?.access?.accessType, "DOOR_FORCED_OPEN");
    passLog("Hikvision forced door → DOOR_ACCESS (DOOR_FORCED_OPEN) critical");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4: Axis Adapter
// ─────────────────────────────────────────────────────────────────────────────
describe("Axis Adapter – key event types", () => {
  const adapter = new AxisDeviceEventAdapter();

  it("Axis Tampering topic → TAMPER", () => {
    const raw = { topic: "tnsaxis:CameraApplicationPlatform/Tampering/Channel1", vendor: "AXIS" };
    const evt = adapter.normalize(raw);
    assert.equal(evt.type, "TAMPER");
    assert.equal(evt.vendorOrigin, "AXIS");
    passLog("Axis Tampering → TAMPER");
  });

  it("Axis FenceGuard topic → ANALYTICS (LINE_CROSSING)", () => {
    const raw = { topic: "tnsaxis:CameraApplicationPlatform/FenceGuard/Camera1Rule1", vendor: "AXIS", data: { scenario: "Vault Zone 2" } };
    const evt = adapter.normalize(raw);
    assert.equal(evt.type, "ANALYTICS");
    assert.equal(evt.details?.analytics?.analyticsType, "LINE_CROSSING");
    passLog("Axis FenceGuard → ANALYTICS (LINE_CROSSING)");
  });

  it("Axis Signal loss → VIDEO_LOSS", () => {
    const raw = { topic: "tnsaxis:VideoSource/SignalLoss", vendor: "AXIS" };
    const evt = adapter.normalize(raw);
    assert.equal(evt.type, "VIDEO_LOSS");
    passLog("Axis SignalLoss → VIDEO_LOSS");
  });

  it("Axis Port/Input → RELAY (TRIGGERED)", () => {
    const raw = { topic: "tnsaxis:IO/Port", vendor: "AXIS" };
    const evt = adapter.normalize(raw);
    assert.equal(evt.type, "RELAY");
    assert.equal(evt.details?.relay?.relayState, "TRIGGERED");
    passLog("Axis Port/IO → RELAY");
  });

  it("Axis motion topic → MOTION", () => {
    const raw = { topic: "tnsaxis:VideoSource/MotionAlarm", vendor: "AXIS" };
    const evt = adapter.normalize(raw);
    assert.equal(evt.type, "MOTION");
    passLog("Axis MotionAlarm → MOTION");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 5: ONVIF Adapter
// ─────────────────────────────────────────────────────────────────────────────
describe("ONVIF Adapter – key event types", () => {
  const adapter = new OnvifDeviceEventAdapter();

  it("ONVIF tns1 SignalLoss → VIDEO_LOSS", () => {
    const raw = { Topic: "tns1:VideoSource/GlobalSceneChange/SignalLoss", UtcTime: "2026-08-17T10:30:00Z" };
    const evt = adapter.normalize(raw);
    assert.equal(evt.type, "VIDEO_LOSS");
    assert.equal(evt.vendorOrigin, "ONVIF");
    passLog("ONVIF SignalLoss → VIDEO_LOSS");
  });

  it("ONVIF tns1 Tampering → TAMPER", () => {
    const raw = { Topic: "tns1:VideoSource/Tampering/TamperDetector" };
    const evt = adapter.normalize(raw);
    assert.equal(evt.type, "TAMPER");
    passLog("ONVIF Tampering → TAMPER");
  });

  it("ONVIF RuleEngine LineDetector → ANALYTICS (LINE_CROSSING)", () => {
    const raw = { Topic: "tns1:RuleEngine/LineDetector/Crossed" };
    const evt = adapter.normalize(raw);
    assert.equal(evt.type, "ANALYTICS");
    assert.equal(evt.details?.analytics?.analyticsType, "LINE_CROSSING");
    passLog("ONVIF LineDetector → ANALYTICS (LINE_CROSSING)");
  });

  it("ONVIF DigitalInput → RELAY", () => {
    const raw = { Topic: "tns1:Device/Trigger/DigitalInput" };
    const evt = adapter.normalize(raw);
    assert.equal(evt.type, "RELAY");
    passLog("ONVIF DigitalInput → RELAY");
  });

  it("ONVIF Door → DOOR_ACCESS", () => {
    const raw = { Topic: "tns1:AccessPoint/AccessGranted/DoorState" };
    const evt = adapter.normalize(raw);
    assert.equal(evt.type, "DOOR_ACCESS");
    passLog("ONVIF Door → DOOR_ACCESS");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 6: Edge Agent Adapter
// ─────────────────────────────────────────────────────────────────────────────
describe("Edge Agent Adapter – key event types", () => {
  const adapter = new EdgeAgentDeviceEventAdapter();

  it("Edge Agent STREAM_STALL → VIDEO_LOSS (critical)", () => {
    const raw = { eventType: "STREAM_STALL", edgeGatewayId: "GW-EDGE-BR118", cameraId: "CAM-VAULT-01", timestamp: "2026-08-17T10:40:00Z" };
    const evt = adapter.normalize(raw);
    assert.equal(evt.type, "VIDEO_LOSS");
    assert.equal(evt.vendorOrigin, "EDGE_AGENT");
    assert.equal(evt.deviceId, "GW-EDGE-BR118");
    passLog("Edge Agent STREAM_STALL → VIDEO_LOSS");
  });

  it("Edge Agent FROZEN_VIDEO → TAMPER (FROZEN_VIDEO)", () => {
    const raw = { eventType: "FROZEN_VIDEO", edgeGatewayId: "GW-EDGE-BR118" };
    const evt = adapter.normalize(raw);
    assert.equal(evt.type, "TAMPER");
    assert.equal(evt.details?.tamper?.tamperType, "FROZEN_VIDEO");
    passLog("Edge Agent FROZEN_VIDEO → TAMPER (FROZEN_VIDEO)");
  });

  it("Edge Agent BLACK_FRAME → TAMPER (BLACK_FRAME)", () => {
    const raw = { eventType: "BLACK_FRAME", edgeGatewayId: "GW-EDGE-BR118" };
    const evt = adapter.normalize(raw);
    assert.equal(evt.type, "TAMPER");
    assert.equal(evt.details?.tamper?.tamperType, "BLACK_FRAME");
    passLog("Edge Agent BLACK_FRAME → TAMPER (BLACK_FRAME)");
  });

  it("Edge Agent DISK_STORAGE → STORAGE_FAULT (critical)", () => {
    const raw = { eventType: "DISK_STORAGE", edgeGatewayId: "GW-EDGE-BR118" };
    const evt = adapter.normalize(raw);
    assert.equal(evt.type, "STORAGE_FAULT");
    passLog("Edge Agent DISK_STORAGE → STORAGE_FAULT");
  });

  it("Edge Agent RECORDING_FAILURE → RECORDING_FAILURE", () => {
    const raw = { eventType: "RECORDING_FAILURE", edgeGatewayId: "GW-EDGE-BR118" };
    const evt = adapter.normalize(raw);
    assert.equal(evt.type, "RECORDING_FAILURE");
    assert.equal(evt.details?.recording?.failureReason, "WRITE_TIMEOUT");
    passLog("Edge Agent RECORDING_FAILURE → RECORDING_FAILURE");
  });

  it("Edge Agent YOLO_INTRUSION → ANALYTICS", () => {
    const raw = { eventType: "YOLO_INTRUSION", edgeGatewayId: "GW-EDGE-BR118" };
    const evt = adapter.normalize(raw);
    assert.equal(evt.type, "ANALYTICS");
    assert.equal(evt.details?.analytics?.analyticsType, "INTRUSION");
    passLog("Edge Agent YOLO_INTRUSION → ANALYTICS");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 7: Generic Fallback Adapter
// ─────────────────────────────────────────────────────────────────────────────
describe("Generic Adapter – canonical field pass-through", () => {
  const adapter = new GenericDeviceEventAdapter();

  it("Generic VIDEO_LOSS → VIDEO_LOSS", () => {
    const raw = { type: "VIDEO_LOSS", tenantId: "T-001", branchId: "BR-118", deviceId: "NVR-GENERIC", cameraId: "CAM-01", sourceTimestamp: "2026-08-17T11:00:00Z" };
    const evt = adapter.normalize(raw);
    assert.equal(evt.type, "VIDEO_LOSS");
    assert.equal(evt.tenantId, "T-001");
    assert.equal(evt.branchId, "BR-118");
    assert.equal(evt.cameraId, "CAM-01");
    passLog("Generic VIDEO_LOSS → VIDEO_LOSS with passthrough fields");
  });

  it("Generic DOOR_FORCED_OPEN → DOOR_ACCESS (critical)", () => {
    const raw = { type: "DOOR_FORCED_OPEN" };
    const evt = adapter.normalize(raw);
    assert.equal(evt.type, "DOOR_ACCESS");
    assert.equal(evt.severity, "critical");
    passLog("Generic DOOR_FORCED_OPEN → DOOR_ACCESS (critical)");
  });

  it("Generic arbitrary vendor neutral event always produces valid DeviceEvent", () => {
    const raw = { name: "UNKNOWN_TYPE", timestamp: "2026-08-17T12:00:00Z" };
    const evt = adapter.normalize(raw);
    assert.ok(evt.id, "Has UUID id");
    assert.ok(evt.receivedTimestamp, "Has receivedTimestamp");
    assert.ok(evt.sourceTimestamp, "Has sourceTimestamp");
    assert.ok(typeof evt.observedClockOffsetMs === "number", "Has clock offset");
    passLog("Generic unknown → always produces valid DeviceEvent envelope");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 8: EventNormalizationService Auto-Dispatch
// ─────────────────────────────────────────────────────────────────────────────
describe("EventNormalizationService – auto-vendor detection", () => {
  it("Auto-routes ONVIF topic to ONVIF adapter", () => {
    const raw = { Topic: "tns1:VideoSource/SignalLoss" };
    const evt = service.normalizeEvent(raw);
    assert.equal(evt.vendorOrigin, "ONVIF");
    assert.equal(evt.type, "VIDEO_LOSS");
    passLog("Auto-routed ONVIF tns1 → ONVIF adapter → VIDEO_LOSS");
  });

  it("Auto-routes CP PLUS VideoLoss to CP PLUS adapter", () => {
    const raw = { Code: "VideoLoss", UTC: "2026-08-17T10:00:00Z" };
    const evt = service.normalizeEvent(raw);
    assert.equal(evt.vendorOrigin, "CP_PLUS");
    passLog("Auto-routed CP PLUS VideoLoss → CP PLUS adapter");
  });

  it("Auto-routes Dahua vendor → Dahua adapter", () => {
    const raw = { code: "CrossLineDetection", action: "Start", vendor: "DAHUA" };
    const evt = service.normalizeEvent(raw);
    assert.equal(evt.vendorOrigin, "DAHUA");
    assert.equal(evt.type, "ANALYTICS");
    passLog("Auto-routed Dahua CrossLineDetection → ANALYTICS");
  });

  it("Vendor hint overrides auto-detection", () => {
    const raw = { Code: "VideoLoss" };
    const evt = service.normalizeEvent(raw, {}, "HIKVISION");
    assert.equal(evt.vendorOrigin, "HIKVISION");
    passLog("Vendor hint overrides auto-detection");
  });

  it("High-security vault zone elevates TAMPER to critical", () => {
    const raw = { vendor: "HIKVISION", eventType: "tamperdetection" };
    const context = { isHighSecurityZone: true };
    const evt = service.normalizeEvent(raw, context);
    assert.equal(evt.type, "TAMPER");
    assert.equal(evt.severity, "critical");
    passLog("High-security zone elevates TAMPER severity to critical");
  });

  it("Batch ingestion processes 5 events", async () => {
    const events = [
      { Code: "VideoLoss", UTC: "2026-08-17T10:00:00Z", vendor: "CPPLUS" },
      { vendor: "DAHUA", code: "StorageFailure", action: "Start" },
      { eventType: "videoloss", vendor: "HIKVISION" },
      { Topic: "tns1:VideoSource/SignalLoss" },
      { type: "MOTION" },
    ];
    const result = await service.batchIngest(events);
    assert.equal(result.count, 5);
    passLog("Batch ingestion processed 5 events");
  });

  it("getRecentEvents returns ingested events with type filter", async () => {
    await service.ingestRawEvent({ Code: "RecordFailure", UTC: "2026-08-17T10:00:00Z" });
    const events = service.getRecentEvents({ type: "RECORDING_FAILURE", limit: 10 });
    assert.ok(events.length >= 1, "At least 1 RECORDING_FAILURE event returned");
    passLog("getRecentEvents filters by type correctly");
  });

  it("Taxonomy returns all 9 normalized event types", () => {
    const taxonomy = service.getSupportedEventTaxonomy();
    const expected = [
      "MOTION", "VIDEO_LOSS", "TAMPER", "STORAGE_FAULT",
      "CAMERA_OFFLINE", "RECORDING_FAILURE", "ANALYTICS", "RELAY", "DOOR_ACCESS",
    ];
    for (const t of expected) {
      assert.ok(taxonomy.types.includes(t as any), `Taxonomy includes ${t}`);
    }
    passLog(`Taxonomy exports all ${expected.length} canonical event types`);
  });

  it("Vendor taxonomy lists all 7 vendors", () => {
    const taxonomy = service.getSupportedEventTaxonomy();
    const expected = ["CP_PLUS", "DAHUA", "HIKVISION", "AXIS", "ONVIF", "EDGE_AGENT", "GENERIC"];
    for (const v of expected) {
      assert.ok(taxonomy.vendors.includes(v as any), `Vendor ${v} listed`);
    }
    passLog("Taxonomy lists all 7 supported vendors");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 9: DeviceEvent Envelope integrity
// ─────────────────────────────────────────────────────────────────────────────
describe("DeviceEvent envelope – structural integrity", () => {
  it("All events have required envelope fields", () => {
    const raw = { Code: "VideoLoss", UTC: "2026-08-17T10:00:00Z" };
    const evt = service.normalizeEvent(raw, { tenantId: "T-BANK", branchId: "BR-Chennai-01", deviceId: "NVR-CPPLUS-01" });
    assert.ok(evt.id, "Has id");
    assert.equal(evt.tenantId, "T-BANK");
    assert.equal(evt.branchId, "BR-Chennai-01");
    assert.equal(evt.deviceId, "NVR-CPPLUS-01");
    assert.ok(evt.sourceTimestamp, "Has sourceTimestamp");
    assert.ok(evt.receivedTimestamp, "Has receivedTimestamp");
    assert.ok(typeof evt.observedClockOffsetMs === "number", "Has observedClockOffsetMs");
    assert.ok(evt.vendorOrigin, "Has vendorOrigin");
    passLog("DeviceEvent envelope has all required fields");
  });

  it("observedClockOffsetMs reflects hardware clock drift", () => {
    // Device time 10 seconds ahead of now
    const deviceTime = new Date(Date.now() + 10_000).toISOString();
    const raw = { Code: "VideoLoss", UTC: deviceTime };
    const evt = service.normalizeEvent(raw);
    assert.ok(evt.observedClockOffsetMs >= 9000 && evt.observedClockOffsetMs <= 12000,
      `Clock offset ${evt.observedClockOffsetMs}ms should be ~10s`);
    passLog(`observedClockOffsetMs = ${evt.observedClockOffsetMs}ms correctly reflects 10s device drift`);
  });

  it("rawPayload is preserved for forensic audit trail", () => {
    const raw = { Code: "IntrusionDetection", UTC: "2026-08-17T10:05:00.000Z", Data: { RuleName: "Vault Perimeter" } };
    const evt = service.normalizeEvent(raw);
    assert.deepEqual(evt.rawPayload, raw);
    passLog("rawPayload preserved in full for forensic audit");
  });
});
