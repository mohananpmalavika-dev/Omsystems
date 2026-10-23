"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Camera,
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  SkipBack,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ShieldAlert,
  Sliders,
  Layers,
  Clock,
  ArrowRight,
  User,
  Sparkles,
  AlertTriangle,
  Volume2,
  Lock,
  Download,
  Info,
  ChevronRight,
  Eye,
  Radio,
  MapPin,
  CheckCircle2,
} from "lucide-react";
import type {
  ReidFloorPlanRouteMap,
  ReidBreadcrumbWaypoint,
  ReidBreadcrumbSegment,
} from "@/lib/api-client";

interface FloorPlanReIdTrailMapProps {
  routeMap: ReidFloorPlanRouteMap;
  onSelectWaypoint?: (waypoint: ReidBreadcrumbWaypoint) => void;
  onFollowAnotherTarget?: () => void;
  onLockdownZone?: (zoneName: string) => void;
  onTalkDown?: (cameraId: string) => void;
}

export function FloorPlanReIdTrailMap({
  routeMap,
  onSelectWaypoint,
  onFollowAnotherTarget,
  onLockdownZone,
  onTalkDown,
}: FloorPlanReIdTrailMapProps) {
  // Playback state for stepping through the journey chronologically
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [activeStepIndex, setActiveStepIndex] = useState<number>(
    routeMap.waypoints.length > 0 ? routeMap.waypoints.length : 1
  );
  const [selectedWaypoint, setSelectedWaypoint] = useState<ReidBreadcrumbWaypoint | null>(
    routeMap.waypoints.length > 0 ? routeMap.waypoints[routeMap.waypoints.length - 1] : null
  );
  const [hoveredCameraId, setHoveredCameraId] = useState<string | null>(null);
  const [showFovCones, setShowFovCones] = useState<boolean>(true);
  const [showZoneNames, setShowZoneNames] = useState<boolean>(true);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [alertSuccessMessage, setAlertSuccessMessage] = useState<string | null>(null);

  const waypoints = routeMap.waypoints || [];
  const segments = routeMap.routeSegments || [];
  const allCameras = routeMap.allBranchCameras || [];

  // Filter visible waypoints up to activeStepIndex for playback animation
  const visibleWaypoints = useMemo(() => {
    return waypoints.slice(0, activeStepIndex);
  }, [waypoints, activeStepIndex]);

  const visibleSegments = useMemo(() => {
    if (activeStepIndex <= 1) return [];
    return segments.slice(0, activeStepIndex - 1);
  }, [segments, activeStepIndex]);

  // Current suspect location marker
  const currentWaypoint = visibleWaypoints[visibleWaypoints.length - 1] || null;

  // Automated playback loop
  useEffect(() => {
    if (!isPlaying) return;
    const intervalTime = Math.max(800, 2400 / playbackSpeed);

    const timer = setInterval(() => {
      setActiveStepIndex((prev) => {
        if (prev >= waypoints.length) {
          setIsPlaying(false);
          return waypoints.length;
        }
        const next = prev + 1;
        const targetWp = waypoints[next - 1];
        if (targetWp) setSelectedWaypoint(targetWp);
        return next;
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, [isPlaying, playbackSpeed, waypoints]);

  const handleStepChange = (index: number) => {
    const clamped = Math.max(1, Math.min(waypoints.length, index));
    setActiveStepIndex(clamped);
    const targetWp = waypoints[clamped - 1];
    if (targetWp) {
      setSelectedWaypoint(targetWp);
      if (onSelectWaypoint) onSelectWaypoint(targetWp);
    }
  };

  const handleTriggerLockdown = () => {
    const zone = currentWaypoint?.zoneName || "Vault Sector";
    if (onLockdownZone) onLockdownZone(zone);
    setAlertSuccessMessage(`🚨 Security Protocol Activated: ${zone} interlock doors locked.`);
    setTimeout(() => setAlertSuccessMessage(null), 5000);
  };

  const handleTriggerAudioTalkdown = () => {
    const camId = currentWaypoint?.cameraId || "cam-01";
    if (onTalkDown) onTalkDown(camId);
    setAlertSuccessMessage(`📢 IP Talk-Down Audio Channel opened on ${currentWaypoint?.cameraName || "Current Camera"}.`);
    setTimeout(() => setAlertSuccessMessage(null), 5000);
  };

  // Convert waypoints into SVG path string
  const trailSvgPath = useMemo(() => {
    if (visibleWaypoints.length < 2) return "";
    return visibleWaypoints.reduce((acc, wp, idx) => {
      const cmd = idx === 0 ? "M" : "L";
      return `${acc} ${cmd} ${wp.coordinates.x * 10} ${wp.coordinates.y * 7}`;
    }, "");
  }, [visibleWaypoints]);

  return (
    <div className="flex flex-col gap-6">
      {/* Top Header Card: Target Identity & Live Tracking Status */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl backdrop-blur-md lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-950 to-slate-950 text-cyan-400 shadow-inner">
            <Radio size={28} className="animate-pulse" />
            <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-4 w-4 rounded-full bg-emerald-500"></span>
            </span>
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-0.5 text-xs font-semibold text-cyan-300">
                2D FLOOR PLAN RE-ID
              </span>
              <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
                {routeMap.isLiveActive ? "LIVE ACTIVE TARGET" : "HISTORICAL TRACKLET"}
              </span>
              <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-0.5 text-xs font-mono text-slate-300">
                {routeMap.globalId}
              </span>
            </div>

            <h2 className="mt-1 text-xl font-bold tracking-tight text-white sm:text-2xl">
              Target Cross-Camera Breadcrumb Trail
            </h2>

            <p className="mt-1 text-xs text-slate-400">
              Contiguous path across <span className="font-semibold text-cyan-300">{routeMap.uniqueCamerasCount} branch cameras</span> ({waypoints.map((w) => w.cameraName).join(" ➡️ ")})
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {onFollowAnotherTarget && (
            <button
              onClick={onFollowAnotherTarget}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 hover:text-white"
            >
              <Eye size={14} className="text-cyan-400" />
              Follow Another Target
            </button>
          )}

          <button
            onClick={handleTriggerAudioTalkdown}
            className="flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-950/30 px-3.5 py-2 text-xs font-semibold text-amber-300 transition hover:bg-amber-900/40"
          >
            <Volume2 size={14} />
            Live Talk-Down
          </button>

          <button
            onClick={handleTriggerLockdown}
            className="flex items-center gap-1.5 rounded-xl border border-rose-500/50 bg-rose-950/40 px-3.5 py-2 text-xs font-semibold text-rose-300 shadow-lg shadow-rose-950/30 transition hover:bg-rose-900/50"
          >
            <Lock size={14} />
            Lockdown Zone
          </button>
        </div>
      </div>

      {alertSuccessMessage && (
        <div className="flex items-center justify-between rounded-xl border border-rose-500/40 bg-rose-950/30 px-4 py-3 text-xs font-semibold text-rose-200">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-rose-400" />
            <span>{alertSuccessMessage}</span>
          </div>
          <button onClick={() => setAlertSuccessMessage(null)} className="text-rose-400 hover:text-rose-200">
            Dismiss
          </button>
        </div>
      )}

      {/* Main Floor Plan Grid Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* LEFT / CENTER: Interactive 2D Blueprint Floor Plan (Span 3 cols) */}
        <div className="relative flex flex-col rounded-2xl border border-slate-800 bg-slate-950/90 p-4 shadow-2xl backdrop-blur-xl lg:col-span-3">
          {/* Canvas Controls Toolbar */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3 text-xs">
            <div className="flex items-center gap-3">
              <span className="font-semibold uppercase tracking-wider text-slate-400">
                Ground Floor Facility Layout
              </span>
              <span className="rounded border border-slate-800 bg-slate-900 px-2 py-0.5 font-mono text-[11px] text-cyan-400">
                Scale: 1:100 (40m × 28m)
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFovCones(!showFovCones)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                  showFovCones
                    ? "border-cyan-500/40 bg-cyan-950/40 text-cyan-300"
                    : "border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200"
                }`}
              >
                FOV Cones
              </button>
              <button
                onClick={() => setShowZoneNames(!showZoneNames)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                  showZoneNames
                    ? "border-cyan-500/40 bg-cyan-950/40 text-cyan-300"
                    : "border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200"
                }`}
              >
                Zone Labels
              </button>
              <div className="h-4 w-px bg-slate-800" />
              <button
                onClick={() => setZoomLevel((z) => Math.max(0.8, z - 0.1))}
                className="rounded-lg border border-slate-800 bg-slate-900 p-1 text-slate-300 hover:bg-slate-800"
                title="Zoom Out"
              >
                <ZoomOut size={14} />
              </button>
              <span className="font-mono text-[11px] text-slate-400">{(zoomLevel * 100).toFixed(0)}%</span>
              <button
                onClick={() => setZoomLevel((z) => Math.min(1.5, z + 0.1))}
                className="rounded-lg border border-slate-800 bg-slate-900 p-1 text-slate-300 hover:bg-slate-800"
                title="Zoom In"
              >
                <ZoomIn size={14} />
              </button>
            </div>
          </div>

          {/* SVG 2D Floor Plan Canvas */}
          <div className="relative flex min-h-[480px] w-full items-center justify-center overflow-hidden rounded-xl border border-slate-900 bg-[#090d16]">
            <div
              className="relative w-full transition-transform duration-200"
              style={{ transform: `scale(${zoomLevel})` }}
            >
              <svg
                viewBox="0 0 1000 700"
                className="w-full h-auto select-none"
                style={{ filter: "drop-shadow(0 4px 20px rgba(0,0,0,0.5))" }}
              >
                <defs>
                  {/* Blueprint Grid Pattern */}
                  <pattern id="blueprint-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(30, 41, 59, 0.4)" strokeWidth="0.5" />
                  </pattern>

                  {/* Flowing Animated Gradient for Breadcrumb Trail */}
                  <linearGradient id="trailGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.9" />
                    <stop offset="50%" stopColor="#38bdf8" stopOpacity="1" />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.95" />
                  </linearGradient>

                  {/* Glow filter for suspect trail */}
                  <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="4" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>

                  {/* Arrow marker for directional chevrons */}
                  <marker
                    id="trail-arrow"
                    viewBox="0 0 10 10"
                    refX="5"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 8 5 L 0 9 z" fill="#38bdf8" />
                  </marker>
                </defs>

                {/* Base Blueprint Background */}
                <rect width="1000" height="700" fill="#090e17" />
                <rect width="1000" height="700" fill="url(#blueprint-grid)" />

                {/* ============================================================== */}
                {/* ARCHITECTURAL ZONES / WALL BOUNDARIES                         */}
                {/* ============================================================== */}
                {/* External Branch Perimeter Walls */}
                <rect
                  x="40"
                  y="40"
                  width="920"
                  height="620"
                  rx="6"
                  fill="none"
                  stroke="#334155"
                  strokeWidth="4"
                />

                {/* ZONE 1: Entrance Vestibule & Metal Detector Gate */}
                <g className="zone-entrance">
                  <rect
                    x="50"
                    y="240"
                    width="180"
                    height="240"
                    fill="rgba(15, 23, 42, 0.75)"
                    stroke="#1e293b"
                    strokeWidth="2"
                  />
                  {/* Metal Detector Gate graphic */}
                  <line x1="80" y1="330" x2="80" y2="390" stroke="#0ea5e9" strokeWidth="4" strokeDasharray="3 3" />
                  <line x1="100" y1="330" x2="100" y2="390" stroke="#0ea5e9" strokeWidth="4" strokeDasharray="3 3" />
                  {showZoneNames && (
                    <text x="140" y="270" textAnchor="middle" fill="#64748b" fontSize="12" fontWeight="600">
                      MAIN ENTRANCE
                    </text>
                  )}
                </g>

                {/* ZONE 2: 24/7 ATM Vestibule */}
                <g className="zone-atm">
                  <rect
                    x="50"
                    y="50"
                    width="180"
                    height="180"
                    fill="rgba(15, 23, 42, 0.75)"
                    stroke="#1e293b"
                    strokeWidth="2"
                  />
                  {/* ATM Kiosks */}
                  <rect x="70" y="70" width="35" height="25" fill="#1e293b" stroke="#475569" strokeWidth="1" />
                  <rect x="120" y="70" width="35" height="25" fill="#1e293b" stroke="#475569" strokeWidth="1" />
                  {showZoneNames && (
                    <text x="140" y="140" textAnchor="middle" fill="#64748b" fontSize="12" fontWeight="600">
                      24/7 ATM LOBBY
                    </text>
                  )}
                </g>

                {/* ZONE 3: Central Customer Banking Hall */}
                <g className="zone-hall">
                  <rect
                    x="240"
                    y="180"
                    width="260"
                    height="360"
                    fill="rgba(15, 23, 42, 0.55)"
                    stroke="#1e293b"
                    strokeWidth="2"
                  />
                  {/* Waiting Sofa Layout */}
                  <rect x="290" y="320" width="100" height="20" rx="3" fill="#1e293b" stroke="#334155" strokeWidth="1" />
                  <rect x="290" y="360" width="100" height="20" rx="3" fill="#1e293b" stroke="#334155" strokeWidth="1" />
                  {showZoneNames && (
                    <text x="370" y="220" textAnchor="middle" fill="#64748b" fontSize="12" fontWeight="600">
                      BANKING HALL / LOUNGE
                    </text>
                  )}
                </g>

                {/* ZONE 4: Cashier & Teller Counter Cages */}
                <g className="zone-teller">
                  <rect
                    x="510"
                    y="180"
                    width="180"
                    height="220"
                    fill="rgba(15, 23, 42, 0.75)"
                    stroke="#3b82f6"
                    strokeWidth="1.5"
                    strokeDasharray="4 2"
                  />
                  {/* Teller Counters */}
                  <line x1="520" y1="230" x2="680" y2="230" stroke="#475569" strokeWidth="3" />
                  <line x1="520" y1="280" x2="680" y2="280" stroke="#475569" strokeWidth="3" />
                  <line x1="520" y1="330" x2="680" y2="330" stroke="#475569" strokeWidth="3" />
                  {showZoneNames && (
                    <text x="600" y="210" textAnchor="middle" fill="#93c5fd" fontSize="12" fontWeight="600">
                      CASH & TELLER COUNTERS
                    </text>
                  )}
                </g>

                {/* ZONE 5: Vault Corridor & Security Mantrap */}
                <g className="zone-corridor">
                  <rect
                    x="700"
                    y="320"
                    width="110"
                    height="220"
                    fill="rgba(30, 41, 59, 0.6)"
                    stroke="#f59e0b"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />
                  {/* Mantrap Double Door */}
                  <line x1="700" y1="400" x2="720" y2="400" stroke="#ef4444" strokeWidth="3" />
                  <line x1="790" y1="400" x2="810" y2="400" stroke="#ef4444" strokeWidth="3" />
                  {showZoneNames && (
                    <text x="755" y="350" textAnchor="middle" fill="#fcd34d" fontSize="11" fontWeight="600">
                      CORRIDOR
                    </text>
                  )}
                </g>

                {/* ZONE 6: Strong Room & Main Vault */}
                <g className="zone-vault">
                  <rect
                    x="820"
                    y="320"
                    width="130"
                    height="220"
                    fill="rgba(220, 38, 38, 0.12)"
                    stroke="#ef4444"
                    strokeWidth="3"
                  />
                  {/* Heavy Steel Vault Door Circle */}
                  <circle cx="840" cy="430" r="16" fill="#1e293b" stroke="#ef4444" strokeWidth="2.5" />
                  <rect x="870" y="350" width="60" height="70" fill="#0f172a" stroke="#475569" strokeWidth="1" />
                  {showZoneNames && (
                    <text x="885" y="345" textAnchor="middle" fill="#fca5a5" fontSize="12" fontWeight="700">
                      STRONG ROOM VAULT
                    </text>
                  )}
                </g>

                {/* ZONE 7: Branch Manager Cabin */}
                <g className="zone-manager">
                  <rect
                    x="510"
                    y="420"
                    width="180"
                    height="230"
                    fill="rgba(15, 23, 42, 0.75)"
                    stroke="#1e293b"
                    strokeWidth="2"
                  />
                  {showZoneNames && (
                    <text x="600" y="540" textAnchor="middle" fill="#64748b" fontSize="12" fontWeight="600">
                      MANAGER CABIN
                    </text>
                  )}
                </g>

                {/* ZONE 8: IT & Server Room */}
                <g className="zone-server">
                  <rect
                    x="700"
                    y="50"
                    width="250"
                    height="250"
                    fill="rgba(15, 23, 42, 0.75)"
                    stroke="#1e293b"
                    strokeWidth="2"
                  />
                  {/* Server Racks */}
                  <rect x="740" y="80" width="50" height="25" fill="#1e293b" stroke="#10b981" strokeWidth="1" />
                  <rect x="810" y="80" width="50" height="25" fill="#1e293b" stroke="#10b981" strokeWidth="1" />
                  {showZoneNames && (
                    <text x="825" y="160" textAnchor="middle" fill="#6ee7b7" fontSize="12" fontWeight="600">
                      SERVER & UPS ROOM
                    </text>
                  )}
                </g>

                {/* ZONE 9: Rear Emergency Exit */}
                <g className="zone-exit">
                  <rect
                    x="240"
                    y="550"
                    width="260"
                    height="100"
                    fill="rgba(15, 23, 42, 0.75)"
                    stroke="#1e293b"
                    strokeWidth="2"
                  />
                  {showZoneNames && (
                    <text x="370" y="605" textAnchor="middle" fill="#64748b" fontSize="12" fontWeight="600">
                      REAR EMERGENCY EXIT
                    </text>
                  )}
                </g>

                {/* ============================================================== */}
                {/* ALL BRANCH CAMERAS & FOV CONES                                 */}
                {/* ============================================================== */}
                {allCameras.map((cam) => {
                  const cx = cam.coordinates.x * 10;
                  const cy = cam.coordinates.y * 7;
                  const isHovered = hoveredCameraId === cam.cameraId;
                  const isVisited = visibleWaypoints.some((w) => w.cameraId === cam.cameraId);

                  // Calculate FOV cone polygon
                  const angleRad = (cam.angleDegrees * Math.PI) / 180;
                  const halfFovRad = ((cam.fovDegrees / 2) * Math.PI) / 180;
                  const reach = 85;

                  const p1X = cx + Math.cos(angleRad - halfFovRad) * reach;
                  const p1Y = cy + Math.sin(angleRad - halfFovRad) * reach;
                  const p2X = cx + Math.cos(angleRad + halfFovRad) * reach;
                  const p2Y = cy + Math.sin(angleRad + halfFovRad) * reach;

                  return (
                    <g
                      key={cam.cameraId}
                      className="cursor-pointer transition-opacity"
                      onMouseEnter={() => setHoveredCameraId(cam.cameraId)}
                      onMouseLeave={() => setHoveredCameraId(null)}
                    >
                      {/* FOV Light Cone */}
                      {showFovCones && (
                        <polygon
                          points={`${cx},${cy} ${p1X},${p1Y} ${p2X},${p2Y}`}
                          fill={isVisited ? "rgba(6, 182, 212, 0.16)" : "rgba(100, 116, 139, 0.08)"}
                          stroke={isVisited ? "rgba(6, 182, 212, 0.4)" : "rgba(100, 116, 139, 0.15)"}
                          strokeWidth="1"
                        />
                      )}

                      {/* Camera Base Circle */}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isHovered ? 15 : 12}
                        fill={isVisited ? "#0891b2" : "#1e293b"}
                        stroke={isVisited ? "#22d3ee" : "#475569"}
                        strokeWidth={isVisited ? "2.5" : "1.5"}
                        className="transition-all"
                      />

                      {/* Direction Pointer */}
                      <line
                        x1={cx}
                        y1={cy}
                        x2={cx + Math.cos(angleRad) * 16}
                        y2={cy + Math.sin(angleRad) * 16}
                        stroke={isVisited ? "#a5f3fc" : "#94a3b8"}
                        strokeWidth="2"
                      />

                      {/* Camera Label */}
                      <text
                        x={cx}
                        y={cy - 16}
                        textAnchor="middle"
                        fill={isVisited ? "#38bdf8" : "#94a3b8"}
                        fontSize="10"
                        fontWeight="bold"
                        fontFamily="ui-monospace, monospace"
                      >
                        {cam.cameraName.split(" ")[0]}
                      </text>
                    </g>
                  );
                })}

                {/* ============================================================== */}
                {/* ANIMATED GLOWING BREADCRUMB TRAIL                              */}
                {/* ============================================================== */}
                {trailSvgPath && (
                  <>
                    {/* Outer Glow Path */}
                    <path
                      d={trailSvgPath}
                      fill="none"
                      stroke="rgba(6, 182, 212, 0.35)"
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      filter="url(#glow)"
                    />
                    {/* Core Breadcrumb Path with Animated Dashflow */}
                    <path
                      d={trailSvgPath}
                      fill="none"
                      stroke="url(#trailGradient)"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray="10 6"
                      className="animate-pulse"
                      markerEnd="url(#trail-arrow)"
                    />
                  </>
                )}

                {/* Direction chevrons along segments */}
                {visibleSegments.map((seg, sIdx) => {
                  const midX = ((seg.fromCoordinates.x + seg.toCoordinates.x) / 2) * 10;
                  const midY = ((seg.fromCoordinates.y + seg.toCoordinates.y) / 2) * 7;
                  return (
                    <g key={`seg-tag-${sIdx}`}>
                      <rect
                        x={midX - 26}
                        y={midY - 11}
                        width="52"
                        height="20"
                        rx="4"
                        fill="rgba(15, 23, 42, 0.9)"
                        stroke="#0ea5e9"
                        strokeWidth="1"
                      />
                      <text
                        x={midX}
                        y={midY + 3}
                        textAnchor="middle"
                        fill="#38bdf8"
                        fontSize="9"
                        fontWeight="bold"
                        fontFamily="ui-monospace, monospace"
                      >
                        {seg.transitDurationSeconds}s
                      </text>
                    </g>
                  );
                })}

                {/* ============================================================== */}
                {/* WAYPOINT PINS & RADAR PING AT TARGET LOCATION                 */}
                {/* ============================================================== */}
                {visibleWaypoints.map((wp) => {
                  const wx = wp.coordinates.x * 10;
                  const wy = wp.coordinates.y * 7;
                  const isSelected = selectedWaypoint?.stepIndex === wp.stepIndex;
                  const isCurrent = wp.isCurrentLocation && activeStepIndex === waypoints.length;

                  return (
                    <g
                      key={`wp-${wp.stepIndex}`}
                      className="cursor-pointer"
                      onClick={() => {
                        setSelectedWaypoint(wp);
                        if (onSelectWaypoint) onSelectWaypoint(wp);
                      }}
                    >
                      {/* Active Target Radar Pulsing Waves */}
                      {isCurrent && (
                        <>
                          <circle cx={wx} cy={wy} r="35" fill="none" stroke="#ef4444" strokeWidth="1.5" className="animate-ping" opacity="0.6" />
                          <circle cx={wx} cy={wy} r="25" fill="none" stroke="#f59e0b" strokeWidth="2" className="animate-pulse" opacity="0.8" />
                        </>
                      )}

                      {/* Waypoint Marker Pin */}
                      <circle
                        cx={wx}
                        cy={wy}
                        r={isSelected ? 18 : 14}
                        fill={isCurrent ? "#dc2626" : isSelected ? "#0284c7" : "#0f172a"}
                        stroke={isCurrent ? "#fca5a5" : isSelected ? "#38bdf8" : "#0ea5e9"}
                        strokeWidth="3"
                        className="transition-all"
                      />

                      {/* Step Number in Waypoint Pin */}
                      <text
                        x={wx}
                        y={wy + 4}
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize={isSelected ? "13" : "11"}
                        fontWeight="bold"
                        fontFamily="sans-serif"
                      >
                        {wp.stepIndex}
                      </text>

                      {/* Dwell Time Badge above waypoint */}
                      <g transform={`translate(${wx}, ${wy + 24})`}>
                        <rect
                          x="-32"
                          y="0"
                          width="64"
                          height="16"
                          rx="4"
                          fill="rgba(15, 23, 42, 0.95)"
                          stroke="#334155"
                          strokeWidth="1"
                        />
                        <text
                          x="0"
                          y="11"
                          textAnchor="middle"
                          fill="#e2e8f0"
                          fontSize="9"
                          fontWeight="600"
                        >
                          {wp.dwellSeconds}s dwell
                        </text>
                      </g>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* Bottom Interactive Playback & Scrubber Controls */}
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              {/* Play / Step Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-1.5 font-bold text-white shadow-md shadow-cyan-500/20 hover:bg-cyan-400 transition"
                >
                  {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                  {isPlaying ? "Pause Trail" : "Play Suspect Journey"}
                </button>

                <button
                  onClick={() => handleStepChange(activeStepIndex - 1)}
                  disabled={activeStepIndex <= 1}
                  className="rounded-lg border border-slate-800 bg-slate-850 p-1.5 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                  title="Previous Step"
                >
                  <SkipBack size={14} />
                </button>

                <button
                  onClick={() => handleStepChange(activeStepIndex + 1)}
                  disabled={activeStepIndex >= waypoints.length}
                  className="rounded-lg border border-slate-800 bg-slate-850 p-1.5 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                  title="Next Step"
                >
                  <SkipForward size={14} />
                </button>

                <button
                  onClick={() => handleStepChange(1)}
                  className="rounded-lg border border-slate-800 bg-slate-850 p-1.5 text-slate-300 hover:bg-slate-800"
                  title="Reset to Start"
                >
                  <RotateCcw size={14} />
                </button>

                {/* Speed Multiplier */}
                <div className="flex items-center rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-[11px]">
                  {[1, 2, 4].map((spd) => (
                    <button
                      key={spd}
                      onClick={() => setPlaybackSpeed(spd)}
                      className={`rounded px-2 py-0.5 font-medium transition ${
                        playbackSpeed === spd ? "bg-cyan-500 text-white" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Waypoint Chronology Status */}
              <div className="flex items-center gap-2 font-mono text-[11px] text-slate-300">
                <span className="text-cyan-400 font-bold">Step {activeStepIndex}</span>
                <span>of</span>
                <span>{waypoints.length}</span>
                <span className="text-slate-500">|</span>
                <span>{currentWaypoint?.cameraName}</span>
                <span className="text-slate-500">({currentWaypoint ? new Date(currentWaypoint.enteredAt).toLocaleTimeString() : ""})</span>
              </div>
            </div>

            {/* Scrubber Range Slider */}
            <div className="relative w-full">
              <input
                type="range"
                min="1"
                max={Math.max(1, waypoints.length)}
                value={activeStepIndex}
                onChange={(e) => handleStepChange(parseInt(e.target.value, 10))}
                className="w-full accent-cyan-400 cursor-pointer h-2 bg-slate-950 rounded-lg appearance-none"
              />
              <div className="mt-1 flex justify-between text-[10px] font-mono text-slate-500">
                <span>Start: {waypoints[0]?.cameraName || "Origin"}</span>
                <span>Latest: {waypoints[waypoints.length - 1]?.cameraName || "Destination"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Waypoint Inspector & Appearance Signature Card (Span 1 col) */}
        <div className="flex flex-col gap-5 lg:col-span-1">
          {/* Waypoint Details Card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl backdrop-blur-md">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Waypoint Inspector</span>
              {selectedWaypoint && (
                <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-[11px] font-bold text-cyan-300">
                  Step #{selectedWaypoint.stepIndex}
                </span>
              )}
            </h3>

            {selectedWaypoint ? (
              <div className="mt-4 space-y-4">
                {/* Snapshot Thumbnail Crop */}
                <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-950 flex items-center justify-center">
                  {selectedWaypoint.snapshotUrl ? (
                    <img
                      src={selectedWaypoint.snapshotUrl}
                      alt={selectedWaypoint.cameraName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center p-4 text-center">
                      <Camera size={28} className="text-slate-600 mb-1" />
                      <span className="text-xs text-slate-400 font-medium">{selectedWaypoint.cameraName}</span>
                      <span className="text-[10px] text-slate-500">AI Tracklet Crop Bounding Box</span>
                    </div>
                  )}
                  <span className="absolute bottom-2 left-2 rounded bg-slate-950/80 px-2 py-0.5 text-[10px] font-mono text-cyan-300 backdrop-blur-sm">
                    {(selectedWaypoint.confidence * 100).toFixed(1)}% Match
                  </span>
                </div>

                {/* Camera & Zone Information */}
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                    <span className="text-slate-400">Camera</span>
                    <span className="font-semibold text-white">{selectedWaypoint.cameraName}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                    <span className="text-slate-400">Zone</span>
                    <span className="font-semibold text-cyan-300">{selectedWaypoint.zoneName}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                    <span className="text-slate-400">Entered At</span>
                    <span className="font-mono text-slate-300">
                      {new Date(selectedWaypoint.enteredAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                    <span className="text-slate-400">Exited At</span>
                    <span className="font-mono text-slate-300">
                      {new Date(selectedWaypoint.exitedAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                    <span className="text-slate-400">Dwell Duration</span>
                    <span className="font-bold text-amber-300">{selectedWaypoint.dwellSeconds}s</span>
                  </div>
                  {selectedWaypoint.transitFromPreviousSeconds !== undefined && (
                    <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                      <span className="text-slate-400">Transit Duration</span>
                      <span className="font-mono text-slate-300">
                        {selectedWaypoint.transitFromPreviousSeconds}s
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-4 p-4 text-center text-xs text-slate-500">
                Click any waypoint marker on the floor plan to inspect the camera capture.
              </div>
            )}
          </div>

          {/* Target Appearance Embeddings Profile Card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl backdrop-blur-md">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Sparkles size={14} className="text-cyan-400" />
              <span>Appearance Signature</span>
            </h3>
            <p className="mt-1 text-[11px] text-slate-500">
              Extracted 512-d embeddings (clothing colors & silhouette) tracking target even with occluded face.
            </p>

            <div className="mt-4 space-y-3">
              {/* Upper Body Clothing */}
              <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3">
                <div className="text-[11px] font-medium text-slate-400">Upper Body Garment</div>
                <div className="mt-1 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-4 w-4 rounded-full border border-slate-700 shadow-sm"
                      style={{ backgroundColor: routeMap.overallAppearance?.upperBody.hexColor || "#1e3a8a" }}
                    />
                    <span className="text-xs font-bold text-white">
                      {routeMap.overallAppearance?.upperBody.colorName || "Navy Blue"}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">
                    {routeMap.overallAppearance?.upperBody.hexColor}
                  </span>
                </div>
              </div>

              {/* Lower Body Clothing */}
              <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3">
                <div className="text-[11px] font-medium text-slate-400">Lower Body Trousers</div>
                <div className="mt-1 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-4 w-4 rounded-full border border-slate-700 shadow-sm"
                      style={{ backgroundColor: routeMap.overallAppearance?.lowerBody.hexColor || "#1e293b" }}
                    />
                    <span className="text-xs font-bold text-white">
                      {routeMap.overallAppearance?.lowerBody.colorName || "Dark Charcoal"}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">
                    {routeMap.overallAppearance?.lowerBody.hexColor}
                  </span>
                </div>
              </div>

              {/* Body Build Silhouette */}
              <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3">
                <div className="text-[11px] font-medium text-slate-400">Body Build / Aspect Ratio</div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-xs font-semibold capitalize text-emerald-400">
                    {routeMap.overallAppearance?.bodyBuild.silhouetteType || "Medium"} Build
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    Ratio {routeMap.overallAppearance?.bodyBuild.heightToWidthRatio || 2.4}:1
                  </span>
                </div>
              </div>

              {/* Summary Description */}
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-3 text-xs text-cyan-200">
                <div className="font-semibold text-cyan-400 mb-0.5">Automated Description:</div>
                <p className="text-[11px] leading-relaxed text-slate-300">
                  {routeMap.overallAppearance?.clothingDescription || "Target detected with dark clothing and athletic posture."}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
