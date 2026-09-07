import { memo, useCallback, useEffect, useState, useRef, useMemo, type CSSProperties } from "react";
import {
  Save,
  Settings,
  Layout,
  Plus,
  RotateCw,
} from "lucide-react";
import { CameraTile } from "./camera-tile";
import {
  clampDecoderLimit,
  createDefaultGridAssignments,
  getDecoderCapacityOptions,
} from "./enhanced-camera-grid-model";
import { useDecoderBudgetManager } from "./decoderBudgetManager";
import { useMediaOrchestrator } from "@/hooks/use-media-orchestrator";
import { VisibilityTracker } from "./visibility-tracker";
import { TileStateIndicator } from "./tile-state-indicator";
import type { AnalyticsAlert, AnalyticsRule, Camera, LiveSessionResponse } from "@/lib/types";
import type { TileStreamState, PresentationMode } from "@/lib/media-types";
import type { CameraPlaybackMode, DegradationReason } from "@/lib/video/types";
import { releaseLiveSession, startLiveFromBrowser } from "@/lib/live-client";
import { cameraInventoryApi } from "@/lib/api-client";
import { useVideoWallScheduler } from "@/hooks/use-video-wall-scheduler";

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
  aiByCamera?: ReadonlyMap<string, { rules: AnalyticsRule[]; alerts: AnalyticsAlert[] }>;
  showAiOverlay?: boolean;
  onOpenCameraAi?: (cameraId: string) => void;
  onDeleteCamera?: (cameraId: string) => Promise<void>;
}

interface VisibleRange {
  start: number;
  end: number;
}

const MAX_PARALLEL_LIVE_STARTS = 2;
const LIVE_START_TIMEOUT_MS = 30_000;
const SAVED_LAYOUTS_STORAGE_KEY = "sentinel.video-wall.layouts.v1";

interface GridTileProps {
  camera: Camera;
  session?: LiveSessionResponse;
  loading: boolean;
  playbackMode?: CameraPlaybackMode;
  desiredPlaybackMode?: CameraPlaybackMode;
  degradationReason?: DegradationReason;
  snapshotUrl?: string;
  liveError?: string;
  index: number;
  onStart: (cameraId: string) => void;
  onVideoElementChange: (cameraId: string, videoElement: HTMLVideoElement | null) => void;
  onPlaybackError: (cameraId: string, reason?: string) => void;
  aiOverlay?: { rules: AnalyticsRule[]; alerts: AnalyticsAlert[] };
  showAiOverlay: boolean;
  onOpenAi?: (cameraId: string) => void;
  onDeleteCamera?: (cameraId: string) => Promise<void> | void;
}

