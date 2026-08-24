import { describe, expect, it } from "vitest";
import { expandDirectProbeTargets } from "../lib/direct-ip-probe";

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
});
