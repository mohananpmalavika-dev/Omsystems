import { memo, useCallback, useEffect, useState, useRef, useMemo, type CSSProperties } from "react";
import {
  Maximize2,
  Minimize2,
  Save,
  Settings,
  Layout,
  Plus,
  RotateCw,
  ShieldAlert,
  FolderPlus,
  Layers,
  Activity,
  Sparkles,
  Mic,
  MicOff,
  Search,
  X,
  Bot,
  Compass,
  MapPin,
} from "lucide-react";
import { InteractiveEMapRadar } from "./interactive-e-map-radar";
import { CameraTile } from "./camera-tile";
import {
  clampDecoderLimit,
  createDefaultGridAssignments,
  getDecoderCapacityOptions,
  retainCameraPageOnGridChange,
} from "./enhanced-camera-grid-model";
import { useDecoderBudgetManager } from "./decoderBudgetManager";
import { useMediaOrchestrator } from "@/hooks/use-media-orchestrator";
import { VisibilityTracker } from "./visibility-tracker";
import { TileStateIndicator } from "./tile-state-indicator";
import type { AnalyticsAlert, AnalyticsRule, Camera, LiveSessionResponse } from "@/lib/types";
import type { TileStreamState, PresentationMode } from "@/lib/media-types";
import type { CameraPlaybackMode, DegradationReason } from "@/lib/video/types";
import { releaseLiveSession, startLiveFromBrowser } from "@/lib/live-client";
import { useVideoWallScheduler } from "@/hooks/use-video-wall-scheduler";
import {
  useCameraPresets,
  useCameraOperatorFlags,
  PREDEFINED_OPERATOR_FLAGS,
} from "@/lib/camera-operator-flags";
import { CameraPresetManagerModal } from "./camera-preset-manager-modal";

