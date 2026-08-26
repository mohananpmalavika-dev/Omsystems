import { describe, expect, it } from "vitest";
import type { DiscoveredCamera } from "../src/domain/models.js";
import {
  selectCameraProtocol,
  supersededRecorderCredentialDiscoveryIds,
} from "../src/services/camera-auto-provision.js";

function discovery(overrides: Partial<DiscoveredCamera>): DiscoveredCamera {
  return {
    id: "discovery-1",
    deviceIdentityId: "identity-1",
    branchId: "branch-1",
    edgeAgentId: "edge-1",
    discoveryMethod: "rtsp-network-scan",
    vendor: "cp-plus",
    manufacturer: "CP PLUS",
    model: "CP PLUS DVR",
    ipAddress: "192.168.29.171",
    onvifPort: 80,
    rtspPort: 554,
    profiles: [{ name: "unverified", codec: "unknown", width: 1, height: 1 }],
    capabilities: { ptz: false, audio: false, events: false },
    status: "pending",
    discoveredAt: new Date(0).toISOString(),
    ...overrides,
  };
}

describe("recorder credential discovery cleanup", () => {
  it("retires the login placeholder after verified recorder channels arrive", () => {
    const placeholder = discovery({
      id: "login-placeholder",
      recorderId: "recorder-1",
      credentialsRequired: true,
      streamVerified: false,
    });
    const verifiedChannel = discovery({
      id: "channel-1",
      recorderId: "recorder-1",
      recorderChannel: 1,
      sourceType: "analog-dvr-channel",
      credentialsRequired: false,
      streamVerified: true,
    });

    expect(supersededRecorderCredentialDiscoveryIds([placeholder, verifiedChannel]))
      .toEqual(["login-placeholder"]);
  });

  it("keeps the prompt while no channel has accepted the login", () => {
    const placeholder = discovery({
      id: "login-placeholder",
      recorderId: "recorder-1",
      credentialsRequired: true,
      streamVerified: false,
    });

    expect(supersededRecorderCredentialDiscoveryIds([placeholder])).toEqual([]);
  });

  it("retires a verified recorder parent after its verified channels arrive", () => {
    const recorderParent = discovery({
      id: "recorder-parent",
      recorderId: "recorder-1",
      credentialsRequired: false,
      streamVerified: true,
    });
    const verifiedChannel = discovery({
      id: "channel-1",
      recorderId: "recorder-1",
      recorderChannel: 1,
      sourceType: "analog-dvr-channel",
      credentialsRequired: false,
      streamVerified: true,
    });

    expect(supersededRecorderCredentialDiscoveryIds([recorderParent, verifiedChannel]))
      .toEqual(["recorder-parent"]);
  });
});

describe("vendor-neutral camera protocol selection", () => {
  it("uses ONVIF first for a recorder channel from an unknown model", () => {
    expect(selectCameraProtocol(discovery({
      vendor: "other",
      manufacturer: "White-label OEM",
      model: "Unknown NVR",
      discoveryMethod: "nvr-dvr-channel-discovery",
      sourceType: "nvr-channel",
      recorderId: "recorder-1",
      recorderChannel: 1,
      onvifSupport: true,
    }))).toBe("onvif-t");
  });

  it("uses verified RTSP when ONVIF is unavailable", () => {
    expect(selectCameraProtocol(discovery({
      vendor: "other",
      manufacturer: "New vendor",
      model: "Unlisted camera",
      onvifSupport: false,
      rtspValidated: true,
    }))).toBe("rtsp");
  });

  it("keeps the vendor adapter as a last resort for legacy recorder channels", () => {
    expect(selectCameraProtocol(discovery({
      discoveryMethod: "vendor-api-discovery",
      sourceType: "analog-dvr-channel",
      recorderId: "legacy-recorder",
      recorderChannel: 1,
      onvifSupport: undefined,
      rtspValidated: false,
    }))).toBe("vendor-adapter");
  });
});
