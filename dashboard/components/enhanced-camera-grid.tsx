"use client";

import { useCallback, useEffect, useState, useRef, useMemo } from "react";
import {
  Grid2X2,
  Grid3X3,
  Maximize,
  Save,
  Settings,
  Square,
  Layout,
  Plus,
  Monitor,
  Layers,
  Zap,
  RotateCw,
} from "lucide-react";
import { CameraTile } from "./camera-tile";
import {
  DECODER_CAPACITY_OPTIONS,
  clampDecoderLimit,
  getDecoderCapacityOptions,
} from "./enhanced-camera-grid-model";
import { useDecoderBudgetManager } from "./decoderBudgetManager";
import { useMediaOrchestrator } from "@/hooks/use-media-orchestrator";
import { VisibilityTracker } from "./visibility-tracker";
import { TileStateIndicator } from "./tile-state-indicator";
import type { Camera, LiveSessionResponse, RecordingJob, RecordingMode } from "@/lib/types";
import type { TileStreamState, PresentationMode } from "@/lib/media-types";
import { startLiveFromBrowser } from "@/lib/live-client";
import { StreamSchedulerProvider, useStreamScheduler } from "./stream-scheduler";

export type GridSize = "1x1" | "2x2" | "3x3" | "4x4" | "5x5" | "6x6" | "7x7" | "8x8" | "9x9" | "10x10" | "11x11" | "12x12";

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

export interface EnhancedCameraGridProps {
  cameras: Camera[];
  onLayoutChange?: (layout: GridLayout) => void;
  initialLayout?: GridLayout;
  enableVirtualScrolling?: boolean;
  enableGPUAcceleration?: boolean;
  adaptiveLayout?: boolean;
  maxConcurrentStreams?: number;
  priorityCameraIds?: string[];
  onActiveStreamsChange?: (count: number) => void;
  onMonitoredCamerasChange?: (cameraIds: string[]) => void;
  presentationMode?: PresentationMode;
  userId?: string;
  tenantId?: string;
}

interface VisibleRange {
  start: number;
  end: number;
}

