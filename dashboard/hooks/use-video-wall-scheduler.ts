/**
 * Video Wall Scheduler Hook
 * 
 * Integrates the capacity-aware StreamScheduler with React components.
 * Provides priority-based scheduling, decoder pool management, and snapshot services.
 */

"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import type { Camera } from "@/lib/types";
import type {
  CameraContext,
  ScheduledCamera,
  ViewerCapacity,
  ViewerResourceBudget,
  CameraPlaybackState,
} from "@/lib/video/types";
import { getViewerCapacityManager } from "@/lib/video/viewer-capacity-manager";
import { getStreamScheduler } from "@/lib/video/stream-scheduler";
import { getDecoderPool } from "@/lib/video/decoder-pool";
import { getSnapshotService } from "@/lib/video/snapshot-service";

// ============================================================================
// HOOK OPTIONS
// ============================================================================

export interface UseVideoWallSchedulerOptions {
  cameras: Camera[];
  visibleRange?: { start: number; end: number };
  gridPositions?: Map<number, { cameraId: string; stream: "main" | "sub"; priority?: number }>;
  priorityCameraIds?: string[];
  alertCameraIds?: string[];
  criticalAlertCameraIds?: string[];
  incidentCameraIds?: string[];
  operatorSelectedCameraId?: string | null;
  operatorPinnedCameraIds?: string[];
  branchSelectedId?: string | null;
  enableSnapshots?: boolean;
  snapshotBaseUrl?: string;
  onScheduleChange?: (schedule: Map<string, ScheduledCamera>) => void;
  onCapacityChange?: (capacity: ViewerCapacity, budget: ViewerResourceBudget) => void;
}

// ============================================================================
// HOOK RESULT
// ============================================================================

export interface VideoWallSchedulerResult {
  // Schedule
  schedule: Map<string, ScheduledCamera>;
  playbackStates: Map<string, CameraPlaybackState>;
  
  // Capacity
  capacity: ViewerCapacity | null;
  budget: ViewerResourceBudget | null;
  
  // Status
  isInitialized: boolean;
  activeDecoderCount: number;
  snapshotCount: number;
  
  // Control
  refresh: () => Promise<void>;
  resetCapacity: () => Promise<void>;
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useVideoWallScheduler(
  options: UseVideoWallSchedulerOptions
): VideoWallSchedulerResult {
  const {
    cameras,
    visibleRange = { start: 0, end: 50 },
    gridPositions = new Map(),
    priorityCameraIds = [],
    alertCameraIds = [],
    criticalAlertCameraIds = [],
    incidentCameraIds = [],
    operatorSelectedCameraId = null,
    operatorPinnedCameraIds = [],
    branchSelectedId = null,
    enableSnapshots = true,
    snapshotBaseUrl = "/api/cameras",
    onScheduleChange,
    onCapacityChange,
  } = options;

  // State
  const [isInitialized, setIsInitialized] = useState(false);
  const [schedule, setSchedule] = useState<Map<string, ScheduledCamera>>(new Map());
  const [playbackStates, setPlaybackStates] = useState<Map<string, CameraPlaybackState>>(new Map());
  const [capacity, setCapacity] = useState<ViewerCapacity | null>(null);
  const [budget, setBudget] = useState<ViewerResourceBudget | null>(null);

  // Refs for services
  const capacityManager = useRef(getViewerCapacityManager());
  const streamScheduler = useRef(getStreamScheduler());
  const decoderPool = useRef(getDecoderPool());
  const snapshotService = useRef<ReturnType<typeof getSnapshotService> | null>(null);

  // Initialize snapshot service if enabled
  useEffect(() => {
    if (enableSnapshots && snapshotBaseUrl && !snapshotService.current) {
      snapshotService.current = getSnapshotService(snapshotBaseUrl);
    }
  }, [enableSnapshots, snapshotBaseUrl]);

  // Initialize capacity manager
  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      try {
        const detectedCapacity = await capacityManager.current.initialize();
        const resourceBudget = await capacityManager.current.getResourceBudget();
        
        if (mounted) {
          setCapacity(detectedCapacity);
          setBudget(resourceBudget);
          setIsInitialized(true);
          onCapacityChange?.(detectedCapacity, resourceBudget);
        }
      } catch (error) {
        console.error("[VideoWallScheduler] Initialization error:", error);
      }
    };

    initialize();

