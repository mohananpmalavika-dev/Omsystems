"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { TileStreamState } from "@/lib/media-types";

type StreamRequest = { cameraId: string; stream: "main" | "sub"; priority: number };

export type StreamSchedulerContextValue = {
  requestStream: (cameraId: string, stream?: "main" | "sub") => void;
  releaseStream: (cameraId: string) => void;
  tileStates: Map<string, TileStreamState>;
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

  // Scheduling loop: decide which visible cameras should be started
  useEffect(() => {
    const doSchedule = () => {
      const totalPositions = gridPositions.size || 0;
      const visibleEntries: Array<{ cameraId: string; stream: "main" | "sub"; priority: boolean }> = [];
      for (let position = visibleRange.start; position < visibleRange.end; position += 1) {
        const entry = gridPositions.get(position);
        if (!entry) continue;
        visibleEntries.push({ cameraId: entry.cameraId, stream: entry.stream, priority: Boolean(entry.priority) || prioritySet.has(entry.cameraId) });
      }
      const urgent = visibleEntries.filter((e) => e.priority);
      const normal = visibleEntries.filter((e) => !e.priority);
      const rotated = sequencing.current && normal.length > 0
        ? [...normal.slice(sequenceOffset.current % normal.length), ...normal.slice(0, sequenceOffset.current % normal.length)]
        : normal;
      const targetEntries = [...urgent, ...rotated].slice(0, decoderLimit);
      const targetIds = new Set(targetEntries.map((e) => e.cameraId));

      // Release active sessions not in target
      for (const id of [...activeSessions.current]) {
        if (!targetIds.has(id) && tileStates.get(id) === "LIVE_SUBSTREAM" || tileStates.get(id) === "LIVE_MAINSTREAM") {
          // mark as to be released
          setTileStates((prev) => {
            const copy = new Map(prev);
            copy.set(id, "PAUSED");
            return copy;
          });
          activeSessions.current.delete(id);
        }
      }

      // Start candidates
      const available = Math.max(0, decoderLimit - activeSessions.current.size - loading.current.size);
      const candidates = targetEntries.filter((entry) => !activeSessions.current.has(entry.cameraId) && !loading.current.has(entry.cameraId) && !autoAttempted.current.has(entry.cameraId));
      for (const candidate of candidates.slice(0, available)) {
        autoAttempted.current.add(candidate.cameraId);
        loading.current.add(candidate.cameraId);
        setTileStates((prev) => new Map(prev).set(candidate.cameraId, "QUEUED"));
        onStartStream({ cameraId: candidate.cameraId, stream: candidate.stream, priority: candidate.priority ? 1 : 0 });
      }
    };

    // Run immediately and on changes
    doSchedule();
    // Also run periodically
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
    setVisibleRange,
    setGridPositions,
    setPrioritySet,
    setDecoderLimit,
  }), [tileStates]);

  return (
    <StreamSchedulerContext.Provider value={contextValue}>
      {children}
    </StreamSchedulerContext.Provider>
  );
}
