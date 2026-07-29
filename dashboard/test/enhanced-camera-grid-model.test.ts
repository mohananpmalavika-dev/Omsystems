import { describe, expect, it } from "vitest";
import {
  clampDecoderLimit,
  getDecoderCapacityOptions,
} from "../components/enhanced-camera-grid-model.js";

describe("camera wall decoder limits", () => {
  it("does not allow a saved workstation preference to exceed a page cap", () => {
    expect(clampDecoderLimit(64, 16)).toBe(16);
    expect(clampDecoderLimit(36, 16)).toBe(16);
    expect(clampDecoderLimit(16, 16)).toBe(16);
  });

  it("only offers decoder capacities allowed by the embedding page", () => {
    expect(getDecoderCapacityOptions(16)).toEqual([16]);
    expect(getDecoderCapacityOptions(36)).toEqual([16, 25, 36]);
  });
});
