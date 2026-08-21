"use client";

import { AlertTriangle, Camera, LoaderCircle, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EnhancedCameraGrid } from "./enhanced-camera-grid";
import type { Camera as CameraRecord } from "@/lib/types";

interface BranchSummary {
  id: string;
  name?: string;
}

const CAMERA_REQUEST_CONCURRENCY = 6;

export function AdaptiveVideoWall() {
  const [cameras, setCameras] = useState<CameraRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeStreams, setActiveStreams] = useState(0);

  const loadCameras = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setRefreshing(true);
    setError(null);

    try {
      const branchesResponse = await fetch("/api/branches", {
        headers: browserAuthHeaders(),
        credentials: "include",
        cache: "no-store",
        signal,
      });
      const branchesBody = await readJson(branchesResponse);
      if (!branchesResponse.ok) {
        throw new Error(getErrorMessage(branchesBody, "Unable to load branches"));
      }

      const branches = Array.isArray(branchesBody.data)
        ? branchesBody.data.filter((branch): branch is BranchSummary => Boolean(branch?.id))
        : [];
      const cameraResults = await fetchBranchCameras(branches, signal);
      const cameraMap = new Map<string, CameraRecord>();
      for (const result of cameraResults.results) {
        for (const camera of result) {
          if (!cameraMap.has(camera.id)) cameraMap.set(camera.id, camera);
        }
      }

      if (cameraMap.size === 0 && cameraResults.failedBranches > 0) {
        throw new Error("Camera inventory is unavailable");
      }

      setCameras([...cameraMap.values()]);
      setLastUpdated(new Date());
      setNotice(cameraResults.failedBranches > 0
        ? `${cameraResults.failedBranches} branch${cameraResults.failedBranches === 1 ? "" : "es"} could not be loaded. Showing available cameras.`
        : null);
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError(reason instanceof Error ? reason.message : "Unable to load camera inventory");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadCameras(controller.signal);
    return () => controller.abort();
  }, [loadCameras]);

  const priorityCameraIds = useMemo(
    () => cameras.filter((camera) => camera.status === "alert").map((camera) => camera.id),
    [cameras],
  );
  const onlineCount = cameras.filter((camera) => camera.status !== "offline").length;

  return (
    <section className="space-y-4" aria-label="Live camera wall">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/90 p-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-cyan-500/10 text-cyan-300">
            <Camera size={20} />
          </span>
          <div>
            <h2 className="text-base font-semibold text-slate-100">Authorized camera wall</h2>
            <p className="text-xs text-slate-400">
              {cameras.length} cameras / {onlineCount} reachable / {activeStreams} live decoders
              {lastUpdated ? ` / updated ${lastUpdated.toLocaleTimeString()}` : ""}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadCameras()}
          disabled={loading || refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-cyan-500/60 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Refreshing" : "Refresh cameras"}
        </button>
      </div>

      {notice && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          <AlertTriangle size={15} /> {notice}
        </div>
      )}

      {loading && cameras.length === 0 ? (
        <div className="grid min-h-64 place-items-center rounded-xl border border-slate-800 bg-slate-900/80 text-slate-400">
          <div className="flex items-center gap-2 text-sm"><LoaderCircle size={18} className="animate-spin" /> Loading authorized cameras...</div>
        </div>
      ) : error && cameras.length === 0 ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-center">
          <AlertTriangle className="mx-auto text-rose-300" size={28} />
          <p className="mt-3 text-sm font-semibold text-rose-100">{error}</p>
          <button type="button" onClick={() => void loadCameras()} className="mt-4 rounded-lg bg-rose-500/20 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-500/30">Try again</button>
        </div>
      ) : cameras.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 p-10 text-center text-sm text-slate-400">No authorized cameras are available for this account.</div>
      ) : (
        <EnhancedCameraGrid
          cameras={cameras}
          enableVirtualScrolling
          enableGPUAcceleration
          adaptiveLayout={false}
          maxConcurrentStreams={36}
          priorityCameraIds={priorityCameraIds}
          onActiveStreamsChange={setActiveStreams}
        />
      )}
    </section>
  );
}

async function fetchBranchCameras(branches: BranchSummary[], signal?: AbortSignal) {
  const results: CameraRecord[][] = [];
  let nextIndex = 0;
  let failedBranches = 0;

  const worker = async () => {
    while (true) {
      const index = nextIndex++;
      const branch = branches[index];
      if (!branch) return;
      try {
        const response = await fetch(`/api/branches/${encodeURIComponent(branch.id)}/cameras`, {
          headers: browserAuthHeaders(),
          credentials: "include",
          cache: "no-store",
          signal,
        });
        const body = await readJson(response);
        if (!response.ok) throw new Error(getErrorMessage(body, "Camera request failed"));
        results[index] = Array.isArray(body.data) ? body.data as CameraRecord[] : [];
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") throw reason;
        failedBranches += 1;
        results[index] = [];
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CAMERA_REQUEST_CONCURRENCY, branches.length) }, () => worker()));
  return { results, failedBranches };
}

async function readJson(response: Response): Promise<{ data?: unknown; error?: unknown; message?: unknown }> {
  return await response.json().catch(() => ({}));
}

function getErrorMessage(body: { error?: unknown; message?: unknown }, fallback: string) {
  return typeof body.message === "string" ? body.message : typeof body.error === "string" ? body.error : fallback;
}

function browserAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = window.localStorage.getItem("accessToken");
  return token
    ? { "x-sentinel-session": token, authorization: `Bearer ${token}` }
    : {};
}
