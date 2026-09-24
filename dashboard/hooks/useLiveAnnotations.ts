"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { io, Socket } from "socket.io-client";

export interface CameraAnnotation {
  id: string;
  cameraId: string;
  flagType: string;
  label: string;
  note: string;
  authorName: string;
  priority: "low" | "medium" | "high" | "critical";
  pinned: boolean;
  createdAt: string;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
}

export interface VideoWallDispatchEvent {
  displayCode: string;
  layout: string;
  assignedCameras: string[];
  dispatchedBy?: string;
  reason?: string;
  timestamp: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#22c55e",
};

export function useLiveAnnotations(cameraId?: string) {
  const [annotations, setAnnotations] = useState<CameraAnnotation[]>([]);
  const [allAnnotations, setAllAnnotations] = useState<Record<string, CameraAnnotation[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [lastDispatch, setLastDispatch] = useState<VideoWallDispatchEvent | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Fetch existing annotations from API
  const fetchAnnotations = useCallback(async () => {
    if (!cameraId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/v1/cameras/${encodeURIComponent(cameraId)}/annotations`);
      if (res.ok) {
        const data = await res.json();
        setAnnotations(data.annotations || []);
      }
    } catch {
      // network error – will still receive live updates via WebSocket
    } finally {
      setIsLoading(false);
    }
  }, [cameraId]);

  // Fetch all annotations across all cameras (for wall-level badge)
  const fetchAllAnnotations = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/cameras/annotations/all");
      if (res.ok) {
        const data = await res.json();
        setAllAnnotations(data.annotations || {});
      }
    } catch {}
  }, []);

  // Add a new annotation via API + optimistically update local state
  const addAnnotation = useCallback(
    async (params: {
      label: string;
      note: string;
      flagType?: string;
      priority?: "low" | "medium" | "high" | "critical";
      pinned?: boolean;
      authorName?: string;
    }): Promise<CameraAnnotation | null> => {
      if (!cameraId) return null;
      try {
        const res = await fetch(`/api/v1/cameras/${encodeURIComponent(cameraId)}/annotations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            flagType: params.flagType || "operator-note",
            label: params.label,
            note: params.note,
            priority: params.priority || "medium",
            pinned: params.pinned !== false,
            authorName: params.authorName,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          return data.annotation as CameraAnnotation;
        }
      } catch {}
      return null;
    },
    [cameraId]
  );

  // Resolve/remove an annotation
  const resolveAnnotation = useCallback(
    async (annotationId: string) => {
      if (!cameraId) return;
      try {
        await fetch(
          `/api/v1/cameras/${encodeURIComponent(cameraId)}/annotations/${encodeURIComponent(annotationId)}`,
          { method: "DELETE" }
        );
      } catch {}
    },
    [cameraId]
  );

  // Setup WebSocket subscription for live collaborative updates
  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || (typeof window !== "undefined" ? window.location.origin : "");
    const socket = io(wsUrl, {
      path: "/ws",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      // Subscribe to annotation updates for this camera and tenant-wide
      if (cameraId) {
        socket.emit("subscribe", `camera:${cameraId}:annotations`);
      }
    });

    socket.on("camera:annotation:updated", (event: CameraAnnotation & { action: string }) => {
      if (event.action === "create" || event.action === "update") {
        if (event.cameraId === cameraId || !cameraId) {
          setAnnotations((prev) => {
            const exists = prev.some((a) => a.id === event.id);
            if (exists) {
              return prev.map((a) => (a.id === event.id ? { ...a, ...event } : a));
            }
            return [event, ...prev];
          });
        }
        // Also update allAnnotations map for wall-level badges
        setAllAnnotations((prev) => {
          const next = { ...prev };
          const key = event.cameraId;
          if (!next[key]) next[key] = [];
          const exists = next[key].some((a) => a.id === event.id);
          if (!exists) {
            next[key] = [event, ...next[key]];
          }
          return next;
        });
      } else if (event.action === "resolve") {
        setAnnotations((prev) => prev.filter((a) => a.id !== event.id));
        setAllAnnotations((prev) => {
          const next = { ...prev };
          const key = event.cameraId;
          if (next[key]) {
            next[key] = next[key].filter((a) => a.id !== event.id);
          }
          return next;
        });
      }
    });

    socket.on("video-wall:dispatch", (event: VideoWallDispatchEvent) => {
      setLastDispatch(event);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [cameraId]);

  // Initial fetch
  useEffect(() => {
    fetchAnnotations();
    fetchAllAnnotations();
  }, [fetchAnnotations, fetchAllAnnotations]);

  return {
    annotations,
    allAnnotations,
    lastDispatch,
    isLoading,
    addAnnotation,
    resolveAnnotation,
    refetch: fetchAnnotations,
    PRIORITY_COLORS,
  };
}
