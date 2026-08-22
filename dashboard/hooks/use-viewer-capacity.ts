"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  ViewerCapacityManager,
  type CameraTileState,
  type StreamCandidate,
  type StreamPriority,
  type ViewerCapacity,
  type ViewerPerformance,
} from "@/lib/viewer-capacity";

export interface UseViewerCapacityOptions {
  customDecoderLimit?: number;
  onPressureChange?: (pressure: string) => void;
  rebalanceIntervalMs?: number;
}

export function useViewerCapacity(options?: UseViewerCapacityOptions) {
  const managerRef = useRef<ViewerCapacityManager | null>(null);

  if (!managerRef.current) {
    managerRef.current = new ViewerCapacityManager(
      options?.customDecoderLimit ? { maxVideoDecoders: options.customDecoderLimit } : undefined
    );
  }

  const manager = managerRef.current;

  const [capacity, setCapacity] = useState<ViewerCapacity>(() => manager.getCapacity());
  const [telemetry, setTelemetry] = useState<ViewerPerformance | null>(null);
  const [tileStates, setTileStates] = useState<Map<string, CameraTileState>>(new Map());

  // Listen to pressure changes
  useEffect(() => {
    const unsub = manager.getEventBus().on("pressure.changed", ({ current }) => {
      options?.onPressureChange?.(current);
    });
    return unsub;
  }, [manager, options]);

  const requestStream = useCallback(
    async (candidate: StreamCandidate) => {
      const result = await manager.admit(candidate);
      setCapacity(manager.getCapacity());
      return result;
    },
    [manager]
  );

  const releaseStream = useCallback(
    (cameraId: string) => {
      manager.release(cameraId);
      setCapacity(manager.getCapacity());
    },
    [manager]
  );

  const promoteCamera = useCallback(
    async (cameraId: string, priority: StreamPriority, metadata?: Partial<StreamCandidate>) => {
      const result = await manager.promote(cameraId, priority, metadata);
      setCapacity(manager.getCapacity());
      return result;
    },
    [manager]
  );

  const rebalanceGrid = useCallback(
    async (candidates: StreamCandidate[]) => {
      const { allocations, telemetry: perf } = await manager.rebalance(candidates);
      setTileStates(allocations);
      setTelemetry(perf);
      setCapacity(manager.getCapacity());
      return { allocations, telemetry: perf };
    },
    [manager]
  );

  const recordQuality = useCallback(
    (cameraId: string, totalFrames: number, droppedFrames: number) => {
      manager.recordPlaybackQuality(cameraId, { totalFrames, droppedFrames });
    },
    [manager]
  );

  return {
    manager,
    capacity,
    entitlement: manager.getEntitlement(),
    telemetry,
    tileStates,
    requestStream,
    releaseStream,
    promoteCamera,
    rebalanceGrid,
    recordQuality,
  };
}
