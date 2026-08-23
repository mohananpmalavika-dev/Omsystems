import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { targetedOnvifEndpoint, targetFromScanJob } from "../src/discovery/targeted-scan.js";

describe("device-scoped scan jobs", () => {
  it("turns a targeted job into one explicit ONVIF endpoint", () => {
    const target = targetFromScanJob({
      scope: "device",
      targetDiscoveryId: "discovery-1",
      targetIpAddress: "192.168.29.171",
      targetOnvifPort: 8080,
    });

    expect(target).toEqual({
      discoveryId: "discovery-1",
      ipAddress: "192.168.29.171",
      onvifPort: 8080,
    });
    expect(targetedOnvifEndpoint(target!)).toEqual({
      endpointReference: null,
      xaddrs: ["http://192.168.29.171:8080/onvif/device_service"],
      scopes: [],
      types: [],
      remoteAddress: "192.168.29.171",
    });
  });

  it("does not run broadcast discovery or expand RTSP scanning beyond a target", async () => {
    const raw = await readFile("edge-agent/src/index.ts", "utf8");
    const source = raw.replace(/\r\n/g, "\n");

    expect(source).toContain("if (options.target) {\n    endpoints = [targetedOnvifEndpoint(options.target)]");
    expect(source).toContain("const knownHosts = options.target ? [options.target.ipAddress]");
    expect(source).toContain("restrictToHosts: Boolean(options.target)");
    expect(source).toContain("scanBranch(target ? { target } : {})");
  });
});
