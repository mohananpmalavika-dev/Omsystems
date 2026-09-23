import { useEffect, useState, useCallback } from "react";

export type OperatorFlagType =
  | "maintenance"
  | "lens-dirty"
  | "vip-area"
  | "high-security"
  | "night-patrol"
  | "custom";

export interface OperatorCameraFlag {
  type: OperatorFlagType;
  label: string;
  note?: string;
  updatedAt: string;
}

export interface CameraPresetGroup {
  id: string;
  name: string;
  description?: string;
  cameraIds: string[];
  gridSize?: string;
  createdAt: string;
  updatedAt: string;
}

export const PREDEFINED_OPERATOR_FLAGS: Array<{
  type: OperatorFlagType;
  label: string;
  colorClass: string;
  icon: string;
  description: string;
}> = [
  {
    type: "maintenance",
    label: "Maintenance Needed",
    colorClass: "bg-amber-500/20 text-amber-300 border-amber-500/60",
    icon: "🛠️",
    description: "Camera or mounting requires physical/technical service",
  },
  {
    type: "lens-dirty",
    label: "Lens Dirty",
    colorClass: "bg-orange-500/20 text-orange-300 border-orange-500/60",
    icon: "🧹",
    description: "Optics obscured, dusty, or blurred; cleaning required",
  },
  {
    type: "vip-area",
    label: "VIP Arrival Area",
    colorClass: "bg-purple-500/20 text-purple-300 border-purple-500/60",
    icon: "⭐",
    description: "High-priority executive, VIP, or cash handling zone",
  },
  {
    type: "high-security",
    label: "High Security",
    colorClass: "bg-red-500/20 text-red-300 border-red-500/60",
    icon: "🚨",
    description: "Vault, strong room, or restricted access perimeter",
  },
  {
    type: "night-patrol",
    label: "Night Patrol",
    colorClass: "bg-cyan-500/20 text-cyan-300 border-cyan-500/60",
    icon: "🌙",
    description: "Included in night guard walkthrough and perimeter checks",
  },
];

const FLAGS_STORAGE_KEY = "sentinel.operator-camera-flags.v1";
const PRESETS_STORAGE_KEY = "sentinel.custom-camera-presets.v1";
const FLAGS_EVENT = "sentinel:operator-flags-changed";
const PRESETS_EVENT = "sentinel:camera-presets-changed";

