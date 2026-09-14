import { describe, expect, it } from "vitest";
import {
  clampDecoderLimit,
  createDefaultGridAssignments,
  getDecoderCapacityOptions,
  retainCameraPageOnGridChange,
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

  it("assigns available cameras when a saved layout cannot be resolved", () => {
    expect(createDefaultGridAssignments(["cam-01", "cam-02", "cam-03"], 2, "sub")).toEqual([
      { position: 0, cameraId: "cam-01", stream: "sub" },
      { position: 1, cameraId: "cam-02", stream: "sub" },
    ]);
  });

  it("keeps the operator at the same camera range when grid density changes", () => {
    // Page two of a 12×12 wall starts at camera 145. In a 4×4 wall, that is
    // page ten (zero-indexed page nine), rather than the first page.
    expect(retainCameraPageOnGridChange(500, 1, 144, 16)).toBe(9);
    expect(retainCameraPageOnGridChange(17, 1, 16, 144)).toBe(0);
  });
});