export type GridSize = "1x1" | "2x2" | "3x3" | "4x4" | "5x5" | "6x6" | "7x7" | "8x8" | "9x9" | "10x10" | "11x11" | "12x12" | "1+5" | "1+7" | "2+8";

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
  focusCameraId?: string;
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
  onSoloAudio?: (cameraId: string) => void;
  isSoloAudio?: boolean;
  stream?: "main" | "sub";
  onStreamQualityChange?: (cameraId: string, quality: "main" | "sub") => void;
  showVectors?: boolean;
  handoverTarget?: { cameraId: string; cameraName: string; direction: "left" | "right" | "top" | "bottom" };
  handoverIncoming?: { originCameraId: string; originCameraName: string };
  onAcceptHandover?: (targetCameraId: string) => void;
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
  onSoloAudio,
  isSoloAudio,
  stream,
  onStreamQualityChange,
  showVectors,
  handoverTarget,
  handoverIncoming,
  onAcceptHandover,
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
      onSoloAudio={onSoloAudio}
      isSoloAudio={isSoloAudio}
      activeStream={stream}
      onStreamQualityChange={onStreamQualityChange}
      index={index}
      showVectors={showVectors}
      handoverTarget={handoverTarget}
      handoverIncoming={handoverIncoming}
      onAcceptHandover={onAcceptHandover}
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
  focusCameraId,
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
  const [isGridHovered, setIsGridHovered] = useState(false);
  const [soloAudioCameraId, setSoloAudioCameraId] = useState<string | null>(null);
  const [autoFocusAlerts, setAutoFocusAlerts] = useState(true);
  const [showVectors, setShowVectors] = useState(true);
  const prevGridSizeRef = useRef<GridSize | null>(null);
  const [operatorSelectedCameraId, setOperatorSelectedCameraId] = useState<string | null>(null);
  const [draggedCamera, setDraggedCamera] = useState<{ camera: Camera; fromPosition: number } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { presets } = useCameraPresets();
  const { allFlags } = useCameraOperatorFlags();
  const [activeViewFilter, setActiveViewFilter] = useState<string>("all");
  const [showPresetManager, setShowPresetManager] = useState<boolean>(false);

  // Guardian AI Copilot Natural Language Grid Switching State
  const [aiPrompt, setAiPrompt] = useState<string>("");
  const [isAiProcessing, setIsAiProcessing] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [copilotFilterActive, setCopilotFilterActive] = useState<boolean>(false);
  const [copilotFilterSummary, setCopilotFilterSummary] = useState<string | null>(null);
  const [copilotMatchedCameraIds, setCopilotMatchedCameraIds] = useState<string[]>([]);
  const recognitionRef = useRef<any>(null);

  // 3D Spatial Fusion & E-Map Mini-Radar State
  const [showEMapRadar, setShowEMapRadar] = useState<boolean>(false);


  const handleFilterCamerasByMapArea = useCallback(
    (targetCameraIds: string[], zoneName?: string) => {
      if (!targetCameraIds || targetCameraIds.length === 0) {
        setLayoutFeedback({
          kind: "error",
          message: "No cameras situated in the selected map boundary.",
        });
        return;
      }

      // Pick an optimal layout for the selected camera count
      let targetGridSize: GridSize = "2x2";
      if (targetCameraIds.length === 1) targetGridSize = "1x1";
      else if (targetCameraIds.length <= 4) targetGridSize = "2x2";
      else if (targetCameraIds.length <= 6) targetGridSize = "1+5";
      else if (targetCameraIds.length <= 8) targetGridSize = "1+7";
      else if (targetCameraIds.length <= 9) targetGridSize = "3x3";
      else if (targetCameraIds.length <= 16) targetGridSize = "4x4";
      else targetGridSize = "5x5";

      setGridSize(targetGridSize);
      setCurrentPage(0);
      setCopilotFilterActive(true);
      setCopilotFilterSummary(`E-Map Spatial Selection: ${zoneName || "Custom Area"} (${targetCameraIds.length} cameras)`);
      setCopilotMatchedCameraIds(targetCameraIds);

      // Reassign slots 0..N with the selected cameras
      setGridPositions(() => {
        const next = new Map<number, { camera: Camera; stream: "main" | "sub" }>();
        targetCameraIds.forEach((camId, idx) => {
          const matched = cameras.find((c) => c.id === camId);
          if (matched) {
            next.set(idx, {
              camera: matched,
              stream: idx === 0 ? "main" : "sub",
            });
          }
        });
        return next;
      });

      // Pulse matched tiles for clear visual feedback
      setTimeout(() => {
        targetCameraIds.forEach((id) => {
          const tile = wallRef.current?.querySelector<HTMLElement>(`[data-camera-id="${CSS.escape(id)}"]`);
          tile?.animate(
            [
              { boxShadow: "0 0 0 0 rgba(6, 182, 212, 0)" },
              { boxShadow: "0 0 0 6px rgba(6, 182, 212, 0.95)" },
              { boxShadow: "0 0 0 0 rgba(6, 182, 212, 0)" },
            ],
            { duration: 1500, easing: "ease-out" }
          );
        });
      }, 150);

      setLayoutFeedback({
        kind: "success",
        message: `🗺️ Loaded ${targetCameraIds.length} cameras from ${zoneName || "Map Area"} into ${targetGridSize} grid`,
      });
    },
    [cameras]
  );

  const handleSelectCameraFromMap = useCallback(
    (cameraId: string) => {
      const selected = cameras.find((c) => c.id === cameraId);
      if (!selected) return;

      // Spotlight this camera into Slot 0 (Hero Tile)
      setGridPositions((prev) => {
        const next = new Map(prev);
        let oldPos: number | null = null;
        for (const [pos, entry] of next.entries()) {
          if (entry.camera.id === cameraId) {
            oldPos = pos;
            break;
          }
        }
        if (oldPos !== null && oldPos !== 0) {
          const slotZero = next.get(0);
          next.set(0, { camera: selected, stream: "main" });
          if (slotZero) {
            next.set(oldPos, { camera: slotZero.camera, stream: "sub" });
          } else {
            next.delete(oldPos);
          }
        } else if (oldPos === null) {
          next.set(0, { camera: selected, stream: "main" });
        }
        return next;
      });

      // Pulse the hero tile
      setTimeout(() => {
        const tile = wallRef.current?.querySelector<HTMLElement>(`[data-camera-id="${CSS.escape(cameraId)}"]`);
        tile?.scrollIntoView({ behavior: "smooth", block: "center" });
        tile?.animate(
          [
            { boxShadow: "0 0 0 0 rgba(6, 182, 212, 0)" },
            { boxShadow: "0 0 0 6px rgba(6, 182, 212, 0.95)" },
            { boxShadow: "0 0 0 0 rgba(6, 182, 212, 0)" },
          ],
          { duration: 1400, easing: "ease-out" }
        );
      }, 100);

      setLayoutFeedback({
        kind: "success",
        message: `🗺️ Spotlighted ${selected.name} to Hero Slot from E-Map`,
      });
    },
    [cameras]
  );

  // Cross-Camera Suspect / Object Handover calculation:
  // Evaluates real-time detection headings and links adjacent cameras topologically
  const handoverData = useMemo(() => {
    const targets = new Map<string, { cameraId: string; cameraName: string; direction: "left" | "right" | "top" | "bottom" }>();
    const incomings = new Map<string, { originCameraId: string; originCameraName: string }>();

    if (!aiByCamera) return { targets, incomings };

    for (const [camId, data] of aiByCamera.entries()) {
      const activeCritical = data.alerts.find(
        (a) =>
          a.severity === "P1" ||
          a.severity === "P2" ||
          /intrusion|weapon|fire|smoke|ppe|helmet|danger|violation/i.test(a.title)
      );
      if (!activeCritical) continue;

      const originCam = cameras.find((c) => c.id === camId);
      if (!originCam) continue;

      const titleLower = activeCritical.title.toLowerCase();
      let direction: "left" | "right" | "top" | "bottom" | null = null;
      if (titleLower.includes("west") || titleLower.includes("left") || titleLower.includes("exit")) {
        direction = "left";
      } else if (titleLower.includes("east") || titleLower.includes("right")) {
        direction = "right";
      } else if (titleLower.includes("north") || titleLower.includes("up")) {
        direction = "top";
      } else if (titleLower.includes("south") || titleLower.includes("down")) {
        direction = "bottom";
      }
      if (!direction) continue;

      // Find adjacent camera in same branch or next in camera catalog
      const branchCameras = cameras.filter((c) => c.branchId === originCam.branchId);
      const candidates = branchCameras.length > 1 ? branchCameras : cameras;
      const originIdx = candidates.findIndex((c) => c.id === camId);

      let targetCam: Camera | undefined;
      if (direction === "right" || direction === "bottom") {
        targetCam = candidates[(originIdx + 1) % candidates.length];
      } else {
        targetCam = candidates[(originIdx - 1 + candidates.length) % candidates.length];
      }

      if (targetCam && targetCam.id !== originCam.id) {
        targets.set(originCam.id, {
          cameraId: targetCam.id,
          cameraName: targetCam.name,
          direction,
        });
        incomings.set(targetCam.id, {
          originCameraId: originCam.id,
          originCameraName: originCam.name,
        });
      }
    }

    return { targets, incomings };
  }, [aiByCamera, cameras]);

  const handleAcceptHandover = useCallback((targetCameraId: string) => {
    const targetCamera = cameras.find((c) => c.id === targetCameraId);
    if (!targetCamera) return;

    setGridPositions((currentPositions) => {
      const nextPositions = new Map(currentPositions);
      let existingPos: number | null = null;
      for (const [pos, entry] of nextPositions.entries()) {
        if (entry.camera.id === targetCameraId) {
          existingPos = pos;
          break;
        }
      }
      const prevSlot1 = nextPositions.get(1);
      nextPositions.set(1, { camera: targetCamera, stream: "main", priority: 2 });
      if (existingPos !== null && existingPos !== 1 && prevSlot1) {
        nextPositions.set(existingPos, prevSlot1);
      }
      return nextPositions;
    });

    const targetTile = wallRef.current?.querySelector<HTMLElement>(`[data-camera-id="${CSS.escape(targetCameraId)}"]`);
    targetTile?.animate(
      [
        { boxShadow: "0 0 0 0 rgba(14, 165, 233, 0)" },
        { boxShadow: "0 0 0 6px rgba(14, 165, 233, 0.9)" },
        { boxShadow: "0 0 0 0 rgba(14, 165, 233, 0)" },
      ],
      { duration: 1200, easing: "ease-out" }
    );
  }, [cameras]);

  const displayedCameras = useMemo(() => {
    if (copilotFilterActive && copilotMatchedCameraIds.length > 0) {
      const idSet = new Set(copilotMatchedCameraIds);
      const filtered = cameras.filter((c) => idSet.has(c.id));
      if (filtered.length > 0) return filtered;
    }
    if (activeViewFilter === "all") return cameras;
    if (activeViewFilter.startsWith("flag:")) {
      const flagType = activeViewFilter.replace("flag:", "");
      return cameras.filter((c) =>
        allFlags[c.id]?.some((f) => f.type === flagType)
      );
    }
    const preset = presets.find((p) => p.id === activeViewFilter);
    if (preset) {
      if (preset.cameraIds.length === 0) return [];
      const idSet = new Set(preset.cameraIds);
      return cameras.filter((c) => idSet.has(c.id));
    }
    return cameras;
  }, [cameras, copilotFilterActive, copilotMatchedCameraIds, activeViewFilter, presets, allFlags]);

  const handleSelectPreset = (presetId: string) => {
    setActiveViewFilter(presetId);
    setCurrentPage(0);
    const preset = presets.find((p) => p.id === presetId);
    if (preset?.gridSize && gridSizeMap[preset.gridSize as GridSize]) {
      setGridSize(preset.gridSize as GridSize);
    }
    setLayoutFeedback({
      kind: "success",
      message: preset ? `Viewing preset group: ${preset.name}` : "Viewing all cameras",
    });
  };

  const handleSoloAudio = useCallback((cameraId: string) => {
    setSoloAudioCameraId((current) => (current === cameraId ? null : cameraId));
  }, []);

  const handleResetCopilotFilter = useCallback(() => {
    setCopilotFilterActive(false);
    setCopilotFilterSummary(null);
    setCopilotMatchedCameraIds([]);
    setAiPrompt("");
    setCurrentPage(0);
    setLayoutFeedback({
      kind: "success",
      message: "Copilot filter reset. Full camera wall view restored.",
    });
  }, []);

  const handleExecuteCopilotCommand = useCallback(async (promptOverride?: string) => {
    const query = (promptOverride !== undefined ? promptOverride : aiPrompt).trim();
    if (!query) return;

    setIsAiProcessing(true);
    setLayoutFeedback(null);

    try {
      // 1. Send natural language command to Guardian AI Assistant
      let actionResult: any = null;
      try {
        const response = await fetch("/api/v1/guardian/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ message: query }),
        });

        if (response.ok) {
          const data = await response.json();
          const liveWallAction = data.actions?.find((a: any) => a.function === "control_live_wall");
          if (liveWallAction?.result) {
            actionResult = liveWallAction.result;
          }
        }
      } catch (err) {
        console.warn("[Guardian Copilot] Backend chat fetch error:", err);
      }

      // 2. Client-side semantic evaluation (guarantees instantaneous fallback and zero failure)
      const qLower = query.toLowerCase();
      let targetCameraIds: string[] = Array.isArray(actionResult?.cameraIds) && actionResult.cameraIds.length > 0
        ? actionResult.cameraIds
        : [];
      let targetGridSize: GridSize = (actionResult?.gridSize as GridSize) || "3x3";
      let summaryText = actionResult?.filterSummary || "";

      // Layout override detection
      if (qLower.includes("1+5") || qLower.includes("1 + 5")) targetGridSize = "1+5";
      else if (qLower.includes("1+7") || qLower.includes("1 + 7")) targetGridSize = "1+7";
      else if (qLower.includes("2+8") || qLower.includes("2 + 8")) targetGridSize = "2+8";
      else if (qLower.includes("1x1") || qLower.includes("single")) targetGridSize = "1x1";
      else if (qLower.includes("2x2") || qLower.includes("4 cameras")) targetGridSize = "2x2";
      else if (qLower.includes("3x3") || qLower.includes("9 cameras")) targetGridSize = "3x3";
      else if (qLower.includes("4x4") || qLower.includes("16 cameras")) targetGridSize = "4x4";

      if (targetCameraIds.length === 0) {
        const isEntrance = qLower.includes("entrance") || qLower.includes("entry") || qLower.includes("gate") || qLower.includes("door");
        const isWarehouse = qLower.includes("warehouse");
        const isZoneB = qLower.includes("zone b") || qLower.includes("zone-b") || qLower.includes("zone_b");
        const isZoneA = qLower.includes("zone a") || qLower.includes("zone-a");
        const isUnauthorized = qLower.includes("unauthorized") || qLower.includes("unauthorised") || qLower.includes("breach") || qLower.includes("access");
        const isMotion = qLower.includes("movement") || qLower.includes("motion") || qLower.includes("moving") || qLower.includes("active");

        let matched = cameras.filter((cam) => {
          const nameLower = cam.name.toLowerCase();
          const branchLower = (cam.branchName || "").toLowerCase();

          if (isEntrance && !(/entrance|gate|door|ingress|entry/i.test(nameLower) || /entrance|gate|door/i.test(branchLower))) {
            return false;
          }
          if (isWarehouse && !(/warehouse/i.test(nameLower) || /warehouse/i.test(branchLower))) {
            return false;
          }
          if (isZoneB && !(/zone\s*b/i.test(nameLower) || /zone\s*b/i.test(branchLower))) {
            return false;
          }
          if (isZoneA && !(/zone\s*a/i.test(nameLower) || /zone\s*a/i.test(branchLower))) {
            return false;
          }

          // Check real-time alerts for unauthorized access
          if (isUnauthorized) {
            const camAlerts = aiByCamera?.get(cam.id)?.alerts || [];
            const hasUnauthorized = camAlerts.some((a) =>
              /unauthorized|intrusion|breach|violation|p1|p2|danger/i.test(a.title)
            );
            if (!hasUnauthorized) return false;
          }

          // Check real-time alerts for active movement
          if (isMotion) {
            const camAlerts = aiByCamera?.get(cam.id)?.alerts || [];
            const hasMotionAlert = camAlerts.some((a) =>
              /motion|movement|crossing|tripwire|zone/i.test(a.title)
            );
            if (!hasMotionAlert && !isEntrance) return false;
          }

          return true;
        });

        if (matched.length === 0) {
          matched = cameras.filter((c) => {
            const str = `${c.name} ${c.branchName || ""}`.toLowerCase();
            if (isWarehouse) return str.includes("warehouse");
            if (isEntrance) return /entrance|gate|door|entry/i.test(str);
            if (isZoneB) return str.includes("zone");
            return false;
          });
        }

        if (matched.length === 0) {
          matched = cameras.slice(0, 8);
        }

        targetCameraIds = matched.map((c) => c.id);
        if (!summaryText) {
          if (isEntrance && isMotion) summaryText = "Entrance cameras with active movement";
          else if (isWarehouse && isZoneB) summaryText = "Warehouse Zone B cameras";
          else if (isUnauthorized) summaryText = "Cameras with unauthorized access in last 15m";
          else summaryText = `Matching: "${query}"`;
        }
      }

      // 3. Grid Layout Auto-fit
      if (!actionResult?.gridSize && !qLower.includes("1+") && !qLower.includes("x")) {
        const count = targetCameraIds.length;
        if (count <= 1) targetGridSize = "1x1";
        else if (count <= 4) targetGridSize = "2x2";
        else if (count <= 6) targetGridSize = "1+5";
        else if (count <= 8) targetGridSize = "1+7";
        else targetGridSize = "3x3";
      }

      setGridSize(targetGridSize);
      setCopilotMatchedCameraIds(targetCameraIds);
      setCopilotFilterActive(true);
      setCopilotFilterSummary(summaryText || query);
      setCurrentPage(0);

      // 4. Reorder Grid Positions placing matched cameras into slots 0..N
      const matchedCameras = targetCameraIds
        .map((id) => cameras.find((c) => c.id === id))
        .filter((c): c is Camera => Boolean(c));

      setGridPositions((currentPositions) => {
        const next = new Map(currentPositions);
        const isHeroLayout = targetGridSize === "1+5" || targetGridSize === "1+7" || targetGridSize === "2+8";

        matchedCameras.forEach((cam, idx) => {
          next.set(idx, {
            camera: cam,
            stream: isHeroLayout && idx === 0 ? "main" : "sub",
            priority: idx === 0 ? 3 : 1,
          });
        });
        return next;
      });

      // 5. High-tech glow pulse animation on matched tiles
      setTimeout(() => {
        targetCameraIds.forEach((id) => {
          const tile = wallRef.current?.querySelector<HTMLElement>(`[data-camera-id="${CSS.escape(id)}"]`);
          tile?.animate(
            [
              { boxShadow: "0 0 0 0 rgba(14, 165, 233, 0)" },
              { boxShadow: "0 0 0 6px rgba(14, 165, 233, 0.95)" },
              { boxShadow: "0 0 0 0 rgba(14, 165, 233, 0)" },
            ],
            { duration: 1500, easing: "ease-out" }
          );
        });
      }, 100);

      setLayoutFeedback({
        kind: "success",
        message: `Guardian AI Copilot: ${summaryText || query} (${targetCameraIds.length} cameras · ${targetGridSize})`,
      });
    } catch (err: any) {
      console.error("[Guardian Copilot] Execution error:", err);
      setLayoutFeedback({
        kind: "error",
        message: "Failed to execute Copilot command. Please retry.",
      });
    } finally {
      setIsAiProcessing(false);
    }
  }, [aiPrompt, cameras, aiByCamera]);

  const handleToggleVoiceRecognition = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setLayoutFeedback({
        kind: "error",
        message: "Speech recognition is not supported in this browser. Please use Chrome or Edge.",
      });
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript;
        if (transcript) {
          setAiPrompt(transcript);
          void handleExecuteCopilotCommand(transcript);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn("[Guardian Copilot] Voice recognition error:", event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error("[Guardian Copilot] Speech recognition failed to start:", err);
      setIsListening(false);
    }
  }, [isListening, handleExecuteCopilotCommand]);
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

  useEffect(() => {
    if (!focusCameraId) return;
    const tile = wallRef.current?.querySelector<HTMLElement>(`[data-camera-id="${CSS.escape(focusCameraId)}"]`);
    tile?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    tile?.animate(
      [{ boxShadow: "0 0 0 0 rgba(14, 165, 233, 0)" }, { boxShadow: "0 0 0 4px rgba(14, 165, 233, 0.8)" }, { boxShadow: "0 0 0 0 rgba(14, 165, 233, 0)" }],
      { duration: 1400, easing: "ease-out" },
    );
  }, [focusCameraId]);

  const handleRemoveFromWall = useCallback(async (cameraId: string) => {
    // Removing a tile is an operator-layout action. It must never delete the
    // camera from inventory: an accidental wall edit must not interrupt
    // recording, alerting, or other operators' views.
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
  }, [closeSession]);

  const wallRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const initialLayoutApplied = useRef(false);
  const activeStreamTypesRef = useRef(new Map<string, "main" | "sub">());
  const pendingLiveStartsRef = useRef(new Map<string, "main" | "sub">());
  const liveStartControllersRef = useRef(new Map<string, AbortController>());
  const activeLiveStartsRef = useRef(0);

  const toggleWallFullscreen = useCallback(() => {
    const wall = wallRef.current;
    if (!wall) return;
    if (document.fullscreenElement === wall) {
      void document.exitFullscreen();
      return;
    }
    void wall.requestFullscreen().catch((error) => {
      console.error("Unable to enter video-wall fullscreen mode", error);
    });
  }, []);

  useEffect(() => {
    const syncFullscreenState = () => setIsFullscreen(document.fullscreenElement === wallRef.current);
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  const gridSizeMap: Record<GridSize, number> = {
    "1x1": 1,
    "1+5": 6,
    "1+7": 8,
    "2+8": 10,
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
  const totalPages = Math.max(1, Math.ceil(displayedCameras.length / totalPositions));
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
    const columns = gridSize === "1+5" ? 3 : (gridSize === "1+7" || gridSize === "2+8") ? 4 : Number(gridSize.split("x")[0]);
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

    // Auto-recover after cooldown: clear error and request a fresh live stream
    const timer = setTimeout(() => {
      setLiveErrors((current) => {
        if (!current.has(cameraId)) return current;
        const next = new Map(current);
        next.delete(cameraId);
        return next;
      });
      const stream = activeStreamTypesRef.current.get(cameraId) ?? "sub";
      void handleStartLive(cameraId, stream, true);
    }, 12_000);
    return () => clearTimeout(timer);
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

  const handleStartLive = useCallback(async (cameraId: string, stream: "main" | "sub" = "sub", forceRefresh = false) => {
    if (
      (!forceRefresh && sessionsRef.current.has(cameraId)) ||
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

  // Live gateway grants are short-lived. Refresh each stream before expiry so
  // a healthy tile does not freeze when its authorization token ages out.
  useEffect(() => {
    const timers = Array.from(sessions.entries()).flatMap(([cameraId, session]) => {
      if (!session.expiresAt) return [];
      const expiry = Date.parse(session.expiresAt);
      if (!Number.isFinite(expiry)) return [];
      const remainingMs = expiry - Date.now();
      // If the session has already expired or expires very soon, do not trigger a fast flap loop
      if (remainingMs <= 10_000) return [];
      const delay = Math.max(10_000, remainingMs - 30_000);
      return [window.setTimeout(() => {
        if (sessionsRef.current.get(cameraId) !== session) return;
        const stream = activeStreamTypesRef.current.get(cameraId) ?? "sub";
        // Refresh authorization smoothly with forceRefresh = true
        void handleStartLive(cameraId, stream, true);
      }, delay)];
    });

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [handleStartLive, sessions]);

  const handleRequestLive = useCallback((cameraId: string) => {
    setOperatorSelectedCameraId(cameraId);
    updateStreamState(cameraId, "CONNECTING");
    const targetStream = [...gridPositions.values()].find((p) => p.camera.id === cameraId)?.stream ?? "sub";
    void handleStartLive(cameraId, targetStream);
  }, [handleStartLive, updateStreamState, gridPositions]);

  const handleStreamQualityChange = useCallback((cameraId: string, quality: "main" | "sub") => {
    setGridPositions((current) => {
      const next = new Map(current);
      for (const [pos, entry] of next.entries()) {
        if (entry.camera.id === cameraId) {
          next.set(pos, { ...entry, stream: quality });
          break;
        }
      }
      return next;
    });

    if (activeStreamTypesRef.current.get(cameraId) === quality) {
      return;
    }

    void handleStartLive(cameraId, quality, true);
  }, [handleStartLive]);

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
      const cols = gridSize === "1+5" ? 3 : (gridSize === "1+7" || gridSize === "2+8") ? 4 : parseInt(gridSize.split("x")[0]);
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
    if (displayedCameras.length === 0) {
      setGridPositions(new Map());
      return;
    }

    const startIdx = currentPage * totalPositions;
    const pageSlice = displayedCameras.slice(startIdx, startIdx + totalPositions);
    const posMap = new Map<number, { camera: Camera; stream: "main" | "sub"; priority: number }>();
    pageSlice.forEach((camera, index) => {
      // Adaptive Dual-Stream rule:
      // - Solo 1x1: Main-stream (1080p/4K)
      // - Hero layouts (1+5, 1+7): Slot 0 is Main-stream, companion slots are Sub-stream (D1/720p)
      // - Hero layout (2+8): Slots 0 and 1 are Main-stream, companion slots are Sub-stream
      // - All other multi-camera grids (2x2, 3x3, 4x4, etc.): Low-bandwidth Sub-stream by default
      const isHeroSlot = (totalPositions === 1) ||
        (index === 0 && (gridSize === "1+5" || gridSize === "1+7")) ||
        (index < 2 && gridSize === "2+8");
      const defaultStream: "main" | "sub" = isHeroSlot ? "main" : "sub";
      posMap.set(index, { camera, stream: defaultStream, priority: isHeroSlot ? 2 : 0 });
    });
    setGridPositions(posMap);
  }, [displayedCameras, currentPage, totalPositions, gridSize]);

  // Video wall auto-tour rotation timer with hover-pause inspection
  useEffect(() => {
    if (!sequencing || totalPages <= 1 || isGridHovered) return;
    const intervalMs = Math.max(3, tourInterval) * 1000;
    const timer = setInterval(() => {
      setCurrentPage((prev) => (prev + 1) % totalPages);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [sequencing, totalPages, tourInterval, isGridHovered]);

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

  // Smart Alarm Spotlight & Dynamic Focus:
  // Auto-elevate layout to Hero (1+5 / 1+7) on critical alert, place alerting camera in Slot 0,
  // align context cameras and handover camera adjacent, and restore previous layout when alert clears.
  useEffect(() => {
    if (!autoFocusAlerts) return;

    // Find any camera with active critical P1/P2 alert or detected intrusion/safety violation
    let alertingCameraId: string | null = null;
    if (aiByCamera) {
      for (const [camId, data] of aiByCamera.entries()) {
        const hasCritical = data.alerts.some(
          (a) =>
            a.severity === "P1" ||
            a.severity === "P2" ||
            /intrusion|weapon|fire|smoke|ppe|helmet|danger|violation/i.test(a.title)
        );
        if (hasCritical) {
          alertingCameraId = camId;
          break;
        }
      }
    }
    if (!alertingCameraId && priorityCameraIds.length > 0) {
      alertingCameraId = priorityCameraIds[0];
    }

    // When all alerts clear, automatically restore the previous layout (e.g., 3x3, 4x4)
    if (!alertingCameraId) {
      if (prevGridSizeRef.current !== null) {
        const restoreSize = prevGridSizeRef.current;
        prevGridSizeRef.current = null;
        setGridSize(restoreSize);
      }
      return;
    }

    const targetCamera = cameras.find((c) => c.id === alertingCameraId);
    if (!targetCamera) return;

    // If currently on an equal grid, preserve it and auto-elevate to Hero Tile layout (1+5 or 1+7)
    const isHeroLayout = gridSize === "1+5" || gridSize === "1+7" || gridSize === "2+8" || gridSize === "1x1";
    if (!isHeroLayout && prevGridSizeRef.current === null) {
      prevGridSizeRef.current = gridSize;
      const elevatedSize: GridSize = displayedCameras.length >= 8 ? "1+7" : "1+5";
      setGridSize(elevatedSize);
    }

    // Context Cameras: Group cameras from the same branch or physical zone
    const contextCameras = displayedCameras.filter(
      (c) => c.id !== targetCamera.id && (c.branchId === targetCamera.branchId || (Boolean(c.branchName) && c.branchName === targetCamera.branchName))
    );
    const otherCameras = displayedCameras.filter(
      (c) => c.id !== targetCamera.id && !contextCameras.some((ctx) => ctx.id === c.id)
    );

    // If there is an active handover target camera, ensure it sits immediately in Slot 1
    const targetHandover = handoverData.targets.get(targetCamera.id);
    const handoverCam = targetHandover ? cameras.find((c) => c.id === targetHandover.cameraId) : null;

    const companionList: Camera[] = [];
    if (handoverCam && handoverCam.id !== targetCamera.id) {
      companionList.push(handoverCam);
    }
    for (const ctx of contextCameras) {
      if (ctx.id !== targetCamera.id && (!handoverCam || ctx.id !== handoverCam.id)) {
        companionList.push(ctx);
      }
    }
    for (const oth of otherCameras) {
      if (oth.id !== targetCamera.id && (!handoverCam || oth.id !== handoverCam.id)) {
        companionList.push(oth);
      }
    }

    const slot0Entry = gridPositions.get(0);
    const slot1Entry = gridPositions.get(1);
    const isAlreadySpotlighted =
      slot0Entry?.camera.id === targetCamera.id &&
      (!handoverCam || slot1Entry?.camera.id === handoverCam.id);

    if (isAlreadySpotlighted) return;

    setGridPositions((currentPositions) => {
      const nextPositions = new Map(currentPositions);

      // Slot 0: Primary Hero Slot (Main-stream HD/4K)
      nextPositions.set(0, { camera: targetCamera, stream: "main", priority: 3 });

      // Slots 1..N: Context and Handover Companion Cameras (Sub-stream SD)
      companionList.forEach((cam, idx) => {
        const slotIdx = idx + 1;
        nextPositions.set(slotIdx, {
          camera: cam,
          stream: "sub",
          priority: slotIdx === 1 && handoverCam ? 2 : 0,
        });
      });

      return nextPositions;
    });

    const heroTile = wallRef.current?.querySelector<HTMLElement>(`[data-camera-id="${CSS.escape(alertingCameraId)}"]`);
    heroTile?.animate(
      [
        { boxShadow: "0 0 0 0 rgba(239, 68, 68, 0)" },
        { boxShadow: "0 0 0 8px rgba(239, 68, 68, 0.9)" },
        { boxShadow: "0 0 0 0 rgba(239, 68, 68, 0)" },
      ],
      { duration: 1600, easing: "ease-out" }
    );
  }, [aiByCamera, priorityCameraIds, autoFocusAlerts, cameras, displayedCameras, gridSize, handoverData, gridPositions]);

  const handleGridSizeChange = (newSize: GridSize) => {
    // If operator manually chooses a layout, clear auto-spotlight restore memory
    prevGridSizeRef.current = null;
    // Keep the first camera from the current page in view while changing
    // density. This avoids jumping an operator back to the beginning of a
    // large wall when changing from, for example, 12×12 to 4×4.
    setCurrentPage((current) => retainCameraPageOnGridChange(
      displayedCameras.length,
      current,
      totalPositions,
      gridSizeMap[newSize],
    ));
    setGridSize(newSize);
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
      const nextStream = entry.stream === "main" ? "sub" : "main";
      handleStreamQualityChange(entry.camera.id, nextStream);
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

  const gridColumnCount = gridSize === "1+5" ? 3 : (gridSize === "1+7" || gridSize === "2+8") ? 4 : Number(gridSize.split("x")[0]);
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
    <div ref={wallRef} className={`camera-grid-container ${isFullscreen ? "camera-grid-fullscreen" : ""}`}>
      {/* ── GUARDIAN AI COPILOT CONTROL BAR ── */}
      <div className="guardian-copilot-bar" role="search" aria-label="Guardian AI Live Wall Copilot">
        <div className="copilot-brand">
          <Bot size={18} className="copilot-icon text-sky-400" />
          <span className="copilot-title">GUARDIAN AI COPILOT</span>
        </div>

        <form
          className="copilot-input-form"
          onSubmit={(e) => {
            e.preventDefault();
            void handleExecuteCopilotCommand();
          }}
        >
          <div className="copilot-input-wrapper">
            <Search size={15} className="copilot-search-icon" />
            <input
              type="text"
              className="copilot-input"
              placeholder="Ask Copilot: 'Show all entrance cameras with active movement', 'Switch to Warehouse Zone B'..."
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              disabled={isAiProcessing}
            />
            {aiPrompt && (
              <button
                type="button"
                className="copilot-clear-btn"
                onClick={() => setAiPrompt("")}
                title="Clear prompt"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <button
            type="button"
            className={`copilot-mic-btn ${isListening ? "listening animate-pulse" : ""}`}
            onClick={handleToggleVoiceRecognition}
            title={isListening ? "Listening... Click to stop" : "Voice Control (Dictate query)"}
            aria-pressed={isListening}
          >
            {isListening ? <MicOff size={16} className="text-rose-400" /> : <Mic size={16} />}
            <span className="copilot-btn-label">{isListening ? "Listening…" : "Voice"}</span>
          </button>

          <button
            type="submit"
            className="copilot-submit-btn"
            disabled={isAiProcessing || !aiPrompt.trim()}
            title="Execute natural language grid switch"
          >
            <Sparkles size={16} className={isAiProcessing ? "animate-spin text-amber-400" : "text-sky-300"} />
            <span>{isAiProcessing ? "Analyzing..." : "Switch Grid"}</span>
          </button>
        </form>

        {copilotFilterActive && (
          <div className="copilot-active-badge">
            <span className="copilot-filter-label">
              Active Filter: <strong>{copilotFilterSummary}</strong> ({copilotMatchedCameraIds.length} cams)
            </span>
            <button
              type="button"
              className="copilot-reset-btn"
              onClick={handleResetCopilotFilter}
              title="Reset AI filter to show all cameras"
            >
              <X size={14} />
              <span>Reset</span>
            </button>
          </div>
        )}

        <div className="copilot-quick-pills">
          <button
            type="button"
            className="quick-pill"
            onClick={() => {
              setAiPrompt("Show all entrance cameras with active movement");
              void handleExecuteCopilotCommand("Show all entrance cameras with active movement");
            }}
          >
            🚪 Entrance & Movement
          </button>
          <button
            type="button"
            className="quick-pill"
            onClick={() => {
              setAiPrompt("Switch to Warehouse Zone B");
              void handleExecuteCopilotCommand("Switch to Warehouse Zone B");
            }}
          >
            🏭 Warehouse Zone B
          </button>
          <button
            type="button"
            className="quick-pill"
            onClick={() => {
              setAiPrompt("Show cameras that triggered unauthorized access in the last 15 minutes");
              void handleExecuteCopilotCommand("Show cameras that triggered unauthorized access in the last 15 minutes");
            }}
          >
            🚨 Unauthorized Access (15m)
          </button>
          <button
            type="button"
            className="quick-pill"
            onClick={() => {
              setAiPrompt("Switch to 1+5 Hero Grid");
              void handleExecuteCopilotCommand("Switch to 1+5 Hero Grid");
            }}
          >
            📐 1+5 Hero Grid
          </button>
        </div>
      </div>

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
            <RotateCw size={16} className={sequencing && !isGridHovered ? "animate-spin" : ""} />
            {sequencing ? (isGridHovered ? "Tour: Paused (Inspecting)" : `Tour (${tourInterval}s)`) : "Tour: Off"}
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
          <button
            type="button"
            className={`btn-secondary ${autoFocusAlerts ? "active-control" : ""}`}
            onClick={() => setAutoFocusAlerts((prev) => !prev)}
            title={autoFocusAlerts ? "Smart Alarm Spotlight: Auto-focus alerting camera into primary Hero Slot" : "Smart Alarm Spotlight: OFF"}
            aria-pressed={autoFocusAlerts}
          >
            <ShieldAlert size={15} className={autoFocusAlerts ? "text-amber-400" : ""} />
            {autoFocusAlerts ? "Spotlight: Auto" : "Spotlight: Off"}
          </button>
          <button
            type="button"
            className={`btn-secondary ${showVectors ? "active-control" : ""}`}
            onClick={() => setShowVectors((prev) => !prev)}
            title={showVectors ? "AI Motion Vectors & Directional Trajectories: Enabled" : "AI Motion Vectors & Directional Trajectories: Disabled"}
            aria-pressed={showVectors}
          >
            <Activity size={15} className={showVectors ? "text-sky-400" : ""} />
            {showVectors ? "Vectors: On" : "Vectors: Off"}
          </button>
          <button
            type="button"
            className={`btn-secondary ${showEMapRadar ? "active-control border-cyan-500/80 bg-cyan-950/70" : ""}`}
            onClick={() => setShowEMapRadar((prev) => !prev)}
            title={showEMapRadar ? "Close 3D Spatial E-Map & Radar View" : "Open Interactive E-Map & Mini-Radar (Lasso select & FOV projection)"}
            aria-pressed={showEMapRadar}
          >
            <Compass size={15} className={showEMapRadar ? "text-cyan-400 animate-spin" : ""} />
            {showEMapRadar ? "E-Map: Active" : "🗺️ E-Map & Radar"}
          </button>
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
          {/* Custom Presets & Group Selector */}
          <label className="toolbar-control" title="Filter video wall by Custom Preset Group or Operator Status Flag">
            <span><Layers size={14} /> View / Group</span>
            <select
              value={activeViewFilter}
              onChange={(e) => handleSelectPreset(e.target.value)}
            >
              <option value="all">All Cameras ({cameras.length})</option>
              {presets.length > 0 && (
                <optgroup label="📁 Custom Preset Groups">
                  {presets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name} ({preset.cameraIds.length} cams)
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="🏷️ Filter by Status Flag">
                {PREDEFINED_OPERATOR_FLAGS.map((flag) => {
                  const count = cameras.filter((c) =>
                    allFlags[c.id]?.some((f) => f.type === flag.type)
                  ).length;
                  return (
                    <option key={flag.type} value={`flag:${flag.type}`}>
                      {flag.icon} {flag.label} ({count})
                    </option>
                  );
                })}
              </optgroup>
            </select>
          </label>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowPresetManager(true)}
            title="Create and manage custom camera preset groups (Main Gates, Warehouse All, Night Patrol, etc.)"
          >
            <FolderPlus size={15} />
            Presets ({presets.length})
          </button>

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
          <button
            type="button"
            className="btn-secondary"
            onClick={toggleWallFullscreen}
            aria-pressed={isFullscreen}
            title={isFullscreen ? "Exit fullscreen wall (Esc)" : "Open fullscreen wall"}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
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

      <div className={`grid-workspace-layout ${showEMapRadar ? "flex flex-col xl:flex-row gap-3 items-start" : ""}`}>
        {showEMapRadar && (
          <div className="w-full xl:w-[460px] 2xl:w-[500px] shrink-0 sticky top-2 z-20">
            <InteractiveEMapRadar
              cameras={cameras}
              aiByCamera={aiByCamera}
              onSelectCamera={handleSelectCameraFromMap}
              onFilterCamerasByArea={handleFilterCamerasByMapArea}
              onClose={() => setShowEMapRadar(false)}
            />
          </div>
        )}
        <div className={`flex-1 w-full min-w-0`}>
          <div 
            ref={containerRef}
            className={`camera-grid ${gpuAccelClass} ${gridSize === "1+5" ? "layout-hero-1-5" : gridSize === "1+7" ? "layout-hero-1-7" : gridSize === "2+8" ? "layout-hero-2-8" : ""}`}
            onMouseEnter={() => setIsGridHovered(true)}
            onMouseLeave={() => setIsGridHovered(false)}
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
                className={`grid-empty-slot slot-index-${i}`}
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
                className={`grid-camera-slot slot-index-${i}`}
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
                  onDeleteCamera={handleRemoveFromWall}
                  onSoloAudio={handleSoloAudio}
                  isSoloAudio={soloAudioCameraId ? soloAudioCameraId === camera.id : undefined}
                  stream={entry.stream}
                  onStreamQualityChange={handleStreamQualityChange}
                  index={i}
                  showVectors={showVectors}
                  handoverTarget={handoverData.targets.get(camera.id)}
                  handoverIncoming={handoverData.incomings.get(camera.id)}
                  onAcceptHandover={handleAcceptHandover}
                />
              </div>
            </VisibilityTracker>
          );
        })}
          </div>
        </div>
      </div>

      <style jsx>{`
        .camera-grid-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
          height: 100%;
        }

        .camera-grid-container:fullscreen {
          box-sizing: border-box;
          width: 100dvw;
          height: 100dvh;
          padding: 16px;
          overflow: hidden;
          background: #071522;
        }

        .camera-grid-container:fullscreen .camera-grid {
          min-height: 0;
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

        .camera-grid.layout-hero-1-5 {
          grid-template-columns: repeat(3, minmax(var(--minimum-tile-width), 1fr)) !important;
        }
        .camera-grid.layout-hero-1-5 .slot-index-0 {
          grid-column: span 2 !important;
          grid-row: span 2 !important;
        }

        .camera-grid.layout-hero-1-7 {
          grid-template-columns: repeat(4, minmax(var(--minimum-tile-width), 1fr)) !important;
        }
        .camera-grid.layout-hero-1-7 .slot-index-0 {
          grid-column: span 3 !important;
          grid-row: span 3 !important;
        }

        .camera-grid.layout-hero-2-8 {
          grid-template-columns: repeat(4, minmax(var(--minimum-tile-width), 1fr)) !important;
        }
        .camera-grid.layout-hero-2-8 .slot-index-0 {
          grid-column: 1 / span 2 !important;
          grid-row: 1 / span 2 !important;
        }
        .camera-grid.layout-hero-2-8 .slot-index-1 {
          grid-column: 3 / span 2 !important;
          grid-row: 1 / span 2 !important;
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

        .guardian-copilot-bar {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          padding: 8px 14px;
          background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(8, 47, 73, 0.85));
          border: 1px solid rgba(56, 189, 248, 0.3);
          border-radius: 8px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(8px);
        }

        .copilot-brand {
          display: flex;
          align-items: center;
          gap: 8px;
          padding-right: 10px;
          border-right: 1px solid rgba(56, 189, 248, 0.2);
        }

        .copilot-title {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: #38bdf8;
          white-space: nowrap;
        }

        .copilot-input-form {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
          min-width: 280px;
        }

        .copilot-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          flex: 1;
        }

        .copilot-input-wrapper :global(.copilot-search-icon) {
          position: absolute;
          left: 10px;
          color: #94a3b8;
          pointer-events: none;
        }

        .copilot-input {
          width: 100%;
          height: 34px;
          padding: 0 32px 0 34px;
          background: rgba(15, 23, 42, 0.8);
          border: 1px solid rgba(56, 189, 248, 0.35);
          border-radius: 6px;
          color: #f8fafc;
          font-size: 13px;
          transition: all 0.2s ease;
        }

        .copilot-input:focus {
          outline: none;
          border-color: #38bdf8;
          box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.2);
        }

        .copilot-clear-btn {
          position: absolute;
          right: 8px;
          background: transparent;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          padding: 2px;
          display: flex;
          align-items: center;
        }

        .copilot-mic-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          height: 34px;
          padding: 0 12px;
          background: rgba(30, 41, 59, 0.9);
          border: 1px solid rgba(148, 163, 184, 0.3);
          border-radius: 6px;
          color: #e2e8f0;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .copilot-mic-btn:hover {
          background: rgba(51, 65, 85, 0.9);
          border-color: #38bdf8;
        }

        .copilot-mic-btn.listening {
          background: rgba(225, 29, 72, 0.2);
          border-color: #f43f5e;
          color: #fda4af;
          box-shadow: 0 0 12px rgba(244, 63, 94, 0.4);
        }

        .copilot-submit-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          height: 34px;
          padding: 0 14px;
          background: linear-gradient(135deg, #0284c7, #0369a1);
          border: 1px solid rgba(56, 189, 248, 0.5);
          border-radius: 6px;
          color: #ffffff;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 2px 8px rgba(2, 132, 199, 0.3);
        }

        .copilot-submit-btn:hover:not(:disabled) {
          background: linear-gradient(135deg, #0369a1, #0284c7);
          box-shadow: 0 0 12px rgba(56, 189, 248, 0.5);
        }

        .copilot-submit-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .copilot-active-badge {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 4px 10px;
          background: rgba(16, 185, 129, 0.15);
          border: 1px solid rgba(16, 185, 129, 0.4);
          border-radius: 6px;
          font-size: 11px;
          color: #6ee7b7;
        }

        .copilot-reset-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 2px 6px;
          background: rgba(239, 68, 68, 0.2);
          border: 1px solid rgba(239, 68, 68, 0.4);
          border-radius: 4px;
          color: #fca5a5;
          font-size: 11px;
          cursor: pointer;
        }

        .copilot-reset-btn:hover {
          background: rgba(239, 68, 68, 0.3);
        }

        .copilot-quick-pills {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }

        .quick-pill {
          padding: 3px 8px;
          background: rgba(30, 41, 59, 0.7);
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 12px;
          color: #94a3b8;
          font-size: 11px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .quick-pill:hover {
          background: rgba(56, 189, 248, 0.15);
          border-color: rgba(56, 189, 248, 0.4);
          color: #38bdf8;
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
      <CameraPresetManagerModal
        isOpen={showPresetManager}
        onClose={() => setShowPresetManager(false)}
        cameras={cameras}
        currentGridSize={gridSize}
        onSelectPreset={handleSelectPreset}
        activePresetId={activeViewFilter}
      />
    </div>
  );
}