    return () => {
      mounted = false;
    };
  }, [onCapacityChange]);

  // Build camera contexts from props
  const buildCameraContexts = useCallback((): CameraContext[] => {
    const visibleCameraIds = new Set<string>();
    for (let i = visibleRange.start; i < visibleRange.end; i++) {
      const entry = gridPositions.get(i);
      if (entry) {
        visibleCameraIds.add(entry.cameraId);
      }
    }

    return cameras.map((camera): CameraContext => {
      const gridEntry = Array.from(gridPositions.values()).find(
        (e) => e.cameraId === camera.id
      );

      return {
        id: camera.id,
        name: camera.name,
        branchId: camera.branchId || "unknown",
        
        // Priority flags
        operatorSelected: operatorSelectedCameraId === camera.id,
        operatorPinned: operatorPinnedCameraIds.includes(camera.id),
        hasCriticalAlert: criticalAlertCameraIds.includes(camera.id),
        hasHighAlert: alertCameraIds.includes(camera.id),
        incidentActive: incidentCameraIds.includes(camera.id),
        isVisible: visibleCameraIds.has(camera.id),
        branchSelected: camera.branchId === branchSelectedId,
        isRotationallyDue: false, // Determined by scheduler
        
        // Stream profiles
        mainStream: {
          cameraId: camera.id,
          streamType: "MAIN",
          codec: "H264", // Default - should come from camera capabilities
          width: 1920,
          height: 1080,
          fps: 25,
          estimatedBitrateKbps: 4096,
          uri: (camera as any).rtspUrl ?? undefined,
        },
        subStream: {
          cameraId: camera.id,
          streamType: "SUB",
          codec: "H264",
          width: 640,
          height: 360,
          fps: 10,
          estimatedBitrateKbps: 512,
          uri: (camera as any).subStreamUrl ?? undefined,
        },
      };
    });
  }, [
    cameras,
    visibleRange,
    gridPositions,
    operatorSelectedCameraId,
    operatorPinnedCameraIds,
    criticalAlertCameraIds,
    alertCameraIds,
    incidentCameraIds,
    branchSelectedId,
  ]);

  // Calculate tile geometry from grid size
  const getTileGeometry = useCallback(() => {
    const totalPositions = gridPositions.size || 144;
    const gridWidth = Math.sqrt(totalPositions);
    
    // Assume 1920x1080 viewport, divided by grid width
    const tileWidth = Math.floor(1920 / gridWidth);
    const tileHeight = Math.floor(1080 / gridWidth);
    
    return { width: tileWidth, height: tileHeight };
  }, [gridPositions]);

  // Run scheduler
  useEffect(() => {
    if (!isInitialized) {
      return;
    }

    let mounted = true;
    let intervalId: NodeJS.Timeout;

    const runScheduler = async () => {
      try {
        const cameraContexts = buildCameraContexts();
        const tileGeometry = getTileGeometry();
        const visibleIds = new Set(
          Array.from(gridPositions.values())
            .slice(visibleRange.start, visibleRange.end)
            .map((e) => e.cameraId)
        );

        const newSchedule = await streamScheduler.current.schedule(
          cameraContexts,
          tileGeometry,
          visibleIds
        );

        if (!mounted) return;

        // Update decoder pool based on schedule
        const liveStreams = Array.from(newSchedule.values()).filter(
          (s) => s.mode === "MAIN_STREAM" || s.mode === "SUB_STREAM"
        );

        // Update playback states
        const newStates = new Map<string, CameraPlaybackState>();
        for (const [cameraId, scheduled] of newSchedule.entries()) {
          const decoderAllocated = liveStreams.some((s) => s.cameraId === cameraId);
          
          newStates.set(cameraId, {
            cameraId,
            desiredMode: scheduled.mode,
            actualMode: scheduled.mode, // Would be updated by actual playback
            priority: scheduled.priority,
            priorityScore: scheduled.priorityScore,
            streamProfile: scheduled.streamProfile,
            decoderAllocated,
            bitrateMbps: scheduled.streamCost?.bitrateMbps,
            pixelsPerSecond: scheduled.streamCost?.pixelsPerSecond,
          });
        }

        setSchedule(newSchedule);
        setPlaybackStates(newStates);
        onScheduleChange?.(newSchedule);

        // Update capacity manager with current usage
        const poolUsage = decoderPool.current.getTotalUsage();
        capacityManager.current.updateUsage(
          poolUsage.decoderCount,
          poolUsage.totalBitrateMbps,
          poolUsage.totalPixelsPerSecond
        );

        // Update budget
        const newBudget = await capacityManager.current.getResourceBudget();
        setBudget(newBudget);

        // Start/stop snapshots based on schedule
        if (enableSnapshots && snapshotService.current) {
          for (const [cameraId, scheduled] of newSchedule.entries()) {
            if (scheduled.mode === "SNAPSHOT") {
              snapshotService.current.startSnapshot(cameraId, scheduled.priority);
            } else if (scheduled.mode === "MAIN_STREAM" || scheduled.mode === "SUB_STREAM") {
              snapshotService.current.stopSnapshot(cameraId);
            }
          }
        }

        // Monitor performance
        const metrics = decoderPool.current.getAllMetrics();
        await capacityManager.current.monitorPerformance(metrics);
        
      } catch (error) {
        console.error("[VideoWallScheduler] Scheduling error:", error);
      }
    };

    // Initial run
    runScheduler();

    // Run scheduler periodically
    intervalId = setInterval(runScheduler, 2000);

    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, [
    isInitialized,
    buildCameraContexts,
    getTileGeometry,
    gridPositions,
    visibleRange,
    enableSnapshots,
    onScheduleChange,
  ]);

  // Refresh function
  const refresh = useCallback(async () => {
    const cameraContexts = buildCameraContexts();
    const tileGeometry = getTileGeometry();
    const visibleIds = new Set(
      Array.from(gridPositions.values())
        .slice(visibleRange.start, visibleRange.end)
        .map((e) => e.cameraId)
    );

    const newSchedule = await streamScheduler.current.schedule(
      cameraContexts,
      tileGeometry,
      visibleIds
    );

    setSchedule(newSchedule);
    onScheduleChange?.(newSchedule);
  }, [buildCameraContexts, getTileGeometry, gridPositions, visibleRange, onScheduleChange]);

  // Reset capacity
  const resetCapacity = useCallback(async () => {
    const newCapacity = await capacityManager.current.reset();
    const newBudget = await capacityManager.current.getResourceBudget();
    
    setCapacity(newCapacity);
    setBudget(newBudget);
    onCapacityChange?.(newCapacity, newBudget);
  }, [onCapacityChange]);

  // Get status counts
  const activeDecoderCount = decoderPool.current.getActiveCount();
  const snapshotCount = snapshotService.current?.getActiveCount() || 0;

  return {
    schedule,
    playbackStates,
    capacity,
    budget,
    isInitialized,
    activeDecoderCount,
    snapshotCount,
    refresh,
    resetCapacity,
  };
}
