/**
 * Media Orchestrator Hook
 * Frontend integration with backend media orchestration services
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type {
  MediaSession,
  ClientMediaCapabilities,
  TileStreamState,
} from "@/lib/media-types";

export interface MediaOrchestratorOptions {
  autoRegisterClient?: boolean;
  heartbeatIntervalMs?: number;
}

export interface CameraTileState {
  cameraId: string;
  streamState: TileStreamState;
  session: MediaSession | null;
  degraded: boolean;
  lastError?: string;
  isVisible: boolean;
  priority: number;
}

export function useMediaOrchestrator(options: MediaOrchestratorOptions) {
  const [tileStates, setTileStates] = useState<Map<string, CameraTileState>>(
    new Map()
  );
  const [clientCapabilities, setClientCapabilities] = useState<ClientMediaCapabilities | null>(null);
  
  const sessionsRef = useRef<Map<string, MediaSession>>(new Map());
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const visibilityObserverRef = useRef<IntersectionObserver | null>(null);

  /**
   * Detect client capabilities
   */
  const detectClientCapabilities = useCallback((): ClientMediaCapabilities => {
    const hardwareConcurrency = navigator.hardwareConcurrency || 4;
    const logicalProcessors = hardwareConcurrency;

    // Check for WebCodecs API
    const webCodecsAvailable = "VideoDecoder" in window;

    // Check for WebRTC
    const webRtcAvailable = "RTCPeerConnection" in window;

    // H.265 support detection (simplified)
    const h265Supported = false; // Would need more sophisticated detection

    // Screen resolution
    const screenResolution = {
      width: window.screen.width,
      height: window.screen.height,
    };

    // Estimate decode class based on hardware
    let estimatedDecodeClass: ClientMediaCapabilities["estimatedDecodeClass"];
    if (hardwareConcurrency >= 16 && webCodecsAvailable) {
      estimatedDecodeClass = "VIDEO_WALL";
    } else if (hardwareConcurrency >= 8) {
      estimatedDecodeClass = "HIGH";
    } else if (hardwareConcurrency >= 4) {
      estimatedDecodeClass = "STANDARD";
    } else {
      estimatedDecodeClass = "LOW";
    }

    // Check for dedicated GPU (heuristic based on memory)
    const gpuAccelerationAvailable = 
      (navigator as any).deviceMemory >= 8 || hardwareConcurrency >= 8;

    return {
      logicalProcessors,
      hardwareConcurrency,
      webCodecsAvailable,
      webRtcAvailable,
      h265Supported,
      estimatedDecodeClass,
      screenResolution,
    };
  }, []);

  /**
   * Register client with backend
   */
  const registerClient = useCallback(async (capabilities: ClientMediaCapabilities) => {
    try {
      const response = await fetch("/api/media/client/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(capabilities),
      });

      if (!response.ok) {
        throw new Error("Failed to register client");
      }

      const result = await response.json();
      console.log("Client registered with media orchestrator", result);
      return result;
    } catch (error) {
      console.error("Failed to register client:", error);
      throw error;
    }
  }, []);

  /**
   * Request media session
   */
  const requestSession = useCallback(
    async (
      cameraId: string,
      branchId: string,
      options: {
        purpose?: "MONITORING" | "INVESTIGATION" | "INCIDENT" | "PLAYBACK";
        preferredQuality?: "AUTO" | "SUBSTREAM" | "MAINSTREAM";
        priority?: number;
      } = {}
    ): Promise<{ session: MediaSession | null; degraded: boolean; reason: string }> => {
      try {
        const response = await fetch("/api/media/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            cameraId,
            branchId,
            purpose: options.purpose || "MONITORING",
            preferredQuality: options.preferredQuality || "AUTO",
            priority: options.priority || 0,
            clientCapabilities: clientCapabilities,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          return {
            session: null,
            degraded: false,
            reason: result.error || "Failed to create session",
          };
        }

        // Store session
        if (result.session) {
          sessionsRef.current.set(cameraId, result.session);

          // Update tile state
          setTileStates((prev) => {
            const newStates = new Map(prev);
            const existing = newStates.get(cameraId);
            newStates.set(cameraId, {
              cameraId,
              streamState: "CONNECTING",
              session: result.session,
              degraded: result.degraded,
              isVisible: existing?.isVisible ?? true,
              priority: options.priority || 0,
            });
            return newStates;
          });
        }

        return {
          session: result.session,
          degraded: result.degraded,
          reason: result.message,
        };
      } catch (error) {
        console.error("Failed to request session:", error);
        return {
          session: null,
          degraded: false,
          reason: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
    [clientCapabilities]
  );

  /**
   * Close media session
   */
  const closeSession = useCallback(async (cameraId: string): Promise<boolean> => {
    const session = sessionsRef.current.get(cameraId);
    if (!session) {
      return false;
    }

    try {
      const response = await fetch(`/api/media/sessions/${session.id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.ok) {
        sessionsRef.current.delete(cameraId);

        // Update tile state
        setTileStates((prev) => {
          const newStates = new Map(prev);
          const existing = newStates.get(cameraId);
          if (existing) {
            newStates.set(cameraId, {
              ...existing,
              streamState: "METADATA_ONLY",
              session: null,
            });
          }
          return newStates;
        });

        return true;
      }

      return false;
    } catch (error) {
      console.error("Failed to close session:", error);
      return false;
    }
  }, []);

  /**
   * Send heartbeat for all active sessions
   */
  const sendHeartbeats = useCallback(async () => {
    const sessions = Array.from(sessionsRef.current.values());

    for (const session of sessions) {
      try {
        await fetch(`/api/media/sessions/${session.id}/heartbeat`, {
          method: "POST",
          credentials: "include",
        });
      } catch (error) {
        console.error("Failed to send heartbeat:", error);
      }
    }
  }, []);

  /**
   * Update tile state
   */
  const updateTileState = useCallback(
    (cameraId: string, updates: Partial<CameraTileState>) => {
      setTileStates((prev) => {
        const newStates = new Map(prev);
        const existing = newStates.get(cameraId);
        
        newStates.set(cameraId, {
          cameraId,
          streamState: "METADATA_ONLY",
          session: null,
          degraded: false,
          isVisible: false,
          priority: 0,
          ...existing,
          ...updates,
        });

        return newStates;
      });
    },
    []
  );

  /**
   * Set tile visibility
   */
  const setTileVisibility = useCallback(
    (cameraId: string, visible: boolean) => {
      updateTileState(cameraId, { isVisible: visible });
    },
    [updateTileState]
  );

  /**
   * Update stream state for camera
   */
  const updateStreamState = useCallback(
    (cameraId: string, state: TileStreamState, error?: string) => {
      updateTileState(cameraId, { streamState: state, lastError: error });
    },
    [updateTileState]
  );

  /**
   * Initialize intersection observer for visibility tracking
   */
  const initVisibilityTracking = useCallback(
    (
      containerRef: React.RefObject<HTMLElement>,
      getTileElement: (cameraId: string) => HTMLElement | null
    ) => {
      if (visibilityObserverRef.current) {
        visibilityObserverRef.current.disconnect();
      }

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const cameraId = entry.target.getAttribute("data-camera-id");
            if (cameraId) {
              setTileVisibility(cameraId, entry.isIntersecting);
            }
          });
        },
        {
          root: containerRef.current,
          rootMargin: "50px", // Buffer for smooth loading
          threshold: 0.1,
        }
      );

      visibilityObserverRef.current = observer;

      return observer;
    },
    [setTileVisibility]
  );

  // Auto-register client on mount
  useEffect(() => {
    if (options.autoRegisterClient !== false) {
      const capabilities = detectClientCapabilities();
      setClientCapabilities(capabilities);
      registerClient(capabilities).catch(console.error);
    }
  }, [options.autoRegisterClient, detectClientCapabilities, registerClient]);

  // Start heartbeat timer
  useEffect(() => {
    const interval = options.heartbeatIntervalMs || 30_000; // 30 seconds

    heartbeatTimerRef.current = setInterval(() => {
      sendHeartbeats();
    }, interval);

    return () => {
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
      }
    };
  }, [options.heartbeatIntervalMs, sendHeartbeats]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Close all sessions
      const cameraIds = Array.from(sessionsRef.current.keys());
      cameraIds.forEach((cameraId) => closeSession(cameraId));

      // Disconnect observer
      if (visibilityObserverRef.current) {
        visibilityObserverRef.current.disconnect();
      }
    };
  }, [closeSession]);

  return {
    // State
    tileStates,
    clientCapabilities,

    // Actions
    requestSession,
    closeSession,
    updateTileState,
    updateStreamState,
    setTileVisibility,
    initVisibilityTracking,

    // Utilities
    registerClient,
    detectClientCapabilities,
  };
}
