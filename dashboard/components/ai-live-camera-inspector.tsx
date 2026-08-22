"use client";

import { useEffect, useState } from "react";
import {
  Camera,
  Cpu,
  Eye,
  Sparkles,
} from "lucide-react";

type CameraOption = {
  id: string;
  name: string;
  ipAddress?: string;
  status: string;
};

export function AiLiveCameraInspector({
  mode = "face",
  title = "Live Camera AI Vision Stream",
  onDetectionTriggered,
}: {
  mode?: "face" | "anpr" | "people" | "banking" | "safety";
  title?: string;
  onDetectionTriggered?: (event: any) => void;
}) {
  const [cameras, setCameras] = useState<CameraOption[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [loadingCameras, setLoadingCameras] = useState(true);
  const [recentDetections, setRecentDetections] = useState<any[]>([]);

  useEffect(() => {
    let active = true;
    async function loadCameras() {
      try {
        const res = await fetch("/api/admin/system/cameras/all", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : data.data || [];
          if (active && list.length > 0) {
            setCameras(list);
            setSelectedCameraId(list[0].id);
          }
        }
      } catch (e) {
        // fallback
      } finally {
        if (active) setLoadingCameras(false);
      }
    }
    loadCameras();
    return () => {
      active = false;
    };
  }, []);

  const selectedCam = cameras.find((c) => c.id === selectedCameraId) || cameras[0];

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xl mb-5">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-4 sm:p-5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-500/15 text-cyan-400">
            <Cpu size={18} />
          </span>
          <div>
            <p className="text-[10px] font-bold tracking-[.18em] text-cyan-400">AI PIPELINE STATUS</p>
            <h2 className="text-base font-semibold text-slate-100 sm:text-lg">{title}</h2>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <label className="text-xs text-slate-400 flex items-center gap-1.5 font-medium">
            <Camera size={14} className="text-slate-500" />
            <select
              value={selectedCameraId}
              onChange={(e) => setSelectedCameraId(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-cyan-500"
              disabled={loadingCameras || cameras.length === 0}
            >
              {cameras.length === 0 ? (
                <option value="">No cameras enrolled</option>
              ) : (
                cameras.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.ipAddress ? `(${c.ipAddress})` : ""}
                  </option>
                ))
              )}
            </select>
          </label>

          <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-400">Not configured</span>
        </div>
      </header>

      <div className="grid gap-0 lg:grid-cols-[1.5fr_1fr]">
        <div className="relative aspect-video w-full bg-black flex items-center justify-center overflow-hidden border-b lg:border-b-0 lg:border-r border-slate-800">
          <div className="text-center p-6 text-slate-500 text-xs">
            <Camera size={28} className="mx-auto mb-2 opacity-50" />
            {selectedCam ? "A live media session is required before AI inspection can start." : "Select a camera to start live AI inspection"}
          </div>
        </div>

        <div className="p-4 sm:p-5 flex flex-col justify-between space-y-4 bg-slate-950/60">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Sparkles size={14} className="text-amber-400" />
                Live Inference Stream
              </span>
              <span className="text-[11px] text-slate-500">Waiting for configured analytics telemetry</span>
            </div>

            <div className="mt-3 space-y-2">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-slate-500 text-[10px] block">Model Pipeline</span>
                  <strong className="text-slate-200">Custom YOLOv8</strong>
                </div>
                <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-slate-500 text-[10px] block">Active Camera</span>
                  <strong className="text-cyan-300 truncate block">{selectedCam?.name || "None"}</strong>
                </div>
              </div>

              <div className="mt-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Live Detections Feed
                </p>
                {recentDetections.length === 0 ? (
                  <div className="text-center py-6 border border-dashed border-slate-800 rounded-xl text-slate-500 text-xs">
                    <Eye size={20} className="mx-auto mb-1.5 opacity-40" />
                    Waiting for detections from model...
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recentDetections.map((det, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-cyan-500/20 text-xs animate-fadeIn"
                      >
                        <div>
                          <strong className="text-cyan-400 font-mono block text-[11px]">
                            {det.rawEventType}
                          </strong>
                          <span className="text-slate-400 text-[10px]">
                            {det.attributes?.plateNumber || det.attributes?.personName || "Visual Match"}
                          </span>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          {Math.round(det.confidence * 100)}% Match
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 border-t border-slate-800/80 pt-3 flex items-center justify-between">
            <span>REST API: <code className="text-cyan-400 font-mono text-[10px]">POST /api/v1/ai/events</code></span>
            <span className="text-slate-500">No analytics stream configured</span>
          </div>
        </div>
      </div>
    </section>
  );
}
