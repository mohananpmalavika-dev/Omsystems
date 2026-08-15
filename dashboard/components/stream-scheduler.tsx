"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { TileStreamState } from "@/lib/media-types";
import type { StreamCost, StreamProfile, ScheduledCamera } from "../lib/video/types";
import { calculateStreamCost } from "../lib/video/cost";

type StreamRequest = { cameraId: string; stream: "main" | "sub"; priority: number };

export type StreamSchedulerContextValue = {
  requestStream: (cameraId: string, stream?: "main" | "sub") => void;
  releaseStream: (cameraId: string) => void;
  tileStates: Map<string, TileStreamState>;
  scheduled: Map<string, ScheduledCamera>;
  setVisibleRange: (start: number, end: number) => void;
  setGridPositions: (positions: Map<number, { cameraId: string; stream: "main" | "sub"; priority?: number }>) => void;
  setPrioritySet: (ids: Set<string>) => void;
  setDecoderLimit: (limit: number) => void;
};

const StreamSchedulerContext = createContext<StreamSchedulerContextValue | null>(null);

export function useStreamScheduler() {
  const ctx = useContext(StreamSchedulerContext);
  if (!ctx) throw new Error("useStreamScheduler must be used within StreamSchedulerProvider");
  return ctx;
}

// Conservative default profiles for Phase 2 when server-side profiles are not yet available
function defaultProfile(cameraId: string, stream: "main" | "sub"): StreamProfile {
  if (stream === "main") {
    return { cameraId, streamType: "MAIN", codec: "H264", width: 1280, height: 720, fps: 25, estimatedBitrateKbps: 2000 };
  }
  return { cameraId, streamType: "SUB", codec: "H264", width: 640, height: 360, fps: 10, estimatedBitrateKbps: 400 };
}