export function EnhancedCameraGrid({
  cameras,
  onLayoutChange,
  initialLayout,
  enableVirtualScrolling = true,
  enableGPUAcceleration = true,
  adaptiveLayout = false,
  maxConcurrentStreams = 36,
  priorityCameraIds = [],
  onActiveStreamsChange,
  onMonitoredCamerasChange,
  presentationMode = "LIVE_MONITORING",
  userId = "default-user",
  tenantId = "default-tenant",
}: EnhancedCameraGridProps) {
  const [gridSize, setGridSize] = useState<GridSize>(
    initialLayout?.gridSize || "2x2"
  );

  // Initialize media orchestrator
  const mediaOrchestrator = useMediaOrchestrator({
    userId,
    tenantId,
    autoRegisterClient: true,
    heartbeatIntervalMs: 30_000,
  });

  const {
    tileStates,
    platformMetrics,
    workstationMetrics,
    requestSession,
    closeSession,
    updateStreamState,
    setTileVisibility,
  } = mediaOrchestrator;

  const [gridPositions, setGridPositions] = useState<
    Map<number, { camera: Camera; stream: "main" | "sub"; priority?: number }>
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
  const [visibleRange, setVisibleRange] = useState<VisibleRange>({ start: 0, end: 50 });
  const [sequencing, setSequencing] = useState(true);
  const [sequenceOffset, setSequenceOffset] = useState(0);
  const [draggedCamera, setDraggedCamera] = useState<{ camera: Camera; fromPosition: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const autoAttempted = useRef(new Set<string>());
  const initialLayoutApplied = useRef(false);

  // Track which cameras have orchestrator-managed sessions
  const orchestratorSessions = useMemo(() => {
    const map = new Map<string, boolean>();
    tileStates.forEach((state, cameraId) => {
      if (state.session) {
        map.set(cameraId, true);
      }
    });
    return map;
  }, [tileStates]);

  const gridSizeMap = {
    "1x1": 1,
    "2x2": 4,
    "3x3": 9,
    "4x4": 16,
    "5x5": 25,
    "6x6": 36,
    "7x7": 49,
    "8x8": 64,
    "9x9": 81,
    "10x10": 100,
    "11x11": 121,
    "12x12": 144,
  };

  const totalPositions = gridSizeMap[gridSize];
  const prioritySet = useMemo(() => new Set(priorityCameraIds), [priorityCameraIds]);
  const decoderCapacityOptions = useMemo(
    () => getDecoderCapacityOptions(maxConcurrentStreams),
    [maxConcurrentStreams],
  );

  // Use the DecoderBudgetManager hook (dynamic budget based on hardware/GPU and maxConcurrentStreams)
  const {
    decoderBudget,
    decoderLimit,
    setUserPreference: setDecoderPreference,
    setActiveCount,
  } = useDecoderBudgetManager({ maxConcurrentStreams, enableGPUAcceleration });

  useEffect(() => {
    // keep the budget aware of current active sessions
    setActiveCount(sessions.size);
  }, [sessions.size, setActiveCount]);

  useEffect(() => onActiveStreamsChange?.(sessions.size), [onActiveStreamsChange, sessions.size]);

  useEffect(() => {
    onMonitoredCamerasChange?.(
      [...gridPositions.values()].map((entry) => entry.camera.id).sort(),
    );
  }, [gridPositions, onMonitoredCamerasChange]);

  useEffect(() => {
    if (!sequencing || gridPositions.size <= decoderLimit) return;
    const timer = window.setInterval(() => setSequenceOffset((current) => current + decoderLimit), 15_000);
    return () => window.clearInterval(timer);
  }, [decoderLimit, gridPositions.size, sequencing]);

  // GPU acceleration classes
  const gpuAccelClass = enableGPUAcceleration ? "gpu-accelerated" : "";

  // Calculate visible range for virtual scrolling
  useEffect(() => {
    if (!enableVirtualScrolling || totalPositions <= 36) {
      setVisibleRange({ start: 0, end: totalPositions });
      return;
    }

    const updateVisibleRange = () => {
      if (!containerRef.current) return;

      const container = containerRef.current;
      const scrollTop = container.scrollTop;
      const clientHeight = container.clientHeight;

      // Calculate approximate tile height based on grid size
      const cols = parseInt(gridSize.split("x")[0]);
      const tileWidth = container.clientWidth / cols;
      const tileHeight = tileWidth * (9 / 16); // 16:9 aspect ratio

      const startIndex = Math.floor(scrollTop / tileHeight) * cols;
      const endIndex = Math.ceil((scrollTop + clientHeight) / tileHeight) * cols;

      // Add buffer for smooth scrolling
      const buffer = cols * 2;
      setVisibleRange({
        start: Math.max(0, startIndex - buffer),
        end: Math.min(totalPositions, endIndex + buffer),
      });
    };

    updateVisibleRange();
    const container = containerRef.current;
    if (container) {
      container.addEventListener("scroll", updateVisibleRange);
      window.addEventListener("resize", updateVisibleRange);
    }

    return () => {
      if (container) {
        container.removeEventListener("scroll", updateVisibleRange);
      }
      window.removeEventListener("resize", updateVisibleRange);
    };
  }, [gridSize, totalPositions, enableVirtualScrolling]);

  // Load saved layouts
  useEffect(() => {
    loadSavedLayouts();
  }, []);

  // Initialize from saved layout
  useEffect(() => {
    if (initialLayout && cameras.length > 0 && !initialLayoutApplied.current) {
      const posMap = new Map();
      initialLayout.positions.forEach((pos) => {
        const camera = cameras.find((c) => c.id === pos.cameraId);
        if (camera) {
          posMap.set(pos.position, { camera, stream: pos.stream, priority: 0 });
        }
      });
      setGridPositions(posMap);
      initialLayoutApplied.current = true;
    }
  }, [initialLayout, cameras]);

  // Adaptive layout: prioritize cameras with alerts
  useEffect(() => {
    if (!adaptiveLayout) return;

    const updatePriorities = () => {
      const newPositions = new Map(gridPositions);
      let changed = false;

      // Sort cameras by priority (status: offline > alerts > normal)
      const sortedEntries = Array.from(newPositions.entries()).sort((a, b) => {
        const priorityA = a[1].camera.status === "offline" ? 3 : 
                         a[1].camera.status === "alert" ? 2 : 1;
        const priorityB = b[1].camera.status === "offline" ? 3 : 
                         b[1].camera.status === "alert" ? 2 : 1;
        return priorityB - priorityA;
      });

      // Reassign positions based on priority
      sortedEntries.forEach(([_, entry], index) => {
        if (index < totalPositions) {
          const currentEntry = newPositions.get(index);
          if (!currentEntry || currentEntry.camera.id !== entry.camera.id) {
            newPositions.set(index, { ...entry, priority: index });
            changed = true;
          }
        }
      });

      if (changed) {
        setGridPositions(newPositions);
      }
    };

    const interval = setInterval(updatePriorities, 5000);
    return () => clearInterval(interval);
  }, [adaptiveLayout, gridPositions, totalPositions]);

  const handleGridSizeChange = (newSize: GridSize) => {
    const newTotalPositions = gridSizeMap[newSize];
    const currentPositions = new Map(gridPositions);

    // Remove positions that exceed new grid size
    for (const [position] of currentPositions) {
      if (position >= newTotalPositions) {
        currentPositions.delete(position);
      }
    }

    const dense = newTotalPositions > 16;
    for (let position = 0; position < Math.min(newTotalPositions, cameras.length); position += 1) {
      const existing = currentPositions.get(position);
      if (existing) {
        if (dense) currentPositions.set(position, { ...existing, stream: "sub" });
        continue;
      }
      const camera = cameras[position];
      if (camera) currentPositions.set(position, { camera, stream: dense ? "sub" : "main", priority: 0 });
    }

    setGridSize(newSize);
    setGridPositions(currentPositions);
  };

  const handleCameraAssign = (position: number, camera: Camera | null) => {
    const newPositions = new Map(gridPositions);
    if (camera) {
      newPositions.set(position, { camera, stream: "main", priority: 0 });
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
        priority: entry.priority,
      });
      setGridPositions(newPositions);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (position: number, camera: Camera) => {
    setDraggedCamera({ camera, fromPosition: position });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (toPosition: number) => {
    if (!draggedCamera) return;

    const newPositions = new Map(gridPositions);
    const fromEntry = newPositions.get(draggedCamera.fromPosition);
    const toEntry = newPositions.get(toPosition);

    if (fromEntry) {
      // Swap positions
      if (toEntry) {
        newPositions.set(draggedCamera.fromPosition, toEntry);
        newPositions.set(toPosition, fromEntry);
      } else {
        newPositions.delete(draggedCamera.fromPosition);
        newPositions.set(toPosition, fromEntry);
      }
      setGridPositions(newPositions);
    }

    setDraggedCamera(null);
  };

  const handleStartLive = useCallback(async (cameraId: string, stream: "main" | "sub" = "sub") => {
    if (sessions.has(cameraId) || loading.has(cameraId) || sessions.size + loading.size >= decoderLimit) return;
    setLoading((prev) => new Set(prev).add(cameraId));

    try {
      // Use media orchestrator for session management
      const camera = cameras.find(c => c.id === cameraId);
      const branchId = camera?.branchId || "unknown";

      // Update state to connecting
      updateStreamState(cameraId, "CONNECTING");

      // Determine purpose based on presentation mode
      const purpose = presentationMode === "INVESTIGATION" ? "INVESTIGATION" : "MONITORING";
      const quality = stream === "main" ? "MAINSTREAM" : "SUBSTREAM";

      const result = await requestSession(cameraId, branchId, {
        purpose,
        preferredQuality: quality,
        priority: priorityCameraIds.includes(cameraId) ? 800 : 0,
      });

      if (result.session) {
        // Use traditional live client for actual streaming
        const session = await startLiveFromBrowser(cameraId, stream);
        setSessions((prev) => new Map(prev).set(cameraId, session));

        // Update stream state based on quality
        const streamState: TileStreamState = stream === "main" 
          ? "LIVE_MAINSTREAM" 
          : "LIVE_SUBSTREAM";
        updateStreamState(cameraId, streamState);
      } else {
        updateStreamState(cameraId, "ERROR", result.reason);
      }
    } catch (error) {
      console.error("Live session error:", error);
      updateStreamState(cameraId, "ERROR", error instanceof Error ? error.message : "Unknown error");
    } finally {
      setLoading((prev) => {
        const newSet = new Set(prev);
        newSet.delete(cameraId);
        return newSet;
      });
    }
  }, [decoderLimit, loading, sessions, cameras, requestSession, updateStreamState, presentationMode, priorityCameraIds]);

  // Only visible slots own browser decoders. Dense walls start substreams first
  // and cap concurrent sessions even when the saved layout contains 144 slots.
  // Scheduling is delegated to StreamSchedulerProvider below. The provider will invoke onStartStream
  // which is implemented by handleStartLive. This avoids each tile starting decoders independently and
  // centralizes sequencing/priority decisions in one place.

  const handleToggleRecording = async (cameraId: string) => {
    const camera = cameras.find((item) => item.id === cameraId);
    const recorderBacked = Boolean(camera?.recorderId) || camera?.sourceType === "analog-dvr-channel" ||
      camera?.sourceType === "nvr-channel";
    const currentJob = recordings.get(cameraId) ?? {
      cameraId,
      mode: "continuous" as const,
      enabled: false,
      status: "disabled" as const,
      primaryRecordingStorage: recorderBacked ? "recorder-local" as const : "sentinel-local" as const,
      cloudArchivePolicy: recorderBacked ? "incident-evidence-only" as const : "none" as const,
      retentionDays: 180,
      postRollSeconds: 30,
      segmentDurationSeconds: 60,
      hotRetentionDays: 30,
      warmRetentionDays: 60,
      coldRetentionDays: 90,
      critical: false,
      backupRequired: false,
      automaticDeletionEnabled: true,
      evidenceProtection: true,
      recordMainStream: true,
      preRollSeconds: 30,
      minMotionDurationSeconds: 0,
      motionConfidenceThreshold: 0,
      cooldownSeconds: 60,
      maxEventDurationSeconds: 0,
    };
    const {
      cameraId: _cameraId,
      id: _id,
      status: _status,
      ...payload
    } = currentJob;
    const update = {
      ...payload,
      enabled: !currentJob.enabled,
    };

    try {
      const response = await fetch(`/api/recording/${cameraId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(update),
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
    const currentJob = recordings.get(cameraId);
    const update: Record<string, unknown> = {
      mode,
      enabled: currentJob?.enabled ?? false,
      preRollSeconds: currentJob?.preRollSeconds ?? 30,
      postRollSeconds: currentJob?.postRollSeconds ?? 30,
      minMotionDurationSeconds: currentJob?.minMotionDurationSeconds ?? 0,
      motionConfidenceThreshold: currentJob?.motionConfidenceThreshold ?? 0,
      cooldownSeconds: currentJob?.cooldownSeconds ?? 60,
      maxEventDurationSeconds: currentJob?.maxEventDurationSeconds ?? 0,
      triggerEventTypes: currentJob?.triggerEventTypes,
    };

    if (mode === "scheduled") {
      update.schedule = currentJob?.schedule ?? { days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00", timezone: "UTC" };
    }

    try {
      const response = await fetch(`/api/recording/${cameraId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(update),
      });

      if (response.ok) {
        const job = await response.json();
        setRecordings((prev) => new Map(prev).set(cameraId, job));
      }
    } catch (error) {
      console.error("Recording mode change error:", error);
    }
  };

  const handleUpdateRecording = async (cameraId: string, update: Partial<Omit<RecordingJob, "id" | "cameraId" | "status">>) => {
    try {
      const response = await fetch(`/api/recording/${cameraId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(update),
      });

      if (response.ok) {
        const job = await response.json();
        setRecordings((prev) => new Map(prev).set(cameraId, job));
      }
    } catch (error) {
      console.error("Recording update error:", error);
    }
  };

  const loadSavedLayouts = async () => {
    try {
      const response = await fetch("/api/control/v1/video-wall/layouts", {
        credentials: "include",
      });
      if (response.ok) {
        const body = await response.json();
        setSavedLayouts((body.data ?? []).map((layout: GridLayout & { cameraPositions?: GridLayout["positions"] }) => ({
          ...layout,
          positions: layout.positions ?? layout.cameraPositions ?? [],
        })));
      }
    } catch (error) {
      console.error("Failed to load layouts:", error);
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
      const response = await fetch("/api/control/v1/video-wall/layouts", {
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
        const savedLayout = await response.json() as GridLayout & {
          cameraPositions?: GridLayout["positions"];
        };
        setSavedLayouts((prev) => [...prev, {
          ...savedLayout,
          positions: savedLayout.positions ?? savedLayout.cameraPositions ?? [],
        }]);
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
        posMap.set(pos.position, { camera, stream: pos.stream, priority: 0 });
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
    "7x7": "grid-cols-7",
    "8x8": "grid-cols-8",
    "9x9": "grid-cols-9",
    "10x10": "grid-cols-10",
    "11x11": "grid-cols-11",
    "12x12": "grid-cols-12",
  };

  // Virtual scrolling: only render visible tiles
  const visibleTiles = useMemo(() => {
    if (!enableVirtualScrolling || totalPositions <= 36) {
      return Array.from({ length: totalPositions }, (_, i) => i);
    }
    return Array.from(
      { length: visibleRange.end - visibleRange.start },
      (_, i) => i + visibleRange.start
    );
  }, [enableVirtualScrolling, totalPositions, visibleRange]);

  function GridContent() {
    const scheduler = useStreamScheduler();

    useEffect(() => {
      // inform scheduler about grid positions and visible range
      const posMap = new Map<number, { cameraId: string; stream: "main" | "sub"; priority?: number }>();
      for (const [pos, entry] of gridPositions) posMap.set(pos, { cameraId: entry.camera.id, stream: entry.stream, priority: entry.priority });
      scheduler.setGridPositions(posMap);
      scheduler.setVisibleRange(visibleRange.start, visibleRange.end);
      scheduler.setPrioritySet(prioritySet);
      scheduler.setDecoderLimit(decoderLimit);
    }, [gridPositions, visibleRange, prioritySet, decoderLimit, scheduler]);

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
          <button
            className={gridSize === "7x7" ? "active" : ""}
            onClick={() => handleGridSizeChange("7x7")}
            title="49 cameras (7×7)"
          >
            7×7
          </button>
          <button
            className={gridSize === "8x8" ? "active" : ""}
            onClick={() => handleGridSizeChange("8x8")}
            title="64 cameras (8×8)"
          >
            8×8
          </button>
          <button
            className={gridSize === "9x9" ? "active" : ""}
            onClick={() => handleGridSizeChange("9x9")}
            title="81 cameras (9×9)"
          >
            9×9
          </button>
          <button
            className={gridSize === "10x10" ? "active" : ""}
            onClick={() => handleGridSizeChange("10x10")}
            title="100 cameras (10×10)"
          >
            10×10
          </button>
          <button
            className={gridSize === "11x11" ? "active" : ""}
            onClick={() => handleGridSizeChange("11x11")}
            title="121 cameras (11×11)"
          >
            11×11
          </button>
          <button
            className={gridSize === "12x12" ? "active" : ""}
            onClick={() => handleGridSizeChange("12x12")}
            title="144 cameras (12×12)"
          >
            12×12
          </button>
        </div>

        <div className="grid-actions">
          <label className="capacity-control" title="Maximum independent browser decoders on this workstation">
            Decoder capacity
            <select
              value={decoderLimit}
              disabled={decoderCapacityOptions.length === 1}
              onChange={(event) => {
                const value = clampDecoderLimit(Number(event.target.value), maxConcurrentStreams);
                setDecoderPreference(value);
              }}
            >
              {decoderCapacityOptions.map((option) => (
                <option key={option} value={option}>
                  {option} — {option === 16 ? "standard" : option === 25 ? "enhanced" : option === 36 ? "recommended" : "certified workstation"}
                </option>
              ))}
            </select>
          </label>
          <span className="capacity-control" title="Grid positions may exceed the live-stream decoder cap">
            {totalPositions} channels · {decoderLimit} live max
          </span>

          <span className="capacity-control" title="Unlimited branch/device enrollment with dynamically scalable live-monitoring capacity">
            <strong>Unlimited enrollment · Dynamic live capacity</strong>
          </span>
          
          {workstationMetrics && (
            <span className="capacity-control" title="Current workstation decoder utilization">
              Decoder Load: {workstationMetrics.decoderLoadPercent.toFixed(0)}%
            </span>
          )}

          {platformMetrics && (
            <span className="capacity-control" title="Platform-wide statistics">
              {platformMetrics.camerasCurrentlyOnline}/{platformMetrics.camerasEnrolled} cameras online · 
              {platformMetrics.activeHoMediaSessions} active sessions
            </span>
          )}
          <button
            className={`btn-secondary ${sequencing ? "active-control" : ""}`}
            onClick={() => setSequencing((current) => !current)}
            title="Rotate cameras every 15 seconds when assigned channels exceed decoder capacity"
          >
            <RotateCw size={16} />
            Sequence {sequencing ? "on" : "off"}
          </button>
          <div className="performance-indicators">
            <span className="performance-badge decoder-badge">
              {sessions.size}/{decoderLimit} live
            </span>
            {enableVirtualScrolling && totalPositions > 36 && (
              <span className="performance-badge">
                <Zap size={14} />
                Virtual Scrolling
              </span>
            )}
            {enableGPUAcceleration && (
              <span className="performance-badge">
                <Layers size={14} />
                GPU Accelerated
              </span>
            )}
            {adaptiveLayout && (
              <span className="performance-badge">
                <Monitor size={14} />
                Adaptive
              </span>
            )}
          </div>

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

      <div 
        ref={containerRef}
        className={`camera-grid ${gridColumns[gridSize]} ${gpuAccelClass}`}
        style={{
          gridTemplateRows: enableVirtualScrolling && totalPositions > 36 
            ? `repeat(${Math.ceil(totalPositions / parseInt(gridSize.split('x')[0]))}, minmax(0, 1fr))`
            : undefined
        }}
      >
        {visibleTiles.map((i) => {
          const entry = gridPositions.get(i);
          const camera = entry?.camera;

          if (!camera) {
            return (
              <div 
                key={i} 
                className="grid-empty-slot"
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(i)}
              >
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
            <VisibilityTracker
              key={i}
              cameraId={camera.id}
              onVisibilityChange={setTileVisibility}
            >
              <div 
                className="grid-camera-slot"
                data-activity-camera-id={camera.id}
                data-activity-branch-id={camera.branchId}
                data-activity-branch-name={camera.branchName}
                draggable
                onDragStart={() => handleDragStart(i, camera)}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(i)}
              >
                <div className="slot-controls">
                  <TileStateIndicator
                    streamState={tileStates.get(camera.id)?.streamState || "METADATA_ONLY"}
                    degraded={tileStates.get(camera.id)?.degraded}
                    error={tileStates.get(camera.id)?.lastError}
                    compact
                  />
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
                  onStart={() => scheduler.requestStream(camera.id, entry.stream)}
                  index={i}
                  recording={recordings.get(camera.id)}
                  recordingLoading={loading.has(camera.id)}
                  onToggleRecording={() => handleToggleRecording(camera.id)}
                  onChangeRecordingMode={(mode) => handleChangeRecordingMode(camera.id, mode)}
                  onUpdateRecording={handleUpdateRecording}
                  onBookmark={async () => {
                    // Handle bookmark
                  }}
                  onCreateIncident={async () => {
                    // Handle incident creation
                  }}
                />
              </div>
            </VisibilityTracker>
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
          flex-wrap: wrap;
          gap: 12px;
        }

        .grid-size-selector {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
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
          align-items: center;
          flex-wrap: wrap;
        }

        .capacity-control {
          display: flex;
          align-items: center;
          gap: 7px;
          color: #475569;
          font-size: 12px;
          font-weight: 700;
        }

        .capacity-control select {
          min-height: 34px;
          padding: 0 28px 0 9px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          background: #fff;
          color: #0f172a;
          font-size: 12px;
        }

        .active-control {
          border-color: #2563eb;
          background: #eff6ff;
          color: #1d4ed8;
        }

        .performance-indicators {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }

        .performance-badge {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          background: #ecfdf5;
          border: 1px solid #10b981;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 600;
          color: #047857;
        }

        .decoder-badge {
          border-color: #60a5fa;
          background: #eff6ff;
          color: #1d4ed8;
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
          max-height: 300px;
          overflow-y: auto;
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

        .gpu-accelerated {
          transform: translateZ(0);
          will-change: transform;
          backface-visibility: hidden;
        }

        .grid-cols-1 { grid-template-columns: 1fr; }
        .grid-cols-2 { grid-template-columns: repeat(2, 1fr); }
        .grid-cols-3 { grid-template-columns: repeat(3, 1fr); }
        .grid-cols-4 { grid-template-columns: repeat(4, 1fr); }
        .grid-cols-5 { grid-template-columns: repeat(5, 1fr); }
        .grid-cols-6 { grid-template-columns: repeat(6, 1fr); }
        .grid-cols-7 { grid-template-columns: repeat(7, 1fr); }
        .grid-cols-8 { grid-template-columns: repeat(8, 1fr); }
        .grid-cols-9 { grid-template-columns: repeat(9, 1fr); }
        .grid-cols-10 { grid-template-columns: repeat(10, 1fr); }
        .grid-cols-11 { grid-template-columns: repeat(11, 1fr); }
        .grid-cols-12 { grid-template-columns: repeat(12, 1fr); }

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
          transition: all 0.2s;
        }

        .grid-empty-slot:hover {
          border-color: #3b82f6;
          background: #eff6ff;
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
          cursor: move;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .grid-camera-slot:hover {
          transform: scale(1.02);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          z-index: 10;
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
  // Top-level render uses the StreamSchedulerProvider which centralizes scheduling
  return (
    <StreamSchedulerProvider onStartStream={(req) => void handleStartLive(req.cameraId, req.stream)} decoderLimitInitial={decoderLimit} sequencingInitial={sequencing}>
      <GridContent />
    </StreamSchedulerProvider>
  );
}
