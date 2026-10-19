import { describe, expect, it } from "vitest";
import {
  clampDecoderLimit,
  createDefaultGridAssignments,
  getDecoderCapacityOptions,
  retainCameraPageOnGridChange,
  uniqueWallCameras,
  assignWallCamera,
} from "../components/enhanced-camera-grid-model.js";

describe("camera wall decoder limits", () => {
  it("deduplicates a camera list before allocating wall positions", () => {
    expect(createDefaultGridAssignments(["a", "a", "b"], 2, "sub").map(entry => entry.cameraId)).toEqual(["a", "b"]);
    expect(uniqueWallCameras([{ id: "a" }, { id: "b" }, { id: "a" }]).map(camera => camera.id)).toEqual(["a", "b"]);
  });

  it("swaps an already assigned camera rather than duplicating its view", () => {
    const a = { camera: { id: "a" }, stream: "main" };
    const b = { camera: { id: "b" }, stream: "sub" };
    const original = new Map([[0, a], [1, b]]);
    expect([...assignWallCamera(original, 0, b)]).toEqual([[1, a], [0, b]]);
    expect([...assignWallCamera(original, 2, a)]).toEqual([[1, b], [2, a]]);
    expect(original.get(0)).toBe(a);
  });
  it("does not allow a saved workstation preference to exceed a page cap", () => {
    expect(clampDecoderLimit(64, 16)).toBe(16);
    expect(clampDecoderLimit(36, 16)).toBe(16);
    expect(clampDecoderLimit(16, 16)).toBe(16);
  });

  it("only offers decoder capacities allowed by the embedding page", () => {
    expect(getDecoderCapacityOptions(16)).toEqual([16]);
    expect(getDecoderCapacityOptions(36)).toEqual([16, 25, 36]);
    expect(getDecoderCapacityOptions(144)).toEqual([16, 25, 36, 64, 144]);
    expect(clampDecoderLimit(144, 144)).toBe(144);
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
