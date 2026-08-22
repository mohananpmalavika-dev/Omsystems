"use client";

import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CircleDot,
  Home,
  Lock,
  Maximize,
  Minimize,
  Play,
  RotateCcw,
  Square,
  Unlock,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

export interface PtzLock {
  id: string;
  cameraId: string;
  operatorId: string;
  operatorName: string;
  lockedAt: string;
  expiresAt: string;
  sessionId: string;
}

export interface PtzPreset {
  id: string;
  presetNumber: number;
  name: string;
  description?: string;
}

export interface PtzPatrol {
  id: string;
  patrolNumber: number;
  name: string;
  enabled: boolean;
}

export interface PtzControlProps {
  cameraId: string;
  sessionId: string;
  onClose: () => void;
}

export function PtzControl({ cameraId, sessionId, onClose }: PtzControlProps) {
  const [lock, setLock] = useState<PtzLock | null>(null);
  const [loading, setLoading] = useState(false);
  const [presets, setPresets] = useState<PtzPreset[]>([]);
  const [patrols, setPatrols] = useState<PtzPatrol[]>([]);
  const [speed, setSpeed] = useState(0.5);
  const [activeCommand, setActiveCommand] = useState<string | null>(null);

  const isLocked = Boolean(lock);
  const canControl = isLocked;

  // Load presets and patrols
  useEffect(() => {
    loadPresets();
    loadPatrols();
  }, [cameraId]);

  // Check lock status
  useEffect(() => {
    checkLockStatus();
    const interval = setInterval(checkLockStatus, 5000);
    return () => clearInterval(interval);
  }, [cameraId]);

  const checkLockStatus = async () => {
    try {
      const response = await fetch(`/api/control/v1/cameras/${cameraId}/ptz/lock`, {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setLock(data);
      } else if (response.status === 404) {
        setLock(null);
      }
    } catch (error) {
      console.error("Failed to check lock status:", error);
    }
  };

  const acquireLock = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/control/v1/cameras/${cameraId}/ptz/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sessionId, durationSeconds: 300 }),
      });

      if (response.ok) {
        const data = await response.json();
        setLock(data);
      } else if (response.status === 409) {
        const error = await response.json();
        alert(`Camera is locked by ${error.lockedBy}. Please wait.`);
      } else {
        const error = await response.json();
        alert(`Failed to acquire lock: ${error.error}`);
      }
    } catch (error) {
      alert("Failed to acquire PTZ lock");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const releaseLock = async () => {
    try {
      const response = await fetch(`/api/control/v1/cameras/${cameraId}/ptz/lock`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.ok) {
        setLock(null);
      }
    } catch (error) {
      console.error("Failed to release lock:", error);
    }
  };

  const loadPresets = async () => {
    try {
      const response = await fetch(`/api/control/v1/cameras/${cameraId}/ptz/presets`, {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setPresets(data);
      }
    } catch (error) {
      console.error("Failed to load presets:", error);
    }
  };

  const loadPatrols = async () => {
    try {
      const response = await fetch(`/api/control/v1/cameras/${cameraId}/ptz/patrols`, {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setPatrols(data);
      }
    } catch (error) {
      console.error("Failed to load patrols:", error);
    }
  };

  const sendCommand = useCallback(
    async (command: any) => {
      if (!canControl) return;

      setActiveCommand(command.action);
      try {
        const response = await fetch(`/api/control/v1/cameras/${cameraId}/ptz/command`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(command),
        });

        if (!response.ok) {
          const error = await response.json();
          alert(`PTZ command failed: ${error.error}`);
        }
      } catch (error) {
        console.error("PTZ command error:", error);
      } finally {
        setActiveCommand(null);
      }
    },
    [cameraId, canControl],
  );

  const move = (direction: "left" | "right" | "up" | "down") => {
    sendCommand({
      action: "move",
      direction,
      speed: { pan: speed, tilt: speed },
    });
  };

  const zoom = (action: "in" | "out") => {
    sendCommand({
      action: "zoom",
      zoomAction: action,
      speed: { zoom: speed },
    });
  };

  const stop = () => {
    sendCommand({ action: "stop" });
  };

  const goHome = () => {
    sendCommand({ action: "home" });
  };

  const gotoPreset = (presetNumber: number) => {
    sendCommand({
      action: "preset",
      presetId: presetNumber,
    });
  };

  const startPatrol = (patrolNumber: number) => {
    sendCommand({
      action: "patrol",
      patrolId: patrolNumber,
    });
  };

  return (
    <div className="ptz-control-panel">
      <div className="ptz-header">
        <h3>PTZ Control</h3>
        <button onClick={onClose} className="close-button" aria-label="Close PTZ control">
          ×
        </button>
      </div>

      <div className="ptz-lock-status">
        {isLocked ? (
          <div className="locked">
            <Lock size={16} />
            <span>Control locked</span>
            <button onClick={releaseLock} className="btn-secondary">
              <Unlock size={14} />
              Release
            </button>
          </div>
        ) : (
          <div className="unlocked">
            <Unlock size={16} />
            <span>No active lock</span>
            <button onClick={acquireLock} className="btn-primary" disabled={loading}>
              <Lock size={14} />
              {loading ? "Acquiring..." : "Take Control"}
            </button>
          </div>
        )}
      </div>

      {lock && lock.expiresAt && (
        <div className="lock-expires">
          Lock expires in {Math.max(0, Math.floor((Date.parse(lock.expiresAt) - Date.now()) / 1000))}s
        </div>
      )}

      <div className="ptz-controls">
        <div className="ptz-direction">
          <div className="direction-row">
            <button
              className="direction-button"
              onMouseDown={() => move("up")}
              onMouseUp={stop}
              onMouseLeave={stop}
              disabled={!canControl}
              aria-label="Pan up"
            >
              <ArrowUp size={20} />
            </button>
          </div>
          <div className="direction-row">
            <button
              className="direction-button"
              onMouseDown={() => move("left")}
              onMouseUp={stop}
              onMouseLeave={stop}
              disabled={!canControl}
              aria-label="Pan left"
            >
              <ArrowLeft size={20} />
            </button>
            <button
              className="direction-button center"
              onClick={stop}
              disabled={!canControl}
              aria-label="Stop"
            >
              <Square size={20} />
            </button>
            <button
              className="direction-button"
              onMouseDown={() => move("right")}
              onMouseUp={stop}
              onMouseLeave={stop}
              disabled={!canControl}
              aria-label="Pan right"
            >
              <ArrowRight size={20} />
            </button>
          </div>
          <div className="direction-row">
            <button
              className="direction-button"
              onMouseDown={() => move("down")}
              onMouseUp={stop}
              onMouseLeave={stop}
              disabled={!canControl}
              aria-label="Pan down"
            >
              <ArrowDown size={20} />
            </button>
          </div>
        </div>

        <div className="ptz-zoom">
          <button
            className="zoom-button"
            onMouseDown={() => zoom("in")}
            onMouseUp={stop}
            onMouseLeave={stop}
            disabled={!canControl}
          >
            <Maximize size={18} />
            Zoom In
          </button>
          <button
            className="zoom-button"
            onMouseDown={() => zoom("out")}
            onMouseUp={stop}
            onMouseLeave={stop}
            disabled={!canControl}
          >
            <Minimize size={18} />
            Zoom Out
          </button>
        </div>

        <div className="ptz-speed">
          <label>
            Speed: {Math.round(speed * 100)}%
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.1"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              disabled={!canControl}
            />
          </label>
        </div>

        <button className="ptz-home" onClick={goHome} disabled={!canControl}>
          <Home size={18} />
          Go Home
        </button>
      </div>

      {presets.length > 0 && (
        <div className="ptz-presets">
          <h4>Presets</h4>
          <div className="preset-grid">
            {presets.map((preset) => (
              <button
                key={preset.id}
                className="preset-button"
                onClick={() => gotoPreset(preset.presetNumber)}
                disabled={!canControl}
                title={preset.description}
              >
                <CircleDot size={14} />
                {preset.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {patrols.length > 0 && (
        <div className="ptz-patrols">
          <h4>Patrol Tours</h4>
          <div className="patrol-grid">
            {patrols.map((patrol) => (
              <button
                key={patrol.id}
                className="patrol-button"
                onClick={() => startPatrol(patrol.patrolNumber)}
                disabled={!canControl || !patrol.enabled}
              >
                <Play size={14} />
                {patrol.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <style jsx>{`
        .ptz-control-panel {
          background: white;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          padding: 20px;
          width: 100%;
          max-width: 400px;
        }

        .ptz-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .ptz-header h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
        }

        .close-button {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: #666;
          padding: 0;
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .ptz-lock-status {
          margin-bottom: 16px;
          padding: 12px;
          border-radius: 6px;
          background: #f5f5f5;
        }

        .locked,
        .unlocked {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .locked {
          color: #16a34a;
        }

        .unlocked {
          color: #666;
        }

        .lock-expires {
          margin-top: 8px;
          font-size: 12px;
          color: #666;
          text-align: center;
        }

        .ptz-controls {
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin-bottom: 20px;
        }

        .ptz-direction {
          display: flex;
          flex-direction: column;
          gap: 4px;
          align-items: center;
        }

        .direction-row {
          display: flex;
          gap: 4px;
        }

        .direction-button {
          width: 60px;
          height: 60px;
          border: 2px solid #ddd;
          border-radius: 8px;
          background: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .direction-button:hover:not(:disabled) {
          background: #f0f9ff;
          border-color: #3b82f6;
        }

        .direction-button:active:not(:disabled) {
          background: #dbeafe;
        }

        .direction-button:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .direction-button.center {
          background: #fee2e2;
        }

        .direction-button.center:hover:not(:disabled) {
          background: #fca5a5;
        }

        .ptz-zoom {
          display: flex;
          gap: 8px;
        }

        .zoom-button {
          flex: 1;
          padding: 12px;
          border: 2px solid #ddd;
          border-radius: 6px;
          background: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          font-size: 14px;
          transition: all 0.2s;
        }

        .zoom-button:hover:not(:disabled) {
          background: #f0f9ff;
          border-color: #3b82f6;
        }

        .zoom-button:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .ptz-speed label {
          display: flex;
          flex-direction: column;
          gap: 8px;
          font-size: 14px;
        }

        .ptz-speed input[type="range"] {
          width: 100%;
        }

        .ptz-home {
          padding: 12px;
          border: 2px solid #ddd;
          border-radius: 6px;
          background: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 500;
        }

        .ptz-home:hover:not(:disabled) {
          background: #fef3c7;
          border-color: #eab308;
        }

        .ptz-home:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .ptz-presets,
        .ptz-patrols {
          margin-top: 20px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
        }

        .ptz-presets h4,
        .ptz-patrols h4 {
          margin: 0 0 12px 0;
          font-size: 14px;
          font-weight: 600;
          color: #374151;
        }

        .preset-grid,
        .patrol-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
        }

        .preset-button,
        .patrol-button {
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 6px;
          background: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          transition: all 0.2s;
        }

        .preset-button:hover:not(:disabled),
        .patrol-button:hover:not(:disabled) {
          background: #f0f9ff;
          border-color: #3b82f6;
        }

        .preset-button:disabled,
        .patrol-button:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .btn-primary,
        .btn-secondary {
          padding: 6px 12px;
          border-radius: 4px;
          border: 1px solid;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          transition: all 0.2s;
        }

        .btn-primary {
          background: #3b82f6;
          color: white;
          border-color: #3b82f6;
        }

        .btn-primary:hover:not(:disabled) {
          background: #2563eb;
        }

        .btn-secondary {
          background: white;
          color: #374151;
          border-color: #d1d5db;
        }

        .btn-secondary:hover:not(:disabled) {
          background: #f3f4f6;
        }

        .btn-primary:disabled,
        .btn-secondary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
