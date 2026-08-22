import { describe, expect, it } from "vitest";
import { parseNeighborMac } from "../src/discovery/network-neighbor.js";

describe("network neighbor identity", () => {
  it("normalizes Windows and Linux neighbor output", () => {
    expect(parseNeighborMac("192.168.1.20  00-11-22-33-44-55  dynamic")).toBe("00:11:22:33:44:55");
    expect(parseNeighborMac("192.168.1.21 dev eth0 lladdr aa:bb:cc:dd:ee:ff REACHABLE")).toBe("aa:bb:cc:dd:ee:ff");
  });

  it("rejects unusable broadcast and empty hardware addresses", () => {
    expect(parseNeighborMac("192.168.1.20 ff:ff:ff:ff:ff:ff")).toBeUndefined();
    expect(parseNeighborMac("192.168.1.20 00:00:00:00:00:00")).toBeUndefined();
  });
});
