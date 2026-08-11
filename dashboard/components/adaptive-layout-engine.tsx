"use client";

import { useEffect, useState, useCallback } from "react";
import type { Camera } from "@/lib/types";

export interface AdaptiveLayoutConfig {
  enabled: boolean;
  priorityRules: PriorityRule[];
  rebalanceInterval: number; // seconds
  alarmResponseMode: "expand" | "replace" | "highlight";
  maxPrioritySlots: number;
}

export interface PriorityRule {
  id: string;
  name: string;
  condition: "status" | "alert" | "motion" | "analytics" | "location";
  value: string;
  priority: number; // 1-10, higher = more important
  enabled: boolean;
}

export interface CameraPriority {
  cameraId: string;
  priority: number;
  reason: string;
  timestamp: number;
}

export interface AdaptiveLayoutEngineProps {
  cameras: Camera[];
  config: AdaptiveLayoutConfig;
  onLayoutUpdate: (prioritizedCameras: CameraPriority[]) => void;
}

export function useAdaptiveLayoutEngine({
  cameras,
  config,
  onLayoutUpdate,
}: AdaptiveLayoutEngineProps) {
  const [priorities, setPriorities] = useState<Map<string, CameraPriority>>(
    new Map()
  );
  const [activeAlerts, setActiveAlerts] = useState<Set<string>>(new Set());

  // Calculate camera priority based on rules
  const calculatePriority = useCallback(
    (camera: Camera): CameraPriority => {
      let totalPriority = 0;
      const reasons: string[] = [];

      if (!config.enabled) {
        return {
          cameraId: camera.id,
          priority: 0,
          reason: "Adaptive layout disabled",
          timestamp: Date.now(),
        };
      }

      // Apply priority rules
      config.priorityRules
        .filter((rule) => rule.enabled)
        .forEach((rule) => {
          let matches = false;

          switch (rule.condition) {
            case "status":
              if (camera.status === rule.value) {
                matches = true;
                reasons.push(`Status: ${rule.value}`);
              }
              break;

            case "alert":
              if (activeAlerts.has(camera.id)) {
                matches = true;
                reasons.push("Active alert");
              }
              break;

            case "motion":
              // Check if camera has motion detection
              if (
                Array.isArray(camera.capabilities?.analytics) &&
                camera.capabilities.analytics.includes("motion")
              ) {
                matches = true;
                reasons.push("Motion detected");
              }
              break;

            case "analytics":
              // Check if specific analytic is running
              if (
                rule.value &&
                Array.isArray(camera.capabilities?.analytics) &&
                camera.capabilities.analytics.includes(rule.value)
              ) {
                matches = true;
                reasons.push(`Analytics: ${rule.value}`);
              }
              break;

            case "location":
              if (camera.branchName === rule.value) {
                matches = true;
                reasons.push(`Location: ${rule.value}`);
              }
              break;
          }

          if (matches) {
            totalPriority += rule.priority;
          }
        });

      // Boost priority for offline cameras (needs attention)
      if (camera.status === "offline") {
        totalPriority += 8;
        reasons.push("Camera offline");
      }

      // Boost priority for cameras with alerts
      if (camera.status === "alert") {
        totalPriority += 10;
        reasons.push("Alert status");
      }

      return {
        cameraId: camera.id,
        priority: totalPriority,
        reason: reasons.join(", ") || "Normal",
        timestamp: Date.now(),
      };
    },
    [config, activeAlerts]
  );

  // Recalculate priorities for all cameras
  const recalculatePriorities = useCallback(() => {
    const newPriorities = new Map<string, CameraPriority>();

    cameras.forEach((camera) => {
      const priority = calculatePriority(camera);
      newPriorities.set(camera.id, priority);
    });

    setPriorities(newPriorities);

    // Sort by priority and return top cameras
    const sortedPriorities = Array.from(newPriorities.values())
      .sort((a, b) => b.priority - a.priority)
      .slice(0, config.maxPrioritySlots || 36);

    onLayoutUpdate(sortedPriorities);
  }, [cameras, calculatePriority, config.maxPrioritySlots, onLayoutUpdate]);

  // Fetch active alerts from the backend
  const fetchActiveAlerts = useCallback(async () => {
    try {
      const response = await fetch("/api/incidents?status=OPEN&limit=100", {
        credentials: "include",
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data?.incidents) {
          const alertCameraIds = new Set<string>(
            result.data.incidents
              .filter((inc: any) => inc.camera?.id)
              .map((inc: any) => inc.camera.id)
          );
          setActiveAlerts(alertCameraIds);
        }
      }
    } catch (error) {
      console.error("Failed to fetch active alerts:", error);
    }
  }, []);

  // Periodic rebalancing
  useEffect(() => {
    if (!config.enabled) return;

    recalculatePriorities();
    fetchActiveAlerts();

    const interval = setInterval(() => {
      fetchActiveAlerts();
      recalculatePriorities();
    }, (config.rebalanceInterval || 30) * 1000);

    return () => clearInterval(interval);
  }, [config, recalculatePriorities, fetchActiveAlerts]);

  // Manual trigger for immediate rebalance
  const triggerRebalance = useCallback(() => {
    fetchActiveAlerts();
    recalculatePriorities();
  }, [fetchActiveAlerts, recalculatePriorities]);

  return {
    priorities,
    activeAlerts,
    triggerRebalance,
  };
}

