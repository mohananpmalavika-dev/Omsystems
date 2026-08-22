"use client";

/**
 * Zone Editor for Analytics Rules
 * Visual polygon/line drawing on camera feed
 */

import { useState, useRef, useEffect } from "react";
import { Save, Trash2, Plus, X } from "lucide-react";

export interface Zone {
  id: string;
  name: string;
  shape: "polygon" | "line";
  points: Array<{ x: number; y: number }>;
  color?: string;
}

interface ZoneEditorProps {
  cameraId: string;
  snapshotUrl?: string;
  existingZones?: Zone[];
  onSave: (zone: Zone) => Promise<void>;
  onDelete?: (zoneId: string) => Promise<void>;
  onClose: () => void;
}

export function ZoneEditor({
  cameraId,
  snapshotUrl,
  existingZones = [],
  onSave,
  onDelete,
  onClose,
}: ZoneEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zones, setZones] = useState<Zone[]>(existingZones);
  const [currentZone, setCurrentZone] = useState<Partial<Zone>>({
    name: "Detection Zone",
    shape: "polygon",
    points: [],
    color: "#FF0000",
  });
  const [isDrawing, setIsDrawing] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!canvasRef.current || !snapshotUrl) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      setImageLoaded(true);
      redrawZones();
    };
    img.src = snapshotUrl;
  }, [snapshotUrl]);

  useEffect(() => {
    redrawZones();
  }, [zones, currentZone]);

  const redrawZones = () => {
    if (!canvasRef.current || !imageLoaded) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Redraw base image
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      // Draw existing zones
      zones.forEach((zone) => {
        drawZone(ctx, zone, canvas.width, canvas.height);
      });

      // Draw current zone being edited
      if (currentZone.points && currentZone.points.length > 0) {
        drawZone(
          ctx,
          currentZone as Zone,
          canvas.width,
          canvas.height,
          true,
        );
      }
    };
    if (snapshotUrl) img.src = snapshotUrl;
  };

  const drawZone = (
    ctx: CanvasRenderingContext2D,
    zone: Partial<Zone>,
    width: number,
    height: number,
    isActive = false,
  ) => {
    if (!zone.points || zone.points.length === 0) return;

    ctx.strokeStyle = zone.color || "#FF0000";
    ctx.fillStyle = zone.color ? `${zone.color}33` : "#FF000033";
    ctx.lineWidth = isActive ? 3 : 2;

    ctx.beginPath();
    zone.points.forEach((point, index) => {
      const x = point.x * width;
      const y = point.y * height;
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    if (zone.shape === "polygon" && zone.points.length > 2) {
      ctx.closePath();
      ctx.fill();
    }
    ctx.stroke();

    // Draw points
    zone.points.forEach((point) => {
      const x = point.x * width;
      const y = point.y * height;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = isActive ? "#FFFF00" : zone.color || "#FF0000";
      ctx.fill();
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;

    const newPoint = { x, y };
    const updatedPoints = [...(currentZone.points || []), newPoint];

    // For line, limit to 2 points
    if (currentZone.shape === "line" && updatedPoints.length > 2) {
      return;
    }

    setCurrentZone({ ...currentZone, points: updatedPoints });
  };

  const startDrawing = () => {
    setIsDrawing(true);
    setCurrentZone({
      ...currentZone,
      points: [],
      id: `zone_${Date.now()}`,
    });
  };

  const finishDrawing = () => {
    if (!currentZone.points || currentZone.points.length < 2) {
      setError("A zone needs at least 2 points");
      return;
    }

    if (
      currentZone.shape === "polygon" &&
      currentZone.points.length < 3
    ) {
      setError("A polygon needs at least 3 points");
      return;
    }

    setZones([...zones, currentZone as Zone]);
    setCurrentZone({
      name: "Detection Zone",
      shape: "polygon",
      points: [],
      color: "#FF0000",
    });
    setIsDrawing(false);
  };

  const cancelDrawing = () => {
    setCurrentZone({
      name: "Detection Zone",
      shape: "polygon",
      points: [],
      color: "#FF0000",
    });
    setIsDrawing(false);
  };

  const saveZones = async () => {
    if (zones.length === 0) {
      setError("Create at least one zone before saving");
      return;
    }

    setSaving(true);
    setError(undefined);

    try {
      for (const zone of zones) {
        await onSave(zone);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save zones");
    } finally {
      setSaving(false);
    }
  };

  const removeZone = async (zoneId: string) => {
    if (onDelete) {
      setSaving(true);
      try {
        await onDelete(zoneId);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to delete zone",
        );
      } finally {
        setSaving(false);
      }
    }
    setZones(zones.filter((z) => z.id !== zoneId));
  };

  return (
    <div className="modal-overlay zone-editor-modal">
      <div className="zone-editor">
        <header className="zone-editor-header">
          <div>
            <h2>Zone Editor</h2>
            <p>Camera {cameraId}</p>
          </div>
          <button onClick={onClose} disabled={saving}>
            <X size={18} />
          </button>
        </header>

        {error && (
          <div className="zone-editor-error">
            <span>⚠️ {error}</span>
            <button onClick={() => setError(undefined)}>
              <X size={14} />
            </button>
          </div>
        )}

        <div className="zone-editor-content">
          <div className="zone-canvas-container">
            {snapshotUrl ? (
              <canvas
                ref={canvasRef}
                onClick={handleCanvasClick}
                className={isDrawing ? "drawing" : ""}
              />
            ) : (
              <div className="zone-placeholder">
                <p>No camera snapshot available</p>
                <small>Upload a snapshot or capture one from live view</small>
              </div>
            )}
          </div>

          <aside className="zone-controls">
            <div className="zone-settings">
              <label>
                Zone Name
                <input
                  type="text"
                  value={currentZone.name || ""}
                  onChange={(e) =>
                    setCurrentZone({ ...currentZone, name: e.target.value })
                  }
                  disabled={!isDrawing}
                />
              </label>
              <label>
                Shape
                <select
                  value={currentZone.shape || "polygon"}
                  onChange={(e) =>
                    setCurrentZone({
                      ...currentZone,
                      shape: e.target.value as "polygon" | "line",
                      points: [],
                    })
                  }
                  disabled={isDrawing}
                >
                  <option value="polygon">Polygon (intrusion, loitering)</option>
                  <option value="line">Line (crossing)</option>
                </select>
              </label>
              <label>
                Color
                <input
                  type="color"
                  value={currentZone.color || "#FF0000"}
                  onChange={(e) =>
                    setCurrentZone({ ...currentZone, color: e.target.value })
                  }
                />
              </label>
            </div>

            {!isDrawing ? (
              <button
                className="primary-action"
                onClick={startDrawing}
                disabled={saving || !imageLoaded}
              >
                <Plus size={16} />
                Start Drawing
              </button>
            ) : (
              <div className="drawing-controls">
                <p>
                  Click on the image to add points
                  {currentZone.shape === "line"
                    ? " (2 points needed)"
                    : " (3+ points needed)"}
                </p>
                <div className="button-group">
                  <button onClick={cancelDrawing}>Cancel</button>
                  <button
                    onClick={finishDrawing}
                    className="primary-action"
                    disabled={
                      !currentZone.points ||
                      currentZone.points.length <
                        (currentZone.shape === "line" ? 2 : 3)
                    }
                  >
                    <Save size={16} />
                    Finish Zone
                  </button>
                </div>
              </div>
            )}

            <div className="zone-list">
              <h3>Created Zones ({zones.length})</h3>
              {zones.length === 0 ? (
                <p className="empty-state">No zones created yet</p>
              ) : (
                zones.map((zone) => (
                  <div key={zone.id} className="zone-item">
                    <div
                      className="zone-color"
                      style={{ backgroundColor: zone.color }}
                    />
                    <div className="zone-info">
                      <strong>{zone.name}</strong>
                      <small>
                        {zone.shape} · {zone.points.length} points
                      </small>
                    </div>
                    <button
                      onClick={() => void removeZone(zone.id)}
                      className="icon-danger"
                      disabled={saving}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>

        <footer className="zone-editor-footer">
          <button onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            onClick={() => void saveZones()}
            className="primary-action"
            disabled={saving || zones.length === 0}
          >
            <Save size={16} />
            {saving ? "Saving..." : "Save All Zones"}
          </button>
        </footer>
      </div>
    </div>
  );
}
