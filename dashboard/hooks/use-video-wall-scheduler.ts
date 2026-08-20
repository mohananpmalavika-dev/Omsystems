/**
 * React integration for the resource-aware video-wall scheduler.
 *
 * This hook owns viewer-local capacity, decoder reservations, and snapshot
 * refreshes. It never changes camera health: a deferred or failed viewer
 * stream remains distinct from an offline camera.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Camera, CameraStreamProfile } from "@/lib/types";
import { DecoderPool } from "@/lib/video/decoder-pool";
import { SnapshotService, type SnapshotMetadata } from "@/lib/video/snapshot-service";
import { StreamScheduler } from "@/lib/video/stream-scheduler";
import type { TileGeometry } from "@/lib/video/stream-utils";
import type {
  CameraContext,
  CameraPlaybackMode,
  CameraPlaybackState,
  ScheduledCamera,
  StreamProfile,
  ViewerCapacity,
  ViewerResourceBudget,
} from "@/lib/video/types";
import { ViewerCapacityManager } from "@/lib/video/viewer-capacity-manager";

const SCHEDULER_INTERVAL_MS = 8_000;
const STREAM_FAILURE_COOLDOWN_MS = 15_000;

export interface VideoWallGridPosition {
  cameraId: string;
  stream: "main" | "sub";
  priority?: number;
}

export interface UseVideoWallSchedulerOptions {
  cameras: Camera[];
  visibleRange?: { start: number; end: number };
  gridPositions?: Map<number, VideoWallGridPosition>;
  priorityCameraIds?: string[];
  alertCameraIds?: string[];
  criticalAlertCameraIds?: string[];
  incidentCameraIds?: string[];
  operatorSelectedCameraId?: string | null;
  operatorPinnedCameraIds?: string[];
  branchSelectedId?: string | null;
  maxDecoderLimit?: number;
  rotationEnabled?: boolean;
  tileGeometry?: TileGeometry;
  enableSnapshots?: boolean;
  snapshotBaseUrl?: string;
  onScheduleChange?: (schedule: Map<string, ScheduledCamera>) => void;
  onCapacityChange?: (capacity: ViewerCapacity, budget: ViewerResourceBudget) => void;
}

export interface VideoWallSchedulerResult {
  schedule: Map<string, ScheduledCamera>;
  playbackStates: Map<string, CameraPlaybackState>;
  snapshotUrls: Map<string, string>;
  capacity: ViewerCapacity | null;
  budget: ViewerResourceBudget | null;
  isInitialized: boolean;
  activeDecoderCount: number;
  snapshotCount: number;
  refresh: () => Promise<void>;
  resetCapacity: () => Promise<void>;
  attachVideoElement: (cameraId: string, videoElement: HTMLVideoElement | null) => void;
  markPlaybackActive: (cameraId: string) => void;
  markPlaybackDeferred: (cameraId: string) => void;
  reportPlaybackFailure: (cameraId: string, reason?: string) => void;
}

function profileFromCapability(cameraId: string, profile: CameraStreamProfile): StreamProfile {
  return {
    cameraId,
    streamType: profile.type,
    codec: profile.codec,
    width: profile.width,
    height: profile.height,
    fps: profile.fps,
    estimatedBitrateKbps: profile.estimatedBitrateKbps,
    uri: profile.uri,
  };
}

function fallbackProfiles(camera: Camera): { main: StreamProfile; sub: StreamProfile } {
  return {
    main: {
      cameraId: camera.id,
      streamType: "MAIN",
      codec: "H264",
      width: 1920,
      height: 1080,
      fps: 25,
      estimatedBitrateKbps: 4096,
      uri: camera.rtspUrl,
    },
    sub: {
      cameraId: camera.id,
      streamType: "SUB",
      codec: "H264",
      width: 640,
      height: 360,
      fps: 10,
      estimatedBitrateKbps: 512,
      uri: camera.subStreamUrl,
    },
  };
}

function isLiveMode(mode: CameraPlaybackMode): boolean {
  return mode === "MAIN_STREAM" || mode === "SUB_STREAM";
}

export function useVideoWallScheduler(
  options: UseVideoWallSchedulerOptions,
): VideoWallSchedulerResult {
  const {
    cameras,
    visibleRange = { start: 0, end: 50 },
    gridPositions = new Map<number, VideoWallGridPosition>(),
    priorityCameraIds = [],
    alertCameraIds = [],
    criticalAlertCameraIds = [],
    incidentCameraIds = [],
    operatorSelectedCameraId = null,
    operatorPinnedCameraIds = [],
    branchSelectedId = null,
    maxDecoderLimit,
    rotationEnabled = true,
    tileGeometry = { width: 640, height: 360 },
    enableSnapshots = true,
    snapshotBaseUrl = "/api/cameras",
    onScheduleChange,
    onCapacityChange,
  } = options;

  const capacityManagerRef = useRef<ViewerCapacityManager | null>(null);
  const schedulerRef = useRef<StreamScheduler | null>(null);
  const decoderPoolRef = useRef<DecoderPool | null>(null);
  if (!capacityManagerRef.current) {
    const capacityManager = new ViewerCapacityManager();
    capacityManagerRef.current = capacityManager;
    schedulerRef.current = new StreamScheduler(capacityManager);
    decoderPoolRef.current = new DecoderPool();
  }

  const snapshotServiceRef = useRef<SnapshotService | null>(null);
  const activeSnapshotIdsRef = useRef(new Set<string>());
  const actualModesRef = useRef(new Map<string, CameraPlaybackMode>());
  const playbackFailuresRef = useRef(new Map<string, { until: number; reason?: string }>());
  const scheduleRef = useRef(new Map<string, ScheduledCamera>());

  const [isInitialized, setIsInitialized] = useState(false);
  const [schedule, setSchedule] = useState<Map<string, ScheduledCamera>>(new Map());
  const [playbackStates, setPlaybackStates] = useState<Map<string, CameraPlaybackState>>(new Map());
  const [snapshotUrls, setSnapshotUrls] = useState<Map<string, string>>(new Map());
  const [capacity, setCapacity] = useState<ViewerCapacity | null>(null);
  const [budget, setBudget] = useState<ViewerResourceBudget | null>(null);
  const [activeDecoderCount, setActiveDecoderCount] = useState(0);
  const [snapshotCount, setSnapshotCount] = useState(0);

  const syncPlaybackStates = useCallback((nextSchedule: Map<string, ScheduledCamera>) => {
    const nextStates = new Map<string, CameraPlaybackState>();
    const now = Date.now();
    for (const [cameraId, scheduled] of nextSchedule) {
      const failure = playbackFailuresRef.current.get(cameraId);
      if (failure && failure.until <= now) {
        playbackFailuresRef.current.delete(cameraId);
      }
      const activeFailure = playbackFailuresRef.current.get(cameraId);
      const actualMode = activeFailure
        ? "SUSPENDED"
        : actualModesRef.current.get(cameraId) ?? (isLiveMode(scheduled.mode) ? "SUSPENDED" : scheduled.mode);
      nextStates.set(cameraId, {
        cameraId,
        desiredMode: scheduled.mode,
        actualMode,
        priority: scheduled.priority,
        priorityScore: scheduled.priorityScore,
        streamProfile: scheduled.streamProfile,
        decoderAllocated: isLiveMode(scheduled.mode),
        bitrateMbps: scheduled.streamCost?.bitrateMbps,
        pixelsPerSecond: scheduled.streamCost?.pixelsPerSecond,
        degradationReason: activeFailure ? "STREAM_FAILURE" : scheduled.degradationReason,
      });
    }
    setPlaybackStates(nextStates);
  }, []);

  const buildCameraContexts = useCallback((): CameraContext[] => {
    const visibleCameraIds = new Set<string>();
    for (let position = visibleRange.start; position < visibleRange.end; position += 1) {
      const entry = gridPositions.get(position);
      if (entry) visibleCameraIds.add(entry.cameraId);
    }
    const now = Date.now();

    return cameras.map((camera) => {
      const advertisedProfiles = (camera.streamProfiles ?? []).map((profile) => profileFromCapability(camera.id, profile));
      const mainStreams = advertisedProfiles.filter((profile) => profile.streamType === "MAIN");
      const subStreams = advertisedProfiles.filter((profile) => profile.streamType === "SUB");
      const fallback = fallbackProfiles(camera);
      const failure = playbackFailuresRef.current.get(camera.id);

      return {
        id: camera.id,
        name: camera.name,
        branchId: camera.branchId || "unknown",
        operatorSelected: operatorSelectedCameraId === camera.id,
        operatorPinned: operatorPinnedCameraIds.includes(camera.id) || priorityCameraIds.includes(camera.id),
        hasCriticalAlert: criticalAlertCameraIds.includes(camera.id),
        hasHighAlert: alertCameraIds.includes(camera.id) || camera.status === "alert",
        incidentActive: incidentCameraIds.includes(camera.id),
        isVisible: visibleCameraIds.has(camera.id),
        branchSelected: camera.branchId === branchSelectedId,
        isRotationallyDue: false,
        isOnline: camera.status !== "offline",
        streamUnavailable: Boolean(failure && failure.until > now),
        mainStream: mainStreams[0] ?? fallback.main,
        subStream: subStreams[0] ?? fallback.sub,
        mainStreams: mainStreams.length > 0 ? mainStreams : undefined,
        subStreams: subStreams.length > 0 ? subStreams : undefined,
      };
    });
  }, [
    alertCameraIds,
    branchSelectedId,
    cameras,
    criticalAlertCameraIds,
    gridPositions,
    incidentCameraIds,
    operatorPinnedCameraIds,
    operatorSelectedCameraId,
    priorityCameraIds,
    visibleRange,
  ]);

  const reconcileDecoders = useCallback(async (nextSchedule: Map<string, ScheduledCamera>) => {
    const decoderPool = decoderPoolRef.current!;
    const desiredLive = new Map(
      Array.from(nextSchedule.values())
        .filter((scheduled) => isLiveMode(scheduled.mode) && scheduled.streamProfile)
        .map((scheduled) => [scheduled.cameraId, scheduled.streamProfile!] as const),
    );

    for (const handle of decoderPool.getAllHandles()) {
      if (!desiredLive.has(handle.cameraId)) {
        await decoderPool.release(handle.cameraId);
      }
    }
    for (const [cameraId, profile] of desiredLive) {
      await decoderPool.acquire(cameraId, profile);
    }

    const usage = decoderPool.getTotalUsage();
    capacityManagerRef.current!.updateUsage(
      usage.decoderCount,
      usage.totalBitrateMbps,
      usage.totalPixelsPerSecond,
    );
    setActiveDecoderCount(usage.decoderCount);
  }, []);

  const reconcileSnapshots = useCallback((nextSchedule: Map<string, ScheduledCamera>) => {
    const snapshotService = snapshotServiceRef.current;
    if (!snapshotService) return;

    const nextSnapshotIds = new Set<string>();
    for (const scheduled of nextSchedule.values()) {
      if (scheduled.mode !== "SNAPSHOT") continue;
      nextSnapshotIds.add(scheduled.cameraId);
      snapshotService.startSnapshot(scheduled.cameraId, scheduled.priority);
    }
    for (const cameraId of activeSnapshotIdsRef.current) {
      if (!nextSnapshotIds.has(cameraId)) snapshotService.stopSnapshot(cameraId);
    }
    activeSnapshotIdsRef.current = nextSnapshotIds;
    setSnapshotCount(snapshotService.getActiveCount());
  }, []);

  const runScheduler = useCallback(async () => {
    const nextSchedule = await schedulerRef.current!.schedule(
      buildCameraContexts(),
      tileGeometry,
      undefined,
      { maxDecoderLimit, rotationEnabled },
    );
    await reconcileDecoders(nextSchedule);
    if (enableSnapshots) reconcileSnapshots(nextSchedule);

    scheduleRef.current = nextSchedule;
    setSchedule(nextSchedule);
    syncPlaybackStates(nextSchedule);
    onScheduleChange?.(nextSchedule);

    const [nextCapacity, nextBudget] = await Promise.all([
      capacityManagerRef.current!.getCapacity(),
      capacityManagerRef.current!.getResourceBudget(),
    ]);
    const capacitySnapshot = { ...nextCapacity };
    const budgetSnapshot = { ...nextBudget };
    setCapacity(capacitySnapshot);
    setBudget(budgetSnapshot);
    onCapacityChange?.(capacitySnapshot, budgetSnapshot);

    const capacityChanged = await capacityManagerRef.current!.monitorPerformance(
      decoderPoolRef.current!.getAllMetrics(),
    );
    if (capacityChanged) {
      const adjustedCapacity = { ...await capacityManagerRef.current!.getCapacity() };
      const adjustedBudget = { ...await capacityManagerRef.current!.getResourceBudget() };
      setCapacity(adjustedCapacity);
      setBudget(adjustedBudget);
      onCapacityChange?.(adjustedCapacity, adjustedBudget);
    }
  }, [
    buildCameraContexts,
    enableSnapshots,
    maxDecoderLimit,
    onCapacityChange,
    onScheduleChange,
    reconcileDecoders,
    reconcileSnapshots,
    rotationEnabled,
    syncPlaybackStates,
    tileGeometry,
  ]);

  useEffect(() => {
    let cancelled = false;
    void capacityManagerRef.current!.initialize().then(async (initialCapacity) => {
      const initialBudget = await capacityManagerRef.current!.getResourceBudget();
      if (cancelled) return;
      setCapacity({ ...initialCapacity });
      setBudget({ ...initialBudget });
      setIsInitialized(true);
      onCapacityChange?.({ ...initialCapacity }, { ...initialBudget });
    }).catch((error) => {
      console.error("[VideoWallScheduler] Capacity initialization error:", error);
    });
    return () => { cancelled = true; };
  }, [onCapacityChange]);

  useEffect(() => {
    if (!enableSnapshots) {
      snapshotServiceRef.current?.stopAll();
      snapshotServiceRef.current = null;
      activeSnapshotIdsRef.current.clear();
      setSnapshotCount(0);
      return;
    }

    const service = new SnapshotService(snapshotBaseUrl, {
      onSnapshotReceived: (snapshot: SnapshotMetadata) => {
        setSnapshotUrls((current) => new Map(current).set(snapshot.cameraId, snapshot.url));
      },
    });
    snapshotServiceRef.current = service;
    return () => {
      service.stopAll();
      if (snapshotServiceRef.current === service) snapshotServiceRef.current = null;
      activeSnapshotIdsRef.current.clear();
    };
  }, [enableSnapshots, snapshotBaseUrl]);

  useEffect(() => {
    if (!isInitialized) return;
    let cancelled = false;
    const run = async () => {
      try {
        await runScheduler();
      } catch (error) {
        if (!cancelled) console.error("[VideoWallScheduler] Scheduling error:", error);
      }
    };
    void run();
    const interval = window.setInterval(() => { void run(); }, SCHEDULER_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [isInitialized, runScheduler]);

  useEffect(() => () => {
    snapshotServiceRef.current?.stopAll();
    void decoderPoolRef.current?.releaseAll();
  }, []);

  const refresh = useCallback(async () => {
    if (isInitialized) await runScheduler();
  }, [isInitialized, runScheduler]);

  const resetCapacity = useCallback(async () => {
    const nextCapacity = await capacityManagerRef.current!.reset();
    const nextBudget = await capacityManagerRef.current!.getResourceBudget();
    setCapacity({ ...nextCapacity });
    setBudget({ ...nextBudget });
    onCapacityChange?.({ ...nextCapacity }, { ...nextBudget });
    await refresh();
  }, [onCapacityChange, refresh]);

  const attachVideoElement = useCallback((cameraId: string, videoElement: HTMLVideoElement | null) => {
    const decoderPool = decoderPoolRef.current!;
    if (videoElement) decoderPool.attachVideoElement(cameraId, videoElement);
    else decoderPool.detachVideoElement(cameraId);
  }, []);

  const markPlaybackActive = useCallback((cameraId: string) => {
    const scheduled = scheduleRef.current.get(cameraId);
    if (!scheduled || !isLiveMode(scheduled.mode)) return;
    playbackFailuresRef.current.delete(cameraId);
    actualModesRef.current.set(cameraId, scheduled.mode);
    syncPlaybackStates(scheduleRef.current);
  }, [syncPlaybackStates]);

  const markPlaybackDeferred = useCallback((cameraId: string) => {
    actualModesRef.current.delete(cameraId);
    syncPlaybackStates(scheduleRef.current);
  }, [syncPlaybackStates]);

  const reportPlaybackFailure = useCallback((cameraId: string, reason?: string) => {
    actualModesRef.current.delete(cameraId);
    playbackFailuresRef.current.set(cameraId, {
      until: Date.now() + STREAM_FAILURE_COOLDOWN_MS,
      reason,
    });
    void decoderPoolRef.current!.release(cameraId).then(() => {
      const usage = decoderPoolRef.current!.getTotalUsage();
      capacityManagerRef.current!.updateUsage(usage.decoderCount, usage.totalBitrateMbps, usage.totalPixelsPerSecond);
      setActiveDecoderCount(usage.decoderCount);
      syncPlaybackStates(scheduleRef.current);
      void refresh();
    });
  }, [refresh, syncPlaybackStates]);

  return {
    schedule,
    playbackStates,
    snapshotUrls,
    capacity,
    budget,
    isInitialized,
    activeDecoderCount,
    snapshotCount,
    refresh,
    resetCapacity,
    attachVideoElement,
    markPlaybackActive,
    markPlaybackDeferred,
    reportPlaybackFailure,
  };
}
