"use client";

import { memo, useCallback, useEffect, useRef, useState, useMemo } from "react";
import {
  Map,
  Compass,
  Crosshair,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ShieldAlert,
  Layers,
  X,
  Radio,
  Eye,
  Maximize2,
  Minimize2,
  Sparkles,
} from "lucide-react";
import type { AnalyticsAlert, AnalyticsRule, Camera } from "@/lib/types";

export interface MappedCameraNode {
  camera: Camera;
  x: number;
  y: number;
  heading: number; // in degrees: 0 = East, 90 = South, 180 = West, 270 = North
  fovAngle: number; // in degrees: typically 70-80
  range: number; // in pixels
  zone: string;
  hasAlert: boolean;
  alertTitle?: string;
  alertSeverity?: string;
}

export interface InteractiveEMapRadarProps {
  cameras: Camera[];
  aiByCamera?: ReadonlyMap<string, { rules: AnalyticsRule[]; alerts: AnalyticsAlert[] }>;
  selectedCameraId?: string | null;
  onSelectCamera: (cameraId: string) => void;
  onFilterCamerasByArea: (cameraIds: string[], zoneName?: string) => void;
  onClose?: () => void;
  isDocked?: boolean;
}

const DEFAULT_MAP_WIDTH = 760;
const DEFAULT_MAP_HEIGHT = 560;

// Facility floor plan architectural definitions (Zones & Walls)
const FACILITY_ZONES = [
  { id: "entrance", name: "Main Entrance & Security Gate", x: 40, y: 40, w: 220, h: 180, color: "rgba(56, 189, 248, 0.08)", border: "#0284c7" },
  { id: "lobby", name: "Central Reception & Lobby", x: 280, y: 40, w: 220, h: 180, color: "rgba(99, 102, 241, 0.08)", border: "#4f46e5" },
  { id: "vault", name: "Strong Room & Cash Counter", x: 520, y: 40, w: 200, h: 180, color: "rgba(245, 158, 11, 0.08)", border: "#d97706" },
  { id: "corridor", name: "Central Transit Corridor", x: 40, y: 240, w: 680, h: 70, color: "rgba(148, 163, 184, 0.05)", border: "#475569" },
  { id: "warehouse_a", name: "Warehouse Zone A (Docking)", x: 40, y: 330, w: 320, h: 190, color: "rgba(16, 185, 129, 0.08)", border: "#059669" },
  { id: "warehouse_b", name: "Warehouse Zone B (High Bay)", x: 380, y: 330, w: 340, h: 190, color: "rgba(168, 85, 247, 0.08)", border: "#9333ea" },
];

