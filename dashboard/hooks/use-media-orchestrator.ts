/**
 * Client-side tile state for the live video wall.
 *
 * Stream authorization and lifecycle are owned by `/api/live` and the media
 * gateway. This hook deliberately keeps no parallel media-session API or
 * fabricated client registration state.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMediaCapabilities, TileStreamState } from "@/lib/media-types";

export interface MediaOrchestratorOptions {
  autoRegisterClient?: boolean;
}

export interface CameraTileState {
  cameraId: string;
  streamState: TileStreamState;
  lastError?: string;
  isVisible: boolean;
  priority: number;
}

export function useMediaOrchestrator(options: MediaOrchestratorOptions = {}) {
  const [tileStates, setTileStates] = useState<Map<string, CameraTileState>>(new Map());
  const [clientCapabilities, setClientCapabilities] = useState<ClientMediaCapabilities | null>(null);
  const visibilityObserverRef = useRef<IntersectionObserver | null>(null);

  const detectClientCapabilities = useCallback((): ClientMediaCapabilities => {
    const hardwareConcurrency = navigator.hardwareConcurrency || 1;
    const webCodecsAvailable = "VideoDecoder" in window;

    return {
      logicalProcessors: hardwareConcurrency,
      hardwareConcurrency,
      webCodecsAvailable,
      webRtcAvailable: "RTCPeerConnection" in window,
      h265Supported: false,
      estimatedDecodeClass:
        hardwareConcurrency >= 16 && webCodecsAvailable ? "VIDEO_WALL" :
        hardwareConcurrency >= 8 ? "HIGH" :
        hardwareConcurrency >= 4 ? "STANDARD" : "LOW",
      screenResolution: { width: window.screen.width, height: window.screen.height },
    };
  }, []);

  const updateTileState = useCallback((cameraId: string, updates: Partial<CameraTileState>) => {
    setTileStates((current) => {
      const next = new Map(current);
      next.set(cameraId, {
        cameraId,
        streamState: "METADATA_ONLY",
        isVisible: false,
        priority: 0,
        ...next.get(cameraId),
        ...updates,
      });
      return next;
    });
  }, []);

  const closeSession = useCallback((cameraId: string): boolean => {
    // The viewer releases the gateway grant when it closes. No parallel local
    // media-session API exists to acknowledge or fabricate a termination.
    updateTileState(cameraId, { streamState: "METADATA_ONLY", lastError: undefined });
    return true;
  }, [updateTileState]);

  const updateStreamState = useCallback((cameraId: string, state: TileStreamState, error?: string) => {
    updateTileState(cameraId, { streamState: state, lastError: error });
  }, [updateTileState]);

  const setTileVisibility = useCallback((cameraId: string, visible: boolean) => {
    updateTileState(cameraId, { isVisible: visible });
  }, [updateTileState]);

  const initVisibilityTracking = useCallback((
    containerRef: React.RefObject<HTMLElement>,
    _getTileElement: (cameraId: string) => HTMLElement | null,
  ) => {
    visibilityObserverRef.current?.disconnect();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const cameraId = entry.target.getAttribute("data-camera-id");
        if (cameraId) setTileVisibility(cameraId, entry.isIntersecting);
      }
    }, { root: containerRef.current, rootMargin: "50px", threshold: 0.1 });
    visibilityObserverRef.current = observer;
    return observer;
  }, [setTileVisibility]);

  useEffect(() => {
    if (options.autoRegisterClient === false) return;
    setClientCapabilities(detectClientCapabilities());
  }, [detectClientCapabilities, options.autoRegisterClient]);

  useEffect(() => () => visibilityObserverRef.current?.disconnect(), []);

  return {
    tileStates,
    clientCapabilities,
    closeSession,
    updateTileState,
    updateStreamState,
    setTileVisibility,
    initVisibilityTracking,
    detectClientCapabilities,
  };
}
