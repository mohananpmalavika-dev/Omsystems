import { describe, expect, it } from "vitest";
import { parseIcmpPacketLoss } from "../src/monitoring/camera-packet-loss.js";

describe("camera ICMP loss parsing", () => {
  it("parses Windows ping output", () => {
    expect(parseIcmpPacketLoss("Packets: Sent = 3, Received = 2, Lost = 1 (33% loss)"))
      .toBe(33);
  });

  it("parses POSIX ping output", () => {
    expect(parseIcmpPacketLoss("3 packets transmitted, 2 received, 33.333% packet loss"))
      .toBe(33.333);
  });

  it("does not turn an unparseable ping response into a zero-loss measurement", () => {
    expect(parseIcmpPacketLoss("ping is blocked")).toBeNull();
  });
});