// Adaptive Layout Settings Component
export function AdaptiveLayoutSettings({
  config,
  onConfigChange,
}: {
  config: AdaptiveLayoutConfig;
  onConfigChange: (config: AdaptiveLayoutConfig) => void;
}) {
  const [localConfig, setLocalConfig] = useState(config);

  const addRule = () => {
    const newRule: PriorityRule = {
      id: `rule-${Date.now()}`,
      name: "New Rule",
      condition: "status",
      value: "online",
      priority: 5,
      enabled: true,
    };

    setLocalConfig({
      ...localConfig,
      priorityRules: [...localConfig.priorityRules, newRule],
    });
  };

  const updateRule = (id: string, updates: Partial<PriorityRule>) => {
    setLocalConfig({
      ...localConfig,
      priorityRules: localConfig.priorityRules.map((rule) =>
        rule.id === id ? { ...rule, ...updates } : rule
      ),
    });
  };

  const removeRule = (id: string) => {
    setLocalConfig({
      ...localConfig,
      priorityRules: localConfig.priorityRules.filter((rule) => rule.id !== id),
    });
  };

  const saveConfig = () => {
    onConfigChange(localConfig);
  };

  return (
    <div className="adaptive-layout-settings">
      <div className="settings-header">
        <h3>Adaptive Layout Configuration</h3>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={localConfig.enabled}
            onChange={(e) =>
              setLocalConfig({ ...localConfig, enabled: e.target.checked })
            }
          />
          <span>Enabled</span>
        </label>
      </div>

      <div className="settings-section">
        <label>
          Rebalance Interval (seconds)
          <input
            type="number"
            value={localConfig.rebalanceInterval}
            onChange={(e) =>
              setLocalConfig({
                ...localConfig,
                rebalanceInterval: parseInt(e.target.value),
              })
            }
            min={5}
            max={300}
          />
        </label>

        <label>
          Max Priority Slots
          <input
            type="number"
            value={localConfig.maxPrioritySlots}
            onChange={(e) =>
              setLocalConfig({
                ...localConfig,
                maxPrioritySlots: parseInt(e.target.value),
              })
            }
            min={1}
            max={144}
          />
        </label>

        <label>
          Alarm Response Mode
          <select
            value={localConfig.alarmResponseMode}
            onChange={(e) =>
              setLocalConfig({
                ...localConfig,
                alarmResponseMode: e.target.value as any,
              })
            }
          >
            <option value="expand">Expand - Show alarm camera larger</option>
            <option value="replace">Replace - Swap with low priority camera</option>
            <option value="highlight">Highlight - Keep position, add border</option>
          </select>
        </label>
      </div>

      <div className="priority-rules-section">
        <div className="section-header">
          <h4>Priority Rules</h4>
          <button className="btn-add" onClick={addRule}>
            + Add Rule
          </button>
        </div>

        <div className="rules-list">
          {localConfig.priorityRules.map((rule) => (
            <div key={rule.id} className="rule-item">
              <input
                type="checkbox"
                checked={rule.enabled}
                onChange={(e) =>
                  updateRule(rule.id, { enabled: e.target.checked })
                }
              />

              <input
                type="text"
                value={rule.name}
                onChange={(e) => updateRule(rule.id, { name: e.target.value })}
                placeholder="Rule name"
              />

              <select
                value={rule.condition}
                onChange={(e) =>
                  updateRule(rule.id, { condition: e.target.value as any })
                }
              >
                <option value="status">Status</option>
                <option value="alert">Alert</option>
                <option value="motion">Motion</option>
                <option value="analytics">Analytics</option>
                <option value="location">Location</option>
              </select>

              <input
                type="text"
                value={rule.value}
                onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                placeholder="Value"
              />

              <input
                type="number"
                value={rule.priority}
                onChange={(e) =>
                  updateRule(rule.id, { priority: parseInt(e.target.value) })
                }
                min={1}
                max={10}
              />

              <button
                className="btn-remove"
                onClick={() => removeRule(rule.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="settings-actions">
        <button className="btn-save" onClick={saveConfig}>
          Save Configuration
        </button>
      </div>

      <style jsx>{`
        .adaptive-layout-settings {
          padding: 24px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .settings-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .settings-header h3 {
          margin: 0;
          font-size: 20px;
          font-weight: 600;
        }

        .toggle-switch {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }

        .toggle-switch input[type="checkbox"] {
          width: 20px;
          height: 20px;
        }

        .settings-section {
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin-bottom: 24px;
        }

        .settings-section label {
          display: flex;
          flex-direction: column;
          gap: 8px;
          font-size: 14px;
          font-weight: 500;
        }

        .settings-section input,
        .settings-section select {
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
        }

        .priority-rules-section {
          margin-bottom: 24px;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .section-header h4 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
        }

        .btn-add {
          padding: 6px 12px;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
        }

        .btn-add:hover {
          background: #2563eb;
        }

        .rules-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .rule-item {
          display: grid;
          grid-template-columns: auto 1fr 1fr 1fr auto auto;
          gap: 12px;
          align-items: center;
          padding: 12px;
          background: #f9fafb;
          border-radius: 8px;
        }

        .rule-item input[type="checkbox"] {
          width: 20px;
          height: 20px;
        }

        .rule-item input[type="text"],
        .rule-item input[type="number"],
        .rule-item select {
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
        }

        .btn-remove {
          padding: 4px 10px;
          background: #ef4444;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 18px;
          line-height: 1;
        }

        .btn-remove:hover {
          background: #dc2626;
        }

        .settings-actions {
          display: flex;
          justify-content: flex-end;
        }

        .btn-save {
          padding: 10px 24px;
          background: #10b981;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 15px;
          font-weight: 600;
        }

        .btn-save:hover {
          background: #059669;
        }
      `}</style>
    </div>
  );
}
