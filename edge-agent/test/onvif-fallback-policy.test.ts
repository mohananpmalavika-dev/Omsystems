import { describe, expect, it } from "vitest";
import {
  fallbackCredentialsRequired,
  rtspOnvifExclusions,
} from "../src/discovery/onvif-fallback-policy.js";

describe("ONVIF fallback policy", () => {
  it("clears credential errors once a vendor RTSP stream is verified", () => {
    expect(fallbackCredentialsRequired(true, true)).toBe(false);
    expect(fallbackCredentialsRequired(false, true)).toBe(true);
  });

  it("keeps recorder fallbacks eligible for RTSP channel enumeration", () => {
    const handledOnvifHosts = new Set(["192.168.29.58", "192.168.29.171"]);
    const recorderFallbackHosts = new Set(["192.168.29.171"]);

    expect(rtspOnvifExclusions({
      onvifHosts: ["192.168.29.58", "192.168.29.171"],
      handledOnvifHosts,
      recorderFallbackHosts,
    })).toEqual(["192.168.29.58"]);

    expect(rtspOnvifExclusions({
      targetIpAddress: "192.168.29.171",
      onvifHosts: ["192.168.29.171"],
      handledOnvifHosts,
      recorderFallbackHosts,
    })).toEqual([]);
  });
});
