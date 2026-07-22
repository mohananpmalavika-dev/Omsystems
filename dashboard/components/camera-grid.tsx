"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Grid2X2,
  Grid3X3,
  Maximize,
  Save,
  Settings,
  Square,
  Layout,
  Plus,
} from "lucide-react";
import { CameraTile } from "./camera-tile";
import type { Camera, LiveSessionResponse, RecordingJob, RecordingMode } from "@/lib/types";

export type GridSize = "1x1" | "2x2" | "3x3" | "4x4" | "5x5" | "6x6";

export interface GridLayout {
  id?: string;
  name: string;
  gridSize: GridSize;
  positions: Array<{
    position: number;
    cameraId: string;
    stream: "main" | "sub";
  }>;
}

export interface CameraGridProps {
  cameras: Camera[];
  onLayoutChange?: (layout: GridLayout) => void;
  initialLayout?: GridLayout;
}

export function CameraGrid({
  cameras,
  onLayoutChange,
  initialLayout,
}: CameraGridProps) {
  const [gridSize, setGridSize] = useState<GridSize>(
    initialLayout?.gridSize || "2x2"
  );
  const [gridPositions, setGridPositions] = useState<
    Map<number, { camera: Camera; stream: "main" | "sub" }>
  >(new Map());
  const [sessions, setSessions] = useState<Map<string, LiveSessionResponse>>(
    new Map()
  );
  const [recordings, setRecordings] = useState<Map<string, RecordingJob>>(
    new Map()
  );
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const [layoutName, setLayoutName] = useState(initialLayout?.name || "");
  const [savedLayouts, setSavedLayouts] = useState<GridLayout[]>([]);

  const gridSizeMap = {
    "1x1": 1,
    "2x2": 4,
    "3x3": 9,
    "4x4": 16,
    "5x5": 25,
    "6x6": 36,
  };

  const totalPositions = gridSizeMap[gridSize];

  // Load saved layouts
  useEffect(() => {
    loadSavedLayouts();
  }, []);

  // Initialize from saved layout
  useEffect(() => {
    if (initialLayout) {
      const posMap = new Map();
      initialLayout.positions.forEach((pos) => {
        const camera = cameras.find((c) => c.id === pos.cameraId);
        if (camera) {
          posMap.set(pos.position, { camera, stream: pos.stream });
        }
      });
      setGridPositions(posMap);
    }
  }, [initialLayout, cameras]);

  const loadSavedLayouts = async () => {
    try {
      const response = await fetch("/api/control/v1/grids/layouts", {
        credentials: "include",
      });
      if (response.ok) {
        const layouts = await response.json();
        setSavedLayouts(layouts);
      }
    } catch (error) {
      console.error("Failed to load layouts:", error);
    }
  };

  const handleGridSizeChange = (newSize: GridSize) => {
    const newTotalPositions = gridSizeMap[newSize];
    const currentPositions = new Map(gridPositions);

    // Remove positions that exceed new grid size
    for (const [position] of currentPositions) {
      if (position >= newTotalPositions) {
        currentPositions.delete(position);
      }
    }

    setGridSize(newSize);
    setGridPositions(currentPositions);
  };

  const handleCameraAssign = (position: number, camera: Camera | null) => {
    const newPositions = new Map(gridPositions);
    if (camera) {
      newPositions.set(position, { camera, stream: "main" });
    } else {
      newPositions.delete(position);
    }
    setGridPositions(newPositions);
  };

  const handleStreamToggle = (position: number) => {
    const entry = gridPositions.get(position);
    if (entry) {
      const newPositions = new Map(gridPositions);
      newPositions.set(position, {
        camera: entry.camera,
        stream: entry.stream === "main" ? "sub" : "main",
      });
      setGridPositions(newPositions);
    }
  };

  const handleStartLive = async (cameraId: string) => {
    setLoading((prev) => new Set(prev).add(cameraId));

    try {
      const response = await fetch("/api/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ cameraId }),
      });

      if (response.ok) {
        const session = await response.json();
        setSessions((prev) => new Map(prev).set(cameraId, session));
      } else {
        const error = await response.json();
        console.error("Failed to start live session:", error);
      }
    } catch (error) {
      console.error("Live session error:", error);
    } finally {
      setLoading((prev) => {
        const newSet = new Set(prev);
        newSet.delete(cameraId);
        return newSet;
      });
    }
  };

  const handleToggleRecording = async (cameraId: string) => {
    const currentJob = recordings.get(cameraId);
    const newEnabled = !currentJob?.enabled;

    try {
      const response = await fetch(`/api/recording/${cameraId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled: newEnabled }),
      });

      if (response.ok) {
        const job = await response.json();
        setRecordings((prev) => new Map(prev).set(cameraId, job));
      }
    } catch (error) {
      console.error("Recording toggle error:", error);
    }
  };

  const handleChangeRecordingMode = async (cameraId: string, mode: RecordingMode) => {
    try {
      const response = await fetch(`/api/recording/${cameraId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mode }),
      });

      if (response.ok) {
        const job = await response.json();
        setRecordings((prev) => new Map(prev).set(cameraId, job));
      }
    } catch (error) {
      console.error("Recording mode change error:", error);
    }
  };

  const handleSaveLayout = useCallback(async () => {
    if (!layoutName.trim()) {
      alert("Please enter a layout name");
      return;
    }

    const layout: GridLayout = {
      name: layoutName,
      gridSize,
      positions: Array.from(gridPositions.entries()).map(
        ([position, { camera, stream }]) => ({
          position,
          cameraId: camera.id,
          stream,
        })
      ),
    };

    try {
      const response = await fetch("/api/control/v1/grids/layouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: layout.name,
          gridSize: layout.gridSize,
          cameraPositions: layout.positions,
        }),
      });

      if (response.ok) {
        const savedLayout = await response.json();
        setSavedLayouts((prev) => [...prev, savedLayout]);
        setShowLayoutMenu(false);
        setLayoutName("");
        onLayoutChange?.(layout);
      } else {
        const error = await response.json();
        alert(`Failed to save layout: ${error.error}`);
      }
    } catch (error) {
      console.error("Failed to save layout:", error);
      alert("Failed to save layout");
    }
  }, [layoutName, gridSize, gridPositions, onLayoutChange]);

  const handleLoadLayout = (layout: GridLayout) => {
    setGridSize(layout.gridSize);
    setLayoutName(layout.name);

    const posMap = new Map();
    layout.positions.forEach((pos) => {
      const camera = cameras.find((c) => c.id === pos.cameraId);
      if (camera) {
        posMap.set(pos.position, { camera, stream: pos.stream });
      }
    });
    setGridPositions(posMap);
  };

  const gridColumns = {
    "1x1": "grid-cols-1",
    "2x2": "grid-cols-2",
    "3x3": "grid-cols-3",
    "4x4": "grid-cols-4",
    "5x5": "grid-cols-5",
    "6x6": "grid-cols-6",
  };

  return (
    <div className="camera-grid-container">
      <div className="grid-toolbar">
        <div className="grid-size-selector">
          <button
            className={gridSize === "1x1" ? "active" : ""}
            onClick={() => handleGridSizeChange("1x1")}
            title="1 camera"
          >
            <Square size={18} />
          </button>
          <button
            className={gridSize === "2x2" ? "active" : ""}
            onClick={() => handleGridSizeChange("2x2")}
            title="4 cameras (2×2)"
          >
            <Grid2X2 size={18} />
          </button>
          <button
            className={gridSize === "3x3" ? "active" : ""}
            onClick={() => handleGridSizeChange("3x3")}
            title="9 cameras (3×3)"
          >
            <Grid3X3 size={18} />
          </button>
          <button
            className={gridSize === "4x4" ? "active" : ""}
            onClick={() => handleGridSizeChange("4x4")}
            title="16 cameras (4×4)"
          >
            4×4
          </button>
          <button
            className={gridSize === "5x5" ? "active" : ""}
            onClick={() => handleGridSizeChange("5x5")}
            title="25 cameras (5×5)"
          >
            5×5
          </button>
          <button
            className={gridSize === "6x6" ? "active" : ""}
            onClick={() => handleGridSizeChange("6x6")}
            title="36 cameras (6×6)"
          >
            6×6
          </button>
        </div>

        <div className="grid-actions">
          {savedLayouts.length > 0 && (
            <div className="saved-layouts-dropdown">
              <button className="btn-secondary">
                <Layout size={16} />
                Load Layout ({savedLayouts.length})
              </button>
              <div className="dropdown-menu">
                {savedLayouts.map((layout) => (
                  <button
                    key={layout.id}
                    onClick={() => handleLoadLayout(layout)}
                    className="dropdown-item"
                  >
                    {layout.name} ({layout.gridSize})
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            className="btn-secondary"
            onClick={() => setShowLayoutMenu(!showLayoutMenu)}
          >
            <Save size={16} />
            Save Layout
          </button>
        </div>
      </div>

      {showLayoutMenu && (
        <div className="layout-save-panel">
          <input
            type="text"
            placeholder="Layout name (e.g., 'Main Entrance View')"
            value={layoutName}
            onChange={(e) => setLayoutName(e.target.value)}
            className="layout-name-input"
          />
          <button className="btn-primary" onClick={handleSaveLayout}>
            <Plus size={16} />
            Save
          </button>
          <button
            className="btn-secondary"
            onClick={() => setShowLayoutMenu(false)}
          >
            Cancel
          </button>
        </div>
      )}

      <div className={`camera-grid ${gridColumns[gridSize]}`}>
        {Array.from({ length: totalPositions }, (_, i) => {
          const entry = gridPositions.get(i);
          const camera = entry?.camera;

          if (!camera) {
            return (
              <div key={i} className="grid-empty-slot">
                <Settings size={24} className="opacity-30" />
                <select
                  className="camera-selector"
                  onChange={(e) => {
                    const selectedCamera = cameras.find(
                      (c) => c.id === e.target.value
                    );
                    handleCameraAssign(i, selectedCamera || null);
                  }}
                  value=""
                >
                  <option value="">Select camera...</option>
                  {cameras.map((cam) => (
                    <option key={cam.id} value={cam.id}>
                      {cam.name} - {cam.branchName}
                    </option>
                  ))}
                </select>
              </div>
            );
          }

          return (
            <div key={i} className="grid-camera-slot">
              <div className="slot-controls">
                <button
                  className="stream-toggle"
                  onClick={() => handleStreamToggle(i)}
                  title={`Switch to ${entry.stream === "main" ? "sub" : "main"} stream`}
                >
                  {entry.stream === "main" ? "MAIN" : "SUB"}
                </button>
                <button
                  className="remove-camera"
                  onClick={() => handleCameraAssign(i, null)}
                  title="Remove camera"
                >
                  ×
                </button>
              </div>
              <CameraTile
                camera={camera}
                session={sessions.get(camera.id)}
                loading={loading.has(camera.id)}
                onStart={() => handleStartLive(camera.id)}
                index={i}
                recording={recordings.get(camera.id)}
                onToggleRecording={() => handleToggleRecording(camera.id)}
                onChangeRecordingMode={(mode) => handleChangeRecordingMode(camera.id, mode)}
                onBookmark={async () => {
                  // Handle bookmark
                }}
                onCreateIncident={async () => {
                  // Handle incident creation
                }}
              />
            </div>
          );
        })}
      </div>

      <style jsx>{`
        .camera-grid-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
          height: 100%;
        }

        .grid-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          background: white;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .grid-size-selector {
          display: flex;
          gap: 8px;
        }

        .grid-size-selector button {
          padding: 8px 12px;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          background: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 13px;
          font-weight: 500;
          transition: all 0.2s;
        }

        .grid-size-selector button:hover {
          background: #f3f4f6;
          border-color: #3b82f6;
        }

        .grid-size-selector button.active {
          background: #3b82f6;
          color: white;
          border-color: #3b82f6;
        }

        .grid-actions {
          display: flex;
          gap: 8px;
        }

        .saved-layouts-dropdown {
          position: relative;
        }

        .saved-layouts-dropdown:hover .dropdown-menu {
          display: block;
        }

        .dropdown-menu {
          display: none;
          position: absolute;
          top: 100%;
          right: 0;
          margin-top: 4px;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          min-width: 200px;
          z-index: 100;
        }

        .dropdown-item {
          display: block;
          width: 100%;
          padding: 10px 16px;
          text-align: left;
          border: none;
          background: white;
          cursor: pointer;
          font-size: 14px;
          transition: background 0.2s;
        }

        .dropdown-item:hover {
          background: #f3f4f6;
        }

        .dropdown-item:first-child {
          border-radius: 6px 6px 0 0;
        }

        .dropdown-item:last-child {
          border-radius: 0 0 6px 6px;
        }

        .btn-primary,
        .btn-secondary {
          padding: 8px 16px;
          border-radius: 6px;
          border: 1px solid;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s;
        }

        .btn-primary {
          background: #3b82f6;
          color: white;
          border-color: #3b82f6;
        }

        .btn-primary:hover {
          background: #2563eb;
        }

        .btn-secondary {
          background: white;
          color: #374151;
          border-color: #d1d5db;
        }

        .btn-secondary:hover {
          background: #f3f4f6;
        }

        .layout-save-panel {
          display: flex;
          gap: 8px;
          padding: 16px;
          background: #f9fafb;
          border-radius: 8px;
          align-items: center;
        }

        .layout-name-input {
          flex: 1;
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
        }

        .camera-grid {
          display: grid;
          gap: 12px;
          flex: 1;
          overflow: auto;
          padding: 4px;
        }

        .grid-cols-1 {
          grid-template-columns: 1fr;
        }

        .grid-cols-2 {
          grid-template-columns: repeat(2, 1fr);
        }

        .grid-cols-3 {
          grid-template-columns: repeat(3, 1fr);
        }

        .grid-cols-4 {
          grid-template-columns: repeat(4, 1fr);
        }

        .grid-cols-5 {
          grid-template-columns: repeat(5, 1fr);
        }

        .grid-cols-6 {
          grid-template-columns: repeat(6, 1fr);
        }

        .grid-empty-slot {
          aspect-ratio: 16/9;
          border: 2px dashed #d1d5db;
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          background: #f9fafb;
          padding: 16px;
        }

        .camera-selector {
          width: 100%;
          max-width: 200px;
          padding: 8px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 13px;
          cursor: pointer;
        }

        .grid-camera-slot {
          position: relative;
          aspect-ratio: 16/9;
        }

        .slot-controls {
          position: absolute;
          top: 8px;
          right: 8px;
          z-index: 10;
          display: flex;
          gap: 4px;
        }

        .stream-toggle,
        .remove-camera {
          padding: 4px 8px;
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 4px;
          background: rgba(0, 0, 0, 0.6);
          color: white;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          backdrop-filter: blur(4px);
          transition: all 0.2s;
        }

        .stream-toggle:hover {
          background: rgba(0, 0, 0, 0.8);
        }

        .remove-camera {
          font-size: 18px;
          line-height: 1;
          padding: 2px 8px;
        }

        .remove-camera:hover {
          background: #ef4444;
          border-color: #ef4444;
        }

        .opacity-30 {
          opacity: 0.3;
        }
      `}</style>
    </div>
  );
}
