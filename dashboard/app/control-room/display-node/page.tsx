"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Tv, Wifi, AlertTriangle } from "lucide-react";
import { HlsPlayer } from "@/components/hls-player";

interface DisplayState {
  displayCode: string;
  name: string;
  activeLayout: string;
  assignedCameras: string[];
  isOnline: boolean;
  resolution: string;
}

interface CameraMetadata {
  id: string;
  name: string;
  hlsUrl?: string;
  streamUrl?: string;
}

function DisplayNodeContent() {
  const searchParams = useSearchParams();
  const displayCode = searchParams?.get("displayCode") || "WALL-01";

  const [displayState, setDisplayState] = useState<DisplayState | null>(null);
  const [cameras, setCameras] = useState<Record<string, CameraMetadata>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(true);

  // Auto-register and fetch display status
  useEffect(() => {
    let isMounted = true;

    const syncDisplay = async () => {
      try {
        // Register / heartbeat
        await fetch("/api/v1/video-wall/displays/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            displayCode,
            name: `SOC Video Wall (${displayCode})`,
            resolution: `${window.innerWidth}x${window.innerHeight}`,
            activeLayout: "grid-4",
          }),
        });

        // Get status
        const res = await fetch(`/api/v1/video-wall/displays/${displayCode}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.display) {
            setDisplayState(data.display);
            setIsConnected(true);
          }
        }
      } catch {
        if (isMounted) setIsConnected(false);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    const fetchAllCameras = async () => {
      try {
        const res = await fetch("/api/vms/cameras");
        if (res.ok) {
          const data = await res.json();
          const camList: CameraMetadata[] = Array.isArray(data) ? data : data.data || [];
          const camMap: Record<string, CameraMetadata> = {};
          camList.forEach((c) => {
            camMap[c.id] = c;
          });
          if (isMounted) setCameras(camMap);
        }
      } catch {
        // fallback
      }
    };

    syncDisplay();
    fetchAllCameras();

    const interval = setInterval(syncDisplay, 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [displayCode]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black text-neutral-300">
        <Tv className="w-12 h-12 text-sky-500 animate-pulse mb-3" />
        <h2 className="text-xl font-bold font-mono">CONNECTING SOC DISPLAY: {displayCode}</h2>
        <p className="text-xs text-neutral-500 mt-1">Initializing WebRTC & HLS Matrix Sync...</p>
      </div>
    );
  }

  const assigned = displayState?.assignedCameras || [];
  const layoutClass =
    displayState?.activeLayout === "grid-1"
      ? "grid-cols-1 grid-rows-1"
      : displayState?.activeLayout === "grid-9"
      ? "grid-cols-3 grid-rows-3"
      : displayState?.activeLayout === "grid-16"
      ? "grid-cols-4 grid-rows-4"
      : "grid-cols-2 grid-rows-2"; // default 2x2

  return (
    <main className="relative w-screen h-screen bg-black overflow-hidden select-none">
      {/* Top Banner (Auto-fades) */}
      <header className="absolute top-2 left-3 right-3 z-30 flex items-center justify-between pointer-events-none opacity-40 hover:opacity-100 transition-opacity bg-neutral-950/80 backdrop-blur-md px-3 py-1 rounded-md text-[11px] text-neutral-400 border border-neutral-800">
        <div className="flex items-center gap-2">
          <Tv className="w-3.5 h-3.5 text-sky-400" />
          <span className="font-bold text-white tracking-wide">{displayState?.name || displayCode}</span>
          <span>•</span>
          <span className="font-mono text-neutral-300">{displayState?.activeLayout.toUpperCase()}</span>
        </div>
        <div className="flex items-center gap-2 font-mono">
          <span className="flex items-center gap-1 text-emerald-400">
            <Wifi className="w-3 h-3" />
            {isConnected ? "LIVE MATRIX SYNC" : "RECONNECTING"}
          </span>
          <span>{new Date().toLocaleTimeString()}</span>
        </div>
      </header>

      {/* Camera Grid */}
      {assigned.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-neutral-500">
          <Tv className="w-16 h-16 mb-2 stroke-1" />
          <h3 className="text-sm font-semibold text-neutral-400">Display Standby Mode</h3>
          <p className="text-xs text-neutral-600 mt-0.5">
            Waiting for dispatch command from Control Room to {displayCode}...
          </p>
        </div>
      ) : (
        <div className={`grid ${layoutClass} w-full h-full gap-1 p-1`}>
          {assigned.map((camId) => (
            <DisplayNodeTile key={camId} camId={camId} cam={cameras[camId]} />
          ))}
        </div>
      )}
    </main>
  );
}

function DisplayNodeTile({
  camId,
  cam,
}: {
  camId: string;
  cam?: CameraMetadata;
}) {
  const [session, setSession] = useState<{
    hlsUrl: string;
    whepUrl?: string;
    bearerToken: string;
    iceServers?: RTCIceServer[];
  }>({
    hlsUrl: cam?.hlsUrl || `/api/vms/cameras/${camId}/hls/live.m3u8`,
    bearerToken: "",
  });

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    async function startLiveSession() {
      try {
        const res = await fetch("/api/live", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cameraId: camId, profile: "sub" }),
          signal: controller.signal,
        });

        if (res.ok) {
          const liveData = await res.json();
          if (isMounted) {
            setSession({
              hlsUrl: liveData.hls?.url || cam?.hlsUrl || `/api/vms/cameras/${camId}/hls/live.m3u8`,
              whepUrl: liveData.webRtc?.whepUrl,
              bearerToken: liveData.webRtc?.bearerToken ?? liveData.hls?.bearerToken ?? "",
              iceServers: liveData.webRtc?.iceServers,
            });
          }
        }
      } catch {
        // Fallback remains the initial HLS stream
      }
    }

    void startLiveSession();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [camId, cam?.hlsUrl]);

  return (
    <div
      key={camId}
      className="relative w-full h-full bg-neutral-950 border border-neutral-850 overflow-hidden flex flex-col group"
    >
      <div className="absolute top-2 left-2 z-20 flex items-center gap-2 bg-black/70 backdrop-blur-md px-2 py-0.5 rounded text-[11px] font-semibold text-white">
        <span>{cam?.name || `Camera ${camId}`}</span>
        {session.whepUrl ? (
          <span className="flex items-center gap-1 text-[9px] font-mono text-emerald-400 bg-emerald-950/80 border border-emerald-500/40 px-1.5 py-0.5 rounded">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            WEBRTC
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[9px] font-mono text-amber-400 bg-amber-950/80 border border-amber-500/40 px-1.5 py-0.5 rounded">
            HLS
          </span>
        )}
      </div>
      <div className="relative flex-1 w-full h-full">
        <HlsPlayer
          url={session.hlsUrl}
          whepUrl={session.whepUrl}
          bearerToken={session.bearerToken}
          iceServers={session.iceServers}
          cameraName={cam?.name || `Camera ${camId}`}
          cameraId={camId}
          muted={true}
        />
      </div>
    </div>
  );
}

export default function VideoWallDisplayNodePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen bg-black text-white">
          Loading Display Node...
        </div>
      }
    >
      <DisplayNodeContent />
    </Suspense>
  );
}
