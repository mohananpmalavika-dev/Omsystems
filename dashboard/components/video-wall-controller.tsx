"use client";

import { useState, useEffect } from "react";
import {
  Monitor,
  Plus,
  Settings,
  Trash2,
  Grid3X3,
  Maximize2,
  Eye,
  AlertCircle,
  Check,
  X,
} from "lucide-react";
import type { Camera } from "@/lib/types";

export interface VideoWallDisplay {
  id: string;
  name: string;
  position: { x: number; y: number };
  resolution: { width: number; height: number };
  gridLayout: string;
  cameraAssignments: Array<{
    position: number;
    cameraId: string;
  }>;
  isPrimary: boolean;
  connected: boolean;
}

export interface VideoWallConfig {
  id?: string;
  name: string;
  displays: VideoWallDisplay[];
  syncEnabled: boolean;
  rotationInterval?: number; // seconds
  rotationEnabled: boolean;
}

export interface VideoWallControllerProps {
  cameras: Camera[];
  onConfigSave?: (config: VideoWallConfig) => void;
}

export function VideoWallController({
  cameras,
  onConfigSave,
}: VideoWallControllerProps) {
  const [configs, setConfigs] = useState<VideoWallConfig[]>([]);
  const [activeConfig, setActiveConfig] = useState<VideoWallConfig | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [showDisplayConfig, setShowDisplayConfig] = useState(false);
  const [detectedDisplays, setDetectedDisplays] = useState<VideoWallDisplay[]>([]);

  useEffect(() => {
    detectDisplays();
    loadConfigs();
  }, []);

  const detectDisplays = () => {
    // Detect connected displays using Screen API
    if (typeof window !== "undefined" && window.screen) {
      const displays: VideoWallDisplay[] = [];
      
      // Primary display
      displays.push({
        id: "display-0",
        name: "Primary Display",
        position: { x: 0, y: 0 },
        resolution: {
          width: window.screen.width,
          height: window.screen.height,
        },
        gridLayout: "3x3",
        cameraAssignments: [],
        isPrimary: true,
        connected: true,
      });

      // Check for additional displays (experimental)
      if ("getScreenDetails" in window) {
        // @ts-ignore - Experimental API
        window.getScreenDetails?.().then((screenDetails: any) => {
          screenDetails.screens.forEach((screen: any, index: number) => {
            if (index > 0) {
              displays.push({
                id: `display-${index}`,
                name: `Display ${index + 1}`,
                position: { x: screen.left, y: screen.top },
                resolution: { width: screen.width, height: screen.height },
                gridLayout: "3x3",
                cameraAssignments: [],
                isPrimary: false,
                connected: true,
              });
            }
          });
          setDetectedDisplays(displays);
        });
      } else {
        setDetectedDisplays(displays);
      }
    }
  };

  const loadConfigs = async () => {
    try {
      const response = await fetch("/api/control/v1/video-wall/configs", {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setConfigs(data);
        if (data.length > 0) {
          setActiveConfig(data[0]);
        }
      }
    } catch (error) {
      console.error("Failed to load video wall configs:", error);
    }
  };

  const saveConfig = async (config: VideoWallConfig) => {
    try {
      const response = await fetch("/api/control/v1/video-wall/configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(config),
      });

      if (response.ok) {
        const savedConfig = await response.json();
        setConfigs((prev) => [...prev, savedConfig]);
        setActiveConfig(savedConfig);
        onConfigSave?.(savedConfig);
        setEditMode(false);
      }
    } catch (error) {
      console.error("Failed to save video wall config:", error);
    }
  };

  const deleteConfig = async (configId: string) => {
    if (!confirm("Delete this video wall configuration?")) return;

    try {
      const response = await fetch(
        `/api/control/v1/video-wall/configs?id=${configId}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      if (response.ok) {
        setConfigs((prev) => prev.filter((c) => c.id !== configId));
        if (activeConfig?.id === configId) {
          setActiveConfig(configs.length > 1 ? configs[0] : null);
        }
      }
    } catch (error) {
      console.error("Failed to delete video wall config:", error);
    }
  };

  const createNewConfig = () => {
    const newConfig: VideoWallConfig = {
      name: "New Video Wall",
      displays: detectedDisplays,
      syncEnabled: true,
      rotationEnabled: false,
      rotationInterval: 60,
    };
    setActiveConfig(newConfig);
    setEditMode(true);
  };

  const updateDisplay = (displayId: string, updates: Partial<VideoWallDisplay>) => {
    if (!activeConfig) return;

    const updatedDisplays = activeConfig.displays.map((d) =>
      d.id === displayId ? { ...d, ...updates } : d
    );

    setActiveConfig({
      ...activeConfig,
      displays: updatedDisplays,
    });
  };

  const assignCameraToDisplay = (
    displayId: string,
    position: number,
    cameraId: string | null
  ) => {
    if (!activeConfig) return;

    const updatedDisplays = activeConfig.displays.map((d) => {
      if (d.id === displayId) {
        const assignments = d.cameraAssignments.filter(
          (a) => a.position !== position
        );
        if (cameraId) {
          assignments.push({ position, cameraId });
        }
        return { ...d, cameraAssignments: assignments };
      }
      return d;
    });

    setActiveConfig({
      ...activeConfig,
      displays: updatedDisplays,
    });
  };

  return (
    <div className="video-wall-controller">
      <div className="controller-header">
        <div className="header-title">
          <Monitor size={28} />
          <div>
            <h2>Video Wall Controller</h2>
            <p>Manage multi-monitor display configurations</p>
          </div>
        </div>

        <div className="header-actions">
          <button className="btn-secondary" onClick={detectDisplays}>
            <Eye size={16} />
            Detect Displays
          </button>
          <button className="btn-primary" onClick={createNewConfig}>
            <Plus size={16} />
            New Configuration
          </button>
        </div>
      </div>

      <div className="controller-body">
        <div className="config-sidebar">
          <h3>Configurations</h3>
          <div className="config-list">
            {configs.map((config) => (
              <div
                key={config.id}
                className={`config-item ${
                  activeConfig?.id === config.id ? "active" : ""
                }`}
                onClick={() => setActiveConfig(config)}
              >
                <div className="config-info">
                  <strong>{config.name}</strong>
                  <span>
                    {config.displays.length} display
                    {config.displays.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="config-actions">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditMode(true);
                    }}
                  >
                    <Settings size={14} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConfig(config.id!);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="config-workspace">
          {activeConfig ? (
            <>
              <div className="workspace-header">
                <input
                  type="text"
                  value={activeConfig.name}
                  onChange={(e) =>
                    setActiveConfig({ ...activeConfig, name: e.target.value })
                  }
                  disabled={!editMode}
                  className="config-name-input"
                />

                <div className="sync-controls">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={activeConfig.syncEnabled}
                      onChange={(e) =>
                        setActiveConfig({
                          ...activeConfig,
                          syncEnabled: e.target.checked,
                        })
                      }
                      disabled={!editMode}
                    />
                    Sync All Displays
                  </label>

                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={activeConfig.rotationEnabled}
                      onChange={(e) =>
                        setActiveConfig({
                          ...activeConfig,
                          rotationEnabled: e.target.checked,
                        })
                      }
                      disabled={!editMode}
                    />
                    Auto Rotation
                  </label>

                  {activeConfig.rotationEnabled && (
                    <input
                      type="number"
                      value={activeConfig.rotationInterval}
                      onChange={(e) =>
                        setActiveConfig({
                          ...activeConfig,
                          rotationInterval: parseInt(e.target.value),
                        })
                      }
                      disabled={!editMode}
                      min={10}
                      max={3600}
                      className="rotation-input"
                      placeholder="Seconds"
                    />
                  )}
                </div>

                {editMode && (
                  <div className="edit-actions">
                    <button
                      className="btn-success"
                      onClick={() => saveConfig(activeConfig)}
                    >
                      <Check size={16} />
                      Save
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() => setEditMode(false)}
                    >
                      <X size={16} />
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              <div className="displays-grid">
                {activeConfig.displays.map((display) => (
                  <div key={display.id} className="display-card">
                    <div className="display-header">
                      <div className="display-info">
                        <Monitor size={20} />
                        <div>
                          <strong>{display.name}</strong>
                          <span className="display-status">
                            {display.connected ? (
                              <><Check size={12} /> Connected</>
                            ) : (
                              <><AlertCircle size={12} /> Disconnected</>
                            )}
                          </span>
                        </div>
                      </div>
                      {display.isPrimary && (
                        <span className="primary-badge">Primary</span>
                      )}
                    </div>

                    <div className="display-specs">
                      <span>
                        {display.resolution.width} × {display.resolution.height}
                      </span>
                      <select
                        value={display.gridLayout}
                        onChange={(e) =>
                          updateDisplay(display.id, {
                            gridLayout: e.target.value,
                          })
                        }
                        disabled={!editMode}
                        className="grid-select"
                      >
                        <option value="2x2">2×2 (4 cameras)</option>
                        <option value="3x3">3×3 (9 cameras)</option>
                        <option value="4x4">4×4 (16 cameras)</option>
                        <option value="5x5">5×5 (25 cameras)</option>
                        <option value="6x6">6×6 (36 cameras)</option>
                      </select>
                    </div>

                    <div className="display-preview">
                      <Grid3X3 size={48} className="preview-icon" />
                      <span>
                        {display.cameraAssignments.length} cameras assigned
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state">
              <Monitor size={64} className="empty-icon" />
              <h3>No Configuration Selected</h3>
              <p>Create a new video wall configuration to get started</p>
              <button className="btn-primary" onClick={createNewConfig}>
                <Plus size={18} />
                Create Configuration
              </button>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .video-wall-controller {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #f9fafb;
        }

        .controller-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 24px 32px;
          background: white;
          border-bottom: 1px solid #e5e7eb;
        }

        .header-title {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .header-title h2 {
          margin: 0;
          font-size: 24px;
          font-weight: 700;
        }

        .header-title p {
          margin: 4px 0 0 0;
          font-size: 14px;
          color: #6b7280;
        }

        .header-actions {
          display: flex;
          gap: 12px;
        }

        .controller-body {
          display: flex;
          flex: 1;
          overflow: hidden;
        }

        .config-sidebar {
          width: 280px;
          background: white;
          border-right: 1px solid #e5e7eb;
          padding: 20px;
          overflow-y: auto;
        }

        .config-sidebar h3 {
          margin: 0 0 16px 0;
          font-size: 16px;
          font-weight: 600;
        }

        .config-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .config-item {
          padding: 12px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: all 0.2s;
        }

        .config-item:hover {
          background: #f9fafb;
          border-color: #3b82f6;
        }

        .config-item.active {
          background: #eff6ff;
          border-color: #3b82f6;
        }

        .config-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .config-info strong {
          font-size: 14px;
        }

        .config-info span {
          font-size: 12px;
          color: #6b7280;
        }

        .config-actions {
          display: flex;
          gap: 4px;
        }

        .config-actions button {
          padding: 6px;
          border: none;
          background: transparent;
          cursor: pointer;
          border-radius: 4px;
          color: #6b7280;
          transition: all 0.2s;
        }

        .config-actions button:hover {
          background: #f3f4f6;
          color: #111827;
        }

        .config-workspace {
          flex: 1;
          padding: 24px;
          overflow-y: auto;
        }

        .workspace-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
          gap: 16px;
          flex-wrap: wrap;
        }

        .config-name-input {
          font-size: 20px;
          font-weight: 600;
          padding: 8px 12px;
          border: 2px solid #e5e7eb;
          border-radius: 6px;
          flex: 1;
          min-width: 200px;
        }

        .config-name-input:disabled {
          background: transparent;
          border-color: transparent;
        }

        .sync-controls {
          display: flex;
          gap: 16px;
          align-items: center;
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          cursor: pointer;
        }

        .checkbox-label input[type="checkbox"] {
          width: 18px;
          height: 18px;
          cursor: pointer;
        }

        .rotation-input {
          width: 80px;
          padding: 6px 10px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
        }

        .edit-actions {
          display: flex;
          gap: 8px;
        }

        .btn-primary,
        .btn-secondary,
        .btn-success {
          padding: 8px 16px;
          border-radius: 6px;
          border: 1px solid;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
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

        .btn-success {
          background: #10b981;
          color: white;
          border-color: #10b981;
        }

        .btn-success:hover {
          background: #059669;
        }

        .displays-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 20px;
        }

        .display-card {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 20px;
          transition: all 0.2s;
        }

        .display-card:hover {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          transform: translateY(-2px);
        }

        .display-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .display-info {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .display-info strong {
          font-size: 16px;
        }

        .display-status {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: #10b981;
          margin-top: 4px;
        }

        .primary-badge {
          padding: 4px 12px;
          background: #dbeafe;
          color: #1e40af;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 600;
        }

        .display-specs {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px;
          background: #f9fafb;
          border-radius: 8px;
          margin-bottom: 16px;
        }

        .display-specs span {
          font-size: 13px;
          color: #6b7280;
        }

        .grid-select {
          padding: 6px 10px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 13px;
          cursor: pointer;
        }

        .display-preview {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 24px;
          border: 2px dashed #d1d5db;
          border-radius: 8px;
          gap: 12px;
        }

        .preview-icon {
          color: #9ca3af;
        }

        .display-preview span {
          font-size: 14px;
          color: #6b7280;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          gap: 16px;
        }

        .empty-icon {
          color: #d1d5db;
        }

        .empty-state h3 {
          margin: 0;
          font-size: 20px;
          color: #374151;
        }

        .empty-state p {
          margin: 0;
          font-size: 14px;
          color: #6b7280;
        }
      `}</style>
    </div>
  );
}
