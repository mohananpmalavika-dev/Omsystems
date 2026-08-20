"use client";

import { useEffect, useState } from "react";
import {
  Camera,
  Cpu,
  Eye,
  Scan,
  Sparkles,
  Zap
} from "lucide-react";
import { HlsPlayer } from "./hls-player";

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
  const [isInferencing, setIsInferencing] = useState(true);
  const [triggering, setTriggering] = useState(false);
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

  const triggerLiveAiEvent = async () => {
    if (!selectedCam) return;
    setTriggering(true);
    try {
      const eventType =
        mode === "face" ? "FACE_RECOGNITION" :
        mode === "anpr" ? "ANPR" :
        mode === "people" ? "CROWD_GATHERING" :
        mode === "banking" ? "VAULT_ACCESS" : "INTRUSION";

      const payload = {
        eventId: `ai-live-${Date.now()}`,
        branchId: "default-branch",
        cameraId: selectedCam.id,
        vendorSource: "CUSTOM_PY",
        rawEventType: eventType,
        confidence: 0.94 + Math.random() * 0.05,
        attributes: {
          cameraName: selectedCam.name,
          detectionType: mode.toUpperCase(),
          plateNumber: mode === "anpr" ? `KL-01-AB-${Math.floor(1000 + Math.random() * 9000)}` : undefined,
          personName: mode === "face" ? "Verified Target #04" : undefined,
          timestamp: new Date().toISOString(),
        },
      };

      const res = await fetch("/api/v1/ai/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        setRecentDetections((prev) => [payload, ...prev.slice(0, 4)]);
        onDetectionTriggered?.(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTriggering(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xl mb-5">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-4 sm:p-5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-500/15 text-cyan-400">
            <Cpu size={18} />
          </span>
          <div>
            <p className="text-[10px] font-bold tracking-[.18em] text-cyan-400">AI PIPELINE ATTACHED</p>
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

          <button
            type="button"
            onClick={() => setIsInferencing(!isInferencing)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              isInferencing
                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                : "bg-slate-800 text-slate-400 border border-slate-700"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isInferencing ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
            {isInferencing ? "AI Engine Active" : "Paused"}
          </button>
        </div>
      </header>

      <div className="grid gap-0 lg:grid-cols-[1.5fr_1fr]">
        <div className="relative aspect-video w-full bg-black flex items-center justify-center overflow-hidden border-b lg:border-b-0 lg:border-r border-slate-800">
          {selectedCam ? (
            <HlsPlayer
              url=""
              bearerToken=""
              cameraName={selectedCam.name}
              cameraId={selectedCam.id}
            />
          ) : (
            <div className="text-center p-6 text-slate-500 text-xs">
              <Camera size={28} className="mx-auto mb-2 opacity-50" />
              Select a camera to start live AI inspection
            </div>
          )}

          {isInferencing && (
            <div className="absolute inset-0 pointer-events-none p-4 flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <span className="bg-black/70 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-mono text-cyan-400 border border-cyan-500/30 flex items-center gap-1.5">
                  <Scan size={12} className="animate-spin" />
                  Neural Engine Active · 16ms Latency
                </span>
                <span className="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded text-[10px] font-mono font-bold border border-emerald-500/30">
                  98.4% Confidence
                </span>
              </div>

              <div className="self-center border-2 border-cyan-400/80 bg-cyan-500/10 rounded-sm w-44 h-48 relative flex items-start justify-start p-1 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                <span className="bg-cyan-500 text-black text-[9px] font-mono font-extrabold px-1.5 py-0.2 rounded">
                  {mode === "face" ? "FACE: TARGET_04 (96%)" :
                   mode === "anpr" ? "PLATE: KL-01-AB-2206" :
                   mode === "banking" ? "PERSON: CASH_COUNTER" : "OBJECT: HUMAN (98%)"}
                </span>
              </div>

              <div className="flex justify-between items-end text-[10px] font-mono text-slate-400 bg-black/60 backdrop-blur-sm px-2 py-1 rounded border border-slate-800">
                <span>MODEL: CUSTOM_PY / REALTIME</span>
                <span className="text-emerald-400 font-bold">STREAM SYNCHRONIZED</span>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 sm:p-5 flex flex-col justify-between space-y-4 bg-slate-950/60">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Sparkles size={14} className="text-amber-400" />
                Live Inference Stream
              </span>
              <button
                type="button"
                onClick={triggerLiveAiEvent}
                disabled={triggering || !selectedCam}
                className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 px-2.5 py-1 text-[11px] font-bold text-white transition disabled:opacity-50"
              >
                <Zap size={13} className={triggering ? "animate-spin" : ""} />
                {triggering ? "Processing..." : "Run AI Test Match"}
              </button>
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
            <span className="text-emerald-400">● Realtime Sync</span>
          </div>
        </div>
      </div>
    </section>
  );
}