export const InteractiveEMapRadar = memo(function InteractiveEMapRadar({
  cameras,
  aiByCamera,
  selectedCameraId,
  onSelectCamera,
  onFilterCamerasByArea,
  onClose,
  isDocked = true,
}: InteractiveEMapRadarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showFovCones, setShowFovCones] = useState<boolean>(true);
  const [radarSweepEnabled, setRadarSweepEnabled] = useState<boolean>(true);
  const [hoveredCameraId, setHoveredCameraId] = useState<string | null>(null);
  const [activeZoneFilter, setActiveZoneFilter] = useState<string>("all");

  // Lasso / Bounding Box Selection State
  const [isLassoing, setIsLassoing] = useState<boolean>(false);
  const [lassoStart, setLassoStart] = useState<{ x: number; y: number } | null>(null);
  const [lassoCurrent, setLassoCurrent] = useState<{ x: number; y: number } | null>(null);
  const [selectedInLasso, setSelectedInLasso] = useState<string[]>([]);
  const [radarSweepAngle, setRadarSweepAngle] = useState<number>(0);

  // Radar continuous sweep animation
  useEffect(() => {
    if (!radarSweepEnabled) return;
    const interval = setInterval(() => {
      setRadarSweepAngle((prev) => (prev + 3) % 360);
    }, 40);
    return () => clearInterval(interval);
  }, [radarSweepEnabled]);

  // Spatial Projection: Map real cameras to physical coordinates & headings
  const mappedCameras: MappedCameraNode[] = useMemo(() => {
    return cameras.map((cam, idx) => {
      const name = cam.name.toLowerCase();
      const branch = (cam.branchName || "").toLowerCase();
      const alerts = aiByCamera?.get(cam.id)?.alerts || [];
      const criticalAlert = alerts.find(
        (a) => a.severity === "P1" || a.severity === "P2" || /intrusion|unauthorized|breach|fire|weapon/i.test(a.title)
      );

      let x = 120;
      let y = 120;
      let heading = 90;
      let fovAngle = 75;
      let range = 85;
      let zone = "entrance";

      if (name.includes("entrance") || name.includes("gate") || name.includes("door") || name.includes("ingress")) {
        zone = "entrance";
        x = 90 + (idx % 3) * 60;
        y = 80 + Math.floor(idx / 3) * 50;
        heading = 135;
      } else if (name.includes("vault") || name.includes("cash") || name.includes("strong")) {
        zone = "vault";
        x = 580 + (idx % 2) * 60;
        y = 90 + Math.floor(idx / 2) * 50;
        heading = 225;
      } else if (name.includes("warehouse") && (name.includes("zone b") || name.includes("b"))) {
        zone = "warehouse_b";
        x = 440 + (idx % 3) * 80;
        y = 390 + Math.floor(idx / 3) * 60;
        heading = 315;
      } else if (name.includes("warehouse")) {
        zone = "warehouse_a";
        x = 100 + (idx % 3) * 80;
        y = 390 + Math.floor(idx / 3) * 60;
        heading = 45;
      } else if (name.includes("lobby") || name.includes("reception") || name.includes("waiting")) {
        zone = "lobby";
        x = 330 + (idx % 2) * 80;
        y = 90 + Math.floor(idx / 2) * 50;
        heading = 90;
      } else {
        // Corridor & Transit distribution
        zone = "corridor";
        const corridorSlots = [120, 240, 360, 480, 600];
        x = corridorSlots[idx % corridorSlots.length];
        y = 275;
        heading = idx % 2 === 0 ? 0 : 180;
      }

      return {
        camera: cam,
        x,
        y,
        heading,
        fovAngle,
        range,
        zone,
        hasAlert: Boolean(criticalAlert),
        alertTitle: criticalAlert?.title,
        alertSeverity: criticalAlert?.severity,
      };
    });
  }, [cameras, aiByCamera]);

  // Helper to generate SVG arc path for camera FOV cone
  const getFovConePath = (cx: number, cy: number, heading: number, fov: number, r: number) => {
    const startAngle = ((heading - fov / 2) * Math.PI) / 180;
    const endAngle = ((heading + fov / 2) * Math.PI) / 180;

    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);

    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`;
  };

  // Mouse Handlers for Lasso / Area Selection
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const startPoint = {
      x: (e.clientX - rect.left - pan.x) / zoom,
      y: (e.clientY - rect.top - pan.y) / zoom,
    };
    setIsLassoing(true);
    setLassoStart(startPoint);
    setLassoCurrent(startPoint);
    setSelectedInLasso([]);
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isLassoing || !lassoStart) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const currentPoint = {
      x: (e.clientX - rect.left - pan.x) / zoom,
      y: (e.clientY - rect.top - pan.y) / zoom,
    };
    setLassoCurrent(currentPoint);

    // Calculate bounding box in map coordinate space
    const minX = Math.min(lassoStart.x, currentPoint.x);
    const maxX = Math.max(lassoStart.x, currentPoint.x);
    const minY = Math.min(lassoStart.y, currentPoint.y);
    const maxY = Math.max(lassoStart.y, currentPoint.y);

    // Hit test cameras
    const matched = mappedCameras
      .filter((cam) => cam.x >= minX && cam.x <= maxX && cam.y >= minY && cam.y <= maxY)
      .map((cam) => cam.camera.id);

    setSelectedInLasso(matched);
  };

  const handleMouseUp = () => {
    if (!isLassoing || !lassoStart || !lassoCurrent) {
      setIsLassoing(false);
      return;
    }

    const minX = Math.min(lassoStart.x, lassoCurrent.x);
    const maxX = Math.max(lassoStart.x, lassoCurrent.x);
    const minY = Math.min(lassoStart.y, lassoCurrent.y);
    const maxY = Math.max(lassoStart.y, lassoCurrent.y);
    const width = maxX - minX;
    const height = maxY - minY;

    setIsLassoing(false);

    // If it was a meaningful box drag (not an accidental click)
    if (width > 20 && height > 20 && selectedInLasso.length > 0) {
      // Find matching zone name if drag falls predominantly in one zone
      const center = { x: minX + width / 2, y: minY + height / 2 };
      const matchedZone = FACILITY_ZONES.find(
        (z) => center.x >= z.x && center.x <= z.x + z.w && center.y >= z.y && center.y <= z.y + z.h
      );
      onFilterCamerasByArea(selectedInLasso, matchedZone?.name || "Selected Map Region");
    }

    setLassoStart(null);
    setLassoCurrent(null);
  };

  // Quick Zone selection
  const handleSelectZone = (zoneId: string) => {
    setActiveZoneFilter(zoneId);
    if (zoneId === "all") {
      onFilterCamerasByArea(cameras.map((c) => c.id), "All Facility Cameras");
      return;
    }
    const zoneCameras = mappedCameras
      .filter((c) => c.zone === zoneId)
      .map((c) => c.camera.id);
    const zoneDef = FACILITY_ZONES.find((z) => z.id === zoneId);
    if (zoneCameras.length > 0) {
      onFilterCamerasByArea(zoneCameras, zoneDef?.name || zoneId);
    }
  };

  const resetMapViewport = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className={`interactive-emap-container ${isDocked ? "emap-docked" : "emap-floating"}`}>
      {/* ── HEADER TOOLBAR ── */}
      <div className="emap-header">
        <div className="emap-title-group">
          <Map size={16} className="text-sky-400" />
          <span className="emap-title">FACILITY 3D SPATIAL E-MAP & RADAR</span>
          <span className="emap-badge">{mappedCameras.length} CAMERAS</span>
        </div>

        <div className="emap-actions">
          <button
            type="button"
            className={`emap-btn ${showFovCones ? "active" : ""}`}
            onClick={() => setShowFovCones((prev) => !prev)}
            title="Toggle Field of View (FOV) vision cones"
          >
            <Eye size={14} />
            <span>FOV</span>
          </button>

          <button
            type="button"
            className={`emap-btn ${radarSweepEnabled ? "active" : ""}`}
            onClick={() => setRadarSweepEnabled((prev) => !prev)}
            title="Toggle active radar sweep wave"
          >
            <Radio size={14} className={radarSweepEnabled ? "text-emerald-400 animate-spin" : ""} />
            <span>Sweep</span>
          </button>

          <div className="emap-zoom-group">
            <button
              type="button"
              className="emap-btn-icon"
              onClick={() => setZoom((z) => Math.min(2.5, z + 0.2))}
              title="Zoom In"
            >
              <ZoomIn size={14} />
            </button>
            <button
              type="button"
              className="emap-btn-icon"
              onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))}
              title="Zoom Out"
            >
              <ZoomOut size={14} />
            </button>
            <button
              type="button"
              className="emap-btn-icon"
              onClick={resetMapViewport}
              title="Reset View"
            >
              <RotateCcw size={14} />
            </button>
          </div>

          {onClose && (
            <button
              type="button"
              className="emap-btn-icon text-slate-400 hover:text-white"
              onClick={onClose}
              title="Close E-Map Panel"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* ── ZONE QUICK PILLS ── */}
      <div className="emap-zones-bar">
        <span className="zones-label">Zones:</span>
        <button
          type="button"
          className={`zone-pill ${activeZoneFilter === "all" ? "active" : ""}`}
          onClick={() => handleSelectZone("all")}
        >
          🌐 All ({cameras.length})
        </button>
        {FACILITY_ZONES.map((zone) => {
          const count = mappedCameras.filter((c) => c.zone === zone.id).length;
          return (
            <button
              key={zone.id}
              type="button"
              className={`zone-pill ${activeZoneFilter === zone.id ? "active" : ""}`}
              onClick={() => handleSelectZone(zone.id)}
            >
              {zone.name.split(" ")[0]} ({count})
            </button>
          );
        })}
      </div>

      {/* ── INTERACTIVE CANVAS STAGE ── */}
      <div className="emap-canvas-viewport" ref={containerRef}>
        <svg
          className="emap-svg"
          viewBox={`0 0 ${DEFAULT_MAP_WIDTH} ${DEFAULT_MAP_HEIGHT}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          style={{
            transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
            transformOrigin: "center center",
            cursor: isLassoing ? "crosshair" : "default",
          }}
        >
          {/* Background Grid Pattern */}
          <defs>
            <pattern id="grid-pattern" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(56, 189, 248, 0.05)" strokeWidth="1" />
            </pattern>
            {/* Radar Sweep Gradient */}
            <radialGradient id="radar-sweep" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(56, 189, 248, 0.4)" />
              <stop offset="60%" stopColor="rgba(56, 189, 248, 0.15)" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
            {/* Alarm Sweep Gradient */}
            <radialGradient id="radar-alert" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(239, 68, 68, 0.5)" />
              <stop offset="60%" stopColor="rgba(239, 68, 68, 0.2)" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
          </defs>

          {/* Tactical Background Grid */}
          <rect width={DEFAULT_MAP_WIDTH} height={DEFAULT_MAP_HEIGHT} fill="#091322" />
          <rect width={DEFAULT_MAP_WIDTH} height={DEFAULT_MAP_HEIGHT} fill="url(#grid-pattern)" />

          {/* Architectural Zones */}
          {FACILITY_ZONES.map((zone) => (
            <g key={zone.id} className="zone-group">
              <rect
                x={zone.x}
                y={zone.y}
                width={zone.w}
                height={zone.h}
                fill={zone.color}
                stroke={zone.border}
                strokeWidth={1.5}
                strokeDasharray="4 2"
                rx={6}
              />
              <text
                x={zone.x + 12}
                y={zone.y + 22}
                fill="#94a3b8"
                fontSize={11}
                fontWeight={700}
                letterSpacing="0.05em"
              >
                {zone.name.toUpperCase()}
              </text>
            </g>
          ))}

          {/* Camera Field of View (FOV) Vision Cones */}
          {showFovCones &&
            mappedCameras.map((cam) => {
              const isSelected = selectedCameraId === cam.camera.id;
              const isHovered = hoveredCameraId === cam.camera.id;
              const conePath = getFovConePath(cam.x, cam.y, cam.heading, cam.fovAngle, cam.range);

              return (
                <g key={`fov-${cam.camera.id}`} className="fov-group pointer-events-none">
                  {/* Vision Cone Wedge */}
                  <path
                    d={conePath}
                    fill={cam.hasAlert ? "url(#radar-alert)" : "url(#radar-sweep)"}
                    stroke={cam.hasAlert ? "#ef4444" : isSelected ? "#38bdf8" : "rgba(56, 189, 248, 0.4)"}
                    strokeWidth={isSelected || isHovered ? 2 : 1}
                    className={cam.hasAlert ? "animate-pulse" : ""}
                  />

                  {/* Pulsing Radar Arc Indicator */}
                  {radarSweepEnabled && (
                    <circle
                      cx={cam.x}
                      cy={cam.y}
                      r={Math.min(cam.range, (radarSweepAngle % cam.range) + 10)}
                      fill="none"
                      stroke={cam.hasAlert ? "rgba(239, 68, 68, 0.4)" : "rgba(56, 189, 248, 0.3)"}
                      strokeWidth={1.5}
                    />
                  )}
                </g>
              );
            })}

          {/* Camera Nodes */}
          {mappedCameras.map((cam) => {
            const isSelected = selectedCameraId === cam.camera.id;
            const isHovered = hoveredCameraId === cam.camera.id;
            const isInLasso = selectedInLasso.includes(cam.camera.id);

            return (
              <g
                key={`cam-${cam.camera.id}`}
                className="camera-node-group cursor-pointer"
                transform={`translate(${cam.x}, ${cam.y})`}
                onClick={() => onSelectCamera(cam.camera.id)}
                onMouseEnter={() => setHoveredCameraId(cam.camera.id)}
                onMouseLeave={() => setHoveredCameraId(null)}
              >
                {/* Alert Warning Ring */}
                {cam.hasAlert && (
                  <circle
                    r={18}
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth={2}
                    className="animate-ping opacity-75"
                  />
                )}

                {/* Selection Halo */}
                {(isSelected || isInLasso) && (
                  <circle
                    r={16}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth={2.5}
                    strokeDasharray="3 3"
                    className="animate-spin"
                    style={{ animationDuration: "6s" }}
                  />
                )}

                {/* Base Marker Circle */}
                <circle
                  r={10}
                  fill={cam.hasAlert ? "#ef4444" : isSelected ? "#0284c7" : "#0f172a"}
                  stroke={cam.hasAlert ? "#fca5a5" : "#38bdf8"}
                  strokeWidth={2}
                />

                {/* Orientation Arrow */}
                <g transform={`rotate(${cam.heading})`}>
                  <polygon points="0,-4 10,0 0,4" fill={cam.hasAlert ? "#ffffff" : "#38bdf8"} />
                </g>

                {/* Camera Name Tag */}
                <text
                  x={14}
                  y={4}
                  fill={cam.hasAlert ? "#fca5a5" : isSelected ? "#38bdf8" : "#e2e8f0"}
                  fontSize={10}
                  fontWeight={600}
                  className="select-none"
                  style={{ textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}
                >
                  {cam.camera.name}
                </text>
              </g>
            );
          })}

          {/* Active Lasso / Bounding Box Selection Rectangle */}
          {isLassoing && lassoStart && lassoCurrent && (
            <g className="lasso-rect-group">
              <rect
                x={Math.min(lassoStart.x, lassoCurrent.x)}
                y={Math.min(lassoStart.y, lassoCurrent.y)}
                width={Math.abs(lassoCurrent.x - lassoStart.x)}
                height={Math.abs(lassoCurrent.y - lassoStart.y)}
                fill="rgba(56, 189, 248, 0.18)"
                stroke="#38bdf8"
                strokeWidth={2}
                strokeDasharray="5 3"
                rx={4}
              />
              <text
                x={Math.min(lassoStart.x, lassoCurrent.x) + 8}
                y={Math.min(lassoStart.y, lassoCurrent.y) + 16}
                fill="#38bdf8"
                fontSize={11}
                fontWeight={700}
              >
                SELECT AREA ({selectedInLasso.length} CAMERAS)
              </text>
            </g>
          )}
        </svg>

        {/* Floating Hint Overlay */}
        <div className="emap-hint-bar">
          <Crosshair size={13} className="text-sky-400" />
          <span>
            {isLassoing
              ? `Selecting: ${selectedInLasso.length} camera(s) targeted`
              : "Drag a box (lasso) to filter video wall to that area · Click any camera to Spotlight into Hero Tile"}
          </span>
        </div>
      </div>

      <style jsx>{`
        .interactive-emap-container {
          display: flex;
          flex-direction: column;
          background: #091322;
          border: 1px solid rgba(56, 189, 248, 0.25);
          border-radius: 10px;
          overflow: hidden;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
          font-family: inherit;
        }

        .emap-docked {
          width: 100%;
          height: 380px;
          margin-bottom: 12px;
        }

        .emap-floating {
          position: fixed;
          bottom: 24px;
          right: 24px;
          width: 540px;
          height: 420px;
          z-index: 50;
          box-shadow: 0 12px 48px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(56, 189, 248, 0.4);
        }

        .emap-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 14px;
          background: #070e1b;
          border-bottom: 1px solid rgba(56, 189, 248, 0.2);
          gap: 12px;
          flex-wrap: wrap;
        }

        .emap-title-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .emap-title {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: #f8fafc;
        }

        .emap-badge {
          padding: 2px 6px;
          background: rgba(56, 189, 248, 0.15);
          border: 1px solid rgba(56, 189, 248, 0.35);
          border-radius: 4px;
          font-size: 10px;
          font-weight: 600;
          color: #38bdf8;
        }

        .emap-actions {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .emap-btn {
          display: flex;
          align-items: center;
          gap: 5px;
          height: 28px;
          padding: 0 8px;
          background: #0f1d30;
          border: 1px solid rgba(148, 163, 184, 0.25);
          border-radius: 5px;
          color: #94a3b8;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .emap-btn:hover {
          background: #1e293b;
          color: #ffffff;
        }

        .emap-btn.active {
          background: rgba(14, 165, 233, 0.2);
          border-color: #38bdf8;
          color: #38bdf8;
        }

        .emap-zoom-group {
          display: flex;
          align-items: center;
          background: #0f1d30;
          border: 1px solid rgba(148, 163, 184, 0.25);
          border-radius: 5px;
        }

        .emap-btn-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          background: transparent;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          transition: color 0.15s ease;
        }

        .emap-btn-icon:hover {
          color: #ffffff;
        }

        .emap-zones-bar {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          background: #0b1526;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          overflow-x: auto;
          scrollbar-width: none;
        }

        .zones-label {
          font-size: 11px;
          font-weight: 600;
          color: #64748b;
          margin-right: 4px;
          white-space: nowrap;
        }

        .zone-pill {
          padding: 3px 8px;
          background: #111e33;
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 12px;
          color: #94a3b8;
          font-size: 11px;
          white-space: nowrap;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .zone-pill:hover {
          background: rgba(56, 189, 248, 0.12);
          color: #38bdf8;
        }

        .zone-pill.active {
          background: rgba(14, 165, 233, 0.25);
          border-color: #38bdf8;
          color: #38bdf8;
          font-weight: 600;
        }

        .emap-canvas-viewport {
          position: relative;
          flex: 1;
          min-height: 0;
          overflow: hidden;
          background: #091322;
        }

        .emap-svg {
          width: 100%;
          height: 100%;
          user-select: none;
        }

        .emap-hint-bar {
          position: absolute;
          bottom: 10px;
          left: 12px;
          right: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          background: rgba(8, 16, 30, 0.88);
          border: 1px solid rgba(56, 189, 248, 0.2);
          border-radius: 6px;
          backdrop-filter: blur(6px);
          font-size: 11px;
          color: #94a3b8;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
});
