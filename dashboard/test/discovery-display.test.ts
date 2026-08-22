import { describe, expect, it } from "vitest";
import { discoveryDeviceTypeLabel, discoveryModelLabel } from "../lib/discovery-display";

describe("discovery identity display", () => {
  it("shows the exact model and identifies an individual IP camera", () => {
    const camera = { model: "DS-2CD2143G2-I", sourceType: "ip-camera" };

    expect(discoveryModelLabel(camera)).toBe("DS-2CD2143G2-I");
    expect(discoveryDeviceTypeLabel(camera)).toBe("Individual IP camera");
  });

  it("identifies DVR and NVR channel sources", () => {
    expect(discoveryDeviceTypeLabel({ model: "Channel 4", sourceType: "analog-dvr-channel" }))
      .toBe("Analog camera via DVR");
    expect(discoveryDeviceTypeLabel({ model: "Channel 7", sourceType: "nvr-channel" }))
      .toBe("IP camera via DVR/NVR");
  });

  it("identifies a recorder from its discovered identity", () => {
    expect(discoveryDeviceTypeLabel({ model: "16 Channel NVR" })).toBe("DVR/NVR recorder");
  });

  it("does not guess the model or type before credential verification", () => {
    const device = { model: "Camera 192.168.29.171", sourceType: "ip-camera" };

    expect(discoveryModelLabel(device)).toBe("Will be identified after login");
    expect(discoveryDeviceTypeLabel(device)).toBe("Camera or DVR (confirmation pending)");
  });
});