const GridTile = memo(function GridTile({
  camera,
  session,
  loading,
  playbackMode,
  desiredPlaybackMode,
  degradationReason,
  snapshotUrl,
  liveError,
  index,
  onStart,
  onVideoElementChange,
  onPlaybackError,
  aiOverlay,
  showAiOverlay,
  onOpenAi,
  onDeleteCamera,
}: GridTileProps) {
  const handleStart = useCallback(() => onStart(camera.id), [onStart, camera.id]);
  const handleVideoElementChange = useCallback((videoElement: HTMLVideoElement | null) => {
    onVideoElementChange(camera.id, videoElement);
  }, [onVideoElementChange, camera.id]);
  const handlePlaybackError = useCallback((reason?: string) => {
    onPlaybackError(camera.id, reason);
  }, [onPlaybackError, camera.id]);

  return (
    <CameraTile
      camera={camera}
      session={session}
      loading={loading}
      onStart={handleStart}
      playbackMode={playbackMode}
      desiredPlaybackMode={desiredPlaybackMode}
      degradationReason={degradationReason}
      snapshotUrl={snapshotUrl}
      liveError={liveError}
      onVideoElementChange={handleVideoElementChange}
      onPlaybackError={handlePlaybackError}
      aiOverlay={aiOverlay}
      showAiOverlay={showAiOverlay}
      onOpenAi={onOpenAi ? () => onOpenAi(camera.id) : undefined}
      onDeleteCamera={onDeleteCamera}
      index={index}
    />
  );
});

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
  aiByCamera,
  showAiOverlay = true,
  onOpenCameraAi,
  onDeleteCamera,
}: EnhancedCameraGridProps) {
  const [gridSize, setGridSize] = useState<GridSize>(
    initialLayout?.gridSize || "2x2"
  );

  // Initialize media orchestrator
  const mediaOrchestrator = useMediaOrchestrator({
    autoRegisterClient: true,
  });

  const {
    tileStates,
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
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [liveErrors, setLiveErrors] = useState<Map<string, string>>(new Map());
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const [layoutName, setLayoutName] = useState(initialLayout?.name || "");
  const [savedLayouts, setSavedLayouts] = useState<GridLayout[]>([]);
  const [layoutFeedback, setLayoutFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [visibleRange, setVisibleRange] = useState<VisibleRange>({ start: 0, end: 50 });
  const [sequencing, setSequencing] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [tourInterval, setTourInterval] = useState(15);
  const [operatorSelectedCameraId, setOperatorSelectedCameraId] = useState<string | null>(null);
  const [draggedCamera, setDraggedCamera] = useState<{ camera: Camera; fromPosition: number } | null>(null);
  const [compactGrid, setCompactGrid] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 760px)");
    const syncGridDensity = () => setCompactGrid(mediaQuery.matches);
    syncGridDensity();
    mediaQuery.addEventListener("change", syncGridDensity);
    return () => mediaQuery.removeEventListener("change", syncGridDensity);
  }, []);

  const handleDeleteCamera = useCallback(async (cameraId: string) => {
    if (onDeleteCamera) {
      await onDeleteCamera(cameraId);
    } else {
      await cameraInventoryApi.deleteCamera(cameraId);
    }
    setGridPositions((prev) => {
      const next = new Map(prev);
      for (const [pos, entry] of next.entries()) {
        if (entry.camera.id === cameraId) {
          next.delete(pos);
        }
      }
      return next;
    });
    void releaseLiveSession(sessionsRef.current.get(cameraId));
    closeSession(cameraId);
  }, [onDeleteCamera, closeSession]);

  const containerRef = useRef<HTMLDivElement>(null);
  const initialLayoutApplied = useRef(false);
  const activeStreamTypesRef = useRef(new Map<string, "main" | "sub">());
  const pendingLiveStartsRef = useRef(new Map<string, "main" | "sub">());
  const liveStartControllersRef = useRef(new Map<string, AbortController>());
  const activeLiveStartsRef = useRef(0);

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
  const totalPages = Math.max(1, Math.ceil(cameras.length / totalPositions));
  const decoderCapacityOptions = useMemo(
    () => getDecoderCapacityOptions(maxConcurrentStreams),
    [maxConcurrentStreams],
  );

  // Use the DecoderBudgetManager hook (dynamic budget based on hardware/GPU and maxConcurrentStreams)
  const {
    decoderLimit,
    setUserPreference: setDecoderPreference,
    setActiveCount,
  } = useDecoderBudgetManager({ maxConcurrentStreams, enableGPUAcceleration });

  const schedulerGridPositions = useMemo(() => new Map(
    Array.from(gridPositions.entries()).map(([position, entry]) => [position, {
      cameraId: entry.camera.id,
      stream: entry.stream,
      priority: entry.priority,
    }]),
  ), [gridPositions]);
  const visibleGridCameraIds = useMemo(() => {
    const cameraIds = new Set<string>();
    for (let position = visibleRange.start; position < visibleRange.end; position += 1) {
      const entry = schedulerGridPositions.get(position);
      if (entry) cameraIds.add(entry.cameraId);
    }
    return cameraIds;
  }, [schedulerGridPositions, visibleRange]);
  const schedulerTileGeometry = useMemo(() => {
    const columns = Number(gridSize.split("x")[0]);
    const viewportWidth = containerRef.current?.clientWidth ??
      (typeof window === "undefined" ? 1280 : window.innerWidth);
    const width = Math.max(1, Math.floor(viewportWidth / columns));
    return { width, height: Math.max(1, Math.floor(width * 9 / 16)) };
  }, [gridSize]);
  const {
    schedule,
    playbackStates,
    snapshotUrls,
    capacity,
    budget,
    isInitialized,
    activeDecoderCount,
    snapshotCount,
    attachVideoElement,
    markPlaybackActive,
    markPlaybackDeferred,
    reportPlaybackFailure,
  } = useVideoWallScheduler({
    cameras,
    visibleRange,
    gridPositions: schedulerGridPositions,
    priorityCameraIds,
    operatorSelectedCameraId,
    maxDecoderLimit: decoderLimit,
    rotationEnabled: sequencing,
    tileGeometry: schedulerTileGeometry,
  });

  useEffect(() => {
    setActiveCount(activeDecoderCount);
  }, [activeDecoderCount, setActiveCount]);

  const prevActiveDecoderCountRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    const activeSessionCount = sessions.size;
    if (prevActiveDecoderCountRef.current !== activeSessionCount) {
      prevActiveDecoderCountRef.current = activeSessionCount;
      onActiveStreamsChange?.(activeSessionCount);
    }
  }, [onActiveStreamsChange, sessions.size]);

  const prevMonitoredIdsRef = useRef<string>("");
  useEffect(() => {
    const ids = [...gridPositions.values()].map((entry) => entry.camera.id).sort().join("|");
    if (prevMonitoredIdsRef.current !== ids) {
      prevMonitoredIdsRef.current = ids;
      onMonitoredCamerasChange?.(
        [...gridPositions.values()].map((entry) => entry.camera.id).sort(),
      );
    }
  }, [gridPositions, onMonitoredCamerasChange]);

  const handleTileVideoElementChange = useCallback((cameraId: string, videoElement: HTMLVideoElement | null) => {
    attachVideoElement(cameraId, videoElement);
  }, [attachVideoElement]);

  const handleTilePlaybackError = useCallback((cameraId: string, reason?: string) => {
    const errorMsg = reason ?? "HLS playback failed";
    setLiveErrors((current) => {
      if (current.get(cameraId) === errorMsg) return current;
      const next = new Map(current);
      next.set(cameraId, errorMsg);
      return next;
    });
    reportPlaybackFailure(cameraId, reason);
  }, [reportPlaybackFailure]);

  const sessionsRef = useRef<Map<string, LiveSessionResponse>>(new Map());
  const loadingRef = useRef<Set<string>>(new Set());

  const releaseSession = useCallback((cameraId: string) => {
    const session = sessionsRef.current.get(cameraId);
    sessionsRef.current.delete(cameraId);
    activeStreamTypesRef.current.delete(cameraId);
    setSessions(new Map(sessionsRef.current));
    void releaseLiveSession(session);
    void closeSession(cameraId);
  }, [closeSession]);

  const handleStartLive = useCallback(async (cameraId: string, stream: "main" | "sub" = "sub") => {
    if (
      sessionsRef.current.has(cameraId) ||
      loadingRef.current.has(cameraId)
    ) return;

    if (activeLiveStartsRef.current >= MAX_PARALLEL_LIVE_STARTS) {
      pendingLiveStartsRef.current.set(cameraId, stream);
      return;
    }

    loadingRef.current.add(cameraId);
    activeLiveStartsRef.current += 1;
    setLoading(new Set(loadingRef.current));
    setLiveErrors((current) => {
      if (!current.has(cameraId)) return current;
      const next = new Map(current);
      next.delete(cameraId);
      return next;
    });

    const controller = new AbortController();
    liveStartControllersRef.current.set(cameraId, controller);
    const timeoutTimer = setTimeout(
      () => controller.abort(new DOMException("Live session timed out", "TimeoutError")),
      LIVE_START_TIMEOUT_MS,
    );

    try {
      updateStreamState(cameraId, "CONNECTING");
      const session = await startLiveFromBrowser(cameraId, stream, controller.signal);
      sessionsRef.current.set(cameraId, session);
      setSessions(new Map(sessionsRef.current));
      setLiveErrors((current) => {
        if (!current.has(cameraId)) return current;
        const next = new Map(current);
        next.delete(cameraId);
        return next;
      });
      activeStreamTypesRef.current.set(cameraId, stream);
      markPlaybackActive(cameraId);

      const streamState: TileStreamState = stream === "main" 
        ? "LIVE_MAINSTREAM" 
        : "LIVE_SUBSTREAM";
      updateStreamState(cameraId, streamState);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown error";
      setLiveErrors((current) => {
        if (current.get(cameraId) === reason) return current;
        const next = new Map(current);
        next.set(cameraId, reason);
        return next;
      });
      updateStreamState(cameraId, "ERROR", reason);
      reportPlaybackFailure(cameraId, reason);
    } finally {
      clearTimeout(timeoutTimer);
      liveStartControllersRef.current.delete(cameraId);
      loadingRef.current.delete(cameraId);
      activeLiveStartsRef.current = Math.max(0, activeLiveStartsRef.current - 1);
      setLoading(new Set(loadingRef.current));

      const next = pendingLiveStartsRef.current.entries().next().value as
        | [string, "main" | "sub"]
        | undefined;
      if (next) {
        pendingLiveStartsRef.current.delete(next[0]);
        void handleStartLive(next[0], next[1]);
      }
    }
  }, [
    markPlaybackActive,
    reportPlaybackFailure,
    updateStreamState,
  ]);

  useEffect(() => () => {
    for (const controller of liveStartControllersRef.current.values()) {
      controller.abort();
    }
    pendingLiveStartsRef.current.clear();
    for (const cameraId of sessionsRef.current.keys()) {
      releaseSession(cameraId);
    }
  }, [releaseSession]);

  // Live gateway grants are short-lived. Restart each stream before expiry so
  // a healthy tile does not freeze when its authorization token ages out.
  useEffect(() => {
    const timers = Array.from(sessions.entries()).flatMap(([cameraId, session]) => {
      if (!session.expiresAt) return [];
      const expiry = Date.parse(session.expiresAt);
      if (!Number.isFinite(expiry)) return [];
      const delay = Math.max(5_000, expiry - Date.now() - 60_000);
      return [window.setTimeout(() => {
        if (sessionsRef.current.get(cameraId) !== session) return;
        const stream = activeStreamTypesRef.current.get(cameraId) ?? "sub";
        releaseSession(cameraId);
        void handleStartLive(cameraId, stream);
      }, delay)];
    });

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [handleStartLive, releaseSession, sessions]);

  const handleRequestLive = useCallback((cameraId: string) => {
    setOperatorSelectedCameraId(cameraId);
    updateStreamState(cameraId, "CONNECTING");
    void handleStartLive(cameraId, "sub");
  }, [handleStartLive, updateStreamState]);

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

  // Initialize from a saved layout. If its camera IDs are no longer present
  useEffect(() => {
    if (currentPage >= totalPages && totalPages > 0) {
      setCurrentPage(0);
    }
  }, [currentPage, totalPages]);

  // Initialize and slice cameras based on current page and grid size
  useEffect(() => {
    if (cameras.length === 0) {
      setGridPositions(new Map());
      return;
    }

    const startIdx = currentPage * totalPositions;
    const pageSlice = cameras.slice(startIdx, startIdx + totalPositions);
    const stream = totalPositions >= 16 ? "sub" : "main";
    const posMap = new Map<number, { camera: Camera; stream: "main" | "sub"; priority: number }>();
    pageSlice.forEach((camera, index) => {
      posMap.set(index, { camera, stream, priority: 0 });
    });
    setGridPositions(posMap);
  }, [cameras, currentPage, totalPositions]);

  // Video wall auto-tour rotation timer
  useEffect(() => {
    if (!sequencing || totalPages <= 1) return;
    const intervalMs = Math.max(3, tourInterval) * 1000;
    const timer = setInterval(() => {
      setCurrentPage((prev) => (prev + 1) % totalPages);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [sequencing, totalPages, tourInterval]);

  // Keyboard navigation shortcuts for presentation/monitoring mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === "input" || activeTag === "textarea" || activeTag === "select") {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        setSequencing((prev) => !prev);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        setCurrentPage((prev) => (prev + 1) % totalPages);
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        setCurrentPage((prev) => (prev - 1 + totalPages) % totalPages);
      } else if (e.key === "1") {
        handleGridSizeChange("1x1");
      } else if (e.key === "2") {
        handleGridSizeChange("2x2");
      } else if (e.key === "3") {
        handleGridSizeChange("3x3");
      } else if (e.key === "4") {
        handleGridSizeChange("4x4");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [totalPages]);

  useEffect(() => {
    const camerasById = new Map(cameras.map((camera) => [camera.id, camera]));
    let sessionsChanged = false;
    for (const cameraId of sessionsRef.current.keys()) {
      if (camerasById.has(cameraId)) continue;
      liveStartControllersRef.current.get(cameraId)?.abort();
      pendingLiveStartsRef.current.delete(cameraId);
      sessionsChanged = true;
      releaseSession(cameraId);
    }
    if (sessionsChanged) setSessions(new Map(sessionsRef.current));
  }, [cameras, releaseSession]);

  // Adaptive layout: elevate stream priority in-place for alerting cameras
  // WITHOUT rearranging physical tile positions (Channel 1 stays in Slot 0, Channel 2 in Slot 1, etc.)
  useEffect(() => {
    if (!adaptiveLayout) return;

    const prioritySet = new Set(priorityCameraIds);
    setGridPositions((currentPositions) => {
      let changed = false;
      const nextPositions = new Map(currentPositions);
      for (const [pos, entry] of currentPositions.entries()) {
        const isAlerting = prioritySet.has(entry.camera.id) || entry.camera.status === "alert";
        const targetPriority = isAlerting ? 3 : 0;
        if (entry.priority !== targetPriority) {
          nextPositions.set(pos, { ...entry, priority: targetPriority });
          changed = true;
        }
      }
      return changed ? nextPositions : currentPositions;
    });
  }, [adaptiveLayout, priorityCameraIds]);

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

  useEffect(() => {
    // The scheduler starts asynchronously. Do not tear down sessions created
    // by the initial visible-tile batch while its first schedule is empty.
    if (!isInitialized || schedule.size === 0) return;

    const desiredLive = new Map(
      Array.from(schedule.values())
        .filter((scheduled) => visibleGridCameraIds.has(scheduled.cameraId))
        .filter((scheduled) => scheduled.mode === "MAIN_STREAM" || scheduled.mode === "SUB_STREAM")
        .map((scheduled) => [
          scheduled.cameraId,
          scheduled.mode === "MAIN_STREAM" ? "main" as const : "sub" as const,
        ]),
    );

    // Older camera records do not advertise streamProfiles even though their
    // gateway can start HLS. Admit those visible cameras into the remaining
    // decoder budget so the wall starts real video instead of stopping at a
    // metadata placeholder.
    let fallbackSlots = Math.max(0, decoderLimit - desiredLive.size);
    if (fallbackSlots > 0) {
      const cameraById = new Map(cameras.map((camera) => [camera.id, camera]));
      const orderedVisibleEntries = [...schedulerGridPositions.entries()]
        .filter(([position]) => position >= visibleRange.start && position < visibleRange.end)
        .sort(([left], [right]) => left - right);
      for (const [, entry] of orderedVisibleEntries) {
        if (fallbackSlots <= 0 || desiredLive.has(entry.cameraId)) continue;
        const camera = cameraById.get(entry.cameraId);
        if (!camera) continue;
        desiredLive.set(entry.cameraId, entry.stream);
        fallbackSlots -= 1;
      }
    }

    for (const [cameraId] of sessions) {
      const desiredStream = desiredLive.get(cameraId);
      if (desiredStream && activeStreamTypesRef.current.get(cameraId) === desiredStream) continue;
      // Do not aggressively tear down an active live session for a camera currently on the visible grid
      // unless there is an unrecoverable playback error or it was removed from the grid.
      if (visibleGridCameraIds.has(cameraId) && !liveErrors.has(cameraId)) {
        continue;
      }
      markPlaybackDeferred(cameraId);
      updateStreamState(cameraId, "PAUSED");
      releaseSession(cameraId);
    }

    for (const [cameraId, stream] of desiredLive) {
      if (!sessions.has(cameraId) && !loading.has(cameraId)) {
        void handleStartLive(cameraId, stream);
      }
    }
  }, [
    handleStartLive,
    isInitialized,
    cameras,
    decoderLimit,
    loading,
    markPlaybackDeferred,
    releaseSession,
    schedule,
    schedulerGridPositions,
    sessions,
    updateStreamState,
    visibleGridCameraIds,
    visibleRange.end,
    visibleRange.start,
  ]);

  const loadSavedLayouts = () => {
    try {
      const savedValue = window.localStorage.getItem(SAVED_LAYOUTS_STORAGE_KEY);
      if (!savedValue) return;
      const parsed = JSON.parse(savedValue) as unknown;
      if (!Array.isArray(parsed)) return;
      setSavedLayouts(parsed.filter((layout): layout is GridLayout => Boolean(
        layout && typeof layout === "object" &&
        typeof (layout as GridLayout).name === "string" &&
        typeof (layout as GridLayout).gridSize === "string" &&
        Array.isArray((layout as GridLayout).positions),
      )));
    } catch (error) {
      console.error("Failed to load layouts:", error);
    }
  };

  const handleSaveLayout = useCallback(() => {
    if (!layoutName.trim()) {
      setLayoutFeedback({ kind: "error", message: "Enter a layout name before saving." });
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

    setLayoutFeedback(null);
    try {
      const savedLayout = { ...layout, id: crypto.randomUUID() };
      const nextLayouts = [
        savedLayout,
        ...savedLayouts.filter((item) => item.name.toLowerCase() !== savedLayout.name.toLowerCase()),
      ];
      window.localStorage.setItem(SAVED_LAYOUTS_STORAGE_KEY, JSON.stringify(nextLayouts));
      setSavedLayouts(nextLayouts);
      setShowLayoutMenu(false);
      setLayoutName("");
      setLayoutFeedback({ kind: "success", message: `Saved “${layout.name}” on this workstation.` });
      onLayoutChange?.(layout);
    } catch (error) {
      console.error("Failed to save layout:", error);
      setLayoutFeedback({ kind: "error", message: "This browser could not store the layout." });
    }
  }, [layoutName, gridSize, gridPositions, onLayoutChange, savedLayouts]);

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
    setLayoutFeedback({ kind: "success", message: `Loaded “${layout.name}”.` });
  };

  const gridColumnCount = Number(gridSize.split("x")[0]);
  const renderedColumnCount = compactGrid || (typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches)
    ? 1
    : gridColumnCount;
  const minimumTileWidth = renderedColumnCount <= 2 ? 260 : renderedColumnCount <= 4 ? 200 : renderedColumnCount <= 6 ? 150 : 112;

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

  return (
    <div className="camera-grid-container">
      <div className="grid-toolbar">
        <div className="grid-actions">
          <label className="toolbar-control">
            Grid
            <select value={gridSize} onChange={(event) => handleGridSizeChange(event.target.value as GridSize)}>
              {(Object.keys(gridSizeMap) as GridSize[]).map((size) => (
                <option key={size} value={size}>{size} · {gridSizeMap[size]} cameras</option>
              ))}
            </select>
          </label>
          <label className="toolbar-control" title="Maximum independent browser decoders on this workstation">
            Live capacity
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
                  {option} streams
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={`btn-secondary ${sequencing ? "active-control" : ""}`}
            onClick={() => setSequencing((current) => !current)}
            title={sequencing ? "Auto-tour is running (Space to pause)" : "Auto-tour is paused (Space to start)"}
            aria-pressed={sequencing}
          >
            <RotateCw size={16} className={sequencing ? "animate-spin" : ""} />
            {sequencing ? `Tour (${tourInterval}s)` : "Tour: Off"}
          </button>
          {sequencing && (
            <label className="toolbar-control">
              <span>Interval</span>
              <select
                value={tourInterval}
                onChange={(e) => setTourInterval(Number(e.target.value))}
                title="Tour cycle interval"
              >
                <option value={5}>5s</option>
                <option value={10}>10s</option>
                <option value={15}>15s</option>
                <option value={30}>30s</option>
                <option value={60}>60s</option>
              </select>
            </label>
          )}
          <div className="tour-pagination" title="Page navigation (Left/Right Arrow key or buttons)">
            <button
              type="button"
              className="btn-page"
              disabled={totalPages <= 1}
              onClick={() => setCurrentPage((p) => (p - 1 + totalPages) % totalPages)}
              aria-label="Previous camera page"
            >
              ◀
            </button>
            <span className="page-indicator">
              Page {currentPage + 1}/{totalPages}
            </span>
            <button
              type="button"
              className="btn-page"
              disabled={totalPages <= 1}
              onClick={() => setCurrentPage((p) => (p + 1) % totalPages)}
              aria-label="Next camera page"
            >
              ▶
            </button>
          </div>
          <span className="viewer-summary" title="Live decoders and snapshot fallbacks currently used by this wall">
            {activeDecoderCount}/{budget?.decoderBudget ?? capacity?.recommendedDecoderLimit ?? decoderLimit} live
            {snapshotCount > 0 ? ` · ${snapshotCount} snapshots` : ""}
          </span>
          {savedLayouts.length > 0 && (
            <label className="toolbar-control">
              <span><Layout size={14} /> Saved layout</span>
              <select
                value=""
                onChange={(event) => {
                  if (event.target.value === "") return;
                  const selectedLayout = savedLayouts[Number(event.target.value)];
                  if (selectedLayout) handleLoadLayout(selectedLayout);
                }}
              >
                <option value="">Choose…</option>
                {savedLayouts.map((layout, index) => (
                  <option key={layout.id ?? `${layout.name}-${layout.gridSize}-${index}`} value={index}>
                    {layout.name} ({layout.gridSize})
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setShowLayoutMenu((current) => !current);
              setLayoutFeedback(null);
            }}
            aria-expanded={showLayoutMenu}
          >
            <Save size={16} />
            Save Layout
          </button>
        </div>
      </div>

      {showLayoutMenu && (
        <div className="layout-save-panel">
          <label htmlFor="layout-name">Layout name</label>
          <input
            id="layout-name"
            type="text"
            placeholder="For example, Main entrances"
            value={layoutName}
            onChange={(e) => {
              setLayoutName(e.target.value);
              setLayoutFeedback(null);
            }}
            className="layout-name-input"
            maxLength={80}
            autoFocus
          />
          <button type="button" className="btn-primary" onClick={handleSaveLayout}>
            <Plus size={16} />
            Save
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowLayoutMenu(false)}
          >
            Cancel
          </button>
        </div>
      )}
      {layoutFeedback && (
        <div className={`layout-feedback ${layoutFeedback.kind}`} role="status">
          {layoutFeedback.message}
        </div>
      )}

      <div 
        ref={containerRef}
        className={`camera-grid ${gpuAccelClass}`}
        style={{
          "--camera-grid-columns": renderedColumnCount,
          "--minimum-tile-width": `${minimumTileWidth}px`,
          gridTemplateRows: enableVirtualScrolling && totalPositions > 36 
            ? `repeat(${Math.ceil(totalPositions / renderedColumnCount)}, minmax(0, 1fr))`
            : undefined
        } as CSSProperties}
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
                <div className="empty-slot-header">
                  <span className="empty-slot-badge">Slot #{String(i + 1).padStart(2, "0")}</span>
                </div>
                <Settings size={24} className="opacity-30" />
                <select
                  className="camera-selector"
                  aria-label={`Camera for wall position ${i + 1}`}
                  onChange={(e) => {
                    const selectedCamera = cameras.find(
                      (c) => c.id === e.target.value
                    );
                    handleCameraAssign(i, selectedCamera || null);
                  }}
                  value=""
                >
                  <option value="">Select camera for Slot #{i + 1}...</option>
                  {cameras.map((cam) => (
                    <option key={cam.id} value={cam.id}>
                      {cam.name} - {cam.branchName}
                    </option>
                  ))}
                </select>
              </div>
            );
          }

          const scheduledCamera = schedule.get(camera.id);
          const playbackState = playbackStates.get(camera.id);
          const viewerStreamState: TileStreamState = sessions.has(camera.id)
            ? activeStreamTypesRef.current.get(camera.id) === "main"
              ? "LIVE_MAINSTREAM"
              : "LIVE_SUBSTREAM"
            : scheduledCamera?.mode === "MAIN_STREAM" || scheduledCamera?.mode === "SUB_STREAM"
              ? "QUEUED"
              : scheduledCamera?.mode === "SNAPSHOT" || scheduledCamera?.mode === "ROTATING"
                ? "PAUSED"
                : tileStates.get(camera.id)?.streamState || "METADATA_ONLY";
          const viewerReason = playbackState?.degradationReason;

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
                    streamState={viewerStreamState}
                    degraded={Boolean(viewerReason)}
                    compact
                  />
                  <button
                    type="button"
                    className="stream-toggle"
                    onClick={() => handleStreamToggle(i)}
                    title={`Switch to ${entry.stream === "main" ? "sub" : "main"} stream`}
                  >
                    {entry.stream === "main" ? "MAIN" : "SUB"}
                  </button>
                  <button
                    type="button"
                    className="remove-camera"
                    onClick={() => handleCameraAssign(i, null)}
                    title={`Remove ${camera.name} from the wall`}
                    aria-label={`Remove ${camera.name} from the wall`}
                  >
                    ×
                  </button>
                </div>
                <GridTile
                  camera={camera}
                  session={sessions.get(camera.id)}
                  loading={loading.has(camera.id)}
                  playbackMode={playbackState?.actualMode}
                  desiredPlaybackMode={scheduledCamera?.mode}
                  degradationReason={viewerReason}
                  snapshotUrl={snapshotUrls.get(camera.id)}
                  liveError={liveErrors.get(camera.id)}
                  onStart={handleRequestLive}
                  onVideoElementChange={handleTileVideoElementChange}
                  onPlaybackError={handleTilePlaybackError}
                  aiOverlay={aiByCamera?.get(camera.id)}
                  showAiOverlay={showAiOverlay}
                  onOpenAi={onOpenCameraAi}
                  onDeleteCamera={handleDeleteCamera}
                  index={i}
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
          padding: 10px 16px;
          background: #0d1926;
          border-radius: 10px;
          border: 1px solid #1e3a52;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
          flex-wrap: wrap;
          gap: 12px;
        }

        .grid-actions {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
        }

        .toolbar-control {
          display: flex;
          align-items: center;
          gap: 7px;
          color: #94a3b8;
          font-size: 12px;
          font-weight: 700;
        }

        .toolbar-control > span {
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }

        .toolbar-control select {
          min-height: 34px;
          padding: 0 28px 0 9px;
          border: 1px solid #1e3a52;
          border-radius: 6px;
          background: #0f1c2b;
          color: #f8fafc;
          font-size: 12px;
          font-weight: 600;
        }

        .viewer-summary {
          padding: 6px 12px;
          border: 1px solid rgba(56, 189, 248, 0.4);
          border-radius: 999px;
          background: rgba(14, 116, 144, 0.2);
          color: #38bdf8;
          font-size: 11px;
          font-weight: 800;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          white-space: nowrap;
        }

        .active-control {
          border-color: #0284c7 !important;
          background: #0c4a6e !important;
          color: #e0f2fe !important;
        }

        .tour-pagination {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #0b1420;
          padding: 3px 8px;
          border-radius: 6px;
          border: 1px solid #1e3a52;
        }

        .btn-page {
          background: #132234;
          border: 1px solid #274563;
          color: #cbd5e1;
          border-radius: 4px;
          padding: 3px 8px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .btn-page:hover:not(:disabled) {
          background: #1e3a52;
          color: #38bdf8;
        }

        .btn-page:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }

        .page-indicator {
          font-size: 12px;
          font-weight: 800;
          color: #f8fafc;
          padding: 0 4px;
          white-space: nowrap;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        }

        .btn-primary,
        .btn-secondary {
          padding: 7px 14px;
          border-radius: 6px;
          border: 1px solid;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          font-weight: 600;
          transition: all 0.2s;
        }

        .btn-primary {
          background: #2563eb;
          color: white;
          border-color: #3b82f6;
        }

        .btn-primary:hover {
          background: #1d4ed8;
        }

        .btn-primary:disabled,
        .btn-secondary:disabled {
          opacity: 0.6;
          cursor: wait;
        }

        .btn-secondary {
          background: #132234;
          color: #cbd5e1;
          border-color: #274563;
        }

        .btn-secondary:hover {
          background: #1e3a52;
          color: #f8fafc;
        }

        .layout-save-panel {
          display: flex;
          gap: 8px;
          padding: 16px;
          background: #f9fafb;
          border-radius: 8px;
          align-items: center;
        }

        .layout-save-panel label {
          color: #475569;
          font-size: 12px;
          font-weight: 700;
        }

        .layout-name-input {
          flex: 1;
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
        }

        .layout-feedback {
          margin-top: -8px;
          padding: 8px 11px;
          border: 1px solid;
          border-radius: 7px;
          font-size: 12px;
          font-weight: 600;
        }

        .layout-feedback.success {
          color: #047857;
          border-color: #a7f3d0;
          background: #ecfdf5;
        }

        .layout-feedback.error {
          color: #b91c1c;
          border-color: #fecaca;
          background: #fef2f2;
        }

        .camera-grid {
          display: grid;
          grid-template-columns: repeat(var(--camera-grid-columns), minmax(var(--minimum-tile-width), 1fr));
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

        .grid-empty-slot {
          aspect-ratio: 16/9;
          border: 2px dashed #1e3a52;
          border-radius: 10px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          background: #0d1a27;
          padding: 16px;
          transition: all 0.2s;
          position: relative;
        }

        .grid-empty-slot:hover {
          border-color: #38bdf8;
          background: #102436;
        }

        .empty-slot-header {
          position: absolute;
          top: 8px;
          left: 8px;
        }

        .empty-slot-badge {
          display: inline-flex;
          align-items: center;
          padding: 2px 8px;
          border-radius: 5px;
          background: rgba(15, 23, 42, 0.9);
          border: 1px solid rgba(56, 189, 248, 0.45);
          color: #38bdf8;
          font-size: 11px;
          font-weight: 800;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          letter-spacing: 0.5px;
        }

        .camera-selector {
          width: 100%;
          max-width: 220px;
          padding: 7px 10px;
          border: 1px solid #1e3a52;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          background: #0f1c2b;
          color: #f8fafc;
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

        @media (max-width: 760px) {
          .grid-toolbar { align-items: stretch; padding: 10px; }
          .grid-actions { width: 100%; align-items: stretch; }
          .toolbar-control { flex: 1 1 150px; align-items: flex-start; flex-direction: column; }
          .toolbar-control select { width: 100%; }
          .viewer-summary { align-self: center; }
          .layout-save-panel { align-items: stretch; flex-direction: column; }
          .layout-name-input { min-height: 38px; }
          .camera-grid { --camera-grid-columns: 1 !important; }
        }
      `}</style>
    </div>
  );
}
