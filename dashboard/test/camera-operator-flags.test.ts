import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getStoredOperatorFlags,
  saveStoredOperatorFlags,
  setCameraOperatorFlags,
  toggleCameraPredefinedFlag,
  getStoredCameraPresets,
  saveStoredCameraPresets,
  PREDEFINED_OPERATOR_FLAGS,
  CameraPresetGroup,
} from "../lib/camera-operator-flags";

describe("Camera Operator Flags & Custom Presets", () => {
  const store = new Map<string, string>();
  const mockLocalStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };

  beforeEach(() => {
    store.clear();
    const mockWindow = {
      localStorage: mockLocalStorage,
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal("window", mockWindow);
    vi.stubGlobal("localStorage", mockLocalStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("Operator Camera Status Flags", () => {
    it("has predefined flags for maintenance, lens dirty, VIP area, high security, and night patrol", () => {
      const types = PREDEFINED_OPERATOR_FLAGS.map((f) => f.type);
      expect(types).toContain("maintenance");
      expect(types).toContain("lens-dirty");
      expect(types).toContain("vip-area");
      expect(types).toContain("high-security");
      expect(types).toContain("night-patrol");
    });

    it("toggles predefined flags on a camera correctly", () => {
      const cameraId = "cam-entrance-01";

      // Toggle ON maintenance flag
      const flags1 = toggleCameraPredefinedFlag(cameraId, "maintenance");
      expect(flags1.length).toBe(1);
      expect(flags1[0].type).toBe("maintenance");
      expect(flags1[0].label).toBe("Maintenance Needed");

      // Toggle ON lens dirty flag
      const flags2 = toggleCameraPredefinedFlag(cameraId, "lens-dirty");
      expect(flags2.length).toBe(2);
      expect(flags2.some((f) => f.type === "lens-dirty")).toBe(true);

      // Verify persistent storage
      const stored = getStoredOperatorFlags();
      expect(stored[cameraId]).toHaveLength(2);

      // Toggle OFF maintenance flag
      const flags3 = toggleCameraPredefinedFlag(cameraId, "maintenance");
      expect(flags3.length).toBe(1);
      expect(flags3[0].type).toBe("lens-dirty");
    });

    it("supports setting custom operator notes and tags", () => {
      const cameraId = "cam-vault-02";
      setCameraOperatorFlags(cameraId, [
        {
          type: "custom",
          label: "Lock Check Required",
          note: "Night shift lock sensor intermittent",
          updatedAt: new Date().toISOString(),
        },
      ]);

      const stored = getStoredOperatorFlags();
      expect(stored[cameraId]).toBeDefined();
      expect(stored[cameraId][0].label).toBe("Lock Check Required");
      expect(stored[cameraId][0].note).toBe("Night shift lock sensor intermittent");
    });
  });

  describe("Custom Camera Preset Groups", () => {
    it("returns default presets when none exist", () => {
      const presets = getStoredCameraPresets();
      expect(presets.length).toBeGreaterThanOrEqual(3);
      expect(presets.some((p) => p.name === "Main Gates")).toBe(true);
      expect(presets.some((p) => p.name === "Warehouse All")).toBe(true);
      expect(presets.some((p) => p.name === "Night Patrol")).toBe(true);
    });

    it("saves and retrieves custom presets", () => {
      const customPreset: CameraPresetGroup = {
        id: "preset-custom-1",
        name: "Cash Counter Cluster",
        description: "All teller and cash handling points",
        cameraIds: ["cam-1", "cam-2", "cam-3"],
        gridSize: "2x2",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      saveStoredCameraPresets([customPreset]);
      const retrieved = getStoredCameraPresets();
      expect(retrieved).toHaveLength(1);
      expect(retrieved[0].name).toBe("Cash Counter Cluster");
      expect(retrieved[0].cameraIds).toEqual(["cam-1", "cam-2", "cam-3"]);
    });
  });
});
