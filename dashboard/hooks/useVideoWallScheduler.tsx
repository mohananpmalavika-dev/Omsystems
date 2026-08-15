"use client";

import { useEffect, useState } from "react";
import { defaultViewerCapacityManager } from "../services/video/viewer-capacity-manager";
import { useStreamScheduler } from "../components/stream-scheduler";
import type { ViewerCapacity, CameraPlaybackState } from "../lib/video/types";

export function useVideoWallScheduler({ decoderLimit }: { decoderLimit: number }) {
  const scheduler = useStreamScheduler();
  const [capacity, setCapacity] = useState<ViewerCapacity | null>(null);
  const [scheduledStates, setScheduledStates] = useState<Map<string, CameraPlaybackState>>(new Map());

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Initialize the viewer capacity manager conservatively
        const c = await defaultViewerCapacityManager.initialize();
        if (!mounted) return;
        // Allow the recommended limit to be influenced by the provided decoderLimit
        const merged = {
          ...c,
          recommendedDecoderLimit: Math.min(c.recommendedDecoderLimit, decoderLimit),
        } as ViewerCapacity;
        setCapacity(merged);
      } catch (e) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, [decoderLimit]);

  useEffect(() => {
    // Derive a simple playback state map from the scheduler tileStates for Phase 1.
    const map = new Map<string, CameraPlaybackState>();
    try {
      const tileStates = (scheduler as any).tileStates as Map<string, string> | undefined;
      if (!tileStates) {
        setScheduledStates(map);
        return;
      }

      for (const [cameraId, state] of tileStates.entries()) {
        let actualMode: CameraPlaybackState["actualMode"] = "SNAPSHOT";
        if (state === "LIVE_MAINSTREAM") actualMode = "MAIN_STREAM";
        else if (state === "LIVE_SUBSTREAM") actualMode = "SUB_STREAM";
        else if (state === "QUEUED") actualMode = "ROTATING";
        else if (state === "PAUSED" || state === "ERROR") actualMode = "SUSPENDED";

        map.set(cameraId, {
          cameraId,
          desiredMode: actualMode,
          actualMode,
          priority: "P4_VISIBLE",
          priorityScore: 0,
          decoderAllocated: actualMode === "MAIN_STREAM" || actualMode === "SUB_STREAM",
        } as CameraPlaybackState);
      }
    } catch (e) {
      // ignore
    }
    setScheduledStates(map);
  }, [scheduler, (scheduler as any)?.tileStates]);

  return { capacity, scheduledStates } as { capacity: ViewerCapacity | null; scheduledStates: Map<string, CameraPlaybackState> };
}