// Default built-in starter presets if user has none
export const DEFAULT_CAMERA_PRESETS: CameraPresetGroup[] = [
  {
    id: "preset-main-gates",
    name: "Main Gates",
    description: "Primary perimeter entry and exit access points",
    cameraIds: [],
    gridSize: "2x2",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "preset-warehouse-all",
    name: "Warehouse All",
    description: "Logistics bay, loading dock, and warehouse interior",
    cameraIds: [],
    gridSize: "3x3",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "preset-night-patrol",
    name: "Night Patrol",
    description: "Critical points active during off-hours surveillance",
    cameraIds: [],
    gridSize: "2x2",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

/** Read all flags from local storage */
export function getStoredOperatorFlags(): Record<string, OperatorCameraFlag[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(FLAGS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch (error) {
    console.error("Failed to read operator camera flags:", error);
    return {};
  }
}

/** Save flags and notify other components */
export function saveStoredOperatorFlags(allFlags: Record<string, OperatorCameraFlag[]>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FLAGS_STORAGE_KEY, JSON.stringify(allFlags));
    window.dispatchEvent(new CustomEvent(FLAGS_EVENT, { detail: allFlags }));
  } catch (error) {
    console.error("Failed to save operator camera flags:", error);
  }
}

/** Set flags for a specific camera */
export function setCameraOperatorFlags(cameraId: string, flags: OperatorCameraFlag[]): void {
  const current = getStoredOperatorFlags();
  if (flags.length === 0) {
    delete current[cameraId];
  } else {
    current[cameraId] = flags;
  }
  saveStoredOperatorFlags(current);
}

/** Toggle a predefined flag for a camera */
export function toggleCameraPredefinedFlag(
  cameraId: string,
  flagType: OperatorFlagType,
  note?: string
): OperatorCameraFlag[] {
  const allFlags = getStoredOperatorFlags();
  const cameraFlags = allFlags[cameraId] || [];
  const existingIndex = cameraFlags.findIndex((f) => f.type === flagType);

  let updatedFlags: OperatorCameraFlag[];
  if (existingIndex >= 0) {
    // Remove if already present
    updatedFlags = cameraFlags.filter((_, idx) => idx !== existingIndex);
  } else {
    // Add new flag
    const def = PREDEFINED_OPERATOR_FLAGS.find((f) => f.type === flagType);
    const newFlag: OperatorCameraFlag = {
      type: flagType,
      label: def ? def.label : flagType,
      note,
      updatedAt: new Date().toISOString(),
    };
    updatedFlags = [...cameraFlags, newFlag];
  }

  setCameraOperatorFlags(cameraId, updatedFlags);
  return updatedFlags;
}

/** Hook for listening to and updating flags for all cameras or a specific camera */
export function useCameraOperatorFlags(cameraId?: string) {
  const [allFlags, setAllFlags] = useState<Record<string, OperatorCameraFlag[]>>(() =>
    getStoredOperatorFlags()
  );

  useEffect(() => {
    const handleUpdate = () => {
      setAllFlags(getStoredOperatorFlags());
    };
    window.addEventListener(FLAGS_EVENT, handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener(FLAGS_EVENT, handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  const cameraFlags = cameraId ? allFlags[cameraId] || [] : [];

  const updateFlags = useCallback(
    (newFlags: OperatorCameraFlag[]) => {
      if (!cameraId) return;
      setCameraOperatorFlags(cameraId, newFlags);
    },
    [cameraId]
  );

  const toggleFlag = useCallback(
    (type: OperatorFlagType, note?: string) => {
      if (!cameraId) return;
      toggleCameraPredefinedFlag(cameraId, type, note);
    },
    [cameraId]
  );

  return {
    allFlags,
    cameraFlags,
    updateFlags,
    toggleFlag,
  };
}

/** Read custom camera presets from local storage */
export function getStoredCameraPresets(): CameraPresetGroup[] {
  if (typeof window === "undefined") return DEFAULT_CAMERA_PRESETS;
  try {
    const raw = window.localStorage.getItem(PRESETS_STORAGE_KEY);
    if (!raw) {
      // Initialize with defaults if empty
      window.localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(DEFAULT_CAMERA_PRESETS));
      return DEFAULT_CAMERA_PRESETS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_CAMERA_PRESETS;
  } catch (error) {
    console.error("Failed to read camera presets:", error);
    return DEFAULT_CAMERA_PRESETS;
  }
}

/** Save custom camera presets and notify components */
export function saveStoredCameraPresets(presets: CameraPresetGroup[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
    window.dispatchEvent(new CustomEvent(PRESETS_EVENT, { detail: presets }));
  } catch (error) {
    console.error("Failed to save camera presets:", error);
  }
}

/** Hook for managing custom camera presets (groups) */
export function useCameraPresets() {
  const [presets, setPresets] = useState<CameraPresetGroup[]>(() => getStoredCameraPresets());

  useEffect(() => {
    const handleUpdate = () => {
      setPresets(getStoredCameraPresets());
    };
    window.addEventListener(PRESETS_EVENT, handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener(PRESETS_EVENT, handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  const createPreset = useCallback(
    (name: string, cameraIds: string[], description?: string, gridSize: string = "2x2") => {
      const newPreset: CameraPresetGroup = {
        id: `preset-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        name: name.trim(),
        description: description?.trim(),
        cameraIds: Array.from(new Set(cameraIds)),
        gridSize,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const next = [newPreset, ...presets.filter((p) => p.name.toLowerCase() !== newPreset.name.toLowerCase())];
      saveStoredCameraPresets(next);
      return newPreset;
    },
    [presets]
  );

  const updatePreset = useCallback(
    (id: string, updates: Partial<Omit<CameraPresetGroup, "id" | "createdAt">>) => {
      const next = presets.map((p) => {
        if (p.id !== id) return p;
        return {
          ...p,
          ...updates,
          cameraIds: updates.cameraIds ? Array.from(new Set(updates.cameraIds)) : p.cameraIds,
          updatedAt: new Date().toISOString(),
        };
      });
      saveStoredCameraPresets(next);
    },
    [presets]
  );

  const deletePreset = useCallback(
    (id: string) => {
      const next = presets.filter((p) => p.id !== id);
      saveStoredCameraPresets(next);
    },
    [presets]
  );

  const toggleCameraInPreset = useCallback(
    (presetId: string, cameraId: string) => {
      const target = presets.find((p) => p.id === presetId);
      if (!target) return;
      const set = new Set(target.cameraIds);
      if (set.has(cameraId)) {
        set.delete(cameraId);
      } else {
        set.add(cameraId);
      }
      updatePreset(presetId, { cameraIds: Array.from(set) });
    },
    [presets, updatePreset]
  );

  return {
    presets,
    createPreset,
    updatePreset,
    deletePreset,
    toggleCameraInPreset,
  };
}
