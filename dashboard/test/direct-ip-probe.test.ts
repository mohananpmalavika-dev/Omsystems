import { describe, expect, it } from "vitest";
import { expandDirectProbeTargets, isPrivateIpv4 } from "../lib/direct-ip-probe";

describe("direct IP probe targets", () => {
  it("keeps single-IP probing unchanged", () => {
    expect(expandDirectProbeTargets("192.168.1.20", "single")).toEqual(["192.168.1.20"]);
  });

  it("expands an inclusive range", () => {
    expect(expandDirectProbeTargets("192.168.1.20 - 192.168.1.22", "range"))
      .toEqual(["192.168.1.20", "192.168.1.21", "192.168.1.22"]);
    expect(expandDirectProbeTargets("192.168.1.20-22", "range"))
      .toEqual(["192.168.1.20", "192.168.1.21", "192.168.1.22"]);
  });

  it("expands a CIDR range", () => {
    expect(expandDirectProbeTargets("192.168.1.0/30", "range"))
      .toEqual(["192.168.1.0", "192.168.1.1", "192.168.1.2", "192.168.1.3"]);
  });

  it("rejects ranges larger than the bounded probe size", () => {
    expect(() => expandDirectProbeTargets("192.168.0.0/16", "range")).toThrow("256");
  });

  it("rejects range syntax in single-IP mode", () => {
    expect(() => expandDirectProbeTargets("192.168.1.20-192.168.1.22", "single"))
      .toThrow("IP range mode");
  });

  it("identifies private IPv4 subnets accurately", () => {
    expect(isPrivateIpv4("192.168.1.1")).toBe(true);
    expect(isPrivateIpv4("192.168.100.50")).toBe(true);
    expect(isPrivateIpv4("10.0.0.1")).toBe(true);
    expect(isPrivateIpv4("10.254.1.99")).toBe(true);
    expect(isPrivateIpv4("172.16.0.1")).toBe(true);
    expect(isPrivateIpv4("172.31.255.254")).toBe(true);
    expect(isPrivateIpv4("100.64.0.1")).toBe(true);
    expect(isPrivateIpv4("127.0.0.1")).toBe(true);
    expect(isPrivateIpv4("8.8.8.8")).toBe(false);
    expect(isPrivateIpv4("1.1.1.1")).toBe(false);
    expect(isPrivateIpv4("172.32.0.1")).toBe(false);
    expect(isPrivateIpv4("invalid")).toBe(false);
  });
});
