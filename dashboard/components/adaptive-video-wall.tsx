"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { EnhancedCameraGrid } from "./enhanced-camera-grid";
import type { Camera } from "@/lib/types";

/** The operations wall is backed exclusively by the authenticated control plane. */
export function AdaptiveVideoWall() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCameras = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const token = typeof window === "undefined" ? null : localStorage.getItem("accessToken");
      const response = await fetch("/api/control/v1/cameras?limit=500&action=live%3Aview", {
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}`, "x-sentinel-session": token } : {}),
        },
        credentials: "include",
        cache: "no-store",
        signal,
      });
      
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { data?: unknown; error?: unknown; message?: unknown };
        const errorMsg = typeof body.message === "string" ? body.message : typeof body.error === "string" ? body.error : "Camera inventory request failed";
        
        // Provide specific error messages based on status code
        if (response.status === 401 || response.status === 403) {
          throw new Error("Authentication required. Please log in to view cameras.");
        } else if (response.status === 502 || response.status === 503) {
          throw new Error("Control plane service is unavailable. Please check your backend configuration.");
        } else if (response.status === 404) {
          throw new Error("Camera API endpoint not found. Please verify your installation.");
        } else {
          throw new Error(`${errorMsg} (HTTP ${response.status})`);
        }
      }
      
      const body = await response.json().catch(() => ({})) as { data?: unknown; error?: unknown; message?: unknown };
      const camerasData = Array.isArray(body.data) ? body.data as Camera[] : Array.isArray(body) ? body as Camera[] : [];
      setCameras(camerasData);
      
      if (camerasData.length === 0) {
        console.warn("No cameras returned from API");
      }
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setCameras([]);
      const errorMessage = reason instanceof Error ? reason.message : "Camera inventory is unavailable";
      setError(errorMessage);
      console.error("Failed to load cameras:", errorMessage, reason);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadCameras(controller.signal);
    return () => controller.abort();
  }, [loadCameras]);

  if (loading) {
    return <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-8 text-center text-sm text-slate-400">Loading cameras from the control plane…</div>;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-8 text-center">
        <AlertTriangle className="mx-auto mb-3 text-rose-300" size={24} />
        <p className="text-sm text-rose-200">Live camera inventory is unavailable.</p>
        <p className="mt-1 text-xs text-rose-300/80">{error}</p>
        <button type="button" onClick={() => void loadCameras()} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-rose-500/20 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-500/30">
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  if (cameras.length === 0) {
    return <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-8 text-center text-sm text-slate-400">No cameras are assigned to this operator or branch.</div>;
  }

  return <EnhancedCameraGrid cameras={cameras} adaptiveLayout enableVirtualScrolling maxConcurrentStreams={144} />;
}
