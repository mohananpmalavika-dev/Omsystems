import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { scanCredentialResolver, targetedOnvifEndpoint, targetFromScanJob } from "../src/discovery/targeted-scan.js";

describe("device-scoped scan jobs", () => {
  it("uses the just received recorder login ahead of an older database login", async () => {
    const fallback = vi.fn(async () => ({ username: "old", password: "old-password" }));
    const credentials = scanCredentialResolver(
      { ipAddress: "172.29.91.100" },
      { username: "new", password: "new-password" },
      fallback,
    );

    await expect(credentials("172.29.91.100")).resolves.toEqual({
      username: "new", password: "new-password",
    });
    expect(fallback).not.toHaveBeenCalled();
    await expect(credentials("172.29.91.101")).resolves.toEqual({
      username: "old", password: "old-password",
    });
  });

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
    const raw = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
    const source = raw.replace(/\r\n/g, "\n");

    expect(source).toContain("if (options.target) {\n    endpoints = [targetedOnvifEndpoint(options.target)]");
    expect(source).toContain("const knownHosts = options.target ? [options.target.ipAddress]");
    expect(source).toContain("restrictToHosts: Boolean(options.target)");
    expect(source).toContain("scanBranch(target ? { target } : {})");
  });
});