export function StreamSchedulerProvider({
  children,
  onStartStream,
  decoderLimitInitial = 36,
  sequencingInitial = true,
}: {
  children: React.ReactNode;
  onStartStream: (req: StreamRequest) => void;
  decoderLimitInitial?: number;
  sequencingInitial?: boolean;
}) {
  const [visibleRange, setVisibleRangeState] = useState({ start: 0, end: 50 });
  const [gridPositions, setGridPositionsState] = useState(new Map<number, { cameraId: string; stream: "main" | "sub"; priority?: number }>());
  const [prioritySet, setPrioritySetState] = useState<Set<string>>(new Set());
  const [decoderLimit, setDecoderLimitState] = useState<number>(decoderLimitInitial);
  const sequencing = useRef<boolean>(sequencingInitial);
  const sequenceOffset = useRef<number>(0);
  const autoAttempted = useRef<Set<string>>(new Set());
  const [tileStates, setTileStates] = useState<Map<string, TileStreamState>>(new Map());
  const [scheduled, setScheduled] = useState<Map<string, ScheduledCamera>>(new Map());

  // External sessions tracker - simplified local view
  const activeSessions = useRef<Set<string>>(new Set());
  const loading = useRef<Set<string>>(new Set());

  useEffect(() => {
    let timer: number | undefined;
    if (sequencing.current) {
      timer = window.setInterval(() => { sequenceOffset.current += 1; }, 15_000) as unknown as number;
    }
    return () => { if (timer) window.clearInterval(timer); };
  }, []);

  // Simple resource budget for Phase 2
  function createBudget(): {
    decoderBudget: number;
    bitrateBudgetMbps: number;
    pixelsPerSecondBudget: number;
    decoderUsage: number;
    bitrateUsageMbps: number;
    pixelsPerSecondUsage: number;
  } {
    return {
      decoderBudget: decoderLimit,
      bitrateBudgetMbps: 25, // conservative default
      pixelsPerSecondBudget: 300_000_000, // 300 MP/s
      decoderUsage: 0,
      bitrateUsageMbps: 0,
      pixelsPerSecondUsage: 0,
    };
  }

  function canAdmit(cost: StreamCost, budget: ReturnType<typeof createBudget>) {
    return (
      budget.decoderUsage + cost.decoderUnits <= budget.decoderBudget &&
      budget.bitrateUsageMbps + cost.bitrateMbps <= budget.bitrateBudgetMbps &&
      budget.pixelsPerSecondUsage + cost.pixelsPerSecond <= budget.pixelsPerSecondBudget
    );
  }

  // Scheduling loop: decide which visible cameras should be started (cost-aware)
  useEffect(() => {
    const doSchedule = () => {
      const visibleEntries: Array<{ cameraId: string; stream: "main" | "sub"; priority: boolean; position: number }> = [];
      for (let position = visibleRange.start; position < visibleRange.end; position += 1) {
        const entry = gridPositions.get(position);
        if (!entry) continue;
        visibleEntries.push({ cameraId: entry.cameraId, stream: entry.stream, priority: Boolean(entry.priority) || prioritySet.has(entry.cameraId), position });
      }

      // Score/priority: operatorPinned/prioritySet first, then position order (rotation applied below)
      const urgent = visibleEntries.filter((e) => e.priority);
      const normal = visibleEntries.filter((e) => !e.priority);
      const rotated = sequencing.current && normal.length > 0
        ? [...normal.slice(sequenceOffset.current % normal.length), ...normal.slice(0, sequenceOffset.current % normal.length)]
        : normal;
      const candidates = [...urgent, ...rotated];

      // Build budget
      const budget = createBudget();

      // Release decisions: anything currently active but not in candidates should be paused
      const candidateIds = new Set(candidates.map((c) => c.cameraId));
      for (const id of [...activeSessions.current]) {
        const state = tileStates.get(id);
        if (!candidateIds.has(id) && (state === "LIVE_SUBSTREAM" || state === "LIVE_MAINSTREAM")) {
          setTileStates((prev) => {
            const copy = new Map(prev);
            copy.set(id, "PAUSED");
            return copy;
          });
          activeSessions.current.delete(id);
        }
      }

      // Compute admission in priority order, checking budgets using cost
      const newScheduled = new Map<string, ScheduledCamera>();

      // First, re-add already-active streams and account for their cost
      for (const id of activeSessions.current) {
        const state = tileStates.get(id);
        if (!state) continue;
        const streamType = state === "LIVE_MAINSTREAM" ? "main" : "sub";
        const profile = defaultProfile(id, streamType as any);
        const cost = calculateStreamCost(profile);
        budget.decoderUsage += cost.decoderUnits;
        budget.bitrateUsageMbps += cost.bitrateMbps;
        budget.pixelsPerSecondUsage += cost.pixelsPerSecond;
        newScheduled.set(id, {
          cameraId: id,
          mode: state === "LIVE_MAINSTREAM" ? "MAIN_STREAM" : "SUB_STREAM",
          priority: (prioritySet.has(id) ? "P4_VISIBLE" : "P6_BACKGROUND") as any,
          priorityScore: prioritySet.has(id) ? 5000 : 0,
          reason: prioritySet.has(id) ? "VISIBLE" : "BACKGROUND",
          streamProfile: profile,
          streamCost: cost,
        });
      }

      for (const candidate of candidates) {
        // Skip already active
        if (activeSessions.current.has(candidate.cameraId)) continue;
        // Skip loading
        if (loading.current.has(candidate.cameraId)) continue;

        const profile = defaultProfile(candidate.cameraId, candidate.stream);
        const cost = calculateStreamCost(profile);

        if (canAdmit(cost, budget)) {
          // Admit
          budget.decoderUsage += cost.decoderUnits;
          budget.bitrateUsageMbps += cost.bitrateMbps;
          budget.pixelsPerSecondUsage += cost.pixelsPerSecond;
          newScheduled.set(candidate.cameraId, {
            cameraId: candidate.cameraId,
            mode: candidate.stream === "main" ? "MAIN_STREAM" : "SUB_STREAM",
            priority: candidate.priority ? "P4_VISIBLE" : "P6_BACKGROUND",
            priorityScore: candidate.priority ? 6000 : 1000,
            reason: candidate.priority ? "VISIBLE" : "ROTATION",
            streamProfile: profile,
            streamCost: cost,
          });
        } else {
          // Not admitted: snapshot/rotating
          newScheduled.set(candidate.cameraId, {
            cameraId: candidate.cameraId,
            mode: "SNAPSHOT",
            priority: candidate.priority ? "P4_VISIBLE" : "P6_BACKGROUND",
            priorityScore: candidate.priority ? 4000 : 500,
            reason: candidate.priority ? "VISIBLE" : "ROTATION",
            streamProfile: profile,
            streamCost: cost,
          });
        }
      }

      // Now enact start/stop decisions based on newScheduled vs activeSessions
      for (const [cameraId, sched] of newScheduled) {
        const currentlyActive = activeSessions.current.has(cameraId);
        if ((sched.mode === "MAIN_STREAM" || sched.mode === "SUB_STREAM") && !currentlyActive) {
          // Attempt to start
          loading.current.add(cameraId);
          setTileStates((prev) => new Map(prev).set(cameraId, "QUEUED"));
          onStartStream({ cameraId, stream: sched.mode === "MAIN_STREAM" ? "main" : "sub", priority: sched.priorityScore });
        }
      }

      setScheduled(newScheduled);
    };

    doSchedule();
    const interval = window.setInterval(doSchedule, 2000);
    return () => window.clearInterval(interval);
  }, [gridPositions, visibleRange, prioritySet, decoderLimit, tileStates, onStartStream]);

  const requestStream = (cameraId: string, stream: "main" | "sub" = "sub") => {
    // User-initiated request -> high priority immediate
    setTileStates((prev) => new Map(prev).set(cameraId, "QUEUED"));
    onStartStream({ cameraId, stream, priority: 1000 });
  };

  const releaseStream = (cameraId: string) => {
    setTileStates((prev) => {
      const copy = new Map(prev);
      copy.set(cameraId, "PAUSED");
      return copy;
    });
    activeSessions.current.delete(cameraId);
  };

  const setVisibleRange = (start: number, end: number) => setVisibleRangeState({ start, end });
  const setGridPositions = (positions: Map<number, { cameraId: string; stream: "main" | "sub"; priority?: number }>) => setGridPositionsState(new Map(positions));
  const setPrioritySet = (ids: Set<string>) => setPrioritySetState(new Set(ids));
  const setDecoderLimit = (limit: number) => setDecoderLimitState(limit);

  const contextValue = useMemo(() => ({
    requestStream,
    releaseStream,
    tileStates,
    scheduled,
    setVisibleRange,
    setGridPositions,
    setPrioritySet,
    setDecoderLimit,
  }), [tileStates, scheduled]);

  return (
    <StreamSchedulerContext.Provider value={contextValue}>
      {children}
    </StreamSchedulerContext.Provider>
  );
}
