import { describe, expect, it } from "vitest";
import { assessLumaFrame } from "../src/monitoring/camera-heartbeat.js";

describe("camera frame health", () => {
  it("detects a persistently identical frame only after three samples", () => {
    const frame = Buffer.alloc(64 * 36, 80);
    const one = assessLumaFrame(undefined, frame);
    const two = assessLumaFrame(one.state, frame);
    const three = assessLumaFrame(two.state, frame);
    expect(one.imageFrozen).toBe(false);
    expect(two.imageFrozen).toBe(false);
    expect(three.imageFrozen).toBe(true);
  });

  it("detects a genuinely dark decoded luminance frame", () => {
    expect(assessLumaFrame(undefined, Buffer.alloc(64 * 36, 4)).blackScreen).toBe(true);
    expect(assessLumaFrame(undefined, Buffer.alloc(64 * 36, 80)).blackScreen).toBe(false);
  });
});
