"use client";

import React, { useState } from "react";
import {
  FolderPlus,
  X,
  Trash2,
  Check,
  Search,
  CheckSquare,
  Square,
  Sliders,
  Sparkles,
  Layers,
} from "lucide-react";
import type { Camera } from "@/lib/types";
import {
  useCameraPresets,
  CameraPresetGroup,
} from "@/lib/camera-operator-flags";

interface CameraPresetManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  cameras: Camera[];
  currentGridSize?: string;
  onSelectPreset: (presetId: string) => void;
  activePresetId?: string;
}

export function CameraPresetManagerModal({
  isOpen,
  onClose,
  cameras,
  currentGridSize = "2x2",
  onSelectPreset,
  activePresetId,
}: CameraPresetManagerModalProps) {
  const { presets, createPreset, deletePreset } = useCameraPresets();
  const [tab, setTab] = useState<"list" | "create">("list");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [gridSize, setGridSize] = useState(currentGridSize);
  const [selectedCameraIds, setSelectedCameraIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  if (!isOpen) return null;

  const filteredCameras = cameras.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.branchName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleCameraSelection = (cameraId: string) => {
    setSelectedCameraIds((prev) => {
      const next = new Set(prev);
      if (next.has(cameraId)) next.delete(cameraId);
      else next.add(cameraId);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedCameraIds(new Set(cameras.map((c) => c.id)));
  };

  const clearAll = () => {
    setSelectedCameraIds(new Set());
  };

  const handleCreate = () => {
    if (!name.trim()) {
      setErrorMsg("Please enter a preset name (e.g., 'Main Gates').");
      return;
    }
    setErrorMsg("");
    const newPreset = createPreset(
      name,
      Array.from(selectedCameraIds),
      description,
      gridSize
    );
    setName("");
    setDescription("");
    setSelectedCameraIds(new Set());
    setTab("list");
    onSelectPreset(newPreset.id);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl bg-zinc-900 border border-zinc-700/80 shadow-2xl p-5 text-zinc-100 flex flex-col gap-4 overflow-hidden relative max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400">
              <Layers size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
                Custom Camera Groups & Presets
              </h3>
              <p className="text-xs text-zinc-400">
                Organize cameras into custom views (e.g. Main Gates, Warehouse All, Night Patrol)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-2 p-1 bg-zinc-950/60 rounded-xl border border-zinc-800">
          <button
            type="button"
            onClick={() => setTab("list")}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              tab === "list"
                ? "bg-zinc-800 text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Saved Presets ({presets.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("create");
              if (selectedCameraIds.size === 0) {
                // Pre-populate with currently available cameras if none selected
                setSelectedCameraIds(new Set(cameras.slice(0, 4).map((c) => c.id)));
              }
            }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
              tab === "create"
                ? "bg-sky-600 text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <FolderPlus size={14} /> + New Preset Group
          </button>
        </div>

        {/* Tab 1: Saved Presets List */}
        {tab === "list" && (
          <div className="flex flex-col gap-2.5 overflow-y-auto max-h-[50vh] pr-1">
            {presets.length === 0 ? (
              <div className="text-center py-8 text-xs text-zinc-500">
                No custom presets saved yet. Click "+ New Preset Group" to create one.
              </div>
            ) : (
              presets.map((preset) => {
                const isActive = activePresetId === preset.id;
                return (
                  <div
                    key={preset.id}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                      isActive
                        ? "bg-sky-950/40 border-sky-500/80 shadow-[0_0_12px_rgba(14,165,233,0.15)]"
                        : "bg-zinc-950/50 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-850"
                    }`}
                  >
                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white truncate">
                          {preset.name}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-300 border border-zinc-700">
                          {preset.gridSize || "2x2"}
                        </span>
                        <span className="text-[11px] text-sky-400 font-medium">
                          {preset.cameraIds.length} cameras
                        </span>
                      </div>
                      {preset.description && (
                        <p className="text-[11px] text-zinc-400 truncate">
                          {preset.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectPreset(preset.id);
                          onClose();
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                          isActive
                            ? "bg-sky-600 text-white"
                            : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
                        }`}
                      >
                        {isActive ? "Viewing" : "Load View"}
                      </button>
                      <button
                        type="button"
                        onClick={() => deletePreset(preset.id)}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800/80 transition-colors"
                        title="Delete preset"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Tab 2: Create New Preset Form */}
        {tab === "create" && (
          <div className="flex flex-col gap-3 overflow-y-auto max-h-[55vh] pr-1">
            {errorMsg && (
              <div className="p-2 rounded-lg bg-red-950/80 border border-red-500/80 text-xs text-red-200">
                {errorMsg}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                  Preset Group Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Main Gates, Warehouse All"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (errorMsg) setErrorMsg("");
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950/80 border border-zinc-700 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                  Default Grid Layout
                </label>
                <select
                  value={gridSize}
                  onChange={(e) => setGridSize(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950/80 border border-zinc-700 text-xs text-zinc-100 focus:outline-none focus:border-sky-500"
                >
                  <option value="1x1">1×1 Single</option>
                  <option value="2x2">2×2 Quad</option>
                  <option value="3x3">3×3 9-Cam</option>
                  <option value="4x4">4×4 16-Cam</option>
                  <option value="1+5">1+5 Hero</option>
                  <option value="1+7">1+7 Hero</option>
                  <option value="6x6">6×6 36-Cam</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                Description (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Perimeter entry, cash counter and night patrol"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl bg-zinc-950/80 border border-zinc-700 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-sky-500"
              />
            </div>

            {/* Cameras selection */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                  Select Cameras ({selectedCameraIds.size} of {cameras.length} selected)
                </label>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-sky-400 hover:text-sky-300 cursor-pointer"
                  >
                    Select all
                  </button>
                  <span className="text-zinc-600">·</span>
                  <button
                    type="button"
                    onClick={clearAll}
                    className="text-zinc-400 hover:text-zinc-200 cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Search input */}
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search cameras by name or branch..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-sky-500"
                />
              </div>

              {/* Camera items list */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto p-1 bg-zinc-950/50 rounded-xl border border-zinc-800">
                {filteredCameras.map((camera) => {
                  const isChecked = selectedCameraIds.has(camera.id);
                  return (
                    <button
                      key={camera.id}
                      type="button"
                      onClick={() => toggleCameraSelection(camera.id)}
                      className={`flex items-center gap-2 p-2 rounded-lg border text-left text-xs transition-colors cursor-pointer ${
                        isChecked
                          ? "bg-sky-950/60 border-sky-500/70 text-sky-200"
                          : "bg-zinc-900/60 border-zinc-800/80 text-zinc-300 hover:bg-zinc-800"
                      }`}
                    >
                      {isChecked ? (
                        <CheckSquare size={14} className="text-sky-400 shrink-0" />
                      ) : (
                        <Square size={14} className="text-zinc-600 shrink-0" />
                      )}
                      <div className="truncate min-w-0">
                        <span className="font-semibold block truncate">
                          {camera.name}
                        </span>
                        <span className="text-[10px] text-zinc-500 block truncate">
                          {camera.branchName || "Main"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setTab("list")}
                className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                className="px-4 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white shadow-lg cursor-pointer"
              >
                Save Preset Group
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-zinc-800 text-xs text-zinc-500">
          <span>Custom views are saved to this workstation</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
