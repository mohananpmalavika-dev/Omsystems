import { describe, expect, it } from "vitest";
import { createDeviceFingerprint } from "../src/discovery/device-fingerprint.js";

describe("stable camera fingerprint", () => {
  it("does not change when the camera IP address changes", () => {
    const first = createDeviceFingerprint({
      onvifEndpointReference: "urn:uuid:4e5f61f4-5747-4fde-b9e2-b2a36a90f085",
      manufacturer: "Hikvision",
      model: "DS-2CD",
      serialNumber: "camera-4500",
    });
    const second = createDeviceFingerprint({
      onvifUuid: "4e5f61f4-5747-4fde-b9e2-b2a36a90f085",
      manufacturer: "Hikvision",
      model: "DS-2CD",
      serialNumber: "camera-4500",
    });

    expect(first).toBe(second);
    expect(first).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("creates separate identities for channels exposed by one recorder UUID", () => {
    const channelOne = createDeviceFingerprint({
      onvifEndpointReference: "urn:uuid:4e5f61f4-5747-4fde-b9e2-b2a36a90f085",
      recorderChannel: 1,
    });
    const channelTwo = createDeviceFingerprint({
      onvifEndpointReference: "urn:uuid:4e5f61f4-5747-4fde-b9e2-b2a36a90f085",
      recorderChannel: 2,
    });

    expect(channelOne).not.toBe(channelTwo);
  });

  it("creates separate identities for automatically discovered channels on one recorder MAC", () => {
    const channelOne = createDeviceFingerprint({
      macAddress: "9C:A3:A9:11:22:33",
      recorderChannel: 1,
    });
    const channelTwo = createDeviceFingerprint({
      macAddress: "9C:A3:A9:11:22:33",
      recorderChannel: 2,
    });

    expect(channelOne).not.toBe(channelTwo);
    expect(channelOne).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("refuses to make an IP-derived identity", () => {
    expect(createDeviceFingerprint({ manufacturer: "unknown", model: "IP Camera" })).toBeUndefined();
  });
});
